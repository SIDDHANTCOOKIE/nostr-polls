import { useEffect, useRef } from "react";
import { useUserContext } from "../../../../hooks/useUserContext";
import { useZappedNotes } from "../hooks/useZappedNotes";
import ZappedNoteCard from "./ZappedNoteCard";
import { Event } from "nostr-tools";
import UnifiedFeed from "../../UnifiedFeed";
import FeedError from "../../FeedError";

const ZappedFeed = ({ onRegisterRefresh }: { onRegisterRefresh?: (fn: () => void) => void }) => {
  const { user } = useUserContext();
  const { zappedEvents, zapRecords, fetchZappedNotes, refreshZappedNotes, loading, loadFailed, initialLoadDone } =
    useZappedNotes(user);
  const fetchedRef = useRef(false);

  useEffect(() => {
    onRegisterRefresh?.(refreshZappedNotes);
  }, [onRegisterRefresh, refreshZappedNotes]);

  useEffect(() => {
    if (fetchedRef.current || !user?.follows?.length) return;
    fetchedRef.current = true;
    fetchZappedNotes();
  }, [user, fetchZappedNotes]);

  // Sort by most recent zap timestamp
  const sorted = Array.from(zappedEvents.values()).sort((a, b) => {
    const latestA = Math.max(
      ...(zapRecords.get(a.id) ?? []).map((r) => r.zapEvent.created_at)
    );
    const latestB = Math.max(
      ...(zapRecords.get(b.id) ?? []).map((r) => r.zapEvent.created_at)
    );
    return latestB - latestA;
  });

  return (
    <UnifiedFeed
      data={sorted}
      loading={!initialLoadDone && !loadFailed}
      loadingMore={loading && sorted.length > 0}
      onEndReached={fetchZappedNotes}
      onRefresh={refreshZappedNotes}
      emptyState={
        (loadFailed || (initialLoadDone && sorted.length === 0))
          ? <FeedError message="Couldn't load zapped notes" onRetry={refreshZappedNotes} />
          : undefined
      }
      itemContent={(index, note: Event) => (
        <ZappedNoteCard
          key={note.id}
          note={note}
          zapRecords={zapRecords.get(note.id) ?? []}
        />
      )}
    />
  );
};

export default ZappedFeed;
