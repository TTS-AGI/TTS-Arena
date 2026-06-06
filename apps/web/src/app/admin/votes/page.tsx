"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AdminVoteRow, AdminVotesResponse } from "@ttsa/shared";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/shell";
import { DataTable, fmtDate, truncate } from "@/components/admin/data-table";
import { useToast } from "@/components/toast";

async function fetchVotes(
  page: number,
  pageSize: number,
  flaggedOnly: boolean,
): Promise<AdminVotesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (flaggedOnly) params.set("flagged", "1");
  const res = await fetch(`/api/admin/votes?${params}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminVotesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "admin",
      "votes",
      pagination.pageIndex,
      pagination.pageSize,
      flaggedOnly,
    ],
    queryFn: () =>
      fetchVotes(pagination.pageIndex, pagination.pageSize, flaggedOnly),
    placeholderData: keepPreviousData,
  });

  const flagMutation = useMutation({
    mutationFn: async (v: { id: number; flagged: boolean }) => {
      const res = await fetch(`/api/admin/votes/${v.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: v.flagged }),
      });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "votes"] });
      toast.success(v.flagged ? "Vote flagged" : "Vote reinstated");
    },
    onError: () => toast.error("Couldn’t update vote"),
  });

  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / pagination.pageSize))
    : 1;

  const columns = useMemo<ColumnDef<AdminVoteRow, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        enableSorting: false,
        cell: (c) => (
          <span className="tag whitespace-nowrap">
            {fmtDate(c.row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "username",
        header: "User",
        enableSorting: false,
        cell: (c) => (
          <span className="font-medium">{c.row.original.username}</span>
        ),
      },
      {
        id: "matchup",
        header: "Result",
        enableSorting: false,
        cell: (c) => (
          <span>
            <span className="font-medium text-ink-2">
              {c.row.original.chosenModel}
            </span>{" "}
            <span className="text-ink-3">
              over {c.row.original.rejectedModel}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "riskScore",
        header: "Risk",
        enableSorting: false,
        cell: (c) => {
          const s = c.row.original.riskScore;
          if (!s) return <span className="text-ink-4">0</span>;
          return (
            <span
              className={`nums font-medium ${s >= 50 ? "text-accent" : "text-amber-500"}`}
            >
              {Math.round(s)}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: (c) => {
          const r = c.row.original;
          if (r.flagged)
            return (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                flagged
              </span>
            );
          return r.countsForPublic ? (
            <span className="text-accent">✓ counts</span>
          ) : (
            <span className="text-ink-4">— excluded</span>
          );
        },
      },
      {
        accessorKey: "text",
        header: "Prompt",
        enableSorting: false,
        cell: (c) => (
          <span className="text-ink-3">
            {truncate(c.row.original.text, 44)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (c) => {
          const r = c.row.original;
          return (
            <button
              onClick={() =>
                flagMutation.mutate({ id: r.id, flagged: !r.flagged })
              }
              disabled={flagMutation.isPending}
              className="rounded-md bg-fill px-2.5 py-1 text-xs font-medium transition-colors hover:bg-line disabled:opacity-50"
            >
              {r.flagged ? "Reinstate" : "Flag"}
            </button>
          );
        },
      },
    ],
    [flagMutation],
  );

  return (
    <div>
      <PageHeader
        title="Votes"
        subtitle={data ? `${data.total.toLocaleString()} votes` : undefined}
        actions={
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => {
                setFlaggedOnly(e.target.checked);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
            Flagged only
          </label>
        }
      />
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        manualPagination
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        loading={isLoading || isFetching}
        emptyMessage="No votes."
        pageSizeOptions={[50, 100]}
      />
    </div>
  );
}
