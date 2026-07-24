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
import { RacerAction, RacerEngine } from "./engine";
import Track, { TrackObstacle } from "./Track";
import RacerReplay from "./Replay";
import GameLeaderboardModal from "../../components/Games/GameLeaderboardModal";
import ShareScoreButton from "../../components/Games/ShareScoreButton";

const GAME_ID = "racer";
const racerFactory = () => new RacerEngine();

const DRAG_DEADZONE_PX = 14;

export default function RacerBoard() {
  const { user } = useUserContext();
  const dateIso = todayUtcIso();
  const seed = getDailySeed(GAME_ID, dateIso);

  const engineRef = useRef<RacerEngine | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  const tickSyncRef = useRef<TickSync<RacerAction> | null>(null);
  if (!engineRef.current) engineRef.current = new RacerEngine();
  if (!recorderRef.current) recorderRef.current = new InputRecorder();
  if (!tickSyncRef.current) tickSyncRef.current = new TickSync();

  const [playerX, setPlayerX] = useState(0);
  const [steerDir, setSteerDir] = useState(0);
  const [obstacles, setObstacles] = useState<TrackObstacle[]>([]);
  const [distance, setDistance] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
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
    tickSyncRef.current = new TickSync();
    pausedRef.current = false;
    setPaused(false);
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

  // Simulation loop — same pattern as Tetris's gravity: ticks are driven
  // through TickSync so live play and replay always agree (see TickSync's
  // doc comment). This game changes visibly every frame (continuous motion)
  // so there's no version-gating: every rAF frame re-renders.
  useEffect(() => {
    let raf = 0;

    const loop = () => {
      const engine = engineRef.current!;
      if (!engine.isGameOver()) {
        tickSyncRef.current!.catchUpTo(engine, recorderRef.current!.elapsedNow());
        syncFromEngine();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [syncFromEngine]);

  const sendAction = useCallback((action: RacerAction) => {
    const engine = engineRef.current!;
    if (engine.isGameOver() || pausedRef.current) return;
    recorderRef.current!.record(action);
    const log = recorderRef.current!.getLog();
    const t = log[log.length - 1].t;
    tickSyncRef.current!.catchUpTo(engine, t);
    engine.applyInput(action, t);
  }, []);

  // Pause freezes the recorder clock so motion halts. Because steering is
  // press-and-hold, we release any active steer *before* freezing (so a key
  // released during the pause can't leave the car drifting on resume) and
  // re-apply whatever is still physically held on resume. heldKeysRef keeps
  // tracking physical key state even while paused (see onKeyDown/onKeyUp).
  const togglePause = useCallback(() => {
    if (engineRef.current!.isGameOver()) return;
    const next = !pausedRef.current;
    if (next) {
      if (heldKeysRef.current.has("ArrowLeft")) sendAction("left_up");
      if (heldKeysRef.current.has("ArrowRight")) sendAction("right_up");
      recorderRef.current!.pause();
      pausedRef.current = true;
    } else {
      pausedRef.current = false;
      recorderRef.current!.resume();
      if (heldKeysRef.current.has("ArrowLeft")) sendAction("left_down");
      if (heldKeysRef.current.has("ArrowRight")) sendAction("right_down");
    }
    setPaused(next);
  }, [sendAction]);

  // Keyboard: press-and-hold steers continuously; a ref tracks which keys
  // are currently down so OS key-repeat doesn't spam extra down events.
  const heldKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      if (heldKeysRef.current.has(e.key)) return;
      heldKeysRef.current.add(e.key);
      // Track the physical key even while paused, but don't steer until resume.
      if (pausedRef.current) return;
      sendAction(e.key === "ArrowLeft" ? "left_down" : "right_down");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!heldKeysRef.current.has(e.key)) return;
      heldKeysRef.current.delete(e.key);
      if (pausedRef.current) return;
      sendAction(e.key === "ArrowLeft" ? "left_up" : "right_up");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [sendAction, togglePause]);

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
    <Stack alignItems="center" spacing={2} sx={{ p: 2, height: "100%", overflowY: "auto" }}>
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
          <Button size="small" variant="outlined" onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </Button>
          {paused && (
            <Typography color="warning.main" fontWeight={600}>
              Paused
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Arrow keys to steer (hold) — or drag left/right on the road; P to pause
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
        {gameOver && <ShareScoreButton gameLabel="Overdrive" gameId={GAME_ID} score={score} dateIso={dateIso} />}
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
