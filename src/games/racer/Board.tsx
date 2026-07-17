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
import { RacerAction, RacerEngine } from "./engine";
import Track, { TrackObstacle } from "./Track";
import RacerReplay from "./Replay";
import GameLeaderboardModal from "../../components/Games/GameLeaderboardModal";

const GAME_ID = "racer";
const racerFactory = () => new RacerEngine();

const DRAG_DEADZONE_PX = 14;

export default function RacerBoard() {
  const { user } = useUserContext();
  const dateIso = todayUtcIso();
  const seed = getDailySeed(GAME_ID, dateIso);

  const engineRef = useRef<RacerEngine | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  if (!engineRef.current) engineRef.current = new RacerEngine();
  if (!recorderRef.current) recorderRef.current = new InputRecorder();

  const [playerX, setPlayerX] = useState(0);
  const [steerDir, setSteerDir] = useState(0);
  const [obstacles, setObstacles] = useState<TrackObstacle[]>([]);
  const [distance, setDistance] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [bestToday, setBestToday] = useState<StoredScore | null>(null);
  const [publishedThisRun, setPublishedThisRun] = useState(false);
  const [watchingReplay, setWatchingReplay] = useState(false);
  const [finishedLog, setFinishedLog] = useState<GameInput[] | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const publishingRef = useRef(false);

  const syncFromEngine = useCallback(() => {
    const engine = engineRef.current!;
    setPlayerX(engine.getPlayerX());
    setSteerDir(engine.getSteerDirection());
    setObstacles(engine.getVisibleObstacles());
    setDistance(engine.getDistance());
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

  // Fixed-timestep simulation loop — same pattern as Tetris's gravity, but
  // this game changes visibly every frame (continuous motion) so there's no
  // version-gating: every rAF frame re-renders.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      const engine = engineRef.current!;
      if (!engine.isGameOver()) {
        accumulator += now - last;
        last = now;
        while (accumulator >= FIXED_STEP_MS) {
          engine.tick(FIXED_STEP_MS);
          accumulator -= FIXED_STEP_MS;
        }
        syncFromEngine();
      } else {
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [syncFromEngine]);

  const sendAction = useCallback((action: RacerAction) => {
    const engine = engineRef.current!;
    if (engine.isGameOver()) return;
    recorderRef.current!.record(action);
    const log = recorderRef.current!.getLog();
    engine.applyInput(action, log[log.length - 1].t);
  }, []);

  // Keyboard: press-and-hold steers continuously; a ref tracks which keys
  // are currently down so OS key-repeat doesn't spam extra down events.
  const heldKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      if (heldKeysRef.current.has(e.key)) return;
      heldKeysRef.current.add(e.key);
      sendAction(e.key === "ArrowLeft" ? "left_down" : "right_down");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!heldKeysRef.current.has(e.key)) return;
      heldKeysRef.current.delete(e.key);
      sendAction(e.key === "ArrowLeft" ? "left_up" : "right_up");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [sendAction]);

  // Touch: drag left/right of the starting touch point to steer, like an
  // analogue stick — only fires down/up transitions when the held direction
  // actually changes, not on every touchmove sample.
  const dragRef = useRef<{ startX: number; dir: "left" | "right" | null }>({ startX: 0, dir: null });
  const onTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { startX: e.touches[0].clientX, dir: null };
  };
  const setDragDir = (dir: "left" | "right" | null) => {
    if (dragRef.current.dir === dir) return;
    if (dragRef.current.dir === "left") sendAction("left_up");
    if (dragRef.current.dir === "right") sendAction("right_up");
    if (dir === "left") sendAction("left_down");
    if (dir === "right") sendAction("right_down");
    dragRef.current.dir = dir;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - dragRef.current.startX;
    if (dx < -DRAG_DEADZONE_PX) setDragDir("left");
    else if (dx > DRAG_DEADZONE_PX) setDragDir("right");
    else setDragDir(null);
  };
  const onTouchEnd = () => setDragDir(null);

  // Publish only once a run ends, and only if it beats the stored best for
  // today — publishDailyScore writes to local storage immediately regardless
  // of connectivity (broadcast to relays is async/best-effort on top).
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
      .catch((err) => console.error("Failed to publish Overdrive score", err))
      .finally(() => {
        publishingRef.current = false;
      });
  }, [gameOver, score, bestToday, publishedThisRun, user?.pubkey, dateIso, seed]);

  return (
    <Stack alignItems="center" spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Overdrive — {dateIso}</Typography>
        <IconButton size="small" onClick={() => setLeaderboardOpen(true)} aria-label="Leaderboard">
          <EmojiEventsIcon />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={3}>
        <Typography>Score: {score}</Typography>
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
        <RacerReplay seed={seed} inputLog={finishedLog} />
      ) : (
        <Stack
          alignItems="center"
          spacing={1}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          sx={{ touchAction: "none" }}
        >
          <Track
            playerX={playerX}
            obstacles={obstacles}
            distance={distance}
            crashed={gameOver}
            steerDir={steerDir}
          />
          <Typography variant="caption" color="text.secondary">
            Arrow keys to steer (hold) — or drag left/right on the road
          </Typography>
        </Stack>
      )}

      {gameOver && (
        <Typography color="error">
          Crashed — final score {score}
          {publishedThisRun ? " (published as today's best)" : ""}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        {gameOver && finishedLog && (
          <Button variant="outlined" onClick={() => setWatchingReplay((w) => !w)}>
            {watchingReplay ? "Back to track" : "Watch replay"}
          </Button>
        )}
        <Button variant="outlined" onClick={resetGame}>
          Restart today's run
        </Button>
      </Stack>

      <GameLeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        label="Overdrive"
        gameId={GAME_ID}
        dateIso={dateIso}
        gameFactory={racerFactory}
        ReplayView={RacerReplay}
      />
    </Stack>
  );
}
