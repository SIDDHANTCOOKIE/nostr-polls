import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, Stack, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useUserContext } from "../../hooks/useUserContext";
import { GameInput } from "../core/types";
import { InputRecorder } from "../core/inputRecorder";
import { TickSync } from "../core/tickSync";
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
import ShareScoreButton from "../../components/Games/ShareScoreButton";
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

const SWIPE_THRESHOLD_PX = 24;
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_DURATION_MS = 250;

export default function TetrisBoard() {
  const { user } = useUserContext();
  const dateIso = todayUtcIso();
  const seed = getDailySeed(GAME_ID, dateIso);

  const engineRef = useRef<TetrisEngine | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  const tickSyncRef = useRef<TickSync<TetrisAction> | null>(null);
  if (!engineRef.current) engineRef.current = new TetrisEngine();
  if (!recorderRef.current) recorderRef.current = new InputRecorder();
  if (!tickSyncRef.current) tickSyncRef.current = new TickSync();

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
    tickSyncRef.current = new TickSync();
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

  // Gravity loop: ticks are driven through TickSync, which advances the
  // engine to exactly floor(elapsed / FIXED_STEP_MS) ticks — the same rule
  // verifyReplay uses — rather than an ad-hoc rAF-delta accumulator, so live
  // play and replay always agree regardless of actual frame rate (see
  // TickSync's doc comment). A version counter gates re-renders so idle
  // frames (most of them, since gravity only moves the piece every ~800ms)
  // don't trigger React work.
  useEffect(() => {
    let raf = 0;
    let lastVersion = -1;

    const loop = () => {
      const engine = engineRef.current!;
      if (!engine.isGameOver()) {
        tickSyncRef.current!.catchUpTo(engine, recorderRef.current!.elapsedNow());
        if (engine.getVersion() !== lastVersion) {
          lastVersion = engine.getVersion();
          syncFromEngine();
        }
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
      const t = log[log.length - 1].t;
      tickSyncRef.current!.catchUpTo(engine, t);
      engine.applyInput(action, t);
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

  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const duration = Date.now() - touchStart.current.t;
    touchStart.current = null;

    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (distance < TAP_MAX_MOVE_PX && duration < TAP_MAX_DURATION_MS) {
      doMove("rotate_cw");
      return;
    }
    if (distance < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "move_right" : "move_left");
    else if (dy > 0) doMove("soft_drop");
  };

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
    <Stack alignItems="center" spacing={2} sx={{ p: 2, height: "100%", overflowY: "auto" }}>
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
          <Stack
            direction="row"
            spacing={2}
            alignItems="flex-start"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            sx={{ touchAction: "none" }}
          >
            <TetrisGrid board={board} flash={flashing} />
            <NextPiece type={nextPiece} />
          </Stack>
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button size="small" variant="outlined" onClick={() => doMove("rotate_ccw")}>
              ⟲
            </Button>
            <Button size="small" variant="contained" onClick={() => doMove("hard_drop")}>
              Drop
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Swipe to move/drop, tap to rotate — or arrow keys, Z, Space on desktop
          </Typography>
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
        {gameOver && <ShareScoreButton gameLabel="Tetris" gameId={GAME_ID} score={score} dateIso={dateIso} />}
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
