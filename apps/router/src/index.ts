/**
 * Router entrypoint. Loads private provider plugins, then serves the Hono app
 * on Bun. Port via PORT (default 8080).
 */
import { createApp } from "./app";
import { loadPlugins } from "./load-providers";

await loadPlugins();

const app = createApp();
const port = Number(process.env.PORT ?? 8080);

export default {
  port,
  fetch: app.fetch,
};

console.info(`[router] listening on :${port}`);
