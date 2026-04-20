import React from "react";
import { Tooltip, Typography } from "@mui/material";
import CommentIcon from "@mui/icons-material/Comment";
import { useAppContext } from "../../../hooks/useAppContext";

interface CommentTriggerProps {
  eventId: string;
  showComments: boolean;
  onToggleComments: () => void;
  /** NIP-22: use addressable ref as cache key instead of eventId */
  addressableRef?: string;
}

const CommentTrigger: React.FC<CommentTriggerProps> = ({
  eventId,
  showComments,
  onToggleComments,
  addressableRef,
}) => {
  const { commentsMap } = useAppContext();
  const byEvent = commentsMap?.get(eventId) || [];
  const byAddr = addressableRef ? (commentsMap?.get(addressableRef) || []) : [];
  const seen = new Set<string>();
  const comments = [...byEvent, ...byAddr].filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));

  return (
    <Tooltip title={showComments ? "Hide Comments" : "View Comments"}>
      <span
        onClick={onToggleComments}
        style={{ cursor: "pointer", display: "flex", flexDirection: "row" }}
      >
        <CommentIcon
          sx={(theme) => ({
            color: theme.palette.mode === "light" ? "black" : "white",
          })}
        />
        <Typography>{comments.length ? comments.length : null}</Typography>
      </span>
    </Tooltip>
  );
};

export default CommentTrigger;
