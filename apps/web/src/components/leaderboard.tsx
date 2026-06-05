"use client";

import { useMemo, useState } from "react";
import {
  rankedStandings,
  tierFor,
  RANK_THRESHOLD,
  type Standing,
} from "@/lib/models";

type SortKey = "elo" | "winRate" | "matchCount";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "elo", label: "Elo" },
  { key: "winRate", label: "Win rate" },
  { key: "matchCount", label: "Votes" },
];

export function Leaderboard() {
  const [sort, setSort] = useState<SortKey>("elo");

  const ranked = useMemo(() => rankedStandings("tts"), []);
  const rows = useMemo(() => {
    // rank is always by elo; the sort only reorders the display
    const withRank = ranked.map((m, i) => ({ ...m, rank: i + 1 }));
    return [...withRank].sort((a, b) => b[sort] - a[sort]);
  }, [ranked, sort]);

  const eloRange = useMemo(() => {
    const elos = ranked.map((m) => m.elo);
    return { min: Math.min(...elos), max: Math.max(...elos) };
  }, [ranked]);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          Leaderboard
        </h1>
        <p className="mt-2 text-ink-2">
          Elo from blind pairwise votes. Models need more than {RANK_THRESHOLD}{" "}
          counted votes to be ranked.
        </p>
      </div>

      {/* Sort chips */}
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full border border-line bg-sunk p-1">
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((m) => (
          <Row
            key={m.id}
            model={m}
            rank={m.rank}
            sort={sort}
            eloRange={eloRange}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  model,
  rank,
  sort,
  eloRange,
}: {
  model: Standing & { rank: number };
  rank: number;
  sort: SortKey;
  eloRange: { min: number; max: number };
}) {
  const tier = tierFor(rank);
  const eloFrac =
    (model.elo - eloRange.min) / (eloRange.max - eloRange.min || 1);

  const value =
    sort === "elo"
      ? model.elo
      : sort === "winRate"
        ? `${model.winRate.toFixed(0)}%`
        : `${(model.matchCount / 1000).toFixed(1)}k`;
  const valueLabel =
    sort === "elo" ? "rating" : sort === "winRate" ? "win rate" : "votes";

  return (
    <div className="relative flex items-center gap-3 px-4 py-3.5">
      <span
        className="pointer-events-none absolute inset-y-1 left-1 rounded-[0.6rem] bg-accent-soft opacity-60"
        style={{ width: `calc((100% - 0.5rem) * ${0.12 + eloFrac * 0.88})` }}
      />
      <span
        className={`nums relative w-6 text-center text-sm font-semibold ${
          rank <= 3 ? "text-accent" : "text-ink-4"
        }`}
      >
        {rank}
      </span>

      {/* Tier chip */}
      {tier ? (
        <span className="relative grid h-6 w-6 place-items-center rounded-md bg-ink text-[0.65rem] font-bold text-canvas">
          {tier}
        </span>
      ) : (
        <span className="relative w-6" />
      )}

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={model.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[0.95rem] leading-tight font-semibold hover:text-accent"
          >
            {model.name}
          </a>
          {model.open && (
            <span className="shrink-0 rounded-full bg-fill px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-3">
              OSS
            </span>
          )}
        </div>
      </div>

      <div className="relative text-right">
        <p className="nums text-base leading-none font-semibold">{value}</p>
        <p className="tag mt-0.5">{valueLabel}</p>
      </div>
    </div>
  );
}
