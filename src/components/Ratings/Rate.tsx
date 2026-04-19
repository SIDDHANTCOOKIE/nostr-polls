import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  Chip,
} from "@mui/material";
import SwipeIcon from "@mui/icons-material/SwipeRounded";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useRating } from "../../hooks/useRating";
import TouchRating from "./TouchRating";

interface Props {
  entityId: string;
  entityType?: string;
  onSubmitted?: () => void;
}

const Rate: React.FC<Props> = ({ entityId, entityType = "event", onSubmitted }) => {
  const ratingKey = `${entityType}:${entityId}`;
  const { averageRating, totalRatings, submitRating, getUserRating } =
    useRating(ratingKey);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [touchLocked, setTouchLocked] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const userRating = getUserRating(ratingKey);

  useEffect(() => {
    if (userRating) setRatingValue(userRating * 5);
  }, [userRating]);

  const handleChange = (newValue: number) => {
    setRatingValue(newValue);
    setIsDragging(true);
    setError("");
  };

  const handleChangeCommitted = (newValue: number) => {
    setIsDragging(false);
    setRatingValue(newValue);
    setError("");
  };

  const handleSubmit = () => {
    if (ratingValue === null) {
      setError("Please give a rating first.");
      return;
    }
    setError("");
    submitRating(ratingValue, 5, entityType, content || undefined);
    setSubmitted(true);
    setTimeout(() => onSubmitted?.(), 1200);
  };

  const displayedAvg = averageRating ? (averageRating * 5).toFixed(1) : null;
  const displayValue = ratingValue ?? (averageRating ? averageRating * 5 : null);

  if (submitted) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" py={1.5} gap={1}>
        <CheckCircleOutlineIcon sx={{ fontSize: 36, color: "success.main" }} />
        <Typography variant="body2" fontWeight={600}>
          {ratingValue?.toFixed(1)} / 5 — Rated!
        </Typography>
      </Box>
    );
  }

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      {/* Stars + live value */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <TouchRating
          value={displayValue}
          onChange={handleChange}
          onChangeCommitted={handleChangeCommitted}
          requireHold
          onLockChange={setTouchLocked}
          size={32}
          fillColor={ratingValue != null ? "#FFB400" : "#64B5F6"}
        />

        {(ratingValue != null || displayedAvg != null) && (
          <Chip
            label={ratingValue != null ? ratingValue.toFixed(1) : displayedAvg}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: "0.85rem",
              bgcolor: isDragging ? "warning.main" : "action.selected",
              color: isDragging ? "warning.contrastText" : "text.primary",
              transition: "background-color 0.15s",
              minWidth: 44,
            }}
          />
        )}
      </Box>

      {/* Hint */}
      {touchLocked ? (
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.68rem" }}>
          Hold to rate
        </Typography>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
          <SwipeIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          <Typography variant="caption" color="text.disabled">
            Tap or drag for precision
          </Typography>
        </Box>
      )}

      {/* Community average */}
      {totalRatings ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Community avg: {displayedAvg} ({totalRatings} rating{totalRatings !== 1 ? "s" : ""})
        </Typography>
      ) : null}

      {/* Comment + submit — only once the user has picked a rating */}
      {ratingValue !== null && <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        placeholder="Add a comment… (optional)"
        value={content}
        onChange={(e) => { e.stopPropagation(); setContent(e.target.value); }}
        onClick={(e) => e.stopPropagation()}
        size="small"
        sx={{
          mt: 1.5,
          "& .MuiOutlinedInput-root": {
            borderRadius: 2,
            fontSize: "0.85rem",
          },
        }}
      />}

      {/* Submit */}
      {ratingValue !== null && <Button
        variant="contained"
        fullWidth
        onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
        sx={{
          mt: 1,
          borderRadius: 2,
          fontWeight: 700,
          background: "linear-gradient(135deg, #FFB400 0%, #F7931A 100%)",
          color: "#000",
        }}
      >
        Submit Rating
      </Button>}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default Rate;
