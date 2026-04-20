import React, { useState } from "react";
import { Button, CircularProgress, Dialog, DialogContent, DialogTitle, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { IconButton } from "@mui/material";
import { useUserContext } from "../../hooks/useUserContext";
import { useListContext } from "../../hooks/useListContext";
import { ProfileListDialog } from "../Common/ProfileListDialog";
import { useBackClose } from "../../hooks/useBackClose";

interface ContactsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({ open, onClose }) => {
  const { user } = useUserContext();
  const { unfollowContact } = useListContext();
  const [unfollowingPk, setUnfollowingPk] = useState<string | null>(null);
  useBackClose(open, onClose);

  const handleUnfollow = async (e: React.MouseEvent, pk: string) => {
    e.stopPropagation();
    setUnfollowingPk(pk);
    try {
      await unfollowContact(pk);
    } finally {
      setUnfollowingPk(null);
    }
  };

  if (!user) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Contacts
          <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography>Please log in to view your contacts.</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  const renderAction = (pk: string) => {
    const isLoading = unfollowingPk === pk;
    return (
      <Button
        variant="outlined"
        size="small"
        color="error"
        disabled={isLoading}
        onClick={(e) => handleUnfollow(e, pk)}
      >
        {isLoading ? <CircularProgress size={16} color="inherit" /> : "Unfollow"}
      </Button>
    );
  };

  return (
    <ProfileListDialog
      open={open}
      onClose={onClose}
      pubkeys={user.follows || []}
      title={`Contacts (${user.follows?.length ?? 0})`}
      renderAction={renderAction}
    />
  );
};
