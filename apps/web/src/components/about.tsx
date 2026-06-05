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

const NOTES = [
  "Sign in with Hugging Face to vote — accounts must be at least 30 days old.",
  "Prompts are English-only for now and capped at 1,000 characters.",
  "Models stay anonymous until you've voted; only then are A and B revealed.",
  "New models start with a live Glicko-2 rating shown as provisional; once a model passes 300 votes, its place on the board is set by a Bradley–Terry fit over every matchup.",
];

const FAQ = [
  {
    q: "How are models ranked?",
    a: "Every vote is a head-to-head result. Below 300 votes a model carries a live Glicko-2 rating, flagged as provisional. Past that, its standing is fixed by a Bradley–Terry fit computed over the full history of matchups — so the board reflects all the evidence, not just the last few votes.",
  },
  {
    q: "Why blind comparisons?",
    a: "Naming a model colors how people hear it. Hiding identities until after the vote keeps the judgment about the audio alone — the same reason listening tests have always been blind.",
  },
  {
    q: "Is this related to the old TTS Arena?",
    a: "This is a fresh start. The original v1 leaderboard is frozen and kept for reference; none of its votes carry over. Every model here begins from scratch.",
  },
  {
    q: "Can I get a model added?",
    a: "Yes — open an issue on GitHub or reach out on the Hugging Face community. If you're shipping something unreleased and want it evaluated anonymously before launch, get in touch and we'll set it up.",
  },
  {
    q: "How can I help?",
    a: "Vote. Every comparison sharpens the rankings. Beyond that, bug reports, model suggestions, and code contributions are all welcome on GitHub.",
  },
];

/** Citation authors, in the order they appear in the BibTeX entry. */
const CITATION = `@misc{tts-arena-v2,
  title  = {TTS Arena 2.0: Benchmarking Text-to-Speech Models in the Wild},
  author = {mrfakename and Srivastav, Vaibhav and Fourrier, Clémentine and
            Pouget, Lucain and Lacombe, Yoach and main and Gandhi, Sanchit and
            Passos, Apolinário and Cuenca, Pedro},
  year   = {2025},
  publisher = {Hugging Face},
  howpublished = {\\url{https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2}}
}`;

/** People who helped build the arena, with their Hugging Face profiles. */
const CREDITS = [
  { name: "Vaibhav Srivastav", hf: "https://huggingface.co/reach-vb" },
  { name: "Clémentine Fourrier", hf: "https://huggingface.co/clefourrier" },
  { name: "Lucain Pouget", hf: "https://huggingface.co/Wauplin" },
  { name: "Yoach Lacombe", hf: "https://huggingface.co/ylacombe" },
  { name: "main", hf: "https://huggingface.co/main-horse" },
  { name: "Sanchit Gandhi", hf: "https://huggingface.co/sanchit-gandhi" },
  { name: "Apolinário Passos", hf: "https://huggingface.co/multimodalart" },
  { name: "Pedro Cuenca", hf: "https://huggingface.co/pcuenq" },
];

const LINKS = [
  { label: "Discord", href: "https://discord.gg/HB8fMR6GTr" },
  { label: "Twitter", href: "https://x.com/realmrfakename" },
  { label: "GitHub", href: "https://github.com/TTS-AGI/TTS-Arena" },
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

      {/* Why it exists */}
      <div className="card p-5">
        <p className="tag mb-2">Why it exists</p>
        <p className="text-sm leading-relaxed text-ink-2">
          Speech synthesis has never had a good yardstick. Word error rate
          measures intelligibility, not whether a voice sounds alive; mean
          opinion scores depend on a handful of listeners in a lab. TTS Arena
          replaces both with open, large-scale preference: anyone can listen,
          compare, and vote, and the rankings that fall out belong to everyone.
        </p>
      </div>

      {/* How it works */}
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

      {/* Good to know */}
      <div className="card p-5">
        <p className="tag mb-3">Good to know</p>
        <ul className="flex flex-col gap-2.5">
          {NOTES.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm text-ink-2">
              <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* FAQ */}
      <div className="card p-5">
        <p className="tag mb-3">Questions</p>
        <div className="flex flex-col divide-y divide-line">
          {FAQ.map((f) => (
            <div key={f.q} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold">{f.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Citation */}
      <div className="card p-5">
        <p className="tag mb-3">Cite</p>
        <p className="mb-3 text-sm text-ink-2">
          Using TTS Arena in research? Please cite it:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-fill p-4 font-mono text-xs leading-relaxed text-ink-2">
          {CITATION}
        </pre>
      </div>

      {/* Credits */}
      <div className="card p-5">
        <p className="tag mb-3">Credits</p>
        <p className="mb-3 text-sm text-ink-2">
          Built by mrfakename, with thanks to the people who helped make it
          real:
        </p>
        <div className="flex flex-wrap gap-2">
          {CREDITS.map((c) => (
            <a
              key={c.name}
              href={c.hf}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-fill px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-line hover:text-ink"
            >
              {c.name}
            </a>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center justify-center gap-2">
        {LINKS.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-fill px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-line hover:text-ink"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
