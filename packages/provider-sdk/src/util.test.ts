import { describe, expect, test } from "bun:test";
import { pcmToWav } from "./util";

describe("pcmToWav", () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); // 8 bytes of fake PCM

  test("prepends a 44-byte RIFF/WAVE header", () => {
    const wav = Buffer.from(pcmToWav(pcm, { sampleRate: 48000 }));
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
  });

  test("writes the format fields (mono s16 by default)", () => {
    const wav = Buffer.from(pcmToWav(pcm, { sampleRate: 48000 }));
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(48000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(28)).toBe(48000 * 2); // byte rate = sr*ch*bytes
    expect(wav.readUInt32LE(40)).toBe(pcm.byteLength); // data size
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.byteLength); // riff size
  });

  test("honors channel and bit-depth overrides", () => {
    const wav = Buffer.from(
      pcmToWav(pcm, { sampleRate: 24000, channels: 2, bitsPerSample: 8 }),
    );
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt16LE(34)).toBe(8);
    expect(wav.readUInt32LE(28)).toBe(24000 * 2 * 1); // sr * ch * (bits/8)
  });

  test("preserves the PCM payload after the header", () => {
    const wav = Buffer.from(pcmToWav(pcm, { sampleRate: 16000 }));
    expect(wav.subarray(44)).toEqual(Buffer.from(pcm));
  });
});
