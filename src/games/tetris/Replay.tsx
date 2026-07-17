import React from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { useReplayPlayback } from "../core/useReplayPlayback";
import { GameInput } from "../core/types";
import { TetrisEngine } from "./engine";
import TetrisGrid from "./Grid";
import NextPiece from "./NextPiece";
import { useLineClearFlash } from "./useLineClearFlash";

const tetrisFactory = () => new TetrisEngine();
const SPEEDS = [1, 2, 4];

export interface TetrisReplayProps {
  seed: string;
  inputLog: GameInput[];
}

export default function TetrisReplay({ seed, inputLog }: TetrisReplayProps) {
  const playback = useReplayPlayback(tetrisFactory, seed, inputLog);
  const board = playback.engine?.getRenderBoard() ?? [];
  const score = playback.engine?.getScore() ?? 0;
  const level = playback.engine?.getLevel() ?? 0;
  const nextPiece = playback.engine?.getNextPieceType() ?? null;
  const progress = playback.durationMs > 0 ? (playback.clockMs / playback.durationMs) * 100 : 0;
  const flashing = useLineClearFlash(playback.engine);

  return (
    <Stack alignItems="center" spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" spacing={2}>
        <Typography variant="body1">Score: {score}</Typography>
        <Typography variant="body1">Level: {level}</Typography>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <TetrisGrid board={board} flash={flashing} />
        <NextPiece type={nextPiece} />
      </Stack>
      <Box sx={{ width: 260 }}>
        <LinearProgress variant="determinate" value={Math.min(100, progress)} />
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">
        {playback.playing ? (
          <Button size="small" variant="outlined" onClick={playback.pause}>
            Pause
          </Button>
        ) : (
          <Button size="small" variant="contained" onClick={playback.play}>
            {playback.done ? "Replay again" : "Play"}
          </Button>
        )}
        <Button size="small" variant="outlined" onClick={playback.restart}>
          Restart
        </Button>
        {SPEEDS.map((s) => (
          <Button
            key={s}
            size="small"
            variant={playback.speed === s ? "contained" : "outlined"}
            onClick={() => playback.setSpeed(s)}
          >
            {s}x
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
