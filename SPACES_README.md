---
title: TTS Arena V2
emoji: 🗣️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: true
hf_oauth: true
hf_oauth_scopes:
  - email
---

# TTS Arena V2

A crowd-sourced text-to-speech benchmark: hear the same line from two
anonymous models and pick the better one. Ratings come from blind pairwise
votes (Glicko-2 live, Bradley–Terry once a model is established).

This Space runs the full stack in one container:

- **Postgres** — data on the persistent `/data` bucket
- **TTS router** — dispatches synthesis to providers (internal, :8080)
- **Web app** — the arena UI + API (Next.js, served on :7860)

Generated audio is logged to the persistent `/audio` bucket alongside per-vote
metadata (user, prompt, voice, file path) for a future preference dataset.

Authentication uses the Space's native Hugging Face Sign-In (no separate OAuth
app). Provider API keys and other config are set as Space secrets.

> Source: https://github.com/TTS-AGI/TTS-Arena
