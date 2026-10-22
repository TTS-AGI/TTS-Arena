import { registerArenaModels, registerProvider } from "@ttsa/provider-sdk";
import { audio8, MODEL_ID } from "./adapter";

export { audio8 } from "./adapter";

registerProvider(audio8);
registerArenaModels([
  {
    id: "audio8-tts-realistic-0-6b",
    name: "Audio8-TTS-Realistic-0.6B",
    url: "https://huggingface.co/Edge0",
    // The submitted version is not yet publicly released. An earlier preview
    // is available; it is not the checkpoint served by this evaluation API.
    open: false,
    provider: audio8.id,
    routerModel: MODEL_ID,
    enabled: true,
  },
]);
