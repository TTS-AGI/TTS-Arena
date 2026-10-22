# Audio8 provider

Serves **Audio8-TTS-Realistic-0.6B** by **Edge0** through a dedicated HTTPS API.
The submitted model version and reference presets are fixed server-side.

## Configuration

Set all three variables in the Arena backend environment:

| Variable              | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `AUDIO8_ENDPOINT_URL` | HTTPS base URL, without `/tts`            |
| `AUDIO8_HF_TOKEN`     | Dedicated single-endpoint inference token |
| `AUDIO8_SERVICE_KEY`  | Application authentication key            |

The endpoint URL and credentials are supplied privately. Do not commit their
values. The provider is unavailable until all three variables are configured.
If using the repository's Space deployment workflow, configure them as repository
secrets so the existing secret sync can deliver them to the Space.

## Request and response

The adapter sends `POST /tts` with `{"text": "...", "voice_id": "grace"}` and
both `Authorization: Bearer ...` and `X-Service-Key: ...`.
Inputs must contain 1–1,000 Unicode code points and non-whitespace text.
The response is a complete PCM16 mono WAV at 44.1 kHz; the adapter returns
base64 WAV to the router for its normal audio processing.

| Voice ID | Name   | Accent           |
| -------- | ------ | ---------------- |
| `grace`  | Grace  | British English  |
| `jack`   | Jack   | British English  |
| `clara`  | Clara  | American English |
| `arthur` | Arthur | American English |

An omitted voice is chosen randomly from this pool and reported in the result.
Unknown voices or model IDs fail before making a request. The router model ID is
`audio8-tts-v1`; the stable Arena entry ID is `audio8-tts-realistic-0-6b`.

The full request, including the response body, has a 60-second deadline.
The adapter does not follow redirects or retry failed requests. Non-2xx
responses, invalid audio and timeouts become sanitized provider errors.
The initial agreed capacity should not exceed four concurrent requests.

The `open` catalogue flag is currently `false` because this exact model version
has not been publicly released. An open-source release is planned; the existing
Audio8 TTS Preview release is a different checkpoint.

## Validation

From the repository root:

```sh
bun test packages/providers/audio8
bun run --filter '@ttsa/provider-audio8' typecheck
```

Tests use synthetic WAV fixtures and local HTTP servers; no API credentials or
paid inference are needed.
