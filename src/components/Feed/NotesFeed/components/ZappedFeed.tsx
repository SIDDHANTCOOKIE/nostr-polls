import { useEffect, useRef } from "react";
import { useUserContext } from "../../../../hooks/useUserContext";
import { useZappedNotes } from "../hooks/useZappedNotes";
import ZappedNoteCard from "./ZappedNoteCard";
import { Event } from "nostr-tools";
import UnifiedFeed from "../../UnifiedFeed";

const ZappedFeed = ({ onRegisterRefresh }: { onRegisterRefresh?: (fn: () => void) => void }) => {
  const { user } = useUserContext();
  const { zappedEvents, zapRecords, fetchZappedNotes, refreshZappedNotes, loading } =
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
      loading={loading && sorted.length === 0}
      loadingMore={loading && sorted.length > 0}
      onEndReached={fetchZappedNotes}
      onRefresh={refreshZappedNotes}
      refreshing={loading && sorted.length > 0}
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
