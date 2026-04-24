import { useState, useRef, useCallback, useEffect } from "react";
import { nostrRuntime } from "../../../../singletons";
import { useRelays } from "../../../../hooks/useRelays";
import { Filter } from "nostr-tools/lib/types";

const LOAD_TIMEOUT_MS = 5000;

export const useDiscoverNotes = () => {
    const { relays } = useRelays();
    const [version, setVersion] = useState(0);
    const [pendingCount, setPendingCount] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const subscriptionHandleRef = useRef<any>(null);
    const loadingRef = useRef(false);
    const oldestTimestampRef = useRef<number | null>(null);
    const webOfTrustRef = useRef<Set<string>>(new Set());

    // Query runtime for notes (only re-queries when version bumps, i.e. when user merges)
    const notes = useCallback(() => {
        if (!webOfTrustRef.current.size) return new Map<string, any>();
        const events = nostrRuntime.query({ kinds: [1], authors: Array.from(webOfTrustRef.current) });
        const noteMap = new Map<string, any>();
        for (const event of events) noteMap.set(event.id, event);
        return noteMap;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version]);

    // Merge buffered notes into the displayed list
    const mergeNewNotes = useCallback(() => {
        setVersion((v) => v + 1);
        setPendingCount(0);
    }, []);

    // Check for newer notes — non-destructive, adds to pendingCount
    const checkForNewer = useCallback(() => {
        if (!initialLoadComplete || !relays?.length) return;
        const authors = Array.from(webOfTrustRef.current);
        if (!authors.length) return;
        const currentEvents = nostrRuntime.query({ kinds: [1] });
        if (!currentEvents.length) return;
        const since = Math.max(...currentEvents.map((e: any) => e.created_at));
        const handle = nostrRuntime.subscribe(
            relays,
            [{ kinds: [1], authors, since: since + 1, limit: 20 }],
            {
                onEvent: () => setPendingCount((c) => c + 1),
                onEose: () => handle.unsubscribe(),
            }
        );
    }, [initialLoadComplete, relays]);

    // Poll for newer notes every 60s after initial load
    useEffect(() => {
        if (!initialLoadComplete || !relays?.length) return;
        const interval = setInterval(checkForNewer, 60_000);
        return () => clearInterval(interval);
    }, [initialLoadComplete, relays, checkForNewer]);

    const fetchNotes = useCallback((webOfTrust: Set<string>, fresh?: boolean) => {
        if (!webOfTrust?.size || !relays?.length) return;
        if (loadingRef.current) return;

        loadingRef.current = true;
        webOfTrustRef.current = webOfTrust;

        if (subscriptionHandleRef.current) {
            subscriptionHandleRef.current.unsubscribe();
        }

        if (fresh) {
            setRefreshing(true);
            oldestTimestampRef.current = null;
        } else {
            setLoadingMore(true);
        }

        const now = Math.floor(Date.now() / 1000);
        const filter: Filter = {
            kinds: [1],
            authors: Array.from(webOfTrust),
            limit: 30,
        };

        if (oldestTimestampRef.current !== null) {
            // Pagination: go backwards from oldest seen event
            filter.until = oldestTimestampRef.current;
        } else {
            // Initial or fresh load: fetch last 24h
            filter.since = now - 86400;
        }

        const deletionFilter: Filter = { kinds: [5], authors: Array.from(webOfTrust) };
        if (oldestTimestampRef.current !== null) {
            deletionFilter.until = oldestTimestampRef.current;
        } else {
            deletionFilter.since = now - 86400;
        }

        let hasNewEvents = false;
        const handle = nostrRuntime.subscribe(relays, [filter, deletionFilter], {
            onEvent: (event: any) => {
                hasNewEvents = true;
                if (oldestTimestampRef.current === null || event.created_at < oldestTimestampRef.current) {
                    oldestTimestampRef.current = event.created_at;
                }
            },
            onEose: () => {
                if (hasNewEvents) setVersion((v) => v + 1);
                setLoadingMore(false);
                setRefreshing(false);
                setInitialLoadComplete(true);
                loadingRef.current = false;
                handle.unsubscribe();
            },
            fresh,
        });

        subscriptionHandleRef.current = handle;

        const timeout = setTimeout(() => {
            setLoadingMore(false);
            setInitialLoadComplete(true);
            loadingRef.current = false;
        }, LOAD_TIMEOUT_MS);

        return () => {
            clearTimeout(timeout);
            if (subscriptionHandleRef.current) {
                subscriptionHandleRef.current.unsubscribe();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [relays]);

    const refreshNotes = useCallback((webOfTrust: Set<string>) => {
        loadingRef.current = false;
        oldestTimestampRef.current = null;
        setVersion(0);
        setPendingCount(0);
        setInitialLoadComplete(false);
        fetchNotes(webOfTrust, true);
    }, [fetchNotes]);

    return {
        notes: notes(),
        pendingCount,
        loadingMore,
        refreshing,
        fetchNotes,
        refreshNotes,
        checkForNewer,
        mergeNewNotes,
    };
};
