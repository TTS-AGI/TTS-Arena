"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@base-ui-components/react/switch";
import { Search, TimerOff } from "lucide-react";
import type {
  AdminModel,
  AdminModelsResponse,
  AdminModelUpdate,
} from "@ttsa/shared";
import { PageHeader } from "@/components/admin/shell";
import { fmtDate } from "@/components/admin/data-table";
import { Modal, ModalTitle, ModalDescription } from "@/components/modal";
import { ModelLogo } from "@/components/model-logo";
import { TestAllPanel } from "@/components/admin/test-all";
import { useToast } from "@/components/toast";

async function fetchModels(): Promise<AdminModelsResponse> {
  const res = await fetch("/api/admin/models");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

/** Is the model currently timed out (epoch-seconds in the future)? */
function isTimedOut(m: AdminModel): boolean {
  return m.timedOutUntil != null && m.timedOutUntil * 1000 > Date.now();
}

function timeLeft(epochSeconds: number): string {
  const ms = epochSeconds * 1000 - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600_000);
  const min = Math.round((ms % 3600_000) / 60_000);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

export default function AdminModelsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "models"],
    queryFn: fetchModels,
    refetchInterval: 30_000,
  });

  const models = useMemo(() => data?.models ?? [], [data]);
  const timedOutCount = models.filter(isTimedOut).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.provider ?? "").toLowerCase().includes(q),
    );
  }, [models, search]);

  // Group by provider (each group sorted by rating, groups by best rating).
  const groups = useMemo(() => {
    if (!grouped)
      return [{ provider: null as string | null, models: filtered }];
    const byProvider = new Map<string, AdminModel[]>();
    for (const m of filtered) {
      const key = m.provider ?? "—";
      const arr = byProvider.get(key) ?? [];
      arr.push(m);
      byProvider.set(key, arr);
    }
    return [...byProvider.entries()]
      .map(([provider, ms]) => ({
        provider,
        models: [...ms].sort((a, b) => b.rating - a.rating),
      }))
      .sort((a, b) => b.models[0]!.rating - a.models[0]!.rating);
  }, [filtered, grouped]);

  const bulkUntimeout = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/models/timeouts/clear", {
        method: "POST",
      });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{ cleared: number }>;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin", "models"] });
      toast.success(
        `Cleared ${d.cleared} time-out${d.cleared === 1 ? "" : "s"}`,
      );
    },
    onError: () => toast.error("Couldn’t clear time-outs"),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Models"
        subtitle={data ? `${models.length} models` : "Ratings & availability."}
        actions={
          timedOutCount > 0 ? (
            <button
              onClick={() => bulkUntimeout.mutate()}
              disabled={bulkUntimeout.isPending}
              className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line disabled:opacity-50"
            >
              <TimerOff className="h-4 w-4" aria-hidden />
              Un-timeout all ({timedOutCount})
            </button>
          ) : undefined
        }
      />

      <TestAllPanel />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models or providers…"
            className="w-full rounded-full border border-line bg-transparent py-1.5 pr-3 pl-9 text-sm outline-none focus:border-ink-3"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />
          Group by provider
        </label>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2.5">
                <span className="tag">Model</span>
              </th>
              <th className="px-3 py-2.5">
                <span className="tag">Rating</span>
              </th>
              <th className="px-3 py-2.5">
                <span className="tag">Votes</span>
              </th>
              <th className="px-3 py-2.5">
                <span className="tag">Status</span>
              </th>
              <th className="px-3 py-2.5">
                <span className="tag">Updated</span>
              </th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-3">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-3">
                  No models match.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <ProviderGroup
                  key={g.provider ?? "all"}
                  provider={grouped ? g.provider : null}
                  models={g.models}
                  onRowClick={(m) =>
                    router.push(`/admin/models/${encodeURIComponent(m.id)}`)
                  }
                  onEdit={setEditing}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <EditModelDialog
        model={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin", "models"] });
          toast.success("Model updated");
        }}
      />
    </div>
  );
}

