"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardResponse, LeaderboardRow } from "@ttsa/shared";

type SortKey = "elo" | "winRate" | "totalVotes";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "elo", label: "Rating" },
  { key: "winRate", label: "Win rate" },
  { key: "totalVotes", label: "Votes" },
];

export function Leaderboard() {
  const [sort, setSort] = useState<SortKey>("elo");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/leaderboard?type=tts")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<LeaderboardResponse>;
      })
      .then((d) => active && setRows(d.rows))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => b[sort] - a[sort]);
  }, [rows, sort]);

  const eloRange = useMemo(() => {
    if (!rows || rows.length === 0) return { min: 0, max: 1 };
    const elos = rows.map((m) => m.elo);
    return { min: Math.min(...elos), max: Math.max(...elos) };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          Leaderboard
        </h1>
        <p className="mt-2 text-ink-2">
          Ratings from blind pairwise votes. New models appear quickly and
          settle as the votes pile up.
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

      {error ? (
        <p className="text-center text-sm text-ink-3">
          Couldn’t load the leaderboard.
        </p>
      ) : rows === null ? (
        <p className="text-center text-sm text-ink-3">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-ink-3">
          No votes yet — be the first in the arena.
        </p>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {sorted.map((m, i) => (
            <Row
              key={m.id}
              model={m}
              displayRank={i + 1}
              sort={sort}
              eloRange={eloRange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  model,
  displayRank,
  sort,
  eloRange,
}: {
  model: LeaderboardRow;
  displayRank: number;
  sort: SortKey;
  eloRange: { min: number; max: number };
}) {
  const eloFrac =
    (model.elo - eloRange.min) / (eloRange.max - eloRange.min || 1);

  const value =
    sort === "elo"
      ? model.elo
      : sort === "winRate"
        ? `${model.winRate.toFixed(0)}%`
        : model.totalVotes >= 1000
          ? `${(model.totalVotes / 1000).toFixed(1)}k`
          : String(model.totalVotes);
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
          displayRank <= 3 ? "text-accent" : "text-ink-4"
        }`}
      >
        {displayRank}
      </span>

      <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
        <ModelLogo icon={model.icon} />
        <a
          href={model.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[0.95rem] leading-tight font-semibold hover:text-accent"
        >
          {model.name}
        </a>
      </div>

      <div className="relative text-right">
        <p
          className={`nums text-base leading-none font-semibold ${
            model.preliminary ? "text-ink-2" : ""
          }`}
        >
          {value}
        </p>
        <p className="tag mt-0.5">{valueLabel}</p>
      </div>
    </div>
  );
}

/**
 * Provider logo on the leaderboard. Rendered on a white rounded tile so logos
 * with black artwork (or transparent backgrounds) stay legible in both themes.
 * When there's no icon (or it fails to load), render a blank tile — no monogram
 * letter — to keep the name column aligned.
 */
function ModelLogo({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);
  if (icon && !broken) {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-0.5 ring-1 ring-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt=""
          aria-hidden
          onError={() => setBroken(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  return <span aria-hidden className="h-6 w-6 shrink-0 rounded-md bg-fill" />;
}
