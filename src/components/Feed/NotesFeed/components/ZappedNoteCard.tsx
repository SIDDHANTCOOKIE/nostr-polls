import React from "react";
import { Avatar, Box, Tooltip, Typography } from "@mui/material";
import { FlashOn } from "@mui/icons-material";
import { nip19 } from "nostr-tools";
import { Event } from "nostr-tools";
import { DEFAULT_IMAGE_URL } from "../../../../utils/constants";
import { useAppContext } from "../../../../hooks/useAppContext";
import { Notes } from "../../../Notes";
import { ZapRecord } from "../hooks/useZappedNotes";

interface ZappedNoteCardProps {
  note: Event;
  zapRecords: ZapRecord[];
}

const ZappedNoteCard: React.FC<ZappedNoteCardProps> = ({ note, zapRecords }) => {
  const { profiles, fetchUserProfileThrottled } = useAppContext();

  const totalSats = zapRecords.reduce((sum, r) => sum + r.sats, 0);
  const uniqueSenders = Array.from(
    new Map(zapRecords.map((r) => [r.senderPubkey, r])).values()
  );

  uniqueSenders.forEach((r) => {
    if (!profiles?.get(r.senderPubkey)) fetchUserProfileThrottled(r.senderPubkey);
  });

  const formatSats = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
    return n.toLocaleString();
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75, flexWrap: "wrap" }}>
        <FlashOn sx={{ fontSize: "1rem", color: "#F7931A" }} />
        <Typography variant="caption" sx={{ color: "#F7931A", fontWeight: 600 }}>
          {formatSats(totalSats)} sats
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {uniqueSenders.slice(0, 5).map((r) => {
            const profile = profiles?.get(r.senderPubkey);
            const displayName =
              profile?.display_name ||
              profile?.name ||
              nip19.npubEncode(r.senderPubkey).substring(0, 8) + "…";
            return (
              <Tooltip
                key={r.senderPubkey}
                title={`${displayName} · ${formatSats(r.sats)} sats`}
              >
                <Avatar
                  src={profile?.picture || DEFAULT_IMAGE_URL}
                  alt={displayName}
                  sx={{ width: 22, height: 22 }}
                />
              </Tooltip>
            );
          })}
          {uniqueSenders.length > 5 && (
            <Typography variant="caption" color="text.secondary">
              +{uniqueSenders.length - 5} more
            </Typography>
          )}
        </Box>
      </Box>

      <Notes event={note} />
    </Box>
  );
};

export default ZappedNoteCard;
