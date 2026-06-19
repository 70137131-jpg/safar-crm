"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import {
  changeLeadStatusAction,
  convertLeadAction,
  deleteLeadAction,
} from "@/modules/leads/leads.actions";
import { LOST_REASON_OPTIONS } from "./leadMeta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LeadRef {
  id: string;
  version: number;
  contactName: string;
}

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Shared lead mutations with toasts + refetch, used by kanban and list. */
export function useLeadMutations(onChanged: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeStatus = (lead: LeadRef, status: LeadStatus) =>
    startTransition(async () => {
      const r = await changeLeadStatusAction(lead.id, { status, version: lead.version });
      if (r.ok) {
        toast.success("Lead updated");
        onChanged();
      } else toast.error(r.message);
    });

  const markLost = (lead: LeadRef, lostReason: string, lostNotes: string) =>
    startTransition(async () => {
      const r = await changeLeadStatusAction(lead.id, {
        status: "LOST",
        version: lead.version,
        lostReason,
        lostNotes,
      });
      if (r.ok) {
        toast.success("Lead marked as lost");
        onChanged();
      } else toast.error(r.message);
    });

  const convert = (lead: LeadRef, totalPrice: string) =>
    startTransition(async () => {
      const r = await convertLeadAction(lead.id, { version: lead.version, totalPrice });
      if (r.ok) {
        toast.success(`Converted — booking ${r.data.bookingNumber}`);
        onChanged();
        router.refresh();
      } else toast.error(r.message);
    });

  const remove = (lead: LeadRef) =>
    startTransition(async () => {
      const r = await deleteLeadAction(lead.id);
      if (r.ok) {
        toast.success("Lead deleted");
        onChanged();
      } else toast.error(r.message);
    });

  return { changeStatus, markLost, convert, remove, pending };
}

// ─── Modal scaffold ───────────────────────────────────────────────────────────

function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ─── Lost-reason dialog ─────────────────────────────────────────────────────

export function LostReasonDialog({
  lead,
  onClose,
  onConfirm,
}: {
  lead: LeadRef | null;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
}) {
  const [reason, setReason] = useState<string>(LOST_REASON_OPTIONS[0].value);
  const [notes, setNotes] = useState("");

  return (
    <Modal title={`Mark "${lead?.contactName}" as lost`} open={!!lead} onClose={onClose}>
      <div className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason, notes)}>
            Mark Lost
          </Button>
        </DialogFooter>
      </div>
    </Modal>
  );
}

// ─── Convert dialog ─────────────────────────────────────────────────────────

export function ConvertDialog({
  lead,
  onClose,
  onConfirm,
}: {
  lead: LeadRef | null;
  onClose: () => void;
  onConfirm: (totalPrice: string) => void;
}) {
  const [price, setPrice] = useState("");

  return (
    <Modal title={`Convert "${lead?.contactName}"`} open={!!lead} onClose={onClose}>
      <div className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">
          Creates (or links) a customer and a booking, then moves the lead to BOOKED.
        </p>
        <div className="space-y-1.5">
          <Label>Booking total (PKR, optional)</Label>
          <Input
            inputMode="decimal"
            placeholder="Defaults to the lead budget"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(price)}>
            Convert Lead
          </Button>
        </DialogFooter>
      </div>
    </Modal>
  );
}
