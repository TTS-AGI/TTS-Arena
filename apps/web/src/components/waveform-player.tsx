"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationFrame } from "motion/react";
import { makeWaveform } from "@/lib/models";

/**
 * Mocked player. Soft rounded bars; pressing play sweeps a playhead across
 * them over `duration`s. Played bars take the accent; the rest stay quiet.
 * No real audio — purely a visual scaffold.
 */
export function WaveformPlayer({
  seed,
  duration = 4.2,
  bars = 56,
}: {
  seed: string;
  duration?: number;
  bars?: number;
}) {
  const amps = makeWaveform(seed, bars);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);
  const bankedRef = useRef(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    bankedRef.current = 0;
    startRef.current = 0;
  }, [seed]);

  useAnimationFrame((t) => {
    if (!playing) return;
    if (startRef.current === 0) startRef.current = t;
    const elapsed = bankedRef.current + (t - startRef.current) / 1000;
    const p = Math.min(1, elapsed / duration);
    setProgress(p);
    if (p >= 1) {
      setPlaying(false);
      bankedRef.current = 0;
      startRef.current = 0;
      setProgress(0);
    }
  });

  function toggle() {
    if (playing) {
      bankedRef.current += (performance.now() - startRef.current) / 1000;
      startRef.current = 0;
      setPlaying(false);
    } else {
      startRef.current = 0;
      setPlaying(true);
    }
  }

  const elapsedSec = (progress * duration).toFixed(1);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-transform active:scale-95"
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="block h-3.5 w-[3px] rounded-full bg-current" />
            <span className="block h-3.5 w-[3px] rounded-full bg-current" />
          </span>
        ) : (
          <span className="ml-0.5 block h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
        )}
      </button>

      <div className="flex h-10 flex-1 items-center gap-[3px]" aria-hidden>
        {amps.map((a, i) => {
          const reached = i / (bars - 1) <= progress;
          return (
            <motion.span
              key={i}
              className="min-h-[10%] flex-1 rounded-full"
              style={{
                height: `${Math.round(a * 100)}%`,
                backgroundColor: reached
                  ? "var(--color-accent)"
                  : "var(--color-line-2)",
              }}
              animate={
                playing && reached ? { scaleY: [1, 1.1, 1] } : { scaleY: 1 }
              }
              transition={{
                duration: 0.5,
                repeat: playing && reached ? Infinity : 0,
                delay: (i % 6) * 0.05,
              }}
            />
          );
        })}
      </div>

      <span className="nums w-9 shrink-0 text-right font-mono text-xs text-ink-3">
        {elapsedSec}s
      </span>
    </div>
  );
}
