import React from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { useReplayPlayback } from "../core/useReplayPlayback";
import { GameInput } from "../core/types";
import { RacerEngine } from "./engine";
import Track from "./Track";

const racerFactory = () => new RacerEngine();
const SPEEDS = [1, 2, 4];

export interface RacerReplayProps {
  seed: string;
  inputLog: GameInput[];
}

export default function RacerReplay({ seed, inputLog }: RacerReplayProps) {
  const playback = useReplayPlayback(racerFactory, seed, inputLog);
  const engine = playback.engine;
  const score = engine?.getScore() ?? 0;
  const progress = playback.durationMs > 0 ? (playback.clockMs / playback.durationMs) * 100 : 0;

  return (
    <Stack alignItems="center" spacing={2} sx={{ p: 2 }}>
      <Typography variant="body1">Score: {score}</Typography>
      <Track
        playerX={engine?.getPlayerX() ?? 0}
        obstacles={engine?.getVisibleObstacles() ?? []}
        distance={engine?.getDistance() ?? 0}
        crashed={engine?.isGameOver()}
        steerDir={engine?.getSteerDirection() ?? 0}
      />
      <Box sx={{ width: 320 }}>
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
