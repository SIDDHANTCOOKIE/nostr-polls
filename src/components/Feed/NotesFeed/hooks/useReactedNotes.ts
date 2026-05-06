import { useState, useCallback, useRef } from "react";
import { Event, Filter } from "nostr-tools";
import { useRelays } from "../../../../hooks/useRelays";
import { nostrRuntime } from "../../../../singletons";

const FETCH_TIMEOUT_MS = 8000;

export const useReactedNotes = (user: any) => {
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [version, setVersion] = useState(0);
  const { relays } = useRelays();

  // Ref-based guards — no stale closures, stable fetchReactedNotes reference
  const oldestTimestampRef = useRef<number | null>(null);
  const loadingRef = useRef(false);

  const reactionEvents = useCallback(() => {
    if (!user?.follows?.length) return new Map<string, Event>();

    const events = nostrRuntime.query({
      kinds: [7],
      authors: user.follows,
    });

    const reactionMap = new Map<string, Event>();
    for (const event of events) {
      reactionMap.set(event.id, event);
    }
    return reactionMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version]);

  const reactedEvents = useCallback(() => {
    if (!user?.follows?.length) return new Map<string, Event>();

    const reactions = Array.from(reactionEvents().values());
    const reactedNoteIds = reactions
      .map((e) => e.tags.find((tag) => tag[0] === "e")?.[1])
      .filter(Boolean) as string[];

    const noteEvents = nostrRuntime.query({
      kinds: [1],
      ids: reactedNoteIds,
    });

    const noteMap = new Map<string, Event>();
    for (const event of noteEvents) {
      noteMap.set(event.id, event);
    }
    return noteMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version, reactionEvents]);

  const fetchReactedNotes = useCallback(async () => {
    if (!user?.follows?.length) { setInitialLoadDone(true); return; }
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadFailed(false);
    setLoading(true);

    const reactionFilter: Filter = {
      kinds: [7],
      authors: user.follows,
      limit: 20,
    };

    if (oldestTimestampRef.current !== null) {
      reactionFilter.until = oldestTimestampRef.current;
    } else {
      reactionFilter.since = Math.floor(Date.now() / 1000) - 30 * 86400;
    }

    let reactedNoteIds: string[] = [];
    let fetchDone = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const finishFetch = (failed = false) => {
      if (fetchDone) return;
      fetchDone = true;
      clearTimeout(timeoutId);
      loadingRef.current = false;
      setLoading(false);
      setInitialLoadDone(true);
      if (failed) {
        setLoadFailed(true);
      } else {
        setVersion((v) => v + 1);
      }
    };

    const reactionHandle = nostrRuntime.subscribe(relays, [reactionFilter], {
      onEvent: (event) => {
        const noteId = event.tags.find((tag) => tag[0] === "e")?.[1];
        if (noteId) reactedNoteIds.push(noteId);
        if (oldestTimestampRef.current === null || event.created_at < oldestTimestampRef.current) {
          oldestTimestampRef.current = event.created_at;
        }
      },
      onEose: () => {
        reactionHandle.unsubscribe();

        if (reactedNoteIds.length > 0) {
          const uniqueNoteIds = Array.from(new Set(reactedNoteIds));
          const noteHandle = nostrRuntime.subscribe(relays, [{ kinds: [1], ids: uniqueNoteIds }], {
            onEvent: () => {},
            onEose: () => {
              noteHandle.unsubscribe();
              finishFetch();
            },
          });
        } else {
          finishFetch();
        }
      },
    });

    timeoutId = setTimeout(() => {
      reactionHandle.unsubscribe();
      finishFetch(true);
    }, FETCH_TIMEOUT_MS);
  }, [user?.follows, relays]);

  const refreshReactedNotes = useCallback(() => {
    oldestTimestampRef.current = null;
    loadingRef.current = false;
    setVersion(0);
    setInitialLoadDone(false);
    setLoadFailed(false);
    fetchReactedNotes();
  }, [fetchReactedNotes]);

  return {
    reactedEvents: reactedEvents(),
    reactionEvents: reactionEvents(),
    fetchReactedNotes,
    refreshReactedNotes,
    loading,
    loadFailed,
    initialLoadDone,
  };
};
