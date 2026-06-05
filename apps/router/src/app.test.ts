import { afterEach, describe, expect, test } from "bun:test";
import {
  clearRegistry,
  registerProvider,
  type TTSProvider,
} from "@ttsa/provider-sdk";
import { createApp } from "./app";

/** A configurable in-memory provider for exercising the router. */
function fakeProvider(over: Partial<TTSProvider> = {}): TTSProvider {
  return {
    id: "fake",
    name: "Fake",
    isAvailable: () => true,
    listModels: () => [{ id: "m1", name: "Model 1" }],
    synthesize: async () => ({
      audioBase64: Buffer.from("audio").toString("base64"),
      extension: "mp3",
      voice: "v1",
      model: "m1",
    }),
    ...over,
  };
}

afterEach(() => clearRegistry());

describe("router", () => {
  test("GET / reports health", async () => {
    const res = await createApp().request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /providers lists only available providers", async () => {
    registerProvider(fakeProvider({ id: "up", isAvailable: () => true }));
    registerProvider(fakeProvider({ id: "down", isAvailable: () => false }));
    const res = await createApp().request("/providers");
    const body = (await res.json()) as { providers: string[] };
    expect(body.providers).toContain("up");
    expect(body.providers).not.toContain("down");
  });

  test("GET /providers/:id/models returns the model list", async () => {
    registerProvider(fakeProvider({ id: "fake" }));
    const res = await createApp().request("/providers/fake/models");
    const body = (await res.json()) as { models: Array<{ id: string }> };
    expect(body.models[0]!.id).toBe("m1");
  });

  test("POST /tts synthesizes via the chosen provider", async () => {
    registerProvider(fakeProvider({ id: "fake" }));
    const res = await createApp().request("/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", provider: "fake" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { voice: string; model: string };
    expect(body.voice).toBe("v1");
    expect(body.model).toBe("m1");
  });

  test("POST /tts 404s on unknown provider", async () => {
    const res = await createApp().request("/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", provider: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /tts 400s on invalid body", async () => {
    const res = await createApp().request("/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(400);
  });
});
