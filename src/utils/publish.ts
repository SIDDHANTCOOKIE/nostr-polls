import { Event } from "nostr-tools";
import { pool } from "../singletons";
import { getNip65InboxRelays } from "../nostr/OutboxService";

const PUBLISH_TIMEOUT_MS = 5000;

export interface PublishResult {
  ok: boolean;
  accepted: number;
  total: number;
}

export async function waitForPublish(
  relays: string[],
  event: Event
): Promise<PublishResult> {
  const total = relays.length;
  if (total === 0) return { ok: false, accepted: 0, total: 0 };

  const promises = pool.publish(relays, event);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), PUBLISH_TIMEOUT_MS)
  );

  const results = await Promise.allSettled(
    promises.map((p) => Promise.race([p, timeout]))
  );

  const accepted = results.filter((r) => r.status === "fulfilled").length;
  return { ok: accepted > 0, accepted, total };
}

/**
 * Publish an event using the gossip/outbox model.
 *
 * In addition to publishing to the user's own write relays, this delivers
 * the event to the NIP-65 read (inbox) relays of any pubkey mentioned via
 * a "p" tag. This ensures mentions actually reach the intended recipients
 * even if they don't share relays with the author.
 *
 * @param writeRelays - The logged-in user's write (outbox) relays
 * @param event       - The signed event to publish
 */
export async function publishWithGossip(
  writeRelays: string[],
  event: Event
): Promise<PublishResult> {
  // Collect pubkeys from p-tags (mentions)
  const mentionedPubkeys = event.tags
    .filter((t) => t[0] === "p" && t[1])
    .map((t) => t[1]);

  // Resolve inbox relays for each mentioned pubkey in parallel
  let inboxRelays: string[] = [];
  if (mentionedPubkeys.length > 0) {
    const settled = await Promise.allSettled(
      mentionedPubkeys.map((pk) => getNip65InboxRelays(pk))
    );
    inboxRelays = settled
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<string[]>).value);
  }

  // Merge user's write relays + recipients' inbox relays, deduplicated
  const allRelays = Array.from(new Set([...writeRelays, ...inboxRelays]));

  return waitForPublish(allRelays, event);
}
