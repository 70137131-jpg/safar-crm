"use client";

import { useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Bot,
  Check,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type {
  AssistantProposalDTO,
  AssistantRunDTO,
  AssistantSource,
} from "@/modules/assistant/assistant.types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
  proposals?: AssistantProposalDTO[];
}

const STARTERS = [
  "What needs my attention today?",
  "Which quotations expire this week?",
  "Show my overdue tasks.",
  "Help me find a lead and prepare a follow-up.",
] as const;

function ProposalCard({ proposal }: { proposal: AssistantProposalDTO }) {
  const [status, setStatus] = useState(proposal.status);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "reject") {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/assistant/proposals/${proposal.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as { status?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Proposal action failed");
      setStatus(body.status ?? (action === "confirm" ? "EXECUTED" : "REJECTED"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Proposal action failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/70 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Confirmation required</p>
          <p className="text-muted-foreground mt-1">{proposal.summary}</p>
          <p className="text-muted-foreground mt-1 text-xs">{proposal.type.replaceAll("_", " ")}</p>
          {status === "PENDING" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void act("confirm")} disabled={working}>
                {working ? <Loader2 className="animate-spin" /> : <Check />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void act("reject")}
                disabled={working}
              >
                <X />
                Reject
              </Button>
            </div>
          ) : (
            <p className="mt-3 font-medium">{status === "EXECUTED" ? "Completed" : status}</p>
          )}
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export function AssistantClient({ configured }: { configured: boolean }) {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function send(prefilled?: string) {
    const message = (prefilled ?? input).trim();
    if (!message || loading || !configured) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const assistantMessageId = crypto.randomUUID();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ask Safar could not answer");
      }

      setMessages((current) => [
        ...current,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      function handleEvent(block: string) {
        const event =
          block
            .split(/\r?\n/)
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "";
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) return;
        const payload = JSON.parse(data) as
          | { text: string }
          | (AssistantRunDTO & { error?: string });

        if (event === "delta" && "text" in payload) {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantMessageId
                ? { ...item, content: `${item.content}${payload.text}` }
                : item,
            ),
          );
          return;
        }
        if (event === "complete" && "conversationId" in payload) {
          completed = true;
          setConversationId(payload.conversationId);
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: payload.answer,
                    sources: payload.sources,
                    proposals: payload.proposals,
                  }
                : item,
            ),
          );
          return;
        }
        if (event === "error") {
          throw new Error("error" in payload ? payload.error : "Ask Safar could not answer");
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
      if (!completed) throw new Error("Ask Safar's response ended unexpectedly.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ask Safar could not answer");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="flex min-h-[65vh] flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary rounded-full p-2">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Operations copilot</CardTitle>
              <CardDescription>
                Answers are limited to records your account may access.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" aria-live="polite">
            {!configured && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                Ask Safar is installed but not connected yet. Add{" "}
                <code className="font-mono">GEMINI_API_KEY</code> to the server environment to
                enable chat.
              </div>
            )}

            {messages.length === 0 && configured && (
              <div className="mx-auto max-w-xl py-10 text-center">
                <Sparkles className="text-primary mx-auto h-8 w-8" />
                <h2 className="mt-3 font-semibold">How can I help today?</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Ask about leads, tasks, quotation expiry, customer context, or booking balances.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      className="hover:bg-accent rounded-lg border p-3 text-left text-sm transition-colors"
                      onClick={() => void send(starter)}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex gap-3", message.role === "user" && "justify-end")}
              >
                {message.role === "assistant" && (
                  <div className="bg-primary/10 text-primary mt-1 rounded-full p-2">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 border",
                  )}
                >
                  <p className="leading-6 whitespace-pre-wrap">{message.content}</p>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <p className="text-muted-foreground mb-1 text-xs font-medium">CRM sources</p>
                      <div className="flex flex-wrap gap-2">
                        {message.sources.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href as Route}
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            {item.label}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.proposals?.map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </div>
                {message.role === "user" && (
                  <div className="bg-muted mt-1 rounded-full p-2">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking your CRM…
              </div>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <div className="border-t p-4">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  configured
                    ? "Ask about your CRM records…"
                    : "Configure GEMINI_API_KEY to enable Ask Safar"
                }
                disabled={!configured || loading}
                rows={2}
                maxLength={4000}
                aria-label="Message Ask Safar"
              />
              <Button
                size="icon"
                onClick={() => void send()}
                disabled={!configured || loading || !input.trim()}
                aria-label="Send message"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-center text-xs">
              Ask Safar can make mistakes. Review CRM sources and confirm every proposed action.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Safety boundaries</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-3 text-sm">
          <p>Uses only records permitted for your signed-in CRM role.</p>
          <p>Passport numbers, dates of birth, and document contents are excluded.</p>
          <p>Changes require an explicit confirmation and are re-authorized.</p>
          <p>Payments, sends, deletions, bookings, users, and settings are never changed.</p>
        </CardContent>
      </Card>
    </div>
  );
}
