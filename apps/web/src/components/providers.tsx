"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WARM_BOARDS,
  fetchLeaderboard,
  leaderboardKey,
} from "@/lib/leaderboard";

/**
 * Client data layer for the public app.
 *
 * The arena is the landing view, but the leaderboard is where people go next —
 * so we fetch it during the idle time right after first paint, while the
 * visitor is still reading the arena. By the time the tab is clicked the rows
 * are already in the cache and the switch is a render, not a round trip. Both
 * board variants are warmed, so the "show new models" toggle is instant in
 * both directions too.
 *
 * staleTime is generous because the board genuinely is: ratings move by
 * fractions of a point per vote, and the server only refits every 50 votes.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    const warm = () => {
      for (const board of WARM_BOARDS) {
        void client.prefetchQuery({
          queryKey: leaderboardKey(board),
          queryFn: () => fetchLeaderboard(board),
        });
      }
    };
    // Idle time, so warming never competes with the arena's first battle.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 600);
    return () => clearTimeout(id);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
