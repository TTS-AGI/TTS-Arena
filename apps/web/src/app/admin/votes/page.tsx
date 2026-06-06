"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AdminVoteRow, AdminVotesResponse } from "@ttsa/shared";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/shell";
import { DataTable, fmtDate, truncate } from "@/components/admin/data-table";

async function fetchVotes(
  page: number,
  pageSize: number,
): Promise<AdminVotesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const res = await fetch(`/api/admin/votes?${params}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminVotesPage() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "votes", pagination.pageIndex, pagination.pageSize],
    queryFn: () => fetchVotes(pagination.pageIndex, pagination.pageSize),
    placeholderData: keepPreviousData,
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
        id: "voices",
        header: "Voices",
        enableSorting: false,
        cell: (c) => (
          <span className="font-mono text-xs text-ink-3">
            {c.row.original.chosenVoice ?? "—"} /{" "}
            {c.row.original.rejectedVoice ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "sentenceOrigin",
        header: "Origin",
        enableSorting: false,
        cell: (c) => (
          <span className="tag">{c.row.original.sentenceOrigin}</span>
        ),
      },
      {
        accessorKey: "countsForPublic",
        header: "Counts",
        enableSorting: false,
        cell: (c) =>
          c.row.original.countsForPublic ? (
            <span className="text-accent">✓</span>
          ) : (
            <span className="text-ink-4">—</span>
          ),
      },
      {
        accessorKey: "text",
        header: "Prompt",
        enableSorting: false,
        cell: (c) => (
          <span className="text-ink-3">
            {truncate(c.row.original.text, 50)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Votes"
        subtitle={data ? `${data.total.toLocaleString()} votes` : undefined}
      />
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        manualPagination
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        loading={isLoading || isFetching}
        emptyMessage="No votes yet."
        pageSizeOptions={[50, 100]}
      />
    </div>
  );
}
