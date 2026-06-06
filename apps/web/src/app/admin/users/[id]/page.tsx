"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserDetail } from "@ttsa/shared";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { fmtDate, truncate } from "@/components/admin/data-table";
import { AreaChartCard, HBarChartCard } from "@/components/admin/charts";
import { useToast } from "@/components/toast";

async function fetchUser(id: string): Promise<AdminUserDetail> {
  const res = await fetch(`/api/admin/users/${id}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => fetchUser(id),
  });

  const quarantineMutation = useMutation({
    mutationFn: async (quarantined: boolean) => {
      const res = await fetch(`/api/admin/users/${id}/quarantine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarantined }),
      });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: (_d, quarantined) => {
      qc.invalidateQueries({ queryKey: ["admin", "user", id] });
      toast.success(quarantined ? "User quarantined" : "User released");
    },
    onError: () => toast.error("Couldn’t update user"),
  });

  if (error) {
    return (
      <div>
        <PageHeader title="User" />
        <p className="text-sm text-accent">User not found.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={data ? data.user.username : "User"}
        subtitle={
          data ? `User #${data.user.id} · ${data.user.hfId}` : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={() =>
                  quarantineMutation.mutate(!data.user.quarantined)
                }
                disabled={quarantineMutation.isPending}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  data.user.quarantined
                    ? "bg-accent-soft text-accent hover:bg-accent hover:text-canvas"
                    : "bg-fill hover:bg-line"
                }`}
              >
                {data.user.quarantined ? "Release" : "Quarantine"}
              </button>
            )}
            <Link
              href="/admin/users"
              className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> All users
            </Link>
          </div>
        }
      />

      {isLoading || !data ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {data.user.quarantined && (
            <div className="card border-l-4 border-l-accent px-4 py-3 text-sm">
              <span className="font-semibold text-accent">Quarantined</span>
              <span className="text-ink-2">
                {" "}
                — this user’s votes don’t count toward ratings.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Votes" value={data.user.voteCount} />
            <StatCard label="Flagged" value={data.flaggedVotes} />
            <StatCard label="Trust" value={Math.round(data.user.trustScore)} />
            <StatCard label="Logins" value={data.logins.length} />
          </div>

          {/* Activity + choice charts */}
          <AreaChartCard
            title="Activity per day (30d)"
            data={data.votesByDay}
            xKey="date"
            series={[{ key: "count", label: "Votes" }]}
          />
          {data.choiceDistribution.length > 0 && (
            <HBarChartCard
              title="Models this user picks"
              data={data.choiceDistribution}
              labelKey="model"
              valueKey="count"
            />
          )}

          {/* Logins: IP / UA / fingerprint history */}
          <div className="card overflow-hidden">
            <p className="tag border-b border-line px-4 py-3">
              Login history ({data.logins.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="tag px-4 py-2">When</th>
                    <th className="tag px-4 py-2">IP</th>
                    <th className="tag px-4 py-2">Fingerprint</th>
                    <th className="tag px-4 py-2">User agent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logins.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-ink-3"
                      >
                        No logins recorded.
                      </td>
                    </tr>
                  )}
                  {data.logins.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="tag px-4 py-2 whitespace-nowrap">
                        {fmtDate(l.createdAt)}
                      </td>
                      <td className="nums px-4 py-2">{l.ip ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-3">
                        {l.fingerprint ? truncate(l.fingerprint, 16) : "—"}
                      </td>
                      <td className="px-4 py-2 text-ink-3">
                        {l.userAgent ? truncate(l.userAgent, 60) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent votes */}
          <div className="card overflow-hidden">
            <p className="tag border-b border-line px-4 py-3">
              Recent votes ({data.votes.length})
            </p>
            <ul className="divide-y divide-line">
              {data.votes.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink-3">
                  No votes.
                </li>
              )}
              {data.votes.map((v) => (
                <li key={v.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium text-ink-2">
                        {v.chosenModel}
                      </span>{" "}
                      <span className="text-ink-3">over {v.rejectedModel}</span>
                    </span>
                    <span className="tag">{fmtDate(v.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-ink-3">{truncate(v.text, 90)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
