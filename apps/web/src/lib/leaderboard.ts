/**
 * Leaderboard fetching, shared by the view that renders it and the provider
 * that warms it. Both variants of the board (with and without the low-vote
 * models) are separate server responses — the vote floor changes which models
 * are ranked at all, so the ranks differ — which is why each gets its own cache
 * entry rather than being derived from the other.
 */
import type {
  LeaderboardResponse,
  LeaderboardRow,
  ModelType,
} from "@ttsa/shared";

export type BoardVariant = {
  type: ModelType;
  /** Lower the vote floor to include newly-added models. */
  preliminary: boolean;
};

/** Every variant we warm on load, so switching or toggling never waits. */
export const WARM_BOARDS: BoardVariant[] = [
  { type: "tts", preliminary: false },
  { type: "tts", preliminary: true },
];

export function leaderboardKey({ type, preliminary }: BoardVariant) {
  return ["leaderboard", type, preliminary] as const;
}

export function leaderboardUrl({ type, preliminary }: BoardVariant): string {
  return `/api/leaderboard?type=${type}${preliminary ? "&preliminary=1" : ""}`;
}

export async function fetchLeaderboard(
  variant: BoardVariant,
): Promise<LeaderboardRow[]> {
  const res = await fetch(leaderboardUrl(variant));
  if (!res.ok) throw new Error(`leaderboard: ${res.status}`);
  return ((await res.json()) as LeaderboardResponse).rows;
}
