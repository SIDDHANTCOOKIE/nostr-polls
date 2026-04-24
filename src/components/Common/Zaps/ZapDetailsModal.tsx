import React, { useEffect } from "react";
import {
  Avatar,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { FlashOn } from "@mui/icons-material";
import { nip19 } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../../hooks/useAppContext";
import { useBackClose } from "../../../hooks/useBackClose";
import { openProfileTab } from "../../../nostr";
import { DEFAULT_IMAGE_URL } from "../../../utils/constants";
import { Nip05Badge } from "../Nip05Badge";
import { ZapInfo } from "../../../contexts/ZapProvider";

interface ZapDetailsModalProps {
  open: boolean;
  onClose: () => void;
  zapInfos: ZapInfo[];
  totalSats: number;
}

const ZapDetailsModal: React.FC<ZapDetailsModalProps> = ({ open, onClose, zapInfos, totalSats }) => {
  const navigate = useNavigate();
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  useBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    zapInfos.forEach((z) => {
      if (!profiles?.get(z.senderPubkey)) fetchUserProfileThrottled(z.senderPubkey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zapInfos.length]);

  const sorted = [...zapInfos].sort((a, b) => b.sats - a.sats);

  const handleProfileClick = (pk: string) => {
    onClose();
    openProfileTab(nip19.npubEncode(pk), navigate);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography variant="h6">Zaps</Typography>
          {totalSats > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <FlashOn sx={{ fontSize: "0.9rem", color: "#F7931A" }} />
              <Typography variant="body2" color="text.secondary">
                {totalSats.toLocaleString()} sats · {zapInfos.length} {zapInfos.length === 1 ? "zap" : "zaps"}
              </Typography>
            </Box>
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {zapInfos.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 3 }}>
            No zaps yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {sorted.map((z) => {
              const profile = profiles?.get(z.senderPubkey);
              const npub = nip19.npubEncode(z.senderPubkey);
              const name = profile?.display_name || profile?.name || npub.slice(0, 8) + "…";

              return (
                <ListItem
                  key={z.event.id}
                  sx={{ px: 2, py: 1, alignItems: "flex-start" }}
                  secondaryAction={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, pt: 0.5 }}>
                      <FlashOn sx={{ fontSize: "0.85rem", color: "#F7931A" }} />
                      <Typography variant="body2" fontWeight={600} sx={{ color: "#F7931A", lineHeight: 1 }}>
                        {z.sats.toLocaleString()}
                      </Typography>
                    </Box>
                  }
                >
                  <ListItemAvatar sx={{ minWidth: 44, mt: 0.5 }}>
                    <Avatar
                      src={profile?.picture || DEFAULT_IMAGE_URL}
                      sx={{ width: 36, height: 36, cursor: "pointer" }}
                      onClick={() => handleProfileClick(z.senderPubkey)}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        noWrap
                        sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" }, pr: 6 }}
                        onClick={() => handleProfileClick(z.senderPubkey)}
                      >
                        {name}
                      </Typography>
                    }
                    secondary={
                      <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                        {profile?.nip05 ? (
                          <Nip05Badge nip05={profile.nip05} pubkey={z.senderPubkey} />
                        ) : (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {npub.slice(0, 16)}…
                          </Typography>
                        )}
                        {z.comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontStyle: "italic", mt: 0.25, display: "block", pr: 6 }}
                          >
                            "{z.comment}"
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ZapDetailsModal;
