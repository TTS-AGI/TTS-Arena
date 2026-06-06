"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminOverview } from "@ttsa/shared";
import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { fmtDate } from "@/components/admin/data-table";
import { BarChartCard } from "@/components/admin/charts";

async function fetchOverview(): Promise<AdminOverview> {
  const res = await fetch("/api/admin/overview");
  if (!res.ok) throw new Error("failed to load overview");
  return res.json();
}

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: fetchOverview,
  });

  return (
    <div>
      <PageHeader title="Overview" subtitle="Arena activity at a glance." />

      {error ? (
        <p className="text-sm text-accent">Couldn’t load overview.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Users"
              value={isLoading ? "…" : data!.totals.users.toLocaleString()}
            />
            <StatCard
              label="Votes"
              value={isLoading ? "…" : data!.totals.votes.toLocaleString()}
            />
            <StatCard
              label="Models"
              value={isLoading ? "…" : data!.totals.models.toLocaleString()}
            />
            <StatCard
              label="Active models"
              value={
                isLoading ? "…" : data!.totals.activeModels.toLocaleString()
              }
            />
          </div>

          {data && <VotesChart data={data.votesByDay} />}

          <div className="grid gap-4 lg:grid-cols-2">
            {data && <RecentVotes rows={data.recentVotes} />}
            {data && <RecentUsers rows={data.recentUsers} />}
          </div>
        </div>
      )}
    </div>
  );
}

function VotesChart({ data }: { data: AdminOverview["votesByDay"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <BarChartCard
      title="Votes · last 30 days"
      right={
        <span className="nums text-sm font-medium text-ink-2">
          {total.toLocaleString()} total
        </span>
      }
      data={data as unknown as Record<string, unknown>[]}
      xKey="date"
      series={[{ key: "count", label: "Votes" }]}
      height={160}
    />
  );
}

function RecentVotes({ rows }: { rows: AdminOverview["recentVotes"] }) {
  return (
    <div className="card p-4">
      <p className="tag mb-3">Recent votes</p>
      <ul className="flex flex-col divide-y divide-line">
        {rows.length === 0 && (
          <li className="py-2 text-sm text-ink-3">No votes yet.</li>
        )}
        {rows.map((v) => (
          <li key={v.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{v.username}</span>
              <span className="tag">{fmtDate(v.createdAt)}</span>
            </div>
            <p className="text-ink-3">
              <span className="text-ink-2">{v.chosenModel}</span> over{" "}
              {v.rejectedModel}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentUsers({ rows }: { rows: AdminOverview["recentUsers"] }) {
  return (
    <div className="card p-4">
      <p className="tag mb-3">Recent users</p>
      <ul className="flex flex-col divide-y divide-line">
        {rows.length === 0 && (
          <li className="py-2 text-sm text-ink-3">No users yet.</li>
        )}
        {rows.map((u) => (
          <li key={u.id} className="flex items-center gap-2.5 py-2 text-sm">
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="h-6 w-6 rounded-full bg-fill" />
            )}
            <Link
              href={`/admin/users/${u.id}`}
              className="font-medium hover:text-accent"
            >
              {u.username}
            </Link>
            <span className="tag ml-auto">{fmtDate(u.joinDate)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
