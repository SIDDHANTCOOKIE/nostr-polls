import React, { useEffect, useRef, useState } from "react";
import { Tooltip, Typography } from "@mui/material";
import { useAppContext } from "../../../hooks/useAppContext";
import { Event } from "nostr-tools/lib/types/core";
import { defaultRelays, signEvent } from "../../../nostr";
import { useRelays } from "../../../hooks/useRelays";
import { FlashOn } from "@mui/icons-material";
import { nip57 } from "nostr-tools";
import { useUserContext } from "../../../hooks/useUserContext";
import { styled } from "@mui/system";
import { getColorsWithTheme } from "../../../styles/theme";
import { useNotification } from "../../../contexts/notification-context";
import { NOTIFICATION_MESSAGES } from "../../../constants/notifications";
import { nostrRuntime } from "../../../singletons";
import ZapModal from "./ZapModal";

interface ZapProps {
  pollEvent: Event;
}

const Wrapper = styled("div")(({ theme }) => ({
  ...getColorsWithTheme(theme, {
    color: "#000000",
  }),
}));

const Zap: React.FC<ZapProps> = ({ pollEvent }) => {
  const { fetchZapsThrottled, zapsMap, profiles, addEventToMap } = useAppContext();
  const { user } = useUserContext();
  const [hasZapped, setHasZapped] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [zapConfirmed, setZapConfirmed] = useState(false);
  const zapSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const { showNotification } = useNotification();
  const { relays } = useRelays();

  const recipient = profiles?.get(pollEvent.pubkey);

  useEffect(() => {
    const fetchZaps = async () => {
      if (!zapsMap?.get(pollEvent.id)) {
        fetchZapsThrottled(pollEvent.id);
      }
      const fetchedZaps = zapsMap?.get(pollEvent.id) || [];
      const userZapped = fetchedZaps.some(
        (zap) => zap.tags.find((t) => t[0] === "P")?.[1] === user?.pubkey
      );
      setHasZapped(userZapped);
    };

    fetchZaps();
  }, [pollEvent.id, zapsMap, fetchZapsThrottled, user]);

  const getTotalZaps = () => {
    let amount = 0;
    zapsMap?.get(pollEvent.id)?.forEach((e) => {
      const bolt11Tag = e.tags.find((t) => t[0] === "bolt11");
      if (bolt11Tag && bolt11Tag[1]) {
        try {
          const sats = nip57.getSatoshisAmountFromBolt11(bolt11Tag[1]);
          amount += sats || 0;
        } catch (e) {
          return;
        }
      }
    });
    return amount.toString();
  };

  const handleZapClick = () => {
    if (!user) {
      showNotification(NOTIFICATION_MESSAGES.LOGIN_TO_ZAP, "warning");
      return;
    }
    if (!recipient) {
      showNotification(NOTIFICATION_MESSAGES.RECIPIENT_PROFILE_ERROR, "error");
      return;
    }
    setModalOpen(true);
  };

  const handleZap = async (amount: number): Promise<string | null> => {
    if (!recipient) {
      showNotification(NOTIFICATION_MESSAGES.RECIPIENT_PROFILE_ERROR, "error");
      return null;
    }

    try {
      const zapRequestEvent = nip57.makeZapRequest({
        profile: pollEvent.pubkey,
        event: pollEvent.id,
        amount: amount * 1000,
        comment: "",
        relays: relays,
      });
      const signedZapRequest = await signEvent(zapRequestEvent, user!.privateKey);
      const serializedZapEvent = encodeURIComponent(JSON.stringify(signedZapRequest));
      const zapEndpoint = await nip57.getZapEndpoint(recipient.event);
      const zaprequestUrl =
        zapEndpoint + `?amount=${amount * 1000}&nostr=${serializedZapEvent}`;
      const paymentRequest = await fetch(zaprequestUrl);
      const request = await paymentRequest.json();

      // Subscribe for the zap receipt (kind 9735) so we can detect payment
      const since = Math.floor(Date.now() / 1000);
      zapSubRef.current?.unsubscribe();
      const handle = nostrRuntime.subscribe(
        defaultRelays,
        [{ kinds: [9735], "#e": [pollEvent.id], since }],
        {
          onEvent: (event) => {
            addEventToMap(event);
            setZapConfirmed(true);
            zapSubRef.current?.unsubscribe();
            zapSubRef.current = null;
          },
        }
      );
      zapSubRef.current = handle;

      return request.pr;
    } catch (error) {
      console.error("Failed to create zap invoice:", error);
      showNotification("Failed to create invoice", "error");
      return null;
    }
  };

  const recipientName =
    recipient?.name || recipient?.display_name;

  return (
    <Wrapper style={{ marginLeft: 20 }}>
      <Tooltip onClick={handleZapClick} title="Send a Zap">
        <span
          style={{ cursor: "pointer", display: "flex", flexDirection: "row" }}
        >
          {hasZapped ? (
            <FlashOn
              sx={(theme) => {
                return {
                  color: theme.palette.primary.main,
                  "& path": {
                    ...getColorsWithTheme(theme, {
                      stroke: "#000000",
                    }),
                    strokeWidth: 2,
                  },
                };
              }}
            />
          ) : (
            <FlashOn
              sx={(theme) => ({
                color: theme.palette.mode === "light" ? "white" : "black",
                "& path": {
                  stroke: theme.palette.mode === "light" ? "black" : "white",
                  strokeWidth: 2,
                },
              })}
            />
          )}
          {zapsMap?.get(pollEvent.id) ? (
            <Typography>{getTotalZaps()}</Typography>
          ) : null}
        </span>
      </Tooltip>

      <ZapModal
        open={modalOpen}
        onClose={() => {
          zapSubRef.current?.unsubscribe();
          zapSubRef.current = null;
          setZapConfirmed(false);
          setModalOpen(false);
        }}
        onZap={handleZap}
        recipientName={recipientName}
        zapConfirmed={zapConfirmed}
      />
    </Wrapper>
  );
};

export default Zap;
