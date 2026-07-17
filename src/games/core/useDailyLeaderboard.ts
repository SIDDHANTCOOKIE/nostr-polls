import { useEffect, useMemo, useRef, useState } from "react";
import { dataLayer } from "@formstr/local-relay";
import { DeterministicGame, GameInput } from "./types";
import { verifyReplay } from "./replayEngine";
import { KIND_GAME_SCORE, getDailySeed, parseScoreEvent, scoreDTag } from "./scoreEvents";

export interface LeaderboardEntry {
  pubkey: string;
  score: number;
  /** true iff the seed matches today's daily seed AND replaying the published
   *  inputLog against it independently reproduces the claimed score. */
  verified: boolean;
  createdAt: number;
  /** carried along so a leaderboard row can be handed straight to a Replay
   *  component without a second fetch — this is the same seed/inputLog that
   *  was just used to verify the entry. */
  seed: string;
  inputLog: GameInput[];
}

/**
 * Self-verifying leaderboard: subscribes to every score event for
 * (gameId, dateIso) — local cache first, then whatever the sync engine pulls
 * from external relays — and independently replays each one rather than
 * trusting the claimed score. `gameFactory` must produce a fresh, unstarted
 * engine instance per call (replay mutates it).
 */
export function useDailyLeaderboard<TAction extends string = string>(
  gameId: string,
  dateIso: string,
  gameFactory: () => DeterministicGame<TAction>
): LeaderboardEntry[] {
  const [entries, setEntries] = useState<Map<string, LeaderboardEntry>>(new Map());
  const gameFactoryRef = useRef(gameFactory);
  gameFactoryRef.current = gameFactory;

  useEffect(() => {
    setEntries(new Map());
    const dTag = scoreDTag(gameId, dateIso);
    const expectedSeed = getDailySeed(gameId, dateIso);

    const handle = dataLayer.observe(
      [{ kinds: [KIND_GAME_SCORE], "#d": [dTag] }],
      {
        onEvent: (event) => {
          const parsed = parseScoreEvent(event);
          if (!parsed) return;

          let verified = false;
          if (parsed.seed === expectedSeed) {
            try {
              const result = verifyReplay(gameFactoryRef.current, parsed.seed, parsed.inputLog);
              verified = result.score === parsed.score;
            } catch {
              verified = false;
            }
          }

          setEntries((prev) => {
            const existing = prev.get(parsed.pubkey);
            if (existing && existing.createdAt >= event.created_at) return prev;
            const next = new Map(prev);
            next.set(parsed.pubkey, {
              pubkey: parsed.pubkey,
              score: parsed.score,
              verified,
              createdAt: event.created_at,
              seed: parsed.seed,
              inputLog: parsed.inputLog,
            });
            return next;
          });
        },
      },
      {}
    );

    return () => handle.unobserve();
  }, [gameId, dateIso]);

  return useMemo(
    () =>
      Array.from(entries.values())
        .filter((e) => e.verified)
        .sort((a, b) => b.score - a.score),
    [entries]
  );
}
