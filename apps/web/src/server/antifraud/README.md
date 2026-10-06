# Anti-fraud seam

`@/server/antifraud` is the single entry point the arena uses for fraud
detection. Import `assessVote`, `SECURITY`, `runSecuritySweep`, and the
`Assessment` / `AssessParams` types from here — never reach into `./impl`
directly.

## Why the indirection

The real scoring, thresholds, and cross-vote sweep are secret (they're what
cheaters would read to evade us), so they live in the private repo
**TTS-AGI/Antifraud**. At deploy time the Hugging Face Space's Docker build
clones that repo into `./impl/`, replacing the stub checked in here. The public
repo therefore builds and runs — just **undefended** (the stub scores every
vote clean and the sweep is a no-op).

```
antifraud/
  index.ts      stable public API (re-exports from ./impl + ./types)
  types.ts      Assessment / AssessParams — generic contracts, no tactics
  impl/         STUB here; overwritten by TTS-AGI/Antifraud at deploy
    config.ts   SECURITY (stub: only .disabled())
    assess.ts   assessVote (stub: returns clean)
    sweep.ts    runSecuritySweep (stub: no-op)
```

The DB schema, the `security_events` audit log, the captcha plumbing
(`server/security/*`), and the login history (`server/auth/logins`) stay public
— they're infrastructure, not tactics. Only the detection moves to the private
repo.

## Adding or changing detection

Edit the files in **TTS-AGI/Antifraud**, not the stub here. If you add a new
public export, add its no-op form to the stub too, or public CI (which builds
against the stub) will break.

## The leak guard

`.github/scripts/check-antifraud-stub.sh` runs first in CI and fails the build
if `impl/` holds anything but the three stubs — each must keep its
`@antifraud-stub` marker and stay short. It exists because developing against a
local clone of the private repo makes an accidental `git add` very easy, and a
leaked tactic can't be un-leaked. If you add a stub export, keep the marker.
