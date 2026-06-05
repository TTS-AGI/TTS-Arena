/**
 * TTS Router — a thin HTTP gateway in front of the provider registry.
 *
 * Endpoints:
 *   GET  /                       health/info
 *   GET  /providers              available provider ids
 *   GET  /providers/:id/models   models a provider exposes
 *   POST /tts                    synthesize { text, provider, model? }
 *
 * Auth: a single bearer key (ROUTER_API_KEY). When unset (local dev) auth is
 * skipped. The audio is peak-normalized before returning.
 */
import { Hono } from "hono";
import {
  ProviderError,
  availableProviders,
  env,
  getProvider,
} from "@ttsa/provider-sdk";
import { routerTTSRequestSchema } from "@ttsa/shared";
import { normalizeBase64Audio } from "./audio";

export function createApp() {
  const app = new Hono();

  // Bearer auth on every route except health, when a key is configured.
  app.use("*", async (c, next) => {
    if (c.req.path === "/") return next();
    const key = env("ROUTER_API_KEY");
    if (!key) return next(); // dev mode: open
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${key}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });

  app.get("/", (c) =>
    c.json({
      name: "tts-router",
      status: "ok",
      providers: availableProviders().length,
    }),
  );

  app.get("/providers", (c) =>
    c.json({ providers: availableProviders().map((p) => p.id) }),
  );

  app.get("/providers/:id/models", async (c) => {
    const provider = getProvider(c.req.param("id"));
    if (!provider || !provider.isAvailable()) {
      return c.json({ error: "unknown or unavailable provider" }, 404);
    }
    return c.json({ models: await provider.listModels() });
  });

  app.post("/tts", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const parsed = routerTTSRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid request", detail: parsed.error.message },
        400,
      );
    }
    const { text, provider: providerId, model } = parsed.data;

    const provider = getProvider(providerId);
    if (!provider) {
      return c.json({ error: `unknown provider "${providerId}"` }, 404);
    }
    if (!provider.isAvailable()) {
      return c.json(
        { error: `provider "${providerId}" is not configured` },
        503,
      );
    }

    try {
      const result = await provider.synthesize({ text, model: model ?? null });
      const audioData = await normalizeBase64Audio(
        result.audioBase64,
        result.extension,
      );
      return c.json({
        status: "success" as const,
        provider: provider.id,
        model: result.model,
        voice: result.voice,
        audioData,
        extension: result.extension,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        const status =
          err.code === "not_configured"
            ? 503
            : err.code === "unknown_model" || err.code === "invalid_input"
              ? 400
              : 502;
        return c.json({ error: err.message, code: err.code }, status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "synthesis failed" },
        502,
      );
    }
  });

  return app;
}
