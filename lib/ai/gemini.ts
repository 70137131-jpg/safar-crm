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

interface InteractionStreamEvent {
  event_type?: string;
  type?: string;
  index?: number;
  step?: Record<string, unknown>;
  delta?: Record<string, unknown>;
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
        "Api-Revision": "2026-05-20",
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

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function createStreamingInteraction(
  input: unknown,
  onTextDelta: (delta: string) => void,
): Promise<InteractionResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Ask Safar is not configured. Add GEMINI_API_KEY to the server environment.");
  }

  let response: Response;
  try {
    response = await fetch(`${INTERACTIONS_URL}?alt=sse`, {
      method: "POST",
      headers: {
        "Api-Revision": "2026-05-20",
        accept: "text/event-stream",
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({ ...(input as Record<string, unknown>), stream: true }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    logger.error({ error, provider: "gemini" }, "assistant.provider_unreachable");
    throw new IntegrationError("The AI service is unavailable. Please try again.", error);
  }

  if (!response.ok || !response.body) {
    const providerBody = await response.text().catch(() => "");
    logger.error(
      { status: response.status, provider: "gemini", providerBody: providerBody.slice(0, 500) },
      "assistant.provider_error",
    );
    throw new IntegrationError("The AI service is unavailable. Please try again.");
  }

  const assembled = new Map<
    number,
    {
      step: Record<string, unknown>;
      text: string;
      argumentsText: string;
    }
  >();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function handleEvent(block: string) {
    const namedEvent = block
      .split(/\r?\n/)
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;

    let event: InteractionStreamEvent;
    try {
      event = JSON.parse(data) as InteractionStreamEvent;
    } catch {
      logger.warn({ provider: "gemini" }, "assistant.provider_event_invalid");
      return;
    }

    if (event.error) {
      throw new IntegrationError("The AI service could not complete the response.");
    }
    const eventType = event.event_type ?? event.type ?? namedEvent;
    if (eventType === "step.start" && typeof event.index === "number" && event.step) {
      assembled.set(event.index, {
        step: event.step,
        text: "",
        argumentsText: typeof event.step.arguments === "string" ? event.step.arguments : "",
      });
      return;
    }
    if (eventType !== "step.delta" || typeof event.index !== "number" || !event.delta) {
      return;
    }

    const current = assembled.get(event.index);
    if (!current) return;
    const deltaType = event.delta.type;
    if (deltaType === "text" && typeof event.delta.text === "string") {
      current.text += event.delta.text;
      onTextDelta(event.delta.text);
      return;
    }
    if (deltaType === "arguments" || deltaType === "arguments_delta") {
      const partial =
        event.delta.partial_arguments ??
        event.delta.arguments_delta ??
        event.delta.delta ??
        event.delta.text;
      if (typeof partial === "string") current.argumentsText += partial;
      return;
    }
    if (deltaType === "thought_signature") {
      const signature = event.delta.signature ?? event.delta.thought_signature;
      if (typeof signature === "string") current.step.signature = signature;
      return;
    }
    if (deltaType === "thought_summary" && typeof event.delta.text === "string") {
      current.step.summary = `${String(current.step.summary ?? "")}${event.delta.text}`;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) handleEvent(block);
    if (done) break;
  }
  if (buffer.trim()) handleEvent(buffer);

  const steps: InteractionStep[] = Array.from(assembled.entries())
    .sort(([left], [right]) => left - right)
    .map(([, item]) => {
      if (item.step.type === "function_call") {
        return {
          ...item.step,
          type: "function_call",
          id: String(item.step.id ?? ""),
          name: String(item.step.name ?? ""),
          arguments:
            item.argumentsText.length > 0
              ? parseJsonObject(item.argumentsText)
              : ((item.step.arguments as Record<string, unknown> | undefined) ?? {}),
        };
      }
      if (item.step.type === "model_output" && item.text) {
        return {
          ...item.step,
          type: "model_output",
          content: [{ type: "text", text: item.text }],
        };
      }
      return item.step as GenericStep;
    });

  return {
    steps,
    output_text: steps
      .filter((step) => step.type === "model_output")
      .map((step) =>
        "content" in step && Array.isArray(step.content) ? textFromResponse({ steps: [step] }) : "",
      )
      .join("")
      .trim(),
  };
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
  onTextDelta?: (delta: string) => void;
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
    const request = {
      model: env.GEMINI_MODEL,
      store: false,
      generation_config: {
        max_output_tokens: 1200,
        thinking_level: "low",
      },
      input: history,
      tools: input.tools,
    };
    const response = input.onTextDelta
      ? await createStreamingInteraction(request, input.onTextDelta)
      : await createInteraction(request);
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
