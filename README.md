# TTS Arena

A crowdsourced, blind benchmark for text-to-speech. Type a line, hear two
anonymous models read it back, and pick the one that sounds more human. Votes
build an open leaderboard.

**[Vote in the arena →](https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2)**
&nbsp;·&nbsp;
**[Docs →](https://docs.ttsarena.org)**

## What's here

A Bun monorepo:

- `apps/web` - the arena, leaderboard, and admin (Next.js)
- `apps/router` - service that calls TTS providers (Hono)
- `apps/docs` - the documentation site
- `packages/*` - shared types, the rating math, and providers

## Running it

See the [development guide](https://docs.ttsarena.org/development) for setup,
configuration, and scripts. The short version:

```bash
bun install
cd apps/web && bun run db:migrate && bun run db:seed
cd ../.. && bun run dev
```

## Contributing

Issues and PRs welcome. To get a model added, see
[Submit a model](https://docs.ttsarena.org/submit-a-model).

## License

[Apache 2.0](LICENSE).
