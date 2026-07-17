import { Event, EventTemplate } from "nostr-tools";
import { dataLayer } from "@formstr/local-relay";
import { signEvent } from "../../nostr";
import { NOSTR_EVENT_KINDS } from "../../constants/nostr";
import { getAppBaseUrl } from "../../utils/platform";

export function buildScoreShareText(gameLabel: string, gameId: string, score: number, dateIso: string): string {
  const url = `${getAppBaseUrl()}/feeds/games/${gameId}`;
  return `I scored ${score} in today's ${gameLabel} challenge on Pollerama! 🎮\n\nPlay today's board: ${url}`;
}

/** Publishes `text` as a kind-1 note, signed with `secret` when the user is on a local-key login. */
export async function publishScoreNote(text: string, secret?: string): Promise<Event> {
  const template: EventTemplate = {
    kind: NOSTR_EVENT_KINDS.TEXT_NOTE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: text,
  };
  const signed = await signEvent(template, secret);
  await dataLayer.publishEvent(signed);
  return signed;
}
