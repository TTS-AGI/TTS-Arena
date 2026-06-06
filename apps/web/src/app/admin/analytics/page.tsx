"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminAnalytics } from "@ttsa/shared";
import { PageHeader, StatCard } from "@/components/admin/shell";

async function fetchAnalytics(): Promise<AdminAnalytics> {
  const res = await fetch("/api/admin/analytics");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminAnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: fetchAnalytics,
  });

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Pool, vote mix, and voices." />

      {error ? (
        <p className="text-sm text-accent">Couldn’t load analytics.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Sentence pool */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Pool size"
              value={data.sentencePool.total.toLocaleString()}
            />
            <StatCard
              label="Consumed"
              value={data.sentencePool.consumed.toLocaleString()}
            />
            <StatCard
              label="Remaining"
              value={data.sentencePool.remaining.toLocaleString()}
            />
            <StatCard
              label="Used"
              value={`${data.sentencePool.consumptionPct}%`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Votes by origin */}
            <div className="card p-4">
              <p className="tag mb-3">Votes by prompt origin</p>
              <ul className="flex flex-col gap-2">
                {data.votesByOrigin.length === 0 && (
                  <li className="text-sm text-ink-3">No votes yet.</li>
                )}
                {data.votesByOrigin.map((o) => (
                  <li
                    key={o.origin}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize">{o.origin}</span>
                    <span className="nums font-medium">
                      {o.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Top models by votes */}
            <div className="card p-4">
              <p className="tag mb-3">Most-voted models</p>
              <ul className="flex flex-col gap-1.5">
                {data.topModelsByVotes.length === 0 && (
                  <li className="text-sm text-ink-3">No data.</li>
                )}
                {data.topModelsByVotes.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="nums ml-2 font-medium">{m.votes}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Top voices */}
          <div className="card overflow-hidden">
            <p className="tag border-b border-line px-4 py-3">
              Top voices by appearances
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="tag px-4 py-2">Model</th>
                    <th className="tag px-4 py-2">Voice</th>
                    <th className="tag px-4 py-2">Wins</th>
                    <th className="tag px-4 py-2">Matches</th>
                    <th className="tag px-4 py-2">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topVoices.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-ink-3"
                      >
                        No voice stats yet.
                      </td>
                    </tr>
                  )}
                  {data.topVoices.map((v, i) => (
                    <tr
                      key={`${v.modelId}-${v.voice}-${i}`}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="px-4 py-2">{v.modelId}</td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-3">
                        {v.voice}
                      </td>
                      <td className="nums px-4 py-2">{v.winCount}</td>
                      <td className="nums px-4 py-2">{v.matchCount}</td>
                      <td className="nums px-4 py-2">
                        {v.matchCount
                          ? `${((v.winCount / v.matchCount) * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
