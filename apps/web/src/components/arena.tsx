"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WaveformPlayer } from "./waveform-player";
import { SNAP } from "./motion";
import { useAuth } from "./auth";
import { pickPair, PROMPTS, type TTSModel } from "@/lib/models";

type Phase = "compose" | "generating" | "listen" | "revealed";
type Side = "a" | "b";
const MAX_LEN = 1000;

export function Arena() {
  const { requireAuth } = useAuth();
  const counter = useRef(0);

  const [text, setText] = useState(PROMPTS[0]);
  const [phase, setPhase] = useState<Phase>("compose");
  const [pair, setPair] = useState<[TTSModel, TTSModel] | null>(null);
  const [seed, setSeed] = useState("b0");
  const [winner, setWinner] = useState<Side | null>(null);

  const overLimit = text.length > MAX_LEN;
  const canGenerate = text.trim().length > 0 && !overLimit;

  function randomize() {
    let next = text;
    while (next === text && PROMPTS.length > 1) {
      next = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    }
    setText(next);
  }

  async function generate() {
    if (!canGenerate) return;
    if (!(await requireAuth())) return; // login required to generate

    counter.current += 1;
    const s = `tts-${counter.current}`; // always a defined string
    setSeed(s);
    setWinner(null);
    setPair(null);
    setPhase("generating");

    // Simulate the backend round-trip (real arena generates two clips).
    window.setTimeout(() => {
      setPair(pickPair("tts", s));
      setPhase("listen");
    }, 1200);
  }

  // Binary vote only — no tie / skip, exactly like the real arena.
  async function vote(side: Side) {
    if (!(await requireAuth())) return;
    setWinner(side);
    setPhase("revealed");
  }

  function reset() {
    setPhase("compose");
    setPair(null);
    setWinner(null);
  }

  const busy = phase === "generating";

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          Which voice sounds more human?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-balance text-ink-2">
          Pick the better of two anonymous models. Every vote feeds the Elo
          leaderboard.
        </p>
      </div>

      {/* Composer */}
      <div className="card overflow-hidden">
        <textarea
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          disabled={phase !== "compose"}
          placeholder="Type something to synthesize…"
          className="w-full resize-none bg-transparent px-5 pt-5 text-lg leading-relaxed outline-none disabled:opacity-55"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2 pb-4">
          <button
            onClick={() => phase === "compose" && randomize()}
            disabled={phase !== "compose"}
            className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-line hover:text-ink disabled:opacity-40"
          >
            <ShuffleIcon /> Random line
          </button>
          <div className="flex items-center gap-3">
            <span className={`tag ${overLimit ? "text-accent" : ""}`}>
              {text.length}/{MAX_LEN}
            </span>
            {phase === "compose" ? (
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              >
                Synthesize →
              </button>
            ) : (
              <button
                onClick={reset}
                disabled={busy}
                className="rounded-full bg-fill px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-line disabled:opacity-50"
              >
                ↺ New round
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Battle area — the grid persists across busy→listen so cards just
          swap in place (no skeleton→cards slide). Only its first mount fades. */}
      <AnimatePresence>
        {phase !== "compose" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SNAP}
            className="grid gap-4 sm:grid-cols-2"
          >
            {busy || !pair ? (
              <>
                <LoadingCard side="A" />
                <LoadingCard side="B" />
              </>
            ) : (
              <>
                <Contestant
                  side="a"
                  model={pair[0]}
                  seed={`${seed}-a`}
                  phase={phase}
                  winner={winner}
                  onVote={() => vote("a")}
                />
                <Contestant
                  side="b"
                  model={pair[1]}
                  seed={`${seed}-b`}
                  phase={phase}
                  winner={winner}
                  onVote={() => vote("b")}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result (binary — no tie) */}
      <AnimatePresence>
        {phase === "revealed" && pair && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SNAP}
            className="card flex flex-col items-center gap-1 p-6 text-center"
          >
            <span className="tag">Result</span>
            <p className="text-xl font-semibold">
              You preferred {(winner === "a" ? pair[0] : pair[1]).name}.
            </p>
            <p className="text-sm text-ink-2">
              over {(winner === "a" ? pair[1] : pair[0]).name} · Elo updated.{" "}
              <button onClick={reset} className="font-medium text-accent">
                Vote again →
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Skeleton shown while "generating" ───────────────────────────────── */
function LoadingCard({ side }: { side: string }) {
  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-fill text-sm font-semibold">
          {side}
        </span>
        <span className="flex items-center gap-2 text-sm font-medium text-ink-3">
          <Spinner /> Synthesizing…
        </span>
      </div>
      {/* shimmering placeholder bars */}
      <div className="flex h-10 items-center gap-[3px]">
        {Array.from({ length: 56 }).map((_, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-full bg-line-2"
            style={{ height: `${20 + ((i * 37) % 60)}%` }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              delay: (i % 8) * 0.06,
            }}
          />
        ))}
      </div>
      <div className="h-[2.6rem] rounded-xl bg-fill" />
    </div>
  );
}

/* ── A contestant card (anonymous until revealed) ────────────────────── */
function Contestant({
  side,
  model,
  seed,
  phase,
  winner,
  onVote,
}: {
  side: Side;
  model: TTSModel;
  seed: string;
  phase: Phase;
  winner: Side | null;
  onVote: () => void;
}) {
  const revealed = phase === "revealed";
  const isWinner = winner === side;
  const label = side.toUpperCase();
  return (
    <div
      className={`card relative flex flex-col gap-5 p-5 transition-colors ${revealed && isWinner ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-fill text-sm font-semibold">
            {label}
          </span>
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={SNAP}
              >
                <a
                  href={model.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm leading-tight font-semibold hover:text-accent"
                >
                  {model.name}
                </a>
                <p className="tag">{model.open ? "Open source" : "Closed"}</p>
              </motion.div>
            ) : (
              <motion.span
                key="anon"
                exit={{ opacity: 0 }}
                className="text-sm font-medium text-ink-3"
              >
                Model {label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {revealed && isWinner && (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            Your pick
          </span>
        )}
      </div>

      <WaveformPlayer seed={seed} />

      {!revealed && (
        <button
          onClick={onVote}
          className="rounded-xl bg-fill py-3 text-sm font-semibold transition-colors hover:bg-ink hover:text-canvas"
        >
          Vote {label}
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

function ShuffleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}