function ProviderGroup({
  provider,
  models,
  onRowClick,
  onEdit,
}: {
  provider: string | null;
  models: AdminModel[];
  onRowClick: (m: AdminModel) => void;
  onEdit: (m: AdminModel) => void;
}) {
  return (
    <>
      {provider !== null && (
        <tr className="bg-fill/40">
          <td colSpan={6} className="px-3 py-1.5">
            <span className="tag">
              {provider} · {models.length}
            </span>
          </td>
        </tr>
      )}
      {models.map((m) => (
        <tr
          key={m.id}
          onClick={() => onRowClick(m)}
          className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-fill/60"
        >
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ModelLogo icon={m.icon} className="h-7 w-7" />
              <span className="font-medium">{m.name}</span>
              <span className="tag">{m.id}</span>
            </div>
          </td>
          <td className="px-3 py-2.5">
            <span className="nums">{Math.round(m.rating)}</span>
          </td>
          <td className="px-3 py-2.5">
            <span className="nums">{m.voteCount}</span>
          </td>
          <td className="px-3 py-2.5">
            <StatusBadges m={m} />
          </td>
          <td className="px-3 py-2.5">
            <span className="tag">{fmtDate(m.updatedAt)}</span>
          </td>
          <td className="px-3 py-2.5 text-right">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(m);
              }}
              className="rounded-md bg-fill px-2.5 py-1 text-xs font-medium transition-colors hover:bg-line"
            >
              Edit
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

function StatusBadges({ m }: { m: AdminModel }) {
  const timedOut = isTimedOut(m);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {m.isActive ? (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
          active
        </span>
      ) : (
        <span className="rounded-full bg-fill px-2 py-0.5 text-xs font-medium text-ink-3">
          off
        </span>
      )}
      {timedOut && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
          <TimerOff className="h-3 w-3" aria-hidden />
          {timeLeft(m.timedOutUntil!)}
        </span>
      )}
    </span>
  );
}

function EditModelDialog({
  model,
  onClose,
  onSaved,
}: {
  model: AdminModel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const open = model !== null;

  const mutation = useMutation({
    mutationFn: async (patch: AdminModelUpdate) => {
      const res = await fetch(`/api/admin/models/${model!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("update failed");
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: () => toast.error("Couldn’t update model"),
  });

  const timeout = useMutation({
    mutationFn: async (body: { hours?: number; clear?: boolean }) => {
      const res = await fetch(`/api/admin/models/${model!.id}/timeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: (_d, body) => {
      qc.invalidateQueries({ queryKey: ["admin", "models"] });
      toast.success(body.clear ? "Time-out cleared" : "Model timed out");
      onClose();
    },
    onError: () => toast.error("Couldn’t change time-out"),
  });

  const timedOut = model ? isTimedOut(model) : false;

  return (
    <Modal open={open} onClose={onClose} size="md">
      {model && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              mutation.mutate({
                name: String(fd.get("name") ?? ""),
                url: String(fd.get("url") ?? ""),
                icon: String(fd.get("icon") ?? ""),
                isActive: fd.get("isActive") === "on",
              });
            }}
          >
            <ModalTitle>Edit {model.name}</ModalTitle>
            <ModalDescription className="mt-0.5">{model.id}</ModalDescription>

            <div className="mt-4 flex flex-col gap-3">
              <Labeled label="Display name">
                <input
                  name="name"
                  defaultValue={model.name}
                  className="input"
                />
              </Labeled>
              <Labeled label="URL">
                <input
                  name="url"
                  defaultValue={model.url ?? ""}
                  placeholder="https://…"
                  className="input"
                />
              </Labeled>
              <Labeled label="Icon URL">
                <input
                  name="icon"
                  defaultValue={model.icon ?? ""}
                  placeholder="/logos/…webp"
                  className="input"
                />
              </Labeled>

              <label className="flex items-center justify-between py-1">
                <span className="text-sm font-medium">Active</span>
                <Switch.Root
                  name="isActive"
                  defaultChecked={model.isActive}
                  className="relative h-6 w-10 rounded-full bg-line-2 transition-colors data-[checked]:bg-accent"
                >
                  <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-[1.125rem]" />
                </Switch.Root>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm text-ink-3 transition-colors hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>

          {/* Time-out — temporary suppression, separate from Active/editing. */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium">Time out</p>
            <p className="mt-0.5 text-sm text-ink-3">
              Temporarily hide this model from battles. Different from turning
              it off — it auto-restores when the timer expires.
            </p>
            {timedOut && (
              <p className="mt-2 text-sm text-amber-600">
                Timed out — {timeLeft(model.timedOutUntil!)} left.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 3, 6, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => timeout.mutate({ hours: h })}
                  disabled={timeout.isPending}
                  className="rounded-full bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line disabled:opacity-50"
                >
                  {h}h
                </button>
              ))}
              {timedOut && (
                <button
                  type="button"
                  onClick={() => timeout.mutate({ clear: true })}
                  disabled={timeout.isPending}
                  className="rounded-full bg-fill px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-line disabled:opacity-50"
                >
                  Clear time-out
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="tag">{label}</span>
      {children}
    </label>
  );
}
