import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { nostrRuntime } from "../singletons";
import { useRelays } from "../hooks/useRelays";
import { getCachedGossipRelays } from "../nostr/OutboxService";
import { useUserContext } from "../hooks/useUserContext";

interface RelayHealthState {
  connected: number;      // own relays connected
  total: number;          // own relays total
  gossipConnected: number; // gossip relays connected
  gossipTotal: number;     // gossip relays discovered
  reconnect: () => void;
}

const RelayHealthContext = createContext<RelayHealthState>({
  connected: 0,
  total: 0,
  gossipConnected: 0,
  gossipTotal: 0,
  reconnect: () => {},
});

export const useRelayHealth = () => useContext(RelayHealthContext);

/**
 * Any relay URL that has at least one active subscription is treated as
 * "connected". This is a reliable proxy since subscriptions only survive on
 * open WebSocket connections in nostr-tools SimplePool.
 */
function getActiveConnectionStatus(relays: string[], ownPubkey?: string): { connected: number; total: number; gossipConnected: number; gossipTotal: number } {
  const activeRelays = nostrRuntime.getActiveRelays();
  let connected = 0;
  for (const url of relays) {
    const normalised = url.replace(/\/$/, "");
    if (activeRelays.has(url) || activeRelays.has(normalised) || activeRelays.has(normalised + "/")) {
      connected++;
    }
  }
  const gossipEntries = getCachedGossipRelays(ownPubkey);
  let gossipConnected = 0;
  for (const entry of gossipEntries) {
    const normalised = entry.url.replace(/\/$/, "");
    if (activeRelays.has(entry.url) || activeRelays.has(normalised) || activeRelays.has(normalised + "/")) {
      gossipConnected++;
    }
  }
  return { connected, total: relays.length, gossipConnected, gossipTotal: gossipEntries.length };
}

export const RelayHealthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { relays } = useRelays();
  const { user } = useUserContext();
  const [health, setHealth] = useState<{ connected: number; total: number }>({
    connected: 0,
    total: relays.length,
  });
  const [gossipHealth, setGossipHealth] = useState({ gossipConnected: 0, gossipTotal: 0 });
  const relaysRef = useRef(relays);
  relaysRef.current = relays;

  const refresh = useCallback(() => {
    const status = getActiveConnectionStatus(relaysRef.current, user?.pubkey);
    setHealth({ connected: status.connected, total: status.total });
    setGossipHealth({ gossipConnected: status.gossipConnected, gossipTotal: status.gossipTotal });
  }, [user?.pubkey]);

  const reconnect = useCallback(() => {
    nostrRuntime.reconnect();
    // Refresh health display after a short delay to let connections re-establish
    setTimeout(refresh, 500);
  }, [refresh]);

  useEffect(() => {
    // Poll active subscriptions — no network cost, no new connections.
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [relays, refresh]);

  // Auto-reconnect when the user returns to the tab/app after being away.
  // WebSocket connections silently die after idle periods (NAT timeouts, relay
  // server closures) but the subscription map still shows them as "active".
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [reconnect]);

  return (
    <RelayHealthContext.Provider value={{ ...health, ...gossipHealth, reconnect }}>
      {children}
    </RelayHealthContext.Provider>
  );
};
