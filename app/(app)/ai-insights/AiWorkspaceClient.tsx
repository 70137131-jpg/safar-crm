"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  FileSearch,
  Languages,
  Loader2,
  MessageSquareText,
  Mic,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type JsonRecord = Record<string, unknown>;

interface DashboardData {
  configured: boolean;
  embeddingModel: string;
  insights: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    score: number | null;
    confidence: number | null;
    sourcePaths: string[];
    updatedAt: string;
  }>;
}

function JsonResult({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted/50 mt-4 max-h-80 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary rounded-lg p-2">{icon}</div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ProposalActions({ proposals }: { proposals: unknown }) {
  const list = Array.isArray(proposals)
    ? (proposals as Array<{ id: string; summary: string; status: string }>)
    : [];
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string>();

  async function act(id: string, action: "confirm" | "reject") {
    setWorking(id);
    const response = await fetch(`/api/assistant/proposals/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json()) as { status?: string; error?: string };
    setWorking(undefined);
    if (response.ok) setStatuses((current) => ({ ...current, [id]: body.status ?? action }));
    else setStatuses((current) => ({ ...current, [id]: body.error ?? "Failed" }));
  }

  if (list.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {list.map((proposal) => (
        <div key={proposal.id} className="rounded-md border border-amber-300/60 p-3 text-sm">
          <p className="font-medium">{proposal.summary}</p>
          {statuses[proposal.id] ? (
            <p className="text-muted-foreground mt-1 text-xs">{statuses[proposal.id]}</p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() => void act(proposal.id, "confirm")}
                disabled={working === proposal.id}
              >
                {working === proposal.id ? <Loader2 className="animate-spin" /> : <Check />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void act(proposal.id, "reject")}
                disabled={working === proposal.id}
              >
                <X />
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AiWorkspaceClient({
  configured,
  initialDocumentId,
  initialLeadId,
  initialCustomerId,
  initialQuotationId,
}: {
  configured: boolean;
  initialDocumentId: string;
  initialLeadId: string;
  initialCustomerId: string;
  initialQuotationId: string;
}) {
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [loading, setLoading] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, unknown>>({});

  const [leadId, setLeadId] = useState(initialLeadId);
  const [followTargetType, setFollowTargetType] = useState<"lead" | "customer">(
    initialCustomerId ? "customer" : "lead",
  );
  const [followTargetId, setFollowTargetId] = useState(initialCustomerId || initialLeadId);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [language, setLanguage] = useState<"ENGLISH" | "URDU" | "ROMAN_URDU">("ENGLISH");
  const [tone, setTone] = useState("friendly");
  const [purpose, setPurpose] = useState("");
  const [documentId, setDocumentId] = useState(initialDocumentId);
  const [audioDocumentId, setAudioDocumentId] = useState(initialDocumentId);
  const [searchQuery, setSearchQuery] = useState("");
  const [packageLeadId, setPackageLeadId] = useState(initialLeadId);
  const [quotationId, setQuotationId] = useState(initialQuotationId);
  const [reportQuestion, setReportQuestion] = useState("");

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/ai/workbench", { cache: "no-store" });
    if (!response.ok) return;
    setDashboard((await response.json()) as DashboardData);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function run(key: string, payload: JsonRecord) {
    setLoading(key);
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch("/api/ai/workbench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? "AI workspace request failed");
      setResults((current) => ({ ...current, [key]: body.data }));
      void loadDashboard();
      return body.data;
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : "AI workspace request failed",
      }));
    } finally {
      setLoading(undefined);
    }
  }

  function output(key: string) {
    const result = results[key];
    const error = errors[key];
    return (
      <>
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        {result !== undefined && <JsonResult value={result} />}
      </>
    );
  }

  const extraction = results.extraction as { id?: string; status?: string } | undefined;
  const media = results.media as { proposals?: unknown } | undefined;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <BrainCircuit className="text-primary mt-0.5 h-6 w-6" />
            <div>
              <p className="font-semibold">Native CRM intelligence</p>
              <p className="text-muted-foreground mt-1 text-sm">
                All reads are permission-scoped. Drafts, extracted fields, and proposed actions
                require human review.
              </p>
            </div>
          </div>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? "Gemini connected" : "Deterministic features only"}
          </Badge>
        </CardContent>
      </Card>

      {dashboard?.insights && dashboard.insights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent insights</h2>
            <Button variant="ghost" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw /> Refresh
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.insights.slice(0, 6).map((insight) => (
              <Card key={insight.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{insight.kind.replaceAll("_", " ")}</Badge>
                    {insight.score !== null && (
                      <span className="text-sm font-semibold">{insight.score}/100</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-medium">{insight.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">{insight.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {insight.sourcePaths.slice(0, 3).map((href) => (
                      <Link
                        key={href}
                        href={href as Route}
                        className="text-primary text-xs hover:underline"
                      >
                        Open record
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <FeatureCard
          icon={<UserRoundSearch className="h-5 w-5" />}
          title="Explainable lead scoring"
          description="Scores intent and urgency, lists evidence, and recommends the next action."
        >
          <div className="flex gap-2">
            <Input
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
              placeholder="Lead UUID"
            />
            <Button
              onClick={() => void run("lead", { action: "lead_score", leadId })}
              disabled={!leadId || loading === "lead"}
            >
              {loading === "lead" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Score
            </Button>
          </div>
          {output("lead")}
        </FeatureCard>

        <FeatureCard
          icon={<MessageSquareText className="h-5 w-5" />}
          title="Multilingual follow-up composer"
          description="Creates an editable WhatsApp or email draft; it never sends automatically."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <Label>Target</Label>
              <select
                className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={followTargetType}
                onChange={(event) => setFollowTargetType(event.target.value as "lead" | "customer")}
              >
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
              </select>
            </label>
            <label>
              <Label>Record UUID</Label>
              <Input
                className="mt-1"
                value={followTargetId}
                onChange={(event) => setFollowTargetId(event.target.value)}
              />
            </label>
            <label>
              <Label>Channel</Label>
              <select
                className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={channel}
                onChange={(event) => setChannel(event.target.value as "WHATSAPP" | "EMAIL")}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label>
              <Label>Language</Label>
              <select
                className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value as typeof language)}
              >
                <option value="ENGLISH">English</option>
                <option value="URDU">Urdu</option>
                <option value="ROMAN_URDU">Roman Urdu</option>
              </select>
            </label>
            <label>
              <Label>Tone</Label>
              <Input
                className="mt-1"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </label>
            <label>
              <Label>Purpose</Label>
              <Input
                className="mt-1"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <Button
            className="mt-3"
            onClick={() =>
              void run("follow", {
                action: "follow_up",
                targetType: followTargetType,
                targetId: followTargetId,
                channel,
                language,
                tone,
                purpose: purpose || undefined,
              })
            }
            disabled={!followTargetId || loading === "follow"}
          >
            {loading === "follow" ? <Loader2 className="animate-spin" /> : <Languages />}
            Draft follow-up
          </Button>
          {output("follow")}
        </FeatureCard>

        <FeatureCard
          icon={<FileSearch className="h-5 w-5" />}
          title="Document extraction"
          description="Extracts structured fields from an authorized PDF or image into a review queue."
        >
          <div className="flex gap-2">
            <Input
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              placeholder="Document UUID"
            />
            <Button
              onClick={() => void run("extraction", { action: "document_extract", documentId })}
              disabled={!configured || !documentId || loading === "extraction"}
            >
              {loading === "extraction" ? <Loader2 className="animate-spin" /> : <WandSparkles />}
              Extract
            </Button>
          </div>
          {extraction?.id && extraction.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void run("extraction-review", {
                    action: "review_extraction",
                    extractionId: extraction.id,
                    decision: "accept",
                  })
                }
              >
                <Check /> Accept review
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void run("extraction-review", {
                    action: "review_extraction",
                    extractionId: extraction.id,
                    decision: "reject",
                  })
                }
              >
                <X /> Reject
              </Button>
            </div>
          )}
          {output("extraction")}
          {output("extraction-review")}
        </FeatureCard>

        <FeatureCard
          icon={<Mic className="h-5 w-5" />}
          title="Voice-note and call intelligence"
          description="Transcribes uploaded audio and creates confirmation-gated interaction and task proposals."
        >
          <div className="flex gap-2">
            <Input
              value={audioDocumentId}
              onChange={(event) => setAudioDocumentId(event.target.value)}
              placeholder="Audio document UUID"
            />
            <Button
              onClick={() =>
                void run("media", {
                  action: "media_analyze",
                  documentId: audioDocumentId,
                  kind: "VOICE_NOTE",
                })
              }
              disabled={!configured || !audioDocumentId || loading === "media"}
            >
              {loading === "media" ? <Loader2 className="animate-spin" /> : <Mic />}
              Analyze
            </Button>
          </div>
          {output("media")}
          <ProposalActions proposals={media?.proposals} />
        </FeatureCard>

        <FeatureCard
          icon={<Search className="h-5 w-5" />}
          title="Permission-aware semantic search"
          description="Searches the current user's isolated pgvector index by meaning."
        >
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search CRM knowledge..."
            />
            <Button
              onClick={() => void run("search", { action: "semantic_search", query: searchQuery })}
              disabled={!configured || searchQuery.length < 2 || loading === "search"}
            >
              {loading === "search" ? <Loader2 className="animate-spin" /> : <Search />}
              Search
            </Button>
          </div>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            onClick={() => void run("sync", { action: "semantic_sync" })}
            disabled={!configured || loading === "sync"}
          >
            {loading === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Rebuild my index
          </Button>
          {output("sync")}
          {output("search")}
        </FeatureCard>

        <FeatureCard
          icon={<PackageSearch className="h-5 w-5" />}
          title="Package recommender"
          description="Ranks verified active packages using lead destination and budget fit."
        >
          <div className="flex gap-2">
            <Input
              value={packageLeadId}
              onChange={(event) => setPackageLeadId(event.target.value)}
              placeholder="Lead UUID"
            />
            <Button
              onClick={() =>
                void run("packages", { action: "recommend_packages", leadId: packageLeadId })
              }
              disabled={!packageLeadId || loading === "packages"}
            >
              {loading === "packages" ? <Loader2 className="animate-spin" /> : <PackageSearch />}
              Recommend
            </Button>
          </div>
          {output("packages")}
        </FeatureCard>

        <FeatureCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Quotation quality checker"
          description="Checks totals, validity, duplicates, discounts, and travel-service clarity before sending."
        >
          <div className="flex gap-2">
            <Input
              value={quotationId}
              onChange={(event) => setQuotationId(event.target.value)}
              placeholder="Quotation UUID"
            />
            <Button
              onClick={() => void run("quote", { action: "quote_review", quotationId })}
              disabled={!quotationId || loading === "quote"}
            >
              {loading === "quote" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Review
            </Button>
          </div>
          {output("quote")}
        </FeatureCard>

        <FeatureCard
          icon={<UserRoundSearch className="h-5 w-5" />}
          title="CRM data-quality assistant"
          description="Finds missing fields, stale tasks, and possible duplicates without changing records."
        >
          <Button
            onClick={() => void run("quality", { action: "data_quality" })}
            disabled={loading === "quality"}
          >
            {loading === "quality" ? <Loader2 className="animate-spin" /> : <UserRoundSearch />}
            Scan authorized records
          </Button>
          {output("quality")}
        </FeatureCard>

        <FeatureCard
          icon={<Bot className="h-5 w-5" />}
          title="Natural-language reporting"
          description="Maps a question to an approved typed report; unrestricted SQL is never available."
        >
          <Textarea
            value={reportQuestion}
            onChange={(event) => setReportQuestion(event.target.value)}
            placeholder="Which destination converted best in the last 90 days?"
            rows={3}
          />
          <Button
            className="mt-2"
            onClick={() => void run("report", { action: "report", question: reportQuestion })}
            disabled={reportQuestion.length < 3 || loading === "report"}
          >
            {loading === "report" ? <Loader2 className="animate-spin" /> : <BarChart3 />}
            Run approved report
          </Button>
          {output("report")}
        </FeatureCard>

        <FeatureCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Forecasting and anomaly detection"
          description="Uses a transparent statistical trend; Gemini does not calculate the forecast."
        >
          <Button
            onClick={() => void run("forecast", { action: "forecast" })}
            disabled={loading === "forecast"}
          >
            {loading === "forecast" ? <Loader2 className="animate-spin" /> : <BarChart3 />}
            Forecast three months
          </Button>
          {output("forecast")}
        </FeatureCard>

        <FeatureCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Daily manager briefing"
          description="Combines priority leads, overdue tasks, expiring quotes, and operational metrics."
        >
          <Button
            onClick={() => void run("brief", { action: "briefing" })}
            disabled={loading === "brief"}
          >
            {loading === "brief" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Generate briefing
          </Button>
          {output("brief")}
        </FeatureCard>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm">
          <ShieldCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Safety remains part of every feature</p>
            <p className="text-muted-foreground mt-1 leading-6">
              Models receive bounded context, never raw database access. Record permissions are
              checked before reads, writes remain confirmation-gated, and model outputs are
              validated before storage. Document review acceptance does not overwrite customer data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
