"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Dices, RotateCcw } from "lucide-react";
import type {
  GenerateResponse,
  RandomSentenceResponse,
  VoteResponse,
} from "@ttsa/shared";
import { WaveformPlayer, type WaveformHandle } from "./waveform-player";
import { SNAP } from "./motion";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import { CapModal } from "./cap-modal";

type Phase = "compose" | "generating" | "listen" | "revealed";
type Side = "a" | "b";
const MAX_LEN = 1000;
/** Seconds a clip must be heard (or its full length, if shorter) before voting. */
const MIN_LISTEN_SECONDS = 3;

type Battle = {
  sessionId: string;
  audioA: string;
  audioB: string;
};

type RevealedModel = VoteResponse["chosen"];

/** Resolve a side's revealed model: the winning side shows `chosen`. */
function modelForSide(
  side: Side,
  winner: Side | null,
  reveal: VoteResponse | null,
): RevealedModel | null {
  if (!reveal || !winner) return null;
  return side === winner ? reveal.chosen : reveal.rejected;
}

export function Arena() {
  const { requireAuth } = useAuth();
  const toast = useToast();

  const [text, setText] = useState("");
  // The exact prompt last loaded from the pool (Random). The vote counts as a
  // "dataset" prompt only if the user generates with this text unchanged.
  const poolText = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<Phase>("compose");
  const [battle, setBattle] = useState<Battle | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [reveal, setReveal] = useState<VoteResponse | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  // Cap verification token, reused across votes until the server asks for a new
  // one (needsCaptcha). Held in a ref so the retry sees the latest value.
  const capToken = useRef<string | null>(null);
  const pendingVote = useRef<Side | null>(null);

  // Player handles (for autoplay A→B) and per-side "listened enough" state.
  const playerA = useRef<WaveformHandle>(null);
  const playerB = useRef<WaveformHandle>(null);
  const [listened, setListened] = useState<{ a: boolean; b: boolean }>({
    a: false,
    b: false,
  });
  // Each clip's listen threshold = min(MIN_LISTEN_SECONDS, full duration).
  const threshold = useRef<{ a: number; b: number }>({
    a: MIN_LISTEN_SECONDS,
    b: MIN_LISTEN_SECONDS,
  });
  const canVote = listened.a && listened.b;

  // Auto-grow the composer with the text, up to a cap (then it scrolls). Keeps
  // short prompts compact while accommodating longer ones without a manual drag.
  const TEXTAREA_MAX_PX = 220;
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_PX ? "auto" : "hidden";
  }, [text]);

  function markListened(side: Side, current: number) {
    if (current >= threshold.current[side]) {
      setListened((prev) => (prev[side] ? prev : { ...prev, [side]: true }));
    }
  }

  const trimmed = text.trim();
  const overLimit = text.length > MAX_LEN;
  const canGenerate = trimmed.length > 0 && !overLimit;

  async function generate() {
    if (!canGenerate || !requireAuth()) return;
    setWinner(null);
    setReveal(null);
    setBattle(null);
    setListened({ a: false, b: false });
    threshold.current = { a: MIN_LISTEN_SECONDS, b: MIN_LISTEN_SECONDS };
    setPhase("generating");
    // "dataset" only if this is the pool prompt left exactly as served.
    const fromPool = poolText.current !== null && poolText.current === trimmed;
    try {
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, fromPool }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        throw new Error(body.detail ?? body.error ?? "generation failed");
      }
      const data = (await res.json()) as GenerateResponse;
      setBattle({
        sessionId: data.sessionId,
        audioA: data.audioA,
        audioB: data.audioB,
      });
      setPhase("listen");
    } catch (e) {
      toast.error(
        "Couldn't generate audio",
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
      setPhase("compose");
    }
  }

  async function randomize() {
    if (randomizing || phase !== "compose") return;
    setRandomizing(true);
    try {
      const res = await fetch("/api/sentences/random");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "couldn't fetch a random line");
      }
      const data = (await res.json()) as RandomSentenceResponse;
      setText(data.sentence);
      poolText.current = data.sentence.trim();
    } catch (e) {
      toast.error(
        "Couldn't fetch a random line",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setRandomizing(false);
    }
  }

  async function vote(side: Side) {
    if (!battle || !requireAuth()) return;
    const prev = phase;
    setWinner(side);
    setPhase("revealed");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (capToken.current) headers["x-cap-token"] = capToken.current;

      const res = await fetch("/api/tts/vote", {
        method: "POST",
        headers,
        body: JSON.stringify({ sessionId: battle.sessionId, chosen: side }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        throw new Error(body.detail ?? body.error ?? "vote failed");
      }
      const data = (await res.json()) as VoteResponse | { needsCaptcha: true };
      if ("needsCaptcha" in data) {
        // Server wants a captcha first; stash the choice, open the modal, and
        // retry once the token arrives. Used token is single-use → clear it.
        capToken.current = null;
        pendingVote.current = side;
        setPhase(prev);
        setWinner(null);
        setCapOpen(true);
        return;
      }
      setReveal(data);
    } catch (e) {
      toast.error(
        "Couldn't record your vote",
        e instanceof Error ? e.message : "Try again.",
      );
      setWinner(null);
      setPhase(prev);
    }
  }

  function onCapSolved(token: string) {
    capToken.current = token;
    setCapOpen(false);
    const side = pendingVote.current;
    pendingVote.current = null;
    if (side) void vote(side);
  }

  function reset() {
    setPhase("compose");
    setBattle(null);
    setWinner(null);
    setReveal(null);
  }

  const busy = phase === "generating";

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          Which voice sounds more human?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-balance text-ink-2">
          Hear the same line from two anonymous models and pick the better one.
          Names are revealed only after you vote.
        </p>
      </div>

      {/* Composer */}
      <div className="card overflow-hidden">
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          disabled={phase !== "compose"}
          placeholder="Type a line for both models to speak…"
          className="w-full resize-none bg-transparent px-5 pt-5 text-lg leading-relaxed outline-none disabled:opacity-55"
        />
        <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-4">
          {phase === "compose" ? (
            <button
              onClick={randomize}
              disabled={randomizing}
              className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-line disabled:opacity-50"
              title="Fill with a random line from the dataset"
            >
              {randomizing ? (
                <Spinner />
              ) : (
                <Dices className="h-4 w-4" aria-hidden />
              )}{" "}
              Random
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <span className={`tag ${overLimit ? "text-accent" : ""}`}>
              {text.length}/{MAX_LEN}
            </span>
            {phase === "compose" ? (
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              >
                Synthesize <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                onClick={reset}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-full bg-fill px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-line disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden /> New round
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Battle area */}
      <AnimatePresence>
        {phase !== "compose" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SNAP}
            className="grid gap-4 sm:grid-cols-2"
          >
            {busy || !battle ? (
              <>
                <LoadingCard side="A" />
                <LoadingCard side="B" />
              </>
            ) : (
              <>
                <Contestant
                  side="a"
                  src={battle.audioA}
                  phase={phase}
                  winner={winner}
                  model={modelForSide("a", winner, reveal)}
                  playerRef={playerA}
                  canVote={canVote}
                  onVote={() => vote("a")}
                  onReady={(d) => {
                    threshold.current.a = Math.min(MIN_LISTEN_SECONDS, d);
                    // Autoplay A as soon as it's ready.
                    playerA.current?.play();
                  }}
                  onProgress={(t) => markListened("a", t)}
                  onEnded={() => {
                    markListened("a", threshold.current.a);
                    // A finished → autoplay B.
                    playerB.current?.play();
                  }}
                />
                <Contestant
                  side="b"
                  src={battle.audioB}
                  phase={phase}
                  winner={winner}
                  model={modelForSide("b", winner, reveal)}
                  playerRef={playerB}
                  canVote={canVote}
                  onVote={() => vote("b")}
                  onReady={(d) => {
                    threshold.current.b = Math.min(MIN_LISTEN_SECONDS, d);
                  }}
                  onProgress={(t) => markListened("b", t)}
                  onEnded={() => markListened("b", threshold.current.b)}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {phase === "revealed" && reveal && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SNAP}
            className="card flex flex-col items-center gap-1 p-6 text-center"
          >
            <span className="tag">Result</span>
            <p className="text-xl font-semibold">
              You preferred {reveal.chosen.name}.
            </p>
            <p className="text-sm text-ink-2">
              over {reveal.rejected.name}
              {reveal.counted ? " · ratings updated" : ""}.{" "}
              <button onClick={reset} className="font-medium text-accent">
                Go again →
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <CapModal
        open={capOpen}
        onSolved={onCapSolved}
        onClose={() => {
          setCapOpen(false);
          pendingVote.current = null;
        }}
      />
    </div>
  );
}

/* ── Skeleton shown while generating ─────────────────────────────────── */
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
  src,
  phase,
  winner,
  model,
  playerRef,
  canVote,
  onVote,
  onReady,
  onProgress,
  onEnded,
}: {
  side: Side;
  src: string;
  phase: Phase;
  winner: Side | null;
  model: RevealedModel | null;
  playerRef: React.Ref<WaveformHandle>;
  canVote: boolean;
  onVote: () => void;
  onReady: (durationSeconds: number) => void;
  onProgress: (currentSeconds: number) => void;
  onEnded: () => void;
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
            {revealed && model ? (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={SNAP}
              >
                {model.url ? (
                  <a
                    href={model.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm leading-tight font-semibold hover:text-accent"
                  >
                    {model.name}
                  </a>
                ) : (
                  <span className="text-sm leading-tight font-semibold">
                    {model.name}
                  </span>
                )}
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

      <WaveformPlayer
        ref={playerRef}
        src={src}
        onReady={onReady}
        onProgress={onProgress}
        onEnded={onEnded}
      />

      {!revealed && (
        <button
          onClick={onVote}
          disabled={!canVote}
          title={canVote ? undefined : "Listen to both clips first"}
          className="rounded-xl bg-fill py-3 text-sm font-semibold transition-colors hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-fill disabled:hover:text-ink"
        >
          {canVote ? `Vote ${label}` : "Listen to both…"}
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
