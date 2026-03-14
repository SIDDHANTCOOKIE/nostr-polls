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

interface RelayHealthState {
  connected: number;
  total: number;
  reconnect: () => void;
}

const RelayHealthContext = createContext<RelayHealthState>({
  connected: 0,
  total: 0,
  reconnect: () => {},
});

export const useRelayHealth = () => useContext(RelayHealthContext);

/**
 * Any relay URL that has at least one active subscription is treated as
 * "connected". This is a reliable proxy since subscriptions only survive on
 * open WebSocket connections in nostr-tools SimplePool.
 */
function getActiveConnectionStatus(relays: string[]): { connected: number; total: number } {
  const activeRelays = nostrRuntime.getActiveRelays();
  let connected = 0;
  for (const url of relays) {
    // Normalise trailing slash differences
    const normalised = url.replace(/\/$/, "");
    if (
      activeRelays.has(url) ||
      activeRelays.has(normalised) ||
      activeRelays.has(normalised + "/")
    ) {
      connected++;
    }
  }
  return { connected, total: relays.length };
}

export const RelayHealthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { relays } = useRelays();
  const [health, setHealth] = useState<{ connected: number; total: number }>({
    connected: 0,
    total: relays.length,
  });
  const relaysRef = useRef(relays);
  relaysRef.current = relays;

  const refresh = useCallback(() => {
    setHealth(getActiveConnectionStatus(relaysRef.current));
  }, []);

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
    <RelayHealthContext.Provider value={{ ...health, reconnect }}>
      {children}
    </RelayHealthContext.Provider>
  );
};
