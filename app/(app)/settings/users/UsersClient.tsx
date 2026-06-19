"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  KeyRound,
  ShieldCheck,
  UserX,
  UserCheck,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listUsersAction,
  createUserAction,
  updateUserAction,
  changeRoleAction,
  resetPasswordAction,
  deactivateUserAction,
  reactivateUserAction,
} from "@/modules/users/users.actions";
import type { UserDTO } from "@/modules/users/users.types";

const ROLES = ["ADMIN", "MANAGER", "AGENT", "ACCOUNTANT"] as const;
type Role = (typeof ROLES)[number];

const ROLE_TONE: Record<string, StatusTone> = {
  ADMIN: "danger",
  MANAGER: "info",
  AGENT: "success",
  ACCOUNTANT: "warning",
};

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(date));
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
      {initials || "?"}
    </div>
  );
}

// ─── Modal primitive ──────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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

type DialogState =
  | { type: "create" }
  | { type: "view" | "edit" | "reset" | "role"; user: UserDTO }
  | null;

// ─── Main ───────────────────────────────────────────────────────────────────

export function UsersClient({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<UserDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await listUsersAction({
      page,
      pageSize,
      search: search || undefined,
      role: roleFilter || undefined,
      status: statusFilter,
    });
    if (res.ok) {
      setData(res.data.items);
      setTotal(res.data.total);
    } else {
      toast.error(res.message);
    }
    setLoading(false);
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const closeDialog = () => setDialog(null);
  const onChanged = () => {
    closeDialog();
    void fetchData();
  };

  const handleDeactivate = useCallback(async (id: string) => {
    const res = await deactivateUserAction(id);
    if (res.ok) {
      toast.success("User deactivated");
      void fetchData();
    } else {
      toast.error(res.message);
    }
  }, [fetchData]);

  const handleReactivate = useCallback(async (id: string) => {
    const res = await reactivateUserAction(id);
    if (res.ok) {
      toast.success("User reactivated");
      void fetchData();
    } else {
      toast.error(res.message);
    }
  }, [fetchData]);

  const cols: ColumnDef<UserDTO>[] = [
    {
      accessorKey: "name",
      header: "User",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.name} url={row.original.avatar} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <StatusBadge tone={ROLE_TONE[row.original.role] ?? "neutral"}>{row.original.role}</StatusBadge>,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge tone={row.original.isActive ? "success" : "neutral"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RowActions
          user={row.original}
          canManage={canManage}
          onSelect={setDialog}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
        />
      ),
    },
  ];

  const table = useReactTable({ data, columns: cols, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-sm">
          <SearchInput
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as "" | Role);
              setPage(1);
            }}
            className={inputClass}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "active" | "inactive");
              setPage(1);
            }}
            className={inputClass}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {canManage && (
            <Button onClick={() => setDialog({ type: "create" })}>
              <Plus className="mr-2 h-4 w-4" />
              New user
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="No users found" description="Try different filters, or invite a new user." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-md border md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className="h-10 text-xs font-medium uppercase tracking-wider">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.name} url={u.avatar} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <RowActions user={u} canManage={canManage} onSelect={setDialog} onDeactivate={handleDeactivate} onReactivate={handleReactivate} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge tone={ROLE_TONE[u.role] ?? "neutral"}>{u.role}</StatusBadge>
                    <StatusBadge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</StatusBadge>
                    <span className="text-muted-foreground">{formatDate(u.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      {dialog?.type === "create" && <CreateUserDialog onClose={closeDialog} onDone={onChanged} />}
      {dialog?.type === "edit" && <EditUserDialog user={dialog.user} onClose={closeDialog} onDone={onChanged} />}
      {dialog?.type === "reset" && <ResetPasswordDialog user={dialog.user} onClose={closeDialog} onDone={onChanged} />}
      {dialog?.type === "role" && <ChangeRoleDialog user={dialog.user} onClose={closeDialog} onDone={onChanged} />}
      {dialog?.type === "view" && <ViewUserDialog user={dialog.user} onClose={closeDialog} />}
    </div>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function RowActions({
  user,
  canManage,
  onSelect,
  onDeactivate,
  onReactivate,
}: {
  user: UserDTO;
  canManage: boolean;
  onSelect: (d: DialogState) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  return (
    <div className="relative text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onClick={() => onSelect({ type: "view", user })}>
            <Eye className="mr-2 h-4 w-4" /> View
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSelect({ type: "edit", user })}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSelect({ type: "role", user })}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Change role
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSelect({ type: "reset", user })}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.isActive ? (
                <ConfirmDialog
                  title="Deactivate user?"
                  description={`${user.name} will lose access until reactivated.`}
                  confirmLabel="Deactivate"
                  destructive
                  onConfirm={() => onDeactivate(user.id)}
                  trigger={(openDlg) => (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        openDlg();
                      }}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <UserX className="mr-2 h-4 w-4" /> Deactivate
                    </DropdownMenuItem>
                  )}
                />
              ) : (
                <DropdownMenuItem onClick={() => onReactivate(user.id)}>
                  <UserCheck className="mr-2 h-4 w-4" /> Reactivate
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function CreateUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await createUserAction({ name, email, role, temporaryPassword: password });
      if (res.ok) {
        toast.success("User created");
        onDone();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New user">
      <div className="space-y-4 pt-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Temporary password" hint="Min 12 chars with upper, lower, digit and symbol. User must change it on first login.">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <DialogButtons busy={busy} onCancel={onClose} onConfirm={submit} confirmLabel="Create user" />
      </div>
    </Modal>
  );
}

function EditUserDialog({ user, onClose, onDone }: { user: UserDTO; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [role, setRole] = useState<Role>(user.role as Role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await updateUserAction(user.id, { name, avatar, role, isActive });
      if (res.ok) {
        toast.success("User updated");
        onDone();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit user">
      <div className="space-y-4 pt-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Avatar URL"><Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" /></Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 rounded border-primary text-primary focus:ring-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <dl className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
          <div><dt className="text-muted-foreground">Created</dt><dd>{formatDate(user.createdAt)}</dd></div>
          <div><dt className="text-muted-foreground">Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd></div>
          <div><dt className="text-muted-foreground">Verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd></div>
        </dl>
        <DialogButtons busy={busy} onCancel={onClose} onConfirm={submit} confirmLabel="Save changes" />
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose, onDone }: { user: UserDTO; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const res = await resetPasswordAction(user.id, { newPassword: password });
      if (res.ok) {
        toast.success("Password reset — user must change it on next login");
        onDone();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}>
      <div className="space-y-4 pt-4">
        <Field label="New temporary password" hint="Min 12 chars with upper, lower, digit and symbol.">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <DialogButtons busy={busy} onCancel={onClose} onConfirm={submit} confirmLabel="Reset password" />
      </div>
    </Modal>
  );
}

function ChangeRoleDialog({ user, onClose, onDone }: { user: UserDTO; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<Role>(user.role as Role);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const res = await changeRoleAction(user.id, { role });
      if (res.ok) {
        toast.success("Role updated");
        onDone();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Change role — ${user.name}`}>
      <div className="space-y-4 pt-4">
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <DialogButtons busy={busy} onCancel={onClose} onConfirm={submit} confirmLabel="Update role" />
      </div>
    </Modal>
  );
}

function ViewUserDialog({ user, onClose }: { user: UserDTO; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="User details">
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} url={user.avatar} />
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Role</dt><dd><StatusBadge tone={ROLE_TONE[user.role] ?? "neutral"}>{user.role}</StatusBadge></dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd><StatusBadge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "Active" : "Inactive"}</StatusBadge></dd></div>
          <div><dt className="text-xs text-muted-foreground">Email verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Created</dt><dd>{formatDate(user.createdAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Updated</dt><dd>{formatDate(user.updatedAt)}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DialogButtons({ busy, onCancel, onConfirm, confirmLabel }: { busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string }) {
  return (
    <DialogFooter className="gap-2 pt-4 sm:space-x-0">
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={onConfirm} disabled={busy}>
        {busy ? "Working…" : confirmLabel}
      </Button>
    </DialogFooter>
  );
}
