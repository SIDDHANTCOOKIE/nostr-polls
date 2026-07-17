import React from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { Tile } from "./engine";

const TILE_COLORS: Record<number, string> = {
  0: "#cdc1b4",
  2: "#eee4da",
  4: "#ede0c8",
  8: "#f2b179",
  16: "#f59563",
  32: "#f67c5f",
  64: "#f65e3b",
  128: "#edcf72",
  256: "#edcc61",
  512: "#edc850",
  1024: "#edc53f",
  2048: "#edc22e",
};

const PAD = 8;
const GAP = 8;
const CELL = 70;
const STEP = CELL + GAP;
const BOARD = PAD * 2 + CELL * 4 + GAP * 3; // 320

// Plays once when a tile first mounts (a brand new spawn) — keyed by tile.id,
// which is stable across slides, so this does NOT replay on every move.
const spawnPop = keyframes`
  0% { scale: 0.4; opacity: 0.3; }
  100% { scale: 1; opacity: 1; }
`;

// Plays when a tile's *value* changes (a merge) — keyed separately by value,
// nested inside the position wrapper so it replays independent of sliding.
const mergePop = keyframes`
  0% { scale: 0.85; }
  50% { scale: 1.12; }
  100% { scale: 1; }
`;

export interface Twenty48GridProps {
  tiles: Tile[];
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export default function Twenty48Grid({ tiles, onTouchStart, onTouchEnd }: Twenty48GridProps) {
  return (
    <Box
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      sx={{
        position: "relative",
        width: BOARD,
        height: BOARD,
        touchAction: "none",
      }}
    >
      {/* Static background — the 16 empty-cell slots tiles slide over. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: `repeat(4, ${CELL}px)`,
          gap: `${GAP}px`,
          p: `${PAD}px`,
          bgcolor: "#bbada0",
          borderRadius: 2,
        }}
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <Box key={i} sx={{ bgcolor: "#cdc1b4", borderRadius: 1 }} />
        ))}
      </Box>

      {/* Tiles overlay — each keyed by stable id, so React keeps the same
          DOM node across a slide and the transform transition animates the
          move instead of jump-cutting. */}
      {tiles.map((tile) => (
        <Box
          key={tile.id}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CELL,
            height: CELL,
            transform: `translate(${PAD + tile.col * STEP}px, ${PAD + tile.row * STEP}px)`,
            transition: "transform 120ms ease-in-out",
            animation: `${spawnPop} 150ms ease-out`,
          }}
        >
          <Box
            key={tile.value}
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1,
              bgcolor: TILE_COLORS[tile.value] ?? "#3c3a32",
              color: tile.value <= 4 ? "#776e65" : "#f9f6f2",
              fontWeight: "bold",
              fontSize: tile.value >= 1024 ? 20 : 24,
              animation: `${mergePop} 120ms ease-out`,
            }}
          >
            {tile.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
