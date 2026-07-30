"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { createPackageAction, updatePackageAction } from "@/modules/packages/packages.actions";
import type { PackageDTO } from "@/modules/packages/packages.types";
import { toPKR, formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Draft = {
  title: string; destination: string; description: string; durationDays: string;
  price: string; hotel: string; included: string; excluded: string;
};

const EMPTY: Draft = {
  title: "", destination: "", description: "", durationDays: "", price: "",
  hotel: "", included: "", excluded: "",
};

function draftFromPackage(item: PackageDTO): Draft {
  return {
    title: item.title, destination: item.destination, description: item.description ?? "",
    durationDays: String(item.durationDays), price: toPKR(item.pricePaisa), hotel: item.hotel ?? "",
    included: item.included.join("\n"), excluded: item.excluded.join("\n"),
  };
}

function payload(draft: Draft) {
  const lines = (value: string) => value.split("\n").map((v) => v.trim()).filter(Boolean);
  return { ...draft, included: lines(draft.included), excluded: lines(draft.excluded) };
}

export function PackageManager({ initialPackages }: { initialPackages: PackageDTO[] }) {
  const [items, setItems] = useState(initialPackages);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const result = editingId
      ? await updatePackageAction(editingId, { ...payload(draft), status: items.find((i) => i.id === editingId)?.status ?? "ACTIVE" })
      : await createPackageAction(payload(draft));
    setSaving(false);
    if (!result.ok) return toast.error(result.message);
    setItems((current) => editingId
      ? current.map((item) => item.id === result.data.id ? result.data : item)
      : [...current, result.data].sort((a, b) => a.title.localeCompare(b.title)));
    setDraft(EMPTY);
    setEditingId(null);
    toast.success(editingId ? "Package updated" : "Package created");
  }

  async function setStatus(item: PackageDTO, status: "ACTIVE" | "ARCHIVED") {
    const result = await updatePackageAction(item.id, { ...payload(draftFromPackage(item)), status });
    if (!result.ok) return toast.error(result.message);
    setItems((current) => current.map((row) => row.id === item.id ? result.data : row));
    toast.success(status === "ACTIVE" ? "Package restored" : "Package archived");
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 font-semibold">{editingId ? "Edit package" : "New package"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title"><Input value={draft.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Destination"><Input value={draft.destination} onChange={(e) => set("destination", e.target.value)} /></Field>
          <Field label="Duration (days)"><Input type="number" min={1} value={draft.durationDays} onChange={(e) => set("durationDays", e.target.value)} /></Field>
          <Field label="Price (PKR)"><Input inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Hotel"><Input value={draft.hotel} onChange={(e) => set("hotel", e.target.value)} /></Field>
          <Field label="Description"><Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Included (one per line)"><Textarea value={draft.included} onChange={(e) => set("included", e.target.value)} /></Field>
          <Field label="Excluded (one per line)"><Textarea value={draft.excluded} onChange={(e) => set("excluded", e.target.value)} /></Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? "Saving…" : editingId ? "Save changes" : "Create package"}</Button>
          {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setDraft(EMPTY); }}>Cancel</Button>}
        </div>
      </section>

      <section className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{item.title}</div>
              <div className="text-sm text-muted-foreground">{item.destination} · {item.durationDays} days · {formatPKR(item.pricePaisa)} · {item.status}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingId(item.id); setDraft(draftFromPackage(item)); }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => setStatus(item, item.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}>
                {item.status === "ACTIVE" ? <Archive className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                {item.status === "ACTIVE" ? "Archive" : "Restore"}
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
