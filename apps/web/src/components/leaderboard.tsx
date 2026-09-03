"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@base-ui-components/react/checkbox";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LeaderboardRow } from "@ttsa/shared";
import { fetchLeaderboard, leaderboardKey } from "@/lib/leaderboard";
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
  const [stealthOpen, setStealthOpen] = useState(false);
  // When on, the board also lists newly-added models that haven't yet earned
  // enough votes to be ranked normally (badged "Preliminary").
  const [showPreliminary, setShowPreliminary] = useState(false);
  const reduce = useReducedMotion();

  // Both variants are warmed at app start (see AppProviders), so this is a
  // cache read on arrival and on every toggle. keepPreviousData means the
  // board never blanks while the other variant refreshes — the rows stay put
  // and the new ones animate in around them.
  const variant = { type: "tts" as const, preliminary: showPreliminary };
  const {
    data: rows,
    isPending,
    isError,
    isFetching,
  } = useQuery({
    queryKey: leaderboardKey(variant),
    queryFn: () => fetchLeaderboard(variant),
    placeholderData: keepPreviousData,
  });

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      // Suspended (delisted) models always sink to the bottom, whatever the sort.
      if (a.suspended !== b.suspended) return a.suspended ? 1 : -1;
      if (sort === "elo") return a.rank - b.rank;
      return b[sort] - a[sort] || a.rank - b.rank;
    });
  }, [rows, sort]);

  const eloRange = useMemo(() => {
    if (!rows || rows.length === 0) return { min: 0, max: 1 };
    const elos = rows.map((m) => m.elo);
    return { min: Math.min(...elos), max: Math.max(...elos) };
  }, [rows]);

  // Each vote gives one appearance to the winner and one to the loser, so the
  // appearances across the board are twice the votes actually cast.
  const tally = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const appearances = rows.reduce((sum, m) => sum + m.totalVotes, 0);
    return { models: rows.length, votes: Math.round(appearances / 2) };
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
        {/* Scale of the thing, in the mono micro-label. The dot pulses while a
            refresh is in flight — the only "loading" cue once rows are up. */}
        <p className="tag mt-3 flex items-center justify-center gap-2">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full bg-accent transition-opacity ${
              isFetching ? "animate-pulse opacity-100" : "opacity-25"
            }`}
          />
          {tally
            ? `${tally.models} models · ${fmtVotes(tally.votes)} votes cast`
            : " "}
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
                className="relative rounded-full px-3.5 py-1.5 text-sm font-medium"
              >
                {on && (
                  <motion.span
                    layoutId="sort-pill"
                    transition={{ type: "spring", stiffness: 460, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  />
                )}
                <span
                  className={`relative transition-colors ${
                    on ? "text-ink" : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {s.label}
                </span>
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

      {isError ? (
        <p className="text-center text-sm text-ink-3">
          Couldn’t load the leaderboard.
        </p>
      ) : isPending ? (
        <BoardSkeleton />
      ) : sorted.length === 0 ? (
        <p className="text-center text-sm text-ink-3">
          No votes yet — be the first in the arena.
        </p>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          <AnimatePresence initial={false}>
            {sorted.map((m, i) => (
              <Row
                key={m.id}
                model={m}
                displayRank={m.suspended ? null : i + 1}
                sort={sort}
                eloRange={eloRange}
                animate={!reduce}
                onStealthClick={() => setStealthOpen(true)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <StealthModal open={stealthOpen} onClose={() => setStealthOpen(false)} />
    </div>
  );
}

/**
 * Placeholder board. Matches the real row geometry exactly, so the switch to
 * live rows is a fill rather than a jump — no reflow, no scroll shift.
 */
function BoardSkeleton() {
  return (
    <div className="card divide-y divide-line overflow-hidden" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="shimmer h-3 w-6 shrink-0 rounded" />
          <span className="shimmer h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="shimmer h-3.5 rounded"
              style={{ width: `${38 + ((i * 13) % 34)}%` }}
            />
            <span className="shimmer h-2.5 w-14 rounded" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="shimmer h-4 w-10 rounded" />
            <span className="shimmer h-2.5 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({
  model,
  displayRank,
  sort,
  eloRange,
  animate,
  onStealthClick,
}: {
  model: LeaderboardRow;
  displayRank: number | null;
  sort: SortKey;
  eloRange: { min: number; max: number };
  animate: boolean;
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

  const suspendedTitle = model.suspended
    ? `Suspended${model.suspendedAt ? ` on ${new Date(model.suspendedAt * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : ""}${model.suspendedReason ? ` for ${model.suspendedReason}` : ""}.`
    : "";

  return (
    <motion.div
      // Position-only layout animation: rows glide to their new place when the
      // sort changes instead of teleporting, and it stays cheap because nothing
      // interpolates size.
      layout={animate ? "position" : false}
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: model.suspended ? 0.55 : 1 }}
      exit={{ opacity: 0 }}
      className="relative flex items-center gap-3 px-4 py-3.5"
    >
      {!model.suspended && (
        <motion.span
          className="pointer-events-none absolute inset-y-1 left-1 origin-left rounded-[0.6rem] bg-accent-soft opacity-60"
          style={{ width: `calc((100% - 0.5rem) * ${0.12 + eloFrac * 0.88})` }}
          initial={animate ? { scaleX: 0 } : false}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      {/* Rank in mono, zero-padded — reads as a chart position rather than a
          number that happens to sit in a list. */}
      <span
        className={`relative w-6 text-center font-mono text-xs tabular-nums ${
          displayRank !== null && displayRank <= 3
            ? "font-semibold text-accent"
            : "text-ink-4"
        }`}
      >
        {displayRank === null ? "—" : String(displayRank).padStart(2, "0")}
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
            {!model.active && !model.suspended && (
              <span
                className="shrink-0 rounded-full border border-line bg-sunk px-2 py-0.5 text-[0.7rem] font-medium text-ink-3"
                title="This model has been retired and is no longer in rotation. Its rating is preserved from past votes."
              >
                Retired
              </span>
            )}
            {model.suspended && (
              <span
                className="shrink-0 cursor-help rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-red-500"
                title={suspendedTitle}
              >
                Suspended
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
    </motion.div>
  );
}
