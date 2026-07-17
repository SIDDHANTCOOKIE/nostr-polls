import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, Stack, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useUserContext } from "../../hooks/useUserContext";
import { FIXED_STEP_MS, GameInput } from "../core/types";
import { InputRecorder } from "../core/inputRecorder";
import {
  StoredScore,
  getDailySeed,
  getMyTodayScore,
  parseScoreEvent,
  publishDailyScore,
  todayUtcIso,
} from "../core/scoreEvents";
import { PieceType, TetrisAction, TetrisEngine } from "./engine";
import TetrisGrid from "./Grid";
import TetrisReplay from "./Replay";
import NextPiece from "./NextPiece";
import GameLeaderboardModal from "../../components/Games/GameLeaderboardModal";
import { useLineClearFlash } from "./useLineClearFlash";

const GAME_ID = "tetris";
const tetrisFactory = () => new TetrisEngine();

const KEY_TO_ACTION: Record<string, TetrisAction> = {
  ArrowLeft: "move_left",
  ArrowRight: "move_right",
  ArrowUp: "rotate_cw",
  z: "rotate_ccw",
  ArrowDown: "soft_drop",
  " ": "hard_drop",
};

export default function TetrisBoard() {
  const { user } = useUserContext();
  const dateIso = todayUtcIso();
  const seed = getDailySeed(GAME_ID, dateIso);

  const engineRef = useRef<TetrisEngine | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  if (!engineRef.current) engineRef.current = new TetrisEngine();
  if (!recorderRef.current) recorderRef.current = new InputRecorder();

  const [board, setBoard] = useState<(string | 0)[][]>([]);
  const [nextPiece, setNextPiece] = useState<PieceType | null>(null);
  const [level, setLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [bestToday, setBestToday] = useState<StoredScore | null>(null);
  const [publishedThisRun, setPublishedThisRun] = useState(false);
  const [watchingReplay, setWatchingReplay] = useState(false);
  const [finishedLog, setFinishedLog] = useState<GameInput[] | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const publishingRef = useRef(false);
  const flashing = useLineClearFlash(engineRef.current);

  const syncFromEngine = useCallback(() => {
    const engine = engineRef.current!;
    setBoard(engine.getRenderBoard());
    setNextPiece(engine.getNextPieceType());
    setLevel(engine.getLevel());
    setScore(engine.getScore());
    if (engine.isGameOver()) {
      setGameOver(true);
      setFinishedLog([...recorderRef.current!.getLog()]);
    }
  }, []);

  const resetGame = useCallback(() => {
    engineRef.current!.init(seed);
    recorderRef.current!.reset();
    setGameOver(false);
    setPublishedThisRun(false);
    setWatchingReplay(false);
    setFinishedLog(null);
    syncFromEngine();
  }, [seed, syncFromEngine]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  useEffect(() => {
    if (!user?.pubkey) return;
    let alive = true;
    getMyTodayScore(GAME_ID, dateIso, user.pubkey).then((stored) => {
      if (alive && stored) setBestToday(stored);
    });
    return () => {
      alive = false;
    };
  }, [user?.pubkey, dateIso]);

  // Fixed-timestep gravity loop: real rAF delta is accumulated and stepped in
  // exact FIXED_STEP_MS increments so this reproduces identically under
  // replay (see FIXED_STEP_MS doc comment) regardless of actual frame rate.
  // A version counter gates re-renders so idle frames (most of them, since
  // gravity only moves the piece every ~800ms) don't trigger React work.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastVersion = -1;

    const loop = (now: number) => {
      const engine = engineRef.current!;
      if (!engine.isGameOver()) {
        accumulator += now - last;
        last = now;
        while (accumulator >= FIXED_STEP_MS) {
          engine.tick(FIXED_STEP_MS);
          accumulator -= FIXED_STEP_MS;
        }
        if (engine.getVersion() !== lastVersion) {
          lastVersion = engine.getVersion();
          syncFromEngine();
        }
      } else {
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [syncFromEngine]);

  const doMove = useCallback(
    (action: TetrisAction) => {
      const engine = engineRef.current!;
      if (engine.isGameOver()) return;
      recorderRef.current!.record(action);
      const log = recorderRef.current!.getLog();
      engine.applyInput(action, log[log.length - 1].t);
      syncFromEngine();
    },
    [syncFromEngine]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = KEY_TO_ACTION[e.key];
      if (!action) return;
      e.preventDefault();
      doMove(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doMove]);

  useEffect(() => {
    if (!gameOver || publishedThisRun || publishingRef.current) return;
    if (!user?.pubkey) return;
    if (bestToday !== null && score <= bestToday.score) return;
    publishingRef.current = true;
    publishDailyScore(GAME_ID, dateIso, seed, score, recorderRef.current!.getLog())
      .then((signed) => {
        const stored = parseScoreEvent(signed);
        if (stored) setBestToday(stored);
        setPublishedThisRun(true);
      })
      .catch((err) => console.error("Failed to publish Tetris score", err))
      .finally(() => {
        publishingRef.current = false;
      });
  }, [gameOver, score, bestToday, publishedThisRun, user?.pubkey, dateIso, seed]);

  return (
    <Stack alignItems="center" spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Tetris — {dateIso}</Typography>
        <IconButton size="small" onClick={() => setLeaderboardOpen(true)} aria-label="Leaderboard">
          <EmojiEventsIcon />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={3}>
        <Typography>Score: {score}</Typography>
        <Typography>Level: {level}</Typography>
        {bestToday ? (
          <Typography
            onClick={() => setLeaderboardOpen(true)}
            sx={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
          >
            Today's best: {bestToday.score}
          </Typography>
        ) : (
          <Typography>Today's best: —</Typography>
        )}
      </Stack>

      {watchingReplay && finishedLog ? (
        <TetrisReplay seed={seed} inputLog={finishedLog} />
      ) : (
        <>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TetrisGrid board={board} flash={flashing} />
            <NextPiece type={nextPiece} />
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
            <Button size="small" variant="outlined" onClick={() => doMove("move_left")}>
              ←
            </Button>
            <Button size="small" variant="outlined" onClick={() => doMove("rotate_ccw")}>
              ⟲
            </Button>
            <Button size="small" variant="outlined" onClick={() => doMove("rotate_cw")}>
              ⟳
            </Button>
            <Button size="small" variant="outlined" onClick={() => doMove("move_right")}>
              →
            </Button>
            <Button size="small" variant="outlined" onClick={() => doMove("soft_drop")}>
              ↓
            </Button>
            <Button size="small" variant="contained" onClick={() => doMove("hard_drop")}>
              Drop
            </Button>
          </Stack>
        </>
      )}

      {gameOver && (
        <Typography color="error">
          Game over — final score {score}
          {publishedThisRun ? " (published as today's best)" : ""}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        {gameOver && finishedLog && (
          <Button variant="outlined" onClick={() => setWatchingReplay((w) => !w)}>
            {watchingReplay ? "Back to board" : "Watch replay"}
          </Button>
        )}
        <Button variant="outlined" onClick={resetGame}>
          Restart today's board
        </Button>
      </Stack>

      <GameLeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        label="Tetris"
        gameId={GAME_ID}
        dateIso={dateIso}
        gameFactory={tetrisFactory}
        ReplayView={TetrisReplay}
      />
    </Stack>
  );
}
