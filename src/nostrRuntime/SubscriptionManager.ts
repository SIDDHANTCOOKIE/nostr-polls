import { Filter, SimplePool } from 'nostr-tools';
import { EventStore } from './EventStore';
import { generateFilterHash, chunkFilter } from './utils/filterUtils';
import {
  ManagedSubscription,
  EventCallback,
  EoseCallback,
  SubscriptionDebugInfo,
} from './types';
import { recordEventRelay } from './EventRelayMap';

/**
 * SubscriptionManager - Manages SimplePool subscriptions with deduplication
 *
 * Features:
 * - Automatic deduplication via filter hashing
 * - Reference counting (auto-close when refCount reaches 0)
 * - Automatic chunking for large author lists (>1000 authors)
 * - Event forwarding to EventStore and component callbacks
 */
export class SubscriptionManager {
  private subscriptions: Map<string, ManagedSubscription> = new Map();
  private pool: SimplePool;
  private eventStore: EventStore;

  constructor(pool: SimplePool, eventStore: EventStore) {
    this.pool = pool;
    this.eventStore = eventStore;
  }

  /**
   * Subscribe to events with automatic deduplication
   * If an identical subscription exists, increments refCount and adds callback
   * Returns subscription ID and unsubscribe function
   */
  subscribe(
    relays: string[],
    filters: Filter[],
    onEvent?: EventCallback,
    onEose?: EoseCallback
  ): { id: string; unsubscribe: () => void } {
    // Generate hash for deduplication
    const subscriptionId = generateFilterHash(filters, relays);

    // Check if subscription already exists
    const existing = this.subscriptions.get(subscriptionId);

    if (existing) {
      // Increment reference count
      existing.refCount++;

      // Add callbacks
      if (onEvent) {
        existing.callbacks.add(onEvent);

        // If subscription already received EOSE, immediately call onEose
        if (existing.eoseReceived && onEose) {
          onEose();
        } else if (onEose) {
          existing.eoseCallbacks.add(onEose);
        }
      }

      // Return existing subscription
      return {
        id: subscriptionId,
        unsubscribe: () => this.unsubscribe(subscriptionId, onEvent, onEose),
      };
    }

    // Create new subscription
    const managedSub: ManagedSubscription = {
      id: subscriptionId,
      filters,
      relays,
      closer: null,
      refCount: 1,
      callbacks: new Set(onEvent ? [onEvent] : []),
      eoseCallbacks: new Set(onEose ? [onEose] : []),
      eoseReceived: false,
      startedAt: Date.now(),
      eventCount: 0,
    };

    // Check if we need to chunk (large author lists)
    const needsChunking = filters.some(
      f => f.authors && f.authors.length > 1000
    );

    if (needsChunking) {
      // Chunk filters and create multiple subscriptions
      managedSub.chunks = [];
      const totalChunks = filters.reduce((acc, f) => {
        const chunks = chunkFilter(f, 1000);
        return acc + chunks.length;
      }, 0);

      // Track EOSE count in a local variable to avoid closure issues
      const eoseState = { count: 0 };

      for (const filter of filters) {
        const chunks = chunkFilter(filter, 1000);

        for (const chunkFilter of chunks) {
          const closer = this.pool.subscribeMany(
            relays,
            [chunkFilter],
            {
              onevent: (event) => {
                // Add to event store
                this.eventStore.addEvent(event);

                // Track timing
                if (!managedSub.firstEventAt) managedSub.firstEventAt = Date.now();
                managedSub.eventCount++;

                // Notify all callbacks
                for (const callback of Array.from(managedSub.callbacks)) {
                  callback(event);
                }
              },
              oneose: () => {
                eoseState.count++;
                if (eoseState.count === totalChunks) {
                  // All chunks have reached EOSE
                  managedSub.eoseReceived = true;
                  managedSub.eoseAt = Date.now();
                  for (const eoseCallback of Array.from(managedSub.eoseCallbacks)) {
                    eoseCallback();
                  }
                  managedSub.eoseCallbacks.clear();
                }
              },
            }
          );

          managedSub.chunks.push(closer);
        }
      }
    } else {
      // Subscribe per relay so we can track which relay each event came from.
      // Functionally identical to subscribeMany(allRelays) — nostr-tools already
      // opens one connection per relay internally.
      managedSub.chunks = [];
      const eoseState = { count: 0 };

      for (const relay of relays) {
        const closer = this.pool.subscribeMany(
          [relay],
          filters,
          {
            onevent: (event) => {
              this.eventStore.addEvent(event);

              if (!managedSub.firstEventAt) managedSub.firstEventAt = Date.now();
              managedSub.eventCount++;
              recordEventRelay(event.id, relay);

              for (const callback of Array.from(managedSub.callbacks)) {
                callback(event);
              }
            },
            oneose: () => {
              eoseState.count++;
              if (eoseState.count === relays.length) {
                managedSub.eoseReceived = true;
                managedSub.eoseAt = Date.now();
                for (const eoseCallback of Array.from(managedSub.eoseCallbacks)) {
                  eoseCallback();
                }
                managedSub.eoseCallbacks.clear();
              }
            },
          }
        );
        managedSub.chunks.push(closer);
      }
    }

    // Store subscription
    this.subscriptions.set(subscriptionId, managedSub);

    return {
      id: subscriptionId,
      unsubscribe: () => this.unsubscribe(subscriptionId, onEvent, onEose),
    };
  }

