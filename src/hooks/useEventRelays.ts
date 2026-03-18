import { useEffect, useState } from 'react';
import { getEventRelays } from '../nostrRuntime/EventRelayMap';

/**
 * Returns the relay URLs that an event was received from.
 * Reads from EventRelayMap which is populated as subscriptions fire.
 */
export function useEventRelays(eventId: string): string[] {
  const [relays, setRelays] = useState<string[]>(() => getEventRelays(eventId));

  useEffect(() => {
    setRelays(getEventRelays(eventId));
  }, [eventId]);

  return relays;
}
