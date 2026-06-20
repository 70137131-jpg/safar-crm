"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { TaskType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTaskAction } from "@/modules/tasks/tasks.actions";
import { listAssignableAgentsAction } from "@/modules/users/users.actions";
import type { AssignableAgent } from "@/modules/users/users.types";
import { CustomerCombobox, type PickedCustomer } from "../bookings/CustomerCombobox";
import { MANUAL_TASK_TYPES, todayInputValue } from "./taskMeta";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

interface Props {
  canAssign: boolean;
  /** Fixed link context. If none is given, the dialog shows a customer picker. */
  leadId?: string;
  customerId?: string;
  bookingId?: string;
  contextLabel?: string;
  onCreated?: () => void;
  /** Custom trigger; defaults to a "New Task" button. */
  trigger?: (open: () => void) => ReactNode;
  triggerLabel?: string;
}

export function CreateTaskDialog({
  canAssign,
  leadId,
  customerId,
  bookingId,
  contextLabel,
  onCreated,
  trigger,
  triggerLabel = "New Task",
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("FOLLOW_UP");
  const [dueDate, setDueDate] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [picked, setPicked] = useState<PickedCustomer | null>(null);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasContext = !!(leadId || customerId || bookingId);

  useEffect(() => {
    if (!open || !canAssign) return;
    let active = true;
    void listAssignableAgentsAction().then((r) => {
      if (active && r.ok) setAgents(r.data);
    });
    return () => {
      active = false;
    };
  }, [open, canAssign]);

  function reset() {
    setTitle("");
    setType("FOLLOW_UP");
    setDueDate("");
    setAssignedToId("");
    setPicked(null);
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!dueDate) {
      setError("Due date is required.");
      return;
    }
    const linkCustomerId = customerId ?? picked?.id;
    if (!hasContext && !linkCustomerId) {
      setError("Select a customer to link this task to.");
      return;
    }
    setBusy(true);
    try {
      const r = await createTaskAction({
        title: title.trim(),
        type,
        dueDate,
        leadId: leadId ?? "",
        customerId: linkCustomerId ?? "",
        bookingId: bookingId ?? "",
        assignedToId: canAssign ? assignedToId : "",
      });
      if (r.ok) {
        toast.success("Task created");
        setOpen(false);
        reset();
        onCreated?.();
      } else {
        toast.error(r.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            {contextLabel && <DialogDescription>{contextLabel}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-4">
            {!hasContext && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Customer <span className="text-destructive">*</span>
                </label>
                <CustomerCombobox value={picked} onChange={setPicked} />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Call customer to confirm itinerary…"
                maxLength={200}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TaskType)}
                  className={selectCls}
                >
                  {MANUAL_TASK_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Due date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  min={todayInputValue()}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {canAssign && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Assign to</label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Me</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
