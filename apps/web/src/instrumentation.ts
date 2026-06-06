/**
 * Next.js startup hook. Runs once per server process — starts the background
 * battle-session cleanup and refreshes the model roster (incl. icons) from the
 * router catalog so logo/metadata changes show up at boot without waiting for a
 * battle to land. Node runtime only (skips edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startCleanup } = await import("./server/arena/cleanup");
  startCleanup();

  // Resume any "Test All" run interrupted by a restart (drains leftover models).
  try {
    const { resumeInterruptedTestRuns } =
      await import("./server/admin/test-runner");
    await resumeInterruptedTestRuns();
  } catch (err) {
    console.error(
      "[instrumentation] resume test runs failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Refresh model metadata (name/url/icon) from the live router catalog. This
  // is what makes a provider's logo appear right after deploy — the boot seed
  // only knows about a couple of providers, and otherwise icons only refresh
  // when a battle happens to include that model. Best-effort.
  try {
    const { getCatalog, ensureModelsSeeded } =
      await import("./server/arena/catalog");
    const catalog = await getCatalog();
    await ensureModelsSeeded(catalog);
    console.info(
      `[instrumentation] refreshed ${catalog.length} model(s) from router catalog`,
    );
  } catch (err) {
    console.error(
      "[instrumentation] catalog refresh failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
