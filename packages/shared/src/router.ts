/**
 * Zod schemas + types for the TTS router's HTTP API (web backend ↔ router).
 * Shared so the router and its callers agree on the wire format.
 */
import { z } from "zod";

/** POST /tts request. `model` is provider-specific; null = provider default. */
export const routerTTSRequestSchema = z.object({
  text: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().nullable().optional(),
});
export type RouterTTSRequest = z.infer<typeof routerTTSRequestSchema>;

/** POST /tts response. Audio is base64; `extension` names the container. */
export const routerTTSResponseSchema = z.object({
  status: z.literal("success"),
  provider: z.string(),
  model: z.string().nullable(),
  audioData: z.string(), // base64
  extension: z.string(), // "mp3" | "wav" | ...
});
export type RouterTTSResponse = z.infer<typeof routerTTSResponseSchema>;

export const routerProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type RouterProviderModel = z.infer<typeof routerProviderModelSchema>;

export const routerProvidersResponseSchema = z.object({
  providers: z.array(z.string()),
});
export type RouterProvidersResponse = z.infer<
  typeof routerProvidersResponseSchema
>;
