/**
 * EventRelayMap - tracks which relay URLs each event was received from.
 *
 * Populated by SubscriptionManager as events arrive. Components can read
 * this to display "found on: relay1, relay2" attribution on event cards.
 */
const eventRelayMap = new Map<string, Set<string>>();

export function recordEventRelay(eventId: string, relayUrl: string): void {
  let set = eventRelayMap.get(eventId);
  if (!set) {
    set = new Set();
    eventRelayMap.set(eventId, set);
  }
  set.add(relayUrl);
}

export function getEventRelays(eventId: string): string[] {
  const set = eventRelayMap.get(eventId);
  return set ? Array.from(set) : [];
}
