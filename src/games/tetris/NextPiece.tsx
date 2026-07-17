import React from "react";
import { Box, Typography } from "@mui/material";
import { PIECE_COLORS, PieceType, getPieceShape } from "./engine";

const CELL = 14;

export interface NextPieceProps {
  type: PieceType | null;
}

export default function NextPiece({ type }: NextPieceProps) {
  const cells = type ? getPieceShape(type, 0) : [];
  const occupied = new Set(cells.map(([r, c]) => `${r}:${c}`));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Next
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(4, ${CELL}px)`,
          gap: "1px",
          bgcolor: "#111",
          p: "4px",
          borderRadius: 1,
        }}
      >
        {Array.from({ length: 16 }).map((_, i) => {
          const r = Math.floor(i / 4);
          const c = i % 4;
          const filled = occupied.has(`${r}:${c}`);
          return (
            <Box
              key={i}
              sx={{
                width: CELL,
                height: CELL,
                bgcolor: filled && type ? PIECE_COLORS[type] : "#1e1e1e",
                borderRadius: "1px",
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
