"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { updateLeadSourcesAction } from "@/modules/settings/settings.actions";
import {
  MAX_LEAD_SOURCES,
  MAX_LEAD_SOURCE_LENGTH,
} from "@/modules/settings/settings.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Lead-source list editor. Sources are free-text tags used as the dropdown
 * options when capturing a lead's origin (§1.11 / unblocks §1.4). Adds are
 * validated client-side for instant feedback; the server action re-normalises
 * (trim, dedupe, cap) so it stays authoritative.
 */
export function LeadSourcesForm({ leadSources }: { leadSources: string[] }) {
  const router = useRouter();
  const [sources, setSources] = useState<string[]>(leadSources);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addSource() {
    const value = draft.trim();
    if (!value) return;
    if (value.length > MAX_LEAD_SOURCE_LENGTH) {
      toast.error(`Keep each source to ${MAX_LEAD_SOURCE_LENGTH} characters or fewer.`);
      return;
    }
    if (sources.some((s) => s.toLowerCase() === value.toLowerCase())) {
      toast.error(`"${value}" is already in the list.`);
      return;
    }
    if (sources.length >= MAX_LEAD_SOURCES) {
      toast.error(`You can have at most ${MAX_LEAD_SOURCES} lead sources.`);
      return;
    }
    setSources((prev) => [...prev, value]);
    setDraft("");
  }

  function removeSource(target: string) {
    setSources((prev) => prev.filter((s) => s !== target));
  }

  async function onSave() {
    setSubmitting(true);
    try {
      const res = await updateLeadSourcesAction({ leadSources: sources });
      if (res.ok) {
        setSources(res.data.leadSources);
        toast.success("Lead sources saved");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <label htmlFor="lead-source-input" className="text-sm font-medium">
          Add a lead source
        </label>
        <div className="flex gap-2">
          <Input
            id="lead-source-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSource();
              }
            }}
            placeholder="e.g. Facebook, Referral, Walk-in"
            maxLength={MAX_LEAD_SOURCE_LENGTH}
            aria-describedby="lead-source-count"
          />
          <Button type="button" variant="secondary" onClick={addSource} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <p id="lead-source-count" className="text-xs text-muted-foreground">
          {sources.length} / {MAX_LEAD_SOURCES} sources. Press Enter to add.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Current sources</p>
        {sources.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No lead sources yet. Add a few above so agents can tag where enquiries come from.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <li key={source}>
                <Badge variant="secondary" className="gap-1 py-1 pl-3 pr-1 text-sm font-normal">
                  {source}
                  <button
                    type="button"
                    onClick={() => removeSource(source)}
                    aria-label={`Remove ${source}`}
                    className="ml-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" onClick={onSave} disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
