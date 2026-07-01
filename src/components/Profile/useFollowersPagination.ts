import { useCallback, useEffect, useRef, useState } from "react";
import { Event } from "nostr-tools";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";

const PAGE_SIZE = 50;

/**
 * Paginated followers list for a profile: fetches kind-3 events tagging
 * `pubkey`, one page (of distinct authors) at a time, walking `until`
 * backwards from the oldest event seen. The subscription only exists while
 * `open` is true — it's torn down (unobserve) as soon as the modal closes, so
 * we don't keep a potentially large "everyone who follows X" scope warm once
 * the user isn't looking at it.
 */
export function useFollowersPagination(pubkey: string | null, open: boolean) {
  const [pubkeys, setPubkeys] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  const eventsRef = useRef(new Map<string, Event>());
  const handleRef = useRef<ObserveHandle | null>(null);
  const batchCountRef = useRef(0);
  const oldestCreatedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !pubkey) return;

    eventsRef.current = new Map();
    batchCountRef.current = 0;
    oldestCreatedAtRef.current = null;
    setPubkeys([]);
    setHasMore(false);
    setInitialLoading(true);

    const handle = dataLayer.observe(
      [{ kinds: [3], "#p": [pubkey], limit: PAGE_SIZE }],
      {
        onEvent: (event: Event) => {
          eventsRef.current.set(event.pubkey, event);
          batchCountRef.current += 1;
          if (
            oldestCreatedAtRef.current === null ||
            event.created_at < oldestCreatedAtRef.current
          ) {
            oldestCreatedAtRef.current = event.created_at;
          }
          setPubkeys(Array.from(eventsRef.current.keys()));
        },
        onEose: () => {
          setInitialLoading(false);
          setLoadingMore(false);
          setHasMore(batchCountRef.current >= PAGE_SIZE);
        },
      },
    );
    handleRef.current = handle;

    return () => {
      handle.unobserve();
      handleRef.current = null;
    };
  }, [open, pubkey]);

  const loadMore = useCallback(() => {
    if (!handleRef.current || !pubkey || oldestCreatedAtRef.current === null)
      return;

    batchCountRef.current = 0;
    setLoadingMore(true);
    handleRef.current.update([
      {
        kinds: [3],
        "#p": [pubkey],
        limit: PAGE_SIZE,
        until: oldestCreatedAtRef.current - 1,
      },
    ]);
  }, [pubkey]);

  return { pubkeys, hasMore, loadingMore, initialLoading, loadMore };
}
