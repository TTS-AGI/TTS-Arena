"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AdminUserDetail } from "@ttsa/shared";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { fmtDate, truncate } from "@/components/admin/data-table";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => fetchUser(id),
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
          <Link
            href="/admin/users"
            className="rounded-full bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line"
          >
            ← All users
          </Link>
        }
      />

      {isLoading || !data ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Votes" value={data.user.voteCount} />
            <StatCard label="Logins" value={data.logins.length} />
            <StatCard label="Joined" value={fmtDate(data.user.joinDate)} />
            <StatCard
              label="HF account"
              value={
                data.user.hfAccountCreated
                  ? fmtDate(data.user.hfAccountCreated)
                  : "—"
              }
            />
          </div>

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
