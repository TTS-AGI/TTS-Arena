"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type {
  AdminSecurityOverview,
  AdminSecurityEvent,
  AdminIpLookup,
} from "@ttsa/shared";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { fmtDate } from "@/components/admin/data-table";

async function fetchOverview(): Promise<AdminSecurityOverview> {
  const res = await fetch("/api/admin/security/overview");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-accent",
  warn: "text-amber-500",
  info: "text-ink-3",
};

export default function AdminSecurityPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "security", "overview"],
    queryFn: fetchOverview,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Security"
        subtitle="Anti-fraud signals, flagged votes, and the event feed."
      />

      {error ? (
        <p className="text-sm text-accent">Couldn’t load security data.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Flagged votes"
              value={data.flaggedVotes.toLocaleString()}
            />
            <StatCard
              label="Flagged %"
              value={
                data.totalVotes
                  ? `${((data.flaggedVotes / data.totalVotes) * 100).toFixed(1)}%`
                  : "0%"
              }
            />
            <StatCard
              label="Quarantined"
              value={data.quarantinedUsers.toLocaleString()}
            />
            <StatCard
              label="Total votes"
              value={data.totalVotes.toLocaleString()}
            />
          </div>

          {/* Vote-ring alerts — the headline signal */}
          <RingAlerts models={data.suspiciousModels} />

          {/* IP lookup */}
          <IpLookup />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Events by severity */}
            <div className="card p-4">
              <p className="tag mb-3">Events by severity</p>
              <ul className="flex flex-col gap-2">
                {data.eventsBySeverity.length === 0 && (
                  <li className="text-sm text-ink-3">No events yet.</li>
                )}
                {data.eventsBySeverity.map((s) => (
                  <li
                    key={s.severity}
                    className="flex items-center justify-between text-sm"
                  >
                    <span
                      className={`capitalize ${SEV_COLOR[s.severity] ?? ""}`}
                    >
                      {s.severity}
                    </span>
                    <span className="nums font-medium">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Top risky IPs */}
            <div className="card p-4">
              <p className="tag mb-3">IPs shared by multiple accounts</p>
              <ul className="flex flex-col gap-1.5">
                {data.topRiskyIps.length === 0 && (
                  <li className="text-sm text-ink-3">None.</li>
                )}
                {data.topRiskyIps.map((r) => (
                  <li
                    key={r.ip}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="nums font-mono text-xs">{r.ip}</span>
                    <span className="text-ink-3">{r.accounts} accounts</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Quarantined users */}
          {data.quarantined.length > 0 && (
            <div className="card p-4">
              <p className="tag mb-3">Quarantined users</p>
              <ul className="flex flex-col divide-y divide-line">
                {data.quarantined.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {u.username}
                    </Link>
                    <span className="tag">trust {u.trustScore.toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recent events */}
          <div className="card overflow-hidden">
            <p className="tag border-b border-line px-4 py-3">Recent events</p>
            <ul className="divide-y divide-line">
              {data.recentEvents.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink-3">
                  No security events yet — that’s a good thing.
                </li>
              )}
              {data.recentEvents.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: AdminSecurityEvent }) {
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={`font-medium ${SEV_COLOR[e.severity] ?? ""}`}>
            {e.kind}
          </span>
          {e.username && (
            <Link
              href={`/admin/users/${e.userId}`}
              className="text-ink-3 hover:text-accent"
            >
              @{e.username}
            </Link>
          )}
        </span>
        <span className="tag">{fmtDate(e.createdAt)}</span>
      </div>
      {e.detail && (
        <p className="mt-0.5 truncate font-mono text-xs text-ink-3">
          {e.detail}
        </p>
      )}
    </li>
  );
}

/* ── Vote-ring alerts ─────────────────────────────────────────────────── */

function RingAlerts({
  models,
}: {
  models: AdminSecurityOverview["suspiciousModels"];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="tag">Vote-ring alerts</p>
        <span className="text-xs text-ink-3">
          models with a cluster of anomalous voters
        </span>
      </div>
      {models.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-3">
          No suspicious clusters — a lone superfan doesn’t trip this; it takes
          several accounts converging on one model.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {models.map((m) => (
            <li key={m.modelId} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/models/${m.modelId}`}
                  className="font-semibold hover:text-accent"
                >
                  {m.modelName}
                </Link>
                <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.7rem] font-medium text-accent">
                  {m.anomalousAccounts} anomalous accounts
                </span>
                {m.sharedIpAccounts > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-amber-500">
                    {m.sharedIpAccounts} share an IP
                  </span>
                )}
                <span className="tag">max z {m.maxAnomalyZ.toFixed(1)}</span>
                <span className="tag">
                  ~{m.inflatedVotes.toLocaleString()} inflated votes
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {m.accounts.map((a) => (
                  <li
                    key={a.userId}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/admin/users/${a.userId}`}
                      className="text-ink-2 hover:text-accent"
                    >
                      @{a.username}
                    </Link>
                    <span className="flex items-center gap-3 text-xs text-ink-3">
                      <span className="nums">
                        {a.picks}/{a.battles} ({a.preferPct.toFixed(0)}%)
                      </span>
                      <span className="nums font-medium text-accent">
                        z {a.anomalyZ.toFixed(1)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── IP lookup ────────────────────────────────────────────────────────── */

function IpLookup() {
  const [ip, setIp] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "ip-lookup", query],
    queryFn: async (): Promise<AdminIpLookup> => {
      const res = await fetch(`/api/admin/ips?ip=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: query.length > 0,
  });

  return (
    <div className="card p-4">
      <p className="tag mb-3">Look up accounts by IP</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(ip.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="e.g. 23.249.17.75"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-on-accent"
        >
          Search
        </button>
      </form>

      {query && (
        <div className="mt-3">
          {isFetching ? (
            <p className="text-sm text-ink-3">Searching…</p>
          ) : !data || data.accounts.length === 0 ? (
            <p className="text-sm text-ink-3">
              No accounts have logged in from {query}.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.accounts.map((a) => (
                <li key={a.userId} className="py-2">
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      href={`/admin/users/${a.userId}`}
                      className="font-medium hover:text-accent"
                    >
                      {a.username}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      {a.quarantined && (
                        <span className="text-accent">quarantined</span>
                      )}
                      <span className="nums">
                        {a.totalVotes.toLocaleString()} votes
                      </span>
                      <span className="tag">
                        trust {a.trustScore.toFixed(0)}
                      </span>
                    </span>
                  </div>
                  {a.otherIps.length > 0 && (
                    <p className="mt-0.5 truncate font-mono text-[0.7rem] text-ink-3">
                      also: {a.otherIps.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
