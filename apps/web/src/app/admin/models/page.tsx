"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@base-ui-components/react/switch";
import { Modal, ModalTitle, ModalDescription } from "@/components/modal";
import type {
  AdminModel,
  AdminModelsResponse,
  AdminModelUpdate,
} from "@ttsa/shared";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/shell";
import { DataTable, fmtDate } from "@/components/admin/data-table";
import { ModelLogo } from "@/components/model-logo";
import { useToast } from "@/components/toast";

async function fetchModels(): Promise<AdminModelsResponse> {
  const res = await fetch("/api/admin/models");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminModelsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<AdminModel | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "models"],
    queryFn: fetchModels,
  });

  const columns = useMemo<ColumnDef<AdminModel, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Model",
        cell: (c) => (
          <div className="flex items-center gap-2">
            <ModelLogo icon={c.row.original.icon} className="h-7 w-7" />
            <span className="font-medium">{c.row.original.name}</span>
            <span className="tag">{c.row.original.id}</span>
          </div>
        ),
      },
      {
        accessorKey: "rating",
        header: "Rating",
        cell: (c) => (
          <span className="nums">{Math.round(c.row.original.rating)}</span>
        ),
      },
      {
        accessorKey: "ratingDeviation",
        header: "RD",
        cell: (c) => (
          <span className="nums text-ink-3">
            {Math.round(c.row.original.ratingDeviation)}
          </span>
        ),
      },
      {
        id: "winrate",
        header: "Win rate",
        accessorFn: (m) =>
          m.matchCount ? (m.winCount / m.matchCount) * 100 : 0,
        cell: (c) => {
          const m = c.row.original;
          const wr = m.matchCount ? (m.winCount / m.matchCount) * 100 : 0;
          return <span className="nums">{wr.toFixed(0)}%</span>;
        },
      },
      {
        accessorKey: "matchCount",
        header: "Matches",
        cell: (c) => <span className="nums">{c.row.original.matchCount}</span>,
      },
      {
        accessorKey: "voteCount",
        header: "Votes",
        cell: (c) => <span className="nums">{c.row.original.voteCount}</span>,
      },
      {
        accessorKey: "isActive",
        header: "Active",
        cell: (c) =>
          c.row.original.isActive ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              active
            </span>
          ) : (
            <span className="rounded-full bg-fill px-2 py-0.5 text-xs font-medium text-ink-3">
              off
            </span>
          ),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: (c) => (
          <span className="tag">{fmtDate(c.row.original.updatedAt)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (c) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(c.row.original);
            }}
            className="rounded-md bg-fill px-2.5 py-1 text-xs font-medium transition-colors hover:bg-line"
          >
            Edit
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Models"
        subtitle={
          data ? `${data.models.length} models` : "Ratings & availability."
        }
      />
      <DataTable
        columns={columns}
        data={data?.models ?? []}
        loading={isLoading}
        emptyMessage="No models seeded yet."
        onRowClick={(m) =>
          router.push(`/admin/models/${encodeURIComponent(m.id)}`)
        }
      />

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

  return (
    <Modal open={open} onClose={onClose} size="md">
      {model && (
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
              <input name="name" defaultValue={model.name} className="input" />
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
                placeholder="/logos/…svg"
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
