import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-google-key",
    GEMINI_MODEL: "gemini-test",
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { runGeminiAgent } from "@/lib/ai/gemini";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Gemini assistant adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs a stateless function loop and returns only application-provided sources", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          steps: [
            {
              type: "function_call",
              id: "call-1",
              name: "search_leads",
              arguments: { query: "Umrah" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ output_text: "I found one matching lead." }));
    const executeTool = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1", name: "Example" }],
      sources: [{ label: "Lead: Example", href: "/leads/lead-1" }],
    });

    const result = await runGeminiAgent({
      systemInstruction: "Use tools.",
      conversation: [{ role: "USER", content: "Find my Umrah lead" }],
      tools: [
        {
          type: "function",
          name: "search_leads",
          description: "Search leads",
          parameters: { type: "object" },
        },
      ],
      executeTool,
    });

    expect(result.text).toBe("I found one matching lead.");
    expect(result.sources).toEqual([{ label: "Lead: Example", href: "/leads/lead-1" }]);
    expect(result.toolCalls).toEqual(["search_leads"]);
    expect(executeTool).toHaveBeenCalledWith("search_leads", { query: "Umrah" });

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      store: boolean;
    };
    expect(firstRequest.store).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-goog-api-key": "test-google-key",
    });
  });

  it("does not send unexpected internal tool errors back to the model", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          steps: [
            {
              type: "function_call",
              id: "call-1",
              name: "search_leads",
              arguments: { query: "test" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ output_text: "The lookup failed safely." }));

    await runGeminiAgent({
      systemInstruction: "Use tools.",
      conversation: [{ role: "USER", content: "Find a lead" }],
      tools: [],
      executeTool: vi.fn().mockRejectedValue(new Error("database password leaked here")),
    });

    const secondRequest = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(secondRequest).toContain("The CRM tool could not complete this request.");
    expect(secondRequest).not.toContain("database password leaked here");
  });

  it("maps provider failures to a safe integration error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "provider details" } }, 503),
    );

    await expect(
      runGeminiAgent({
        systemInstruction: "Use tools.",
        conversation: [{ role: "USER", content: "Hello" }],
        tools: [],
        executeTool: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "INTEGRATION_ERROR",
      message: "The AI service is unavailable. Please try again.",
    });
  });

  it("streams text deltas while assembling the final response", async () => {
    const sse = [
      "event: interaction.created",
      'data: {"event_type":"interaction.created"}',
      "",
      "event: step.start",
      'data: {"event_type":"step.start","index":0,"step":{"type":"model_output"}}',
      "",
      "event: step.delta",
      'data: {"event_type":"step.delta","index":0,"delta":{"type":"text","text":"Hello "}}',
      "",
      "event: step.delta",
      'data: {"event_type":"step.delta","index":0,"delta":{"type":"text","text":"Safar"}}',
      "",
      "event: step.stop",
      'data: {"event_type":"step.stop","index":0}',
      "",
      "event: interaction.completed",
      'data: {"event_type":"interaction.completed"}',
      "",
      "",
    ].join("\n");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    const onTextDelta = vi.fn();

    const result = await runGeminiAgent({
      systemInstruction: "Answer safely.",
      conversation: [{ role: "USER", content: "Hello" }],
      tools: [],
      executeTool: vi.fn(),
      onTextDelta,
    });

    expect(result.text).toBe("Hello Safar");
    expect(onTextDelta.mock.calls.flat()).toEqual(["Hello ", "Safar"]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("?alt=sse");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"stream":true');
  });
});
