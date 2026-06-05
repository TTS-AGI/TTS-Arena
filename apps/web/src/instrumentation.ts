/**
 * Next.js startup hook. Runs once per server process — used to start the
 * background battle-session cleanup. Node runtime only (skips edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCleanup } = await import("./server/arena/cleanup");
    startCleanup();
  }
}
