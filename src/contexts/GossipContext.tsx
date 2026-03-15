/**
 * GossipContext — bootstraps gossip/outbox relay connections at app init.
 *
 * When the user's follow list becomes available:
 *   1. Batch-fetches kind:10002 for all follows → populates OutboxService cache
 *   2. Computes the gossip relay union (user's read relays + follows' outbox relays)
 *   3. Subscribes (one-shot, closes on EOSE) to:
 *        kind:0   — profiles, so avatars/names load from where people actually publish
 *        kind:10002 — relay lists, keeps the OutboxService cache warm
 *        kind:10015 — interest sets, surfaces network topics
 *   4. Exposes networkInterests[] — hashtags from the network, sorted by frequency
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Event } from "nostr-tools";
import { useUserContext } from "../hooks/useUserContext";
import { useRelays } from "../hooks/useRelays";
import { nostrRuntime } from "../singletons";
import {
  prefetchOutboxRelays,
  getRelaysForAuthors,
  cacheNip65Event,
} from "../nostr/OutboxService";

interface GossipContextInterface {
  /** Hashtags from follows' kind:10015 interest sets, sorted by frequency */
  networkInterests: string[];
  /** True once the initial gossip bootstrap has finished (all EOSE received) */
  bootstrapped: boolean;
}

const GossipContext = createContext<GossipContextInterface>({
  networkInterests: [],
  bootstrapped: false,
});

export function useGossipContext() {
  return useContext(GossipContext);
}

/** Extract unique hashtags from a kind:10015 event */
function extractInterests(event: Event): string[] {
  return event.tags
    .filter((t) => t[0] === "t" && t[1])
    .map((t) => t[1].toLowerCase().trim());
}

export function GossipProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();
  const { relays } = useRelays();
  const [networkInterests, setNetworkInterests] = useState<string[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Prevent re-bootstrapping for the same user / relay set
  const bootstrappedPubkeyRef = useRef<string | null>(null);

  const bootstrap = useCallback(
    async (follows: string[], readRelays: string[]) => {
      // 1. Batch-fetch kind:10002 for all follows from default relays
      //    This populates the OutboxService cache so getRelaysForAuthors works
      await prefetchOutboxRelays(follows);

      // 2. Build gossip relay set: user's read relays + follows' outbox relays
      const gossipRelays = getRelaysForAuthors(readRelays, follows);

      // 3. Track EOSE completions — bootstrap is done when all 3 subs close
      let eoseCount = 0;
      const checkDone = () => {
        eoseCount++;
        if (eoseCount >= 3) setBootstrapped(true);
      };

      // 3a. Profiles (kind:0) — pull from where follows actually publish
      const profileSub = nostrRuntime.subscribe(
        gossipRelays,
        [{ kinds: [0], authors: follows, limit: follows.length }],
        { onEose: () => { profileSub.unsubscribe(); checkDone(); } }
      );

      // 3b. Relay lists (kind:10002) — keep OutboxService cache warm
      const relayListSub = nostrRuntime.subscribe(
        gossipRelays,
        [{ kinds: [10002], authors: follows, limit: follows.length }],
        {
          onEvent: (event) => cacheNip65Event(event),
          onEose: () => { relayListSub.unsubscribe(); checkDone(); },
        }
      );

      // 3c. Interest sets (kind:10015) — harvest network topics
      const interestTagCounts = new Map<string, number>();

      const interestSub = nostrRuntime.subscribe(
        gossipRelays,
        [{ kinds: [10015], authors: follows, limit: follows.length }],
        {
          onEvent: (event) => {
            for (const tag of extractInterests(event)) {
              interestTagCounts.set(tag, (interestTagCounts.get(tag) ?? 0) + 1);
            }
          },
          onEose: () => {
            interestSub.unsubscribe();
            checkDone();

            // Sort by frequency and expose the top interests
            const sorted = Array.from(interestTagCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([tag]) => tag);
            setNetworkInterests(sorted);
          },
        }
      );
    },
    [] // stable — deps accessed via closure args, not from the outer scope
  );

  useEffect(() => {
    const follows = user?.follows;
    if (!user?.pubkey || !follows?.length || !relays.length) return;

    // Only bootstrap once per user session (follows list may update — ignore re-runs)
    if (bootstrappedPubkeyRef.current === user.pubkey) return;
    bootstrappedPubkeyRef.current = user.pubkey;

    setBootstrapped(false);
    bootstrap(follows, relays);

    return () => {
      // Reset on logout so the next user gets a fresh bootstrap
      bootstrappedPubkeyRef.current = null;
      setBootstrapped(false);
      setNetworkInterests([]);
    };
  }, [user?.pubkey, user?.follows, relays, bootstrap]);

  return (
    <GossipContext.Provider value={{ networkInterests, bootstrapped }}>
      {children}
    </GossipContext.Provider>
  );
}
