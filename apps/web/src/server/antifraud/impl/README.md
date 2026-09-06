# impl/ — anti-fraud implementation (STUB in the public repo)

**Do not put real detection logic here in the public repo.** These files are a
permissive stub. At deploy time the Space's Docker build clones
**TTS-AGI/Antifraud** over this directory, replacing every file with the real
implementation.

- `config.ts` — stub `SECURITY` (only `disabled()`); real one has thresholds + weights
- `assess.ts` — stub `assessVote` returns clean; real one scores signals
- `sweep.ts` — stub `runSecuritySweep` is a no-op; real one runs the sweep

Public CI builds against this stub, so the arena compiles and runs (undefended)
without the private repo. If you add a new export to the private impl, add a
matching no-op here or CI breaks. See `../README.md`.

CI also runs `.github/scripts/check-antifraud-stub.sh`, which rejects any file
here that lacks the `@antifraud-stub` marker, runs long, or isn't one of the
three stubs — so a stray commit of the real implementation fails loudly instead
of leaking.
