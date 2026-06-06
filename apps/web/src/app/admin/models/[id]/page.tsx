"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { AdminModelDetail, AdminVoteRow } from "@ttsa/shared";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { DataTable, fmtDate, truncate } from "@/components/admin/data-table";
import {
  BarChartCard,
  HBarChartCard,
  LineChartCard,
} from "@/components/admin/charts";

async function fetchDetail(id: string): Promise<AdminModelDetail> {
  const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "model", id],
    queryFn: () => fetchDetail(id),
  });

  if (error) {
    return (
      <div>
        <PageHeader title="Model" />
        <p className="text-sm text-accent">Model not found.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={data ? data.model.name : "Model"}
        subtitle={data ? data.model.id : undefined}
        actions={
          <Link
            href="/admin/models"
            className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All models
          </Link>
        }
      />

      {isLoading || !data ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Rank" value={`#${data.rank}`} />
            <StatCard label="Rating" value={Math.round(data.model.rating)} />
            <StatCard
              label="Win rate"
              value={`${
                data.model.matchCount
                  ? Math.round(
                      (data.model.winCount / data.model.matchCount) * 100,
                    )
                  : 0
              }%`}
            />
            <StatCard label="Flagged votes" value={data.flaggedVotes} />
          </div>

          {data.ratingHistory.length > 1 && (
            <LineChartCard
              title="Rating over time"
              data={data.ratingHistory.map((h) => ({
                t: fmtDate(h.t),
                rating: Math.round(h.rating),
              }))}
              xKey="t"
              series={[{ key: "rating", label: "Rating" }]}
              height={240}
            />
          )}

          <BarChartCard
            title="Appearances per day (30d)"
            data={data.votesByDay}
            xKey="date"
            series={[
              { key: "count", label: "Votes" },
              {
                key: "flagged",
                label: "Flagged",
                color: "var(--color-ink-3)",
              },
            ]}
            stacked
          />

          {data.vsOpponents.length > 0 && (
            <HBarChartCard
              title="Wins by opponent"
              data={data.vsOpponents.map((o) => ({
                opponent: o.opponent,
                wins: o.wins,
              }))}
              labelKey="opponent"
              valueKey="wins"
            />
          )}

          {/* Top voters — fraud lens (flagged share). */}
          {data.topVoters.length > 0 && (
            <div className="card overflow-hidden">
              <p className="tag border-b border-line px-4 py-3">
                Top voters for this model
              </p>
              <ul className="divide-y divide-line">
                {data.topVoters.map((v) => (
                  <li
                    key={v.userId}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <Link
                      href={`/admin/users/${v.userId}`}
                      className="font-medium hover:text-accent"
                    >
                      {v.username}
                    </Link>
                    <span className="text-ink-3">
                      {v.votes} votes
                      {v.flagged > 0 && (
                        <span className="ml-2 text-accent">
                          {v.flagged} flagged
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="tag mb-2">Recent votes</p>
            <RecentVotes rows={data.recentVotes} />
          </div>
        </div>
      )}
    </div>
  );
}

function RecentVotes({ rows }: { rows: AdminVoteRow[] }) {
  const columns: ColumnDef<AdminVoteRow, unknown>[] = [
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
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: (c) =>
        c.row.original.flagged ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            flagged
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    {
      accessorKey: "text",
      header: "Prompt",
      enableSorting: false,
      cell: (c) => (
        <span className="text-ink-3">{truncate(c.row.original.text, 40)}</span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="No votes yet."
      pageSizeOptions={[25, 50]}
    />
  );
}
