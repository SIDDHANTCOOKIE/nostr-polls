import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, Stack, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useUserContext } from "../../hooks/useUserContext";
import { InputRecorder } from "../core/inputRecorder";
import {
  StoredScore,
  getDailySeed,
  getMyTodayScore,
  parseScoreEvent,
  publishDailyScore,
  todayUtcIso,
} from "../core/scoreEvents";
import { Tile, Twenty48Action, Twenty48Engine } from "./engine";
import Twenty48Grid from "./Grid";
import Twenty48Replay from "./Replay";
import { GameInput } from "../core/types";
import GameLeaderboardModal from "../../components/Games/GameLeaderboardModal";
import ShareScoreButton from "../../components/Games/ShareScoreButton";

const twenty48Factory = () => new Twenty48Engine();

const GAME_ID = "2048";

const KEY_TO_ACTION: Record<string, Twenty48Action> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const SWIPE_THRESHOLD_PX = 24;

export default function Twenty48Board() {
  const { user } = useUserContext();
  const dateIso = todayUtcIso();
  const seed = getDailySeed(GAME_ID, dateIso);

  const engineRef = useRef<Twenty48Engine | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  if (!engineRef.current) engineRef.current = new Twenty48Engine();
  if (!recorderRef.current) recorderRef.current = new InputRecorder();

  const [tiles, setTiles] = useState<Tile[]>([]);
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

  const resetGame = useCallback(() => {
    engineRef.current!.init(seed);
    recorderRef.current!.reset();
    setTiles(engineRef.current!.getTiles());
    setScore(0);
    pausedRef.current = false;
    setPaused(false);
    setGameOver(false);
    setPublishedThisRun(false);
    setWatchingReplay(false);
    setFinishedLog(null);
  }, [seed]);

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

  const doMove = useCallback((action: Twenty48Action) => {
    const engine = engineRef.current!;
    if (engine.isGameOver() || pausedRef.current) return;
    recorderRef.current!.record(action);
    const log = recorderRef.current!.getLog();
    engine.applyInput(action, log[log.length - 1].t);
    setTiles(engine.getTiles());
    setScore(engine.getScore());
    if (engine.isGameOver()) {
      setGameOver(true);
      setFinishedLog([...log]);
    }
  }, []);

  const togglePause = useCallback(() => {
    if (engineRef.current!.isGameOver()) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    if (next) recorderRef.current!.pause();
    else recorderRef.current!.resume();
    setPaused(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (pausedRef.current) return;
      const action = KEY_TO_ACTION[e.key];
      if (!action) return;
      e.preventDefault();
      doMove(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doMove, togglePause]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  };

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
      .catch((err) => console.error("Failed to publish 2048 score", err))
      .finally(() => {
        publishingRef.current = false;
      });
  }, [gameOver, score, bestToday, publishedThisRun, user?.pubkey, dateIso, seed]);

  return (
    <Stack alignItems="center" spacing={2} sx={{ p: 2, height: "100%", overflowY: "auto" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">2048 — {dateIso}</Typography>
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
        <Twenty48Replay seed={seed} inputLog={finishedLog} />
      ) : (
        <>
          <Twenty48Grid tiles={tiles} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} />
          <Button size="small" variant="outlined" onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </Button>
          {paused && (
            <Typography color="warning.main" fontWeight={600}>
              Paused
            </Typography>
          )}
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
        {gameOver && <ShareScoreButton gameLabel="2048" gameId={GAME_ID} score={score} dateIso={dateIso} />}
      </Stack>

      <GameLeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        label="2048"
        gameId={GAME_ID}
        dateIso={dateIso}
        gameFactory={twenty48Factory}
        ReplayView={Twenty48Replay}
      />
    </Stack>
  );
}
