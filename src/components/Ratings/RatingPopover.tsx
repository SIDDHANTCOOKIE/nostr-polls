import React, { useState } from "react";
import {
  Box,
  Popover,
  Typography,
  IconButton,
  Grow,
  Divider,
} from "@mui/material";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { useRating } from "../../hooks/useRating";
import Rate from "./Rate";

interface Props {
  entityId: string;
  entityType?: string;
  /** Optional label shown in the popover header, e.g. "Rate this movie" */
  label?: string;
  /** Icon button size override */
  iconSize?: number;
}

const RatingPopover: React.FC<Props> = ({
  entityId,
  entityType = "event",
  label,
  iconSize = 22,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const ratingKey = `${entityType}:${entityId}`;
  const { averageRating, totalRatings } = useRating(ratingKey);

  const displayRating = averageRating ? (averageRating * 5).toFixed(1) : null;
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  return (
    <>
      {/* Trigger */}
      <Box
        display="inline-flex"
        alignItems="center"
        onClick={handleOpen}
        sx={{ cursor: "pointer", userSelect: "none" }}
      >
        <IconButton size="small" sx={{ p: 0.5 }} tabIndex={-1}>
          {totalRatings ? (
            <StarRoundedIcon
              sx={{
                fontSize: iconSize,
                color: "#FFB400",
                filter: "drop-shadow(0 0 4px rgba(255,180,0,0.5))",
                transition: "transform 0.15s",
                transform: open ? "scale(1.25)" : "scale(1)",
              }}
            />
          ) : (
            <StarBorderRoundedIcon
              sx={{
                fontSize: iconSize,
                transition: "transform 0.15s",
                transform: open ? "scale(1.25)" : "scale(1)",
              }}
            />
          )}
        </IconButton>

        {displayRating && (
          <Grow in>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, fontSize: "0.72rem", lineHeight: 1 }}
            >
              {displayRating}
            </Typography>
          </Grow>
        )}
      </Box>

      {/* Popover */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        TransitionProps={{ timeout: 180 }}
        PaperProps={{
          elevation: 8,
          sx: {
            borderRadius: 3,
            minWidth: 300,
            overflow: "visible",
            background: (theme) =>
              theme.palette.mode === "dark"
                ? "linear-gradient(145deg, #1e1e2e 0%, #181825 100%)"
                : "linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)",
            border: (theme) =>
              `1px solid ${
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)"
              }`,
          },
        }}
      >
        {/* Arrow */}
        <Box
          sx={{
            position: "absolute",
            top: -8,
            left: 20,
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: (theme) =>
              `8px solid ${
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)"
              }`,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            top: -7,
            left: 21,
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderBottom: (theme) =>
              `7px solid ${
                theme.palette.mode === "dark" ? "#1e1e2e" : "#ffffff"
              }`,
          }}
        />

        <Box sx={{ px: 2.5, pt: 2, pb: 2.5 }}>
          {label && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}
              >
                {label}
              </Typography>
              <Divider sx={{ my: 1 }} />
            </>
          )}

          <Rate entityId={entityId} entityType={entityType} onSubmitted={handleClose} />
        </Box>
      </Popover>
    </>
  );
};

export default RatingPopover;