  /**
   * Unsubscribe from a subscription
   * Decrements refCount and closes if it reaches 0
   */
  private unsubscribe(
    subscriptionId: string,
    onEvent?: EventCallback,
    onEose?: EoseCallback
  ): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Remove callbacks
    if (onEvent) {
      subscription.callbacks.delete(onEvent);
    }
    if (onEose) {
      subscription.eoseCallbacks.delete(onEose);
    }

    // Decrement reference count
    subscription.refCount--;

    // If no more references, close subscription
    if (subscription.refCount <= 0) {
      this.closeSubscription(subscriptionId);
    }
  }

  /**
   * Close a subscription and clean up
   */
  private closeSubscription(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Close SimplePool subscription(s)
    if (subscription.chunks) {
      for (const closer of subscription.chunks) {
        closer.close();
      }
    } else if (subscription.closer) {
      subscription.closer.close();
    }

    // Remove from map
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get active subscription count
   */
  getActiveCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all relay URLs that have at least one active subscription.
   * Used as a proxy for "connected" status — if we're subscribed, the relay
   * is (or was recently) reachable.
   */
  getActiveRelays(): Set<string> {
    const relaySet = new Set<string>();
    for (const sub of Array.from(this.subscriptions.values())) {
      for (const relay of sub.relays) relaySet.add(relay);
    }
    return relaySet;
  }

  /**
   * Get debug information about all subscriptions
   */
  listSubscriptions(): SubscriptionDebugInfo[] {
    const info: SubscriptionDebugInfo[] = [];

    for (const sub of Array.from(this.subscriptions.values())) {
      info.push({
        id: sub.id,
        filters: sub.filters,
        relays: sub.relays,
        refCount: sub.refCount,
        callbackCount: sub.callbacks.size,
        eoseReceived: sub.eoseReceived,
        isChunked: !!sub.chunks,
        startedAt: sub.startedAt,
        firstEventAt: sub.firstEventAt,
        eoseAt: sub.eoseAt,
        eventCount: sub.eventCount,
      });
    }

    return info;
  }

  /**
   * Close all subscriptions (useful for cleanup/testing)
   */
  closeAll(): void {
    for (const subscriptionId of Array.from(this.subscriptions.keys())) {
      this.closeSubscription(subscriptionId);
    }
  }

  /**
   * Reconnect all active subscriptions.
   * Closes existing pool subscriptions and re-creates them, preserving
   * callbacks and refCounts. Useful after idle/background periods where
   * WebSocket connections may have silently dropped.
   */
  reconnectAll(): void {
    for (const sub of Array.from(this.subscriptions.values())) {
      // Close existing pool subscription(s)
      if (sub.chunks) {
        for (const closer of sub.chunks) {
          closer.close();
        }
      } else if (sub.closer) {
        sub.closer.close();
      }

      // Reset EOSE and timing state
      sub.eoseReceived = false;
      sub.startedAt = Date.now();
      sub.firstEventAt = undefined;
      sub.eoseAt = undefined;
      sub.eventCount = 0;

      // Re-create pool subscription(s)
      const needsChunking = sub.filters.some(
        f => f.authors && f.authors.length > 1000
      );

      if (needsChunking) {
        sub.chunks = [];
        const totalChunks = sub.filters.reduce((acc, f) => {
          const chunks = chunkFilter(f, 1000);
          return acc + chunks.length;
        }, 0);
        const eoseState = { count: 0 };

        for (const filter of sub.filters) {
          const chunks = chunkFilter(filter, 1000);
          for (const cf of chunks) {
            const closer = this.pool.subscribeMany(
              sub.relays,
              [cf],
              {
                onevent: (event) => {
                  this.eventStore.addEvent(event);
                  if (!sub.firstEventAt) sub.firstEventAt = Date.now();
                  sub.eventCount++;
                  for (const callback of Array.from(sub.callbacks)) {
                    callback(event);
                  }
                },
                oneose: () => {
                  eoseState.count++;
                  if (eoseState.count === totalChunks) {
                    sub.eoseReceived = true;
                    sub.eoseAt = Date.now();
                    for (const eoseCallback of Array.from(sub.eoseCallbacks)) {
                      eoseCallback();
                    }
                    sub.eoseCallbacks.clear();
                  }
                },
              }
            );
            sub.chunks.push(closer);
          }
        }
      } else {
        sub.chunks = [];
        sub.closer = null;
        const eoseState = { count: 0 };

        for (const relay of sub.relays) {
          const closer = this.pool.subscribeMany(
            [relay],
            sub.filters,
            {
              onevent: (event) => {
                this.eventStore.addEvent(event);
                if (!sub.firstEventAt) sub.firstEventAt = Date.now();
                sub.eventCount++;
                recordEventRelay(event.id, relay);
                for (const callback of Array.from(sub.callbacks)) {
                  callback(event);
                }
              },
              oneose: () => {
                eoseState.count++;
                if (eoseState.count === sub.relays.length) {
                  sub.eoseReceived = true;
                  sub.eoseAt = Date.now();
                  for (const eoseCallback of Array.from(sub.eoseCallbacks)) {
                    eoseCallback();
                  }
                  sub.eoseCallbacks.clear();
                }
              },
            }
          );
          sub.chunks.push(closer);
        }
      }
    }
  }
}
