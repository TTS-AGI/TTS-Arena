import Home from "../page";

// Deep-link support: /arena, /leaderboard, /about all render the same single
// page, which reads the path on mount to pick the initial view. Statically
// prerendered for the known views.
export function generateStaticParams() {
  return [{ view: "arena" }, { view: "leaderboard" }, { view: "about" }];
}

export const dynamicParams = false;

export default function ViewPage() {
  return <Home />;
}
