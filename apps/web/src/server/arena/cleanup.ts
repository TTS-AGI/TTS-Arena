/**
 * Background cleanup: periodically evict expired battle sessions (DB rows +
 * their cached audio). Sessions are also purged lazily on access, so this is a
 * safety net for sessions that are generated but never voted on.
 */
import { sweepExpired } from "./session-store";
import { runSecuritySweep } from "../security/sweep";
import {
  errInfo,
  logErrorEvent,
  pruneErrorEvents,
} from "../observability/errors";
import { pruneGenerationEvents } from "../observability/generation";

const INTERVAL_MS = 5 * 60 * 1000;
/** Security sweep runs less often (cross-entity analysis is heavier). */
const SECURITY_INTERVAL_MS = 10 * 60 * 1000;

let started = false;

/** Start the periodic sweep once per server process. Idempotent. */
export function startCleanup(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const removed = await sweepExpired();
      if (removed > 0) {
        console.info(`[cleanup] removed ${removed} expired battle session(s)`);
      }
      // Prune old observability rows on the same cadence (best-effort).
      await pruneErrorEvents();
      await pruneGenerationEvents();
    } catch (err) {
      const info = errInfo(err);
      console.error("[cleanup] sweep failed:", info.message);
      void logErrorEvent({
        source: "cleanup",
        message: info.message,
        stack: info.stack,
      });
    }
  };

  const securityTick = async () => {
    try {
      await runSecuritySweep();
    } catch (err) {
      const info = errInfo(err);
      console.error("[cleanup] security sweep failed:", info.message);
      void logErrorEvent({
        source: "security_sweep",
        message: info.message,
        stack: info.stack,
      });
    }
  };

  // Kick once shortly after boot, then on an interval.
  setTimeout(tick, 30_000);
  setTimeout(securityTick, 90_000);
  const timer = setInterval(tick, INTERVAL_MS);
  const secTimer = setInterval(securityTick, SECURITY_INTERVAL_MS);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  if (typeof secTimer === "object" && "unref" in secTimer) secTimer.unref();
}
