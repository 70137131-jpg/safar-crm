import "server-only";
import { env } from "@/lib/env";
import { AppError, IntegrationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface GeminiToolDeclaration {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiToolResult {
  data: unknown;
  sources?: Array<{ label: string; href: string }>;
  proposal?: {
    id: string;
    type: string;
    summary: string;
    status: string;
    expiresAt: string;
  };
}

interface FunctionCallStep {
  type: "function_call";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

interface GenericStep {
  type: string;
  text?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
}

type InteractionStep = FunctionCallStep | GenericStep;

interface InteractionResponse {
  output_text?: string;
  steps?: InteractionStep[];
  error?: { message?: string };
}

export interface GeminiRunResult {
  text: string;
  sources: Array<{ label: string; href: string }>;
  proposals: Array<NonNullable<GeminiToolResult["proposal"]>>;
  toolCalls: string[];
}

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_TOOL_ROUNDS = 6;

function textFromResponse(response: InteractionResponse): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  const parts: string[] = [];
  for (const step of response.steps ?? []) {
    if ("text" in step && typeof step.text === "string") parts.push(step.text);
    if ("content" in step && typeof step.content === "string") parts.push(step.content);
    if ("content" in step && Array.isArray(step.content)) {
      for (const part of step.content) {
        if (typeof part.text === "string") parts.push(part.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function createInteraction(input: unknown): Promise<InteractionResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Ask Safar is not configured. Add GEMINI_API_KEY to the server environment.");
  }

  let response: Response;
  try {
    response = await fetch(INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    logger.error({ error, provider: "gemini" }, "assistant.provider_unreachable");
    throw new IntegrationError("The AI service is unavailable. Please try again.", error);
  }

  const payload = (await response.json().catch(() => ({}))) as InteractionResponse;
  if (!response.ok) {
    logger.error(
      {
        status: response.status,
        provider: "gemini",
        providerMessage: payload.error?.message,
      },
      "assistant.provider_error",
    );
    throw new IntegrationError("The AI service is unavailable. Please try again.");
  }
  return payload;
}

function dedupeSources(
  sources: Array<{ label: string; href: string }>,
): Array<{ label: string; href: string }> {
  return Array.from(new Map(sources.map((source) => [source.href, source])).values());
}

/**
 * Stateless Gemini Interactions loop. Google receives only the bounded chat
 * history and permission-filtered tool results for this run; store=false
 * prevents provider-side conversation persistence.
 */
export async function runGeminiAgent(input: {
  systemInstruction: string;
  conversation: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
  tools: GeminiToolDeclaration[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<GeminiToolResult>;
}): Promise<GeminiRunResult> {
  const transcript = input.conversation
    .map(({ role, content }) => `${role === "USER" ? "Staff" : "Ask Safar"}: ${content}`)
    .join("\n\n");
  const history: InteractionStep[] = [
    {
      type: "user_input",
      content: [
        {
          type: "text",
          text: `${input.systemInstruction}\n\nConversation:\n${transcript}`,
        },
      ],
    },
  ];
  const sources: Array<{ label: string; href: string }> = [];
  const proposals: Array<NonNullable<GeminiToolResult["proposal"]>> = [];
  const toolCalls: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await createInteraction({
      model: env.GEMINI_MODEL,
      store: false,
      input: history,
      tools: input.tools,
    });
    const steps = response.steps ?? [];
    history.push(...steps);
    const calls = steps.filter((step): step is FunctionCallStep => step.type === "function_call");

    if (calls.length === 0) {
      const text = textFromResponse(response);
      return {
        text: text || "I could not produce an answer from the available CRM data.",
        sources: dedupeSources(sources),
        proposals,
        toolCalls,
      };
    }

    for (const call of calls) {
      toolCalls.push(call.name);
      let result: GeminiToolResult;
      try {
        result = await input.executeTool(call.name, call.arguments ?? {});
      } catch (error) {
        if (!(error instanceof AppError)) {
          logger.error({ error, tool: call.name }, "assistant.tool_failed");
        }
        result = {
          data: {
            error:
              error instanceof AppError
                ? error.message
                : "The CRM tool could not complete this request.",
          },
        };
      }
      sources.push(...(result.sources ?? []));
      if (result.proposal) proposals.push(result.proposal);
      history.push({
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: [{ type: "text", text: JSON.stringify(result.data) }],
      });
    }
  }

  throw new Error("Ask Safar reached its tool-call limit. Please narrow the question.");
}
