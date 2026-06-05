const STEPS = [
  { n: "01", t: "Type", d: "Write any line you want to hear spoken aloud." },
  { n: "02", t: "Listen", d: "Two anonymous models — A and B — read it back." },
  {
    n: "03",
    t: "Vote",
    d: "Pick the one that sounds more human. One choice, no skips.",
  },
  {
    n: "04",
    t: "Rank",
    d: "Your vote updates both models' ratings in real time.",
  },
];

const RULES = [
  "Sign in with Hugging Face to vote — accounts must be at least 30 days old.",
  "Prompts are English-only for now and capped at 1,000 characters.",
  "Models stay anonymous until you've voted; only then are A and B revealed.",
  "Ratings use Glicko-2 live, with a Bradley–Terry fit settling the board over time.",
];

export function About() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]">
          A benchmark you can hear.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-balance text-ink-2">
          TTS Arena ranks text-to-speech models the only way that really matters
          — by ear, in a blind head-to-head.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="card flex items-start gap-3 p-4">
            <span className="tag pt-0.5">{s.n}</span>
            <div>
              <p className="leading-tight font-semibold">{s.t}</p>
              <p className="mt-0.5 text-sm text-ink-2">{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      {/* The rules of the arena */}
      <div className="card p-5">
        <p className="tag mb-3">House rules</p>
        <ul className="flex flex-col gap-2.5">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm text-ink-2">
              <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
