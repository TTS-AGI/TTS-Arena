import { afterEach, describe, expect, test } from "bun:test";
import {
  allArenaModels,
  availableArenaModels,
  clearRegistry,
  getProvider,
  pcmToWav,
} from "@ttsa/provider-sdk";
import { createAudio8Provider, inspectWav, MODEL_ID, VOICES } from "./adapter";

const wav = Buffer.from(pcmToWav(new Uint8Array(8820), { sampleRate: 44100 }));
const servers: Array<ReturnType<typeof Bun.serve>> = [];
const fixtureCredentials = {
  hfToken: "fixture-hf-token",
  serviceKey: "fixture-service-key",
};

function serve(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  servers.push(server);
  return server.url.toString().replace(/\/$/, "");
}

function provider(endpoint: string, timeoutMs = 1000) {
  return createAudio8Provider({
    config: () => ({ endpoint, ...fixtureCredentials }),
    allowLoopbackHttp: true,
    timeoutMs,
    chooseVoice: () => "clara",
  });
}

function audioResponse(bytes = wav) {
  return new Response(bytes, { headers: { "Content-Type": "audio/wav" } });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  clearRegistry();
});

describe("Audio8", () => {
  test("registers the exact unpublished model and requires configuration", async () => {
    const keys = [
      "AUDIO8_ENDPOINT_URL",
      "AUDIO8_HF_TOKEN",
      "AUDIO8_SERVICE_KEY",
    ];
    const saved = keys.map((key) => process.env[key]);
    for (const key of keys) delete process.env[key];
    try {
      await import("./index");
      expect(getProvider("audio8")?.name).toBe("Edge0");
      const entry = allArenaModels().find(
        (model) => model.id === "audio8-tts-realistic-0-6b",
      );
      expect(entry?.name).toBe("Audio8-TTS-Realistic-0.6B");
      expect(entry?.routerModel).toBe(MODEL_ID);
      expect(entry?.open).toBe(false);
      expect(availableArenaModels().some((m) => m.id === entry?.id)).toBe(
        false,
      );

      process.env.AUDIO8_ENDPOINT_URL = "https://example.invalid";
      process.env.AUDIO8_HF_TOKEN = fixtureCredentials.hfToken;
      expect(getProvider("audio8")?.isAvailable()).toBe(false);
      process.env.AUDIO8_SERVICE_KEY = fixtureCredentials.serviceKey;
      expect(availableArenaModels().some((m) => m.id === entry?.id)).toBe(true);
    } finally {
      keys.forEach((key, i) => {
        if (saved[i] === undefined) delete process.env[key];
        else process.env[key] = saved[i];
      });
    }
  });

  test("requires a valid HTTPS endpoint outside local fixtures", () => {
    for (const endpoint of [
      "http://example.invalid",
      "https://user:password@example.invalid",
      "https://example.invalid?key=secret",
      "https://example.invalid#fragment",
    ]) {
      expect(
        createAudio8Provider({
          config: () => ({ endpoint, ...fixtureCredentials }),
        }).isAvailable(),
      ).toBe(false);
    }
    expect(
      createAudio8Provider({ config: () => undefined }).isAvailable(),
    ).toBe(false);
  });

  test("sends both credentials and returns exact audio and voice for all presets", async () => {
    const received: string[] = [];
    const endpoint = serve(async (request) => {
      expect(new URL(request.url).pathname).toBe("/tts");
      expect(request.headers.get("Authorization")).toBe(
        `Bearer ${fixtureCredentials.hfToken}`,
      );
      expect(request.headers.get("X-Service-Key")).toBe(
        fixtureCredentials.serviceKey,
      );
      const body = (await request.json()) as Record<string, string>;
      expect(body.text).toBe("A short test sentence.");
      expect(Object.keys(body).sort()).toEqual(["text", "voice_id"]);
      received.push(body.voice_id!);
      return audioResponse();
    });
    for (const voice of VOICES) {
      const result = await provider(endpoint).synthesize({
        text: "A short test sentence.",
        voice,
        model: MODEL_ID,
      });
      expect(result.voice).toBe(voice);
      expect(result.model).toBe(MODEL_ID);
      expect(result.extension).toBe("wav");
      expect(Buffer.from(result.audioBase64, "base64")).toEqual(wav);
    }
    expect(received).toEqual([...VOICES]);
  });

  test("reports the chosen voice when it is omitted", async () => {
    const endpoint = serve(async (request) => {
      const body = (await request.json()) as { voice_id: string };
      expect(body.voice_id).toBe("clara");
      return audioResponse();
    });
    expect(
      (await provider(endpoint).synthesize({ text: "Hello." })).voice,
    ).toBe("clara");
  });

  test("rejects invalid input before sending a request", async () => {
    let calls = 0;
    const endpoint = serve(() => {
      calls++;
      return audioResponse();
    });
    for (const input of [
      { text: "" },
      { text: "   " },
      { text: "x".repeat(1001) },
      { text: "Hello.", voice: "unknown" },
      { text: "Hello.", model: "different-checkpoint" },
    ]) {
      await expect(provider(endpoint).synthesize(input)).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });

  test("counts Unicode code points consistently with the service", async () => {
    const endpoint = serve(() => audioResponse());
    await expect(
      provider(endpoint).synthesize({ text: "😀".repeat(1000) }),
    ).resolves.toHaveProperty("extension", "wav");
    await expect(
      provider(endpoint).synthesize({ text: "😀".repeat(1001) }),
    ).rejects.toThrow("1–1000 characters");
  });

  test("sanitizes upstream failures and does not retry overload", async () => {
    let calls = 0;
    const endpoint = serve(() => {
      calls++;
      return new Response("internal path and credentials", { status: 429 });
    });
    await expect(
      provider(endpoint).synthesize({ text: "Hello." }),
    ).rejects.toThrow("Audio8: HTTP 429");
    expect(calls).toBe(1);
  });

  test("does not follow redirects with credentials", async () => {
    let destinationCalls = 0;
    const destination = serve(() => {
      destinationCalls++;
      return audioResponse();
    });
    const endpoint = serve(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: `${destination}/tts` },
        }),
    );
    await expect(
      provider(endpoint).synthesize({ text: "Hello." }),
    ).rejects.toThrow("request failed");
    expect(destinationCalls).toBe(0);
  });

  test("rejects non-audio responses and truncated WAV", async () => {
    const jsonEndpoint = serve(() => Response.json({ error: "not audio" }));
    await expect(
      provider(jsonEndpoint).synthesize({ text: "Hello." }),
    ).rejects.toThrow("expected WAV");
    const truncatedEndpoint = serve(() => audioResponse(wav.subarray(0, -2)));
    await expect(
      provider(truncatedEndpoint).synthesize({ text: "Hello." }),
    ).rejects.toThrow("invalid WAV");
    expect(() =>
      inspectWav(
        Buffer.from(pcmToWav(new Uint8Array(800), { sampleRate: 16000 })),
      ),
    ).toThrow("invalid WAV");
  });

  test("applies its deadline to a stalled body after receiving headers", async () => {
    const endpoint = serve(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(wav.subarray(0, 44)));
              // Deliberately leave the body open until the client aborts.
            },
          }),
          { headers: { "Content-Type": "audio/wav" } },
        ),
    );
    const started = Date.now();
    await expect(
      provider(endpoint, 100).synthesize({ text: "Hello." }),
    ).rejects.toThrow("deadline exceeded");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
