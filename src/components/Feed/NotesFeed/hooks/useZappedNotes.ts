import { useState, useCallback, useRef } from "react";
import { Event, Filter, nip57 } from "nostr-tools";
import { useRelays } from "../../../../hooks/useRelays";
import { nostrRuntime } from "../../../../singletons";

export interface ZapRecord {
  zapEvent: Event;
  senderPubkey: string;
  sats: number;
}

function parseZapRecord(event: Event): ZapRecord {
  let sats = 0;
  const bolt11 = event.tags.find((t) => t[0] === "bolt11")?.[1];
  if (bolt11) {
    try { sats = nip57.getSatoshisAmountFromBolt11(bolt11) ?? 0; } catch {}
  }

  let senderPubkey = event.tags.find((t) => t[0] === "P")?.[1] ?? event.pubkey;
  const description = event.tags.find((t) => t[0] === "description")?.[1];
  if (description) {
    try {
      const req = JSON.parse(description) as Event;
      if (req.pubkey) senderPubkey = req.pubkey;
    } catch {}
  }

  return { zapEvent: event, senderPubkey, sats };
}

export const useZappedNotes = (user: any) => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const { relays } = useRelays();

  const oldestTimestampRef = useRef<number | null>(null);
  const loadingRef = useRef(false);

  // eventId -> ZapRecord[]
  const zapRecords = useCallback((): Map<string, ZapRecord[]> => {
    if (!user?.follows?.length) return new Map();

    const map = new Map<string, ZapRecord[]>();
    const zapEvents = nostrRuntime.query({ kinds: [9735] });

    for (const event of zapEvents) {
      const eTag = event.tags.find((t) => t[0] === "e")?.[1];
      if (!eTag) continue;

      const record = parseZapRecord(event);
      // Only include zaps sent by contacts
      if (!user.follows.includes(record.senderPubkey)) continue;

      const existing = map.get(eTag) ?? [];
      if (!existing.some((r) => r.zapEvent.id === event.id)) {
        map.set(eTag, [...existing, record]);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version]);

  const zappedEvents = useCallback((): Map<string, Event> => {
    if (!user?.follows?.length) return new Map();

    const noteIds = Array.from(zapRecords().keys());
    const events = nostrRuntime.query({ kinds: [1], ids: noteIds });

    const map = new Map<string, Event>();
    for (const e of events) map.set(e.id, e);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version, zapRecords]);

  const fetchZappedNotes = useCallback(async () => {
    if (!user?.follows?.length || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const zapFilter: Filter = {
      kinds: [9735],
      "#P": user.follows, // uppercase P = sender pubkey in NIP-57
      limit: 30,
    } as any;

    if (oldestTimestampRef.current !== null) {
      (zapFilter as any).until = oldestTimestampRef.current;
    } else {
      (zapFilter as any).since = Math.floor(Date.now() / 1000) - 30 * 86400;
    }

    const zappedNoteIds: string[] = [];

    const handle = nostrRuntime.subscribe(relays, [zapFilter], {
      onEvent: (event) => {
        const eTag = event.tags.find((t) => t[0] === "e")?.[1];
        if (eTag) zappedNoteIds.push(eTag);
        if (
          oldestTimestampRef.current === null ||
          event.created_at < oldestTimestampRef.current
        ) {
          oldestTimestampRef.current = event.created_at;
        }
      },
      onEose: () => {
        handle.unsubscribe();
        const uniqueNoteIds = Array.from(new Set(zappedNoteIds));
        if (uniqueNoteIds.length > 0) {
          const noteHandle = nostrRuntime.subscribe(
            relays,
            [{ kinds: [1], ids: uniqueNoteIds }],
            {
              onEvent: () => {},
              onEose: () => {
                noteHandle.unsubscribe();
                finishFetch();
              },
            }
          );
        } else {
          finishFetch();
        }
      },
    });

    const finishFetch = () => {
      setVersion((v) => v + 1);
      loadingRef.current = false;
      setLoading(false);
    };
  }, [user?.follows, relays]);

  const refreshZappedNotes = useCallback(() => {
    oldestTimestampRef.current = null;
    loadingRef.current = false;
    setVersion(0);
    fetchZappedNotes();
  }, [fetchZappedNotes]);

  return {
    zappedEvents: zappedEvents(),
    zapRecords: zapRecords(),
    fetchZappedNotes,
    refreshZappedNotes,
    loading,
  };
};
