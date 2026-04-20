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
import { nip19 } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../hooks/useAppContext";
import { useBackClose } from "../../hooks/useBackClose";
import { openProfileTab } from "../../nostr";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";
import { Nip05Badge } from "./Nip05Badge";

interface ProfileListDialogProps {
  open: boolean;
  onClose: () => void;
  pubkeys: string[];
  title: string;
  subtitle?: string;
  renderAction?: (pubkey: string) => React.ReactNode;
}

export const ProfileListDialog: React.FC<ProfileListDialogProps> = ({
  open,
  onClose,
  pubkeys,
  title,
  subtitle,
  renderAction,
}) => {
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  const navigate = useNavigate();
  useBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    pubkeys.forEach((pk) => {
      if (!profiles?.get(pk)) fetchUserProfileThrottled(pk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pubkeys.length]);

  const handleProfileClick = (pk: string) => {
    onClose();
    openProfileTab(nip19.npubEncode(pk), navigate);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography variant="h6" component="span">{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <List dense disablePadding>
          {pubkeys.map((pk) => {
            const profile = profiles?.get(pk);
            const npub = nip19.npubEncode(pk);
            const name =
              profile?.display_name ||
              profile?.name ||
              npub.slice(0, 8) + "…";

            return (
              <ListItem
                key={pk}
                sx={{ px: 2, py: 0.75 }}
                secondaryAction={renderAction?.(pk)}
              >
                <ListItemAvatar sx={{ minWidth: 44 }}>
                  <Avatar
                    src={profile?.picture || DEFAULT_IMAGE_URL}
                    sx={{ width: 36, height: 36, cursor: "pointer" }}
                    onClick={() => handleProfileClick(pk)}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      noWrap
                      sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                      onClick={() => handleProfileClick(pk)}
                    >
                      {name}
                    </Typography>
                  }
                  secondary={
                    profile?.nip05 ? (
                      <Nip05Badge nip05={profile.nip05} pubkey={pk} />
                    ) : (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {npub.slice(0, 16)}…
                      </Typography>
                    )
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
};
