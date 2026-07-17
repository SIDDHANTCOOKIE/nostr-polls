import React from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { PIECE_COLORS, PieceType, TETRIS_WIDTH } from "./engine";

// Fires whenever a cell's color changes — a piece moving/rotating/falling
// into a new cell, or locking into the board.
const pop = keyframes`
  0% { transform: scale(0.6); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
`;

const flashKeyframes = keyframes`
  0%, 100% { background-color: transparent; }
  40% { background-color: rgba(255, 255, 255, 0.85); }
`;

export interface TetrisGridProps {
  board: (string | 0)[][];
  cellSize?: number;
  /** Set true briefly right after a line clear to flash the board. */
  flash?: boolean;
}

export default function TetrisGrid({ board, cellSize = 24, flash = false }: TetrisGridProps) {
  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${TETRIS_WIDTH}, ${cellSize}px)`,
        gap: "1px",
        bgcolor: "#111",
        p: "4px",
        borderRadius: 1,
      }}
    >
      {board.flat().map((value, i) => (
        <Box
          // Keying by index+value replays the pop animation whenever a
          // cell's color changes (piece moves/rotates/falls/locks).
          key={`${i}:${value}`}
          sx={{
            width: cellSize,
            height: cellSize,
            bgcolor: value ? PIECE_COLORS[value as PieceType] : "#1e1e1e",
            borderRadius: "2px",
            animation: value ? `${pop} 100ms ease-out` : "none",
          }}
        />
      ))}
      {flash && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: 1,
            pointerEvents: "none",
            animation: `${flashKeyframes} 220ms ease-out`,
          }}
        />
      )}
    </Box>
  );
}
