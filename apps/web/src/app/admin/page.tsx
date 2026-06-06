"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminOverview } from "@ttsa/shared";
import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { fmtDate } from "@/components/admin/data-table";

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
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="tag">Votes · last 30 days</p>
        <p className="nums text-sm font-medium text-ink-2">
          {total.toLocaleString()} total
        </p>
      </div>
      <div className="flex h-28 items-end gap-[3px]">
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 rounded-t-sm bg-accent-soft transition-colors hover:bg-accent"
            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="tag">{data[0]?.date}</span>
        <span className="tag">{data[data.length - 1]?.date}</span>
      </div>
    </div>
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
