import React, { useState } from "react";
import { Button, CircularProgress } from "@mui/material";
import { useUserContext } from "../../hooks/useUserContext";
import { useListContext } from "../../hooks/useListContext";
import { ProfileListDialog } from "../Common/ProfileListDialog";

interface FollowPackMembersDialogProps {
  open: boolean;
  onClose: () => void;
  memberPubkeys: string[];
  packTitle: string;
}

export const FollowPackMembersDialog: React.FC<FollowPackMembersDialogProps> = ({
  open,
  onClose,
  memberPubkeys,
  packTitle,
}) => {
  const { user } = useUserContext();
  const { followPubkey } = useListContext();
  const [followingPks, setFollowingPks] = useState<Set<string>>(new Set());

  const handleFollow = async (e: React.MouseEvent, pk: string) => {
    e.stopPropagation();
    if (!user || followingPks.has(pk)) return;
    setFollowingPks((prev) => new Set(prev).add(pk));
    try {
      // Shared follow flow: publishes the updated kind-3 AND commits it to the
      // durable contacts cache + in-memory follows. Allow the empty case since
      // this dialog has no no-contact-list confirmation of its own.
      await followPubkey(pk, { allowEmptyContactList: true });
    } finally {
      setFollowingPks((prev) => {
        const s = new Set(prev);
        s.delete(pk);
        return s;
      });
    }
  };

  const renderAction = (pk: string) => {
    if (!user || user.pubkey === pk || user.follows?.includes(pk)) return undefined;
    const isLoading = followingPks.has(pk);
    return (
      <Button
        size="small"
        variant="outlined"
        disabled={isLoading}
        sx={{ minWidth: 70 }}
        onClick={(e) => handleFollow(e, pk)}
      >
        {isLoading ? <CircularProgress size={16} color="inherit" /> : "Follow"}
      </Button>
    );
  };

  return (
    <ProfileListDialog
      open={open}
      onClose={onClose}
      pubkeys={memberPubkeys}
      title={packTitle}
      subtitle={`${memberPubkeys.length} member${memberPubkeys.length !== 1 ? "s" : ""}`}
      renderAction={renderAction}
    />
  );
};
