"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

/**
 * Real audio player built on Wavesurfer.js. Renders the decoded waveform of a
 * remote clip and plays it with a click. Themed to the design tokens; the
 * played portion takes the accent.
 */
export function WaveformPlayer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const ink3 = styles.getPropertyValue("--color-line-2").trim() || "#ccc";
    const accent =
      styles.getPropertyValue("--color-accent").trim() || "#5b5bd6";

    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 40,
      waveColor: ink3,
      progressColor: accent,
      cursorWidth: 0,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      normalize: true,
      url: src,
    });
    wsRef.current = ws;

    ws.on("ready", () => setReady(true));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => {
      setPlaying(false);
      setElapsed(0);
    });
    ws.on("timeupdate", (t) => setElapsed(t));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [src]);

  function toggle() {
    wsRef.current?.playPause();
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={toggle}
        disabled={!ready}
        aria-label={playing ? "Pause" : "Play"}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-transform active:scale-95 disabled:opacity-40"
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

      <div ref={containerRef} className="h-10 flex-1" />

      <span className="nums w-9 shrink-0 text-right font-mono text-xs text-ink-3">
        {elapsed.toFixed(1)}s
      </span>
    </div>
  );
}
