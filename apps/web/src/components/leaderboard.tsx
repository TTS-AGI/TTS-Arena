"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@base-ui-components/react/checkbox";
import type { LeaderboardResponse, LeaderboardRow } from "@ttsa/shared";
import { ModelLogo } from "./model-logo";
import { StealthModal } from "./stealth-modal";

/** Stealth (anonymous pre-release) models are marked by the ghost logo. */
const STEALTH_ICON = "/logos/stealth.webp";
const isStealth = (m: LeaderboardRow) => m.icon === STEALTH_ICON;

/** Compact vote count: 1234 → "1.2k". */
function fmtVotes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

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
  const [stealthOpen, setStealthOpen] = useState(false);
  // When on, the board also lists newly-added models that haven't yet earned
  // enough votes to be ranked normally (badged "Preliminary").
  const [showPreliminary, setShowPreliminary] = useState(false);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    const url = showPreliminary
      ? "/api/leaderboard?type=tts&preliminary=1"
      : "/api/leaderboard?type=tts";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<LeaderboardResponse>;
      })
      .then((d) => active && setRows(d.rows))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [showPreliminary]);

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
          Ratings from blind pairwise votes. Ratings settle as the votes pile
          up; newer models join once they’ve earned enough.
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

      {/* Show-preliminary toggle */}
      <div className="flex justify-center">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2 select-none">
          <Checkbox.Root
            checked={showPreliminary}
            onCheckedChange={setShowPreliminary}
            className="grid h-4.5 w-4.5 place-items-center rounded-[0.3rem] border border-line bg-surface transition-colors data-[checked]:border-accent data-[checked]:bg-accent"
          >
            <Checkbox.Indicator className="text-white">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                <path
                  d="M2.5 6.2 4.8 8.5 9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Checkbox.Indicator>
          </Checkbox.Root>
          Show new models with few votes
        </label>
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
              onStealthClick={() => setStealthOpen(true)}
            />
          ))}
        </div>
      )}

      <StealthModal open={stealthOpen} onClose={() => setStealthOpen(false)} />
    </div>
  );
}

function Row({
  model,
  displayRank,
  sort,
  eloRange,
  onStealthClick,
}: {
  model: LeaderboardRow;
  displayRank: number;
  sort: SortKey;
  eloRange: { min: number; max: number };
  onStealthClick: () => void;
}) {
  const eloFrac =
    (model.elo - eloRange.min) / (eloRange.max - eloRange.min || 1);

  const value =
    sort === "elo"
      ? model.elo
      : sort === "winRate"
        ? `${model.winRate.toFixed(0)}%`
        : fmtVotes(model.totalVotes);
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
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {isStealth(model) ? (
              <button
                onClick={onStealthClick}
                className="truncate text-left text-[0.95rem] leading-tight font-semibold hover:text-accent"
              >
                {model.name}
              </button>
            ) : model.url ? (
              <a
                href={model.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[0.95rem] leading-tight font-semibold hover:text-accent"
              >
                {model.name}
              </a>
            ) : (
              <span className="truncate text-[0.95rem] leading-tight font-semibold">
                {model.name}
              </span>
            )}
            {model.preliminary && model.active && (
              <span
                className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.7rem] font-medium text-accent"
                title="Preliminary — fewer than 300 votes, so this rating is still settling and may move as more votes come in."
              >
                Preliminary
              </span>
            )}
            {!model.active && (
              <span
                className="shrink-0 rounded-full border border-line bg-sunk px-2 py-0.5 text-[0.7rem] font-medium text-ink-3"
                title="This model has been retired and is no longer in rotation. Its rating is preserved from past votes."
              >
                Retired
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-4">
            {fmtVotes(model.totalVotes)} votes
          </p>
        </div>
      </div>

      <div className="relative text-right">
        <p
          className={`nums text-base leading-none font-semibold ${
            model.preliminary ? "text-ink-2" : ""
          }`}
        >
          {value}
          {sort === "elo" && (
            <span className="ml-1 text-xs font-normal text-ink-4">
              ±{model.uncertainty}
            </span>
          )}
        </p>
        <p className="tag mt-0.5">{valueLabel}</p>
      </div>
    </div>
  );
}
