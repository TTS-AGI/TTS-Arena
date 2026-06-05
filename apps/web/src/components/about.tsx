"use client";

import { useState } from "react";
import { Switch } from "@base-ui-components/react/switch";
import { useAuth } from "./auth";

const STEPS = [
  {
    n: "01",
    t: "Type",
    d: "Enter a line, or pull a random one from the prompt set.",
  },
  { n: "02", t: "Listen", d: "Two anonymous models — A and B — read it back." },
  {
    n: "03",
    t: "Vote",
    d: "Pick the one that sounds more human. No ties, no skips.",
  },
  { n: "04", t: "Rank", d: "Each vote nudges both models' Elo, like chess." },
];

const RULES = [
  "Sign in with Hugging Face to generate and vote — accounts must be ≥30 days old.",
  "TTS prompts are English-only and capped at 1,000 characters.",
  "Models stay anonymous until you've voted; only then are A and B revealed.",
  "A model needs more than 250 counted votes before it appears on the board.",
];

export function About() {
  const { user } = useAuth();
  // Mirrors the real "show me on the leaderboard" toggle (per-account).
  const [listed, setListed] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          A benchmark you can hear.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-balance text-ink-2">
          TTS Arena ranks text-to-speech and conversational models the only way
          that really matters — by ear, in a blind head-to-head.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="card flex items-start gap-3 p-4">
            <span className="tag pt-0.5">{s.n}</span>
            <div>
              <p className="leading-tight font-semibold">{s.t}</p>
              <p className="mt-0.5 text-sm text-ink-2">{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      {/* The rules of the arena */}
      <div className="card p-5">
        <p className="tag mb-3">House rules</p>
        <ul className="flex flex-col gap-2.5">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm text-ink-2">
              <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Per-account leaderboard visibility — signed-in users only */}
      {user && (
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="font-medium">Show me on the top-voters board</p>
            <p className="text-sm text-ink-2">
              Appear publicly in the voter rankings.
            </p>
          </div>
          <Switch.Root
            checked={listed}
            onCheckedChange={setListed}
            className="relative h-7 w-12 cursor-pointer rounded-full bg-line-2 px-0.5 transition-colors data-[checked]:bg-accent"
          >
            <Switch.Thumb className="block h-6 w-6 translate-x-0 rounded-full bg-surface shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[checked]:translate-x-5" />
          </Switch.Root>
        </div>
      )}
    </div>
  );
}
