import { useEffect, useRef } from "react";
import FeedError from "../../FeedError";
import { useUserContext } from "../../../../hooks/useUserContext";
import { useReactedNotes } from "../hooks/useReactedNotes";
import ReactedNoteCard from "./ReactedNoteCard";
import { Event } from "nostr-tools";
import UnifiedFeed from "../../UnifiedFeed";

const ReactedFeed = ({ onRegisterRefresh }: { onRegisterRefresh?: (fn: () => void) => void }) => {
  const { user } = useUserContext();
  const { reactedEvents, reactionEvents, fetchReactedNotes, refreshReactedNotes, loading, loadFailed, initialLoadDone } =
    useReactedNotes(user);
  const fetchedRef = useRef(false);

  // Register refresh with parent SpeedDial
  useEffect(() => {
    onRegisterRefresh?.(refreshReactedNotes);
  }, [onRegisterRefresh, refreshReactedNotes]);

  // Fetch once user.follows is available — retries if user wasn't ready on mount
  useEffect(() => {
    if (fetchedRef.current || !user?.follows?.length) return;
    fetchedRef.current = true;
    fetchReactedNotes();
  }, [user, fetchReactedNotes]);

  const sorted = Array.from(reactedEvents.values()).sort(
    (a, b) => b.created_at - a.created_at,
  );

  return (
    <UnifiedFeed
      data={sorted}
      loading={!initialLoadDone && !loadFailed}
      loadingMore={loading && sorted.length > 0}
      onEndReached={fetchReactedNotes}
      onRefresh={refreshReactedNotes}
      emptyState={
        (loadFailed || (initialLoadDone && sorted.length === 0))
          ? <FeedError message="Couldn't load reacted notes" onRetry={refreshReactedNotes} />
          : undefined
      }
      itemContent={(index, note: Event) => (
        <ReactedNoteCard
          key={note.id}
          note={note}
          reactions={Array.from(reactionEvents.values())}
        />
      )}
    />
  );
};

export default ReactedFeed;
