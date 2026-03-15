import { createContext, ReactNode, useCallback, useEffect, useState } from "react";
import { defaultRelays } from "../nostr";
import { useUserContext } from "../hooks/useUserContext";
import { nostrRuntime } from "../singletons";
import { cacheNip65Event } from "../nostr/OutboxService";

interface RelayContextInterface {
  relays: string[];      // read relays (for subscriptions)
  writeRelays: string[]; // write relays (for publishing)
  isUsingUserRelays: boolean;
  refreshRelays: () => void;
}

export const RelayContext = createContext<RelayContextInterface>({
  relays: defaultRelays,
  writeRelays: defaultRelays,
  isUsingUserRelays: false,
  refreshRelays: () => {},
});

export function RelayProvider({ children }: { children: ReactNode }) {
  const [relays, setRelays] = useState<string[]>(defaultRelays);
  const [writeRelays, setWriteRelays] = useState<string[]>(defaultRelays);
  const [isUsingUserRelays, setIsUsingUserRelays] = useState<boolean>(false);
  const { user } = useUserContext();

  const fetchUserRelays = useCallback(async () => {
    // Reset to default relays when user logs out
    if (!user) {
      setRelays(defaultRelays);
      setWriteRelays(defaultRelays);
      setIsUsingUserRelays(false);
      return;
    }

    // Fetch user's relay list when logged in
    try {
      const filters = { kinds: [10002], authors: [user.pubkey] };
      const results = await nostrRuntime.querySync(defaultRelays, filters);

      if (results && results.length > 0) {
        const event = results[0];

        // Seed the OutboxService cache so future lookups for this user are free
        cacheNip65Event(event);

        // Parse NIP-65 markers:
        //   no marker  → both read and write
        //   "write"    → outbox only
        //   "read"     → inbox only
        const readRelays: string[] = [];
        const writRelays: string[] = [];

        for (const tag of event.tags) {
          if (tag[0] !== "r" || !tag[1]) continue;
          const url = tag[1];
          const marker = tag[2];

          if (!marker || marker === "read") readRelays.push(url);
          if (!marker || marker === "write") writRelays.push(url);
        }

        if (readRelays.length > 0 || writRelays.length > 0) {
          // Fall back to the full list for whichever side is empty
          setRelays(readRelays.length > 0 ? readRelays : writRelays);
          setWriteRelays(writRelays.length > 0 ? writRelays : readRelays);
          setIsUsingUserRelays(true);
          return;
        }
      }

      // Fallback to default relays if no user relays found
      setRelays(defaultRelays);
      setWriteRelays(defaultRelays);
      setIsUsingUserRelays(false);
    } catch (error) {
      console.error("Error fetching user relays:", error);
      setRelays(defaultRelays);
      setWriteRelays(defaultRelays);
      setIsUsingUserRelays(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserRelays();
  }, [fetchUserRelays]);

  return (
    <RelayContext.Provider value={{ relays, writeRelays, isUsingUserRelays, refreshRelays: fetchUserRelays }}>
      {children}
    </RelayContext.Provider>
  );
}
