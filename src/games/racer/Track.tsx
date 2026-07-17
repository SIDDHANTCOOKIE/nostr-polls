import React, { useMemo } from "react";
import { Box, useTheme } from "@mui/material";

const W = 320;
const H = 420;
const HORIZON_Y = 24;
const PLAYER_Y = H - 76;
const HORIZON_HALF_WIDTH = 16;
const BOTTOM_HALF_WIDTH = W / 2 - 12;
const SHOULDER_WIDTH = 6;
const RAIL_WIDTH = 5;
const CENTER_X = W / 2;
const DASH_COUNT = 7;
const POST_COUNT = 6;

/** Perspective ease — objects spend more visual time near the horizon and
 *  rush the last stretch, the classic pseudo-3D "coming at you" feel. */
function ease(p: number): number {
  return p * p;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * `y` is eased toward PLAYER_Y (the near plane objects are drawn at, which
 * sits above the canvas bottom H to leave room below the car). `halfWidth`
 * and `scale` must instead be derived from the *true* fraction of the way
 * down the actual road polygon (HORIZON_Y..H, where it's really defined) —
 * reusing the same eased fraction for both would claim the road is as wide
 * as it is at y=H even when actually drawing at the narrower y=PLAYER_Y,
 * which is exactly what let cars render past the true road edge before.
 */
function depthMetrics(progress: number) {
  const p = ease(clamp01(progress));
  const y = HORIZON_Y + p * (PLAYER_Y - HORIZON_Y);
  const q = clamp01((y - HORIZON_Y) / (H - HORIZON_Y));
  const halfWidth = HORIZON_HALF_WIDTH + q * (BOTTOM_HALF_WIDTH - HORIZON_HALF_WIDTH);
  const scale = 0.22 + q * 0.78;
  return { y, halfWidth, scale };
}

function roadPolygon(halfWidthAtBottom: number) {
  return `polygon(${CENTER_X - HORIZON_HALF_WIDTH}px ${HORIZON_Y}px, ${
    CENTER_X + HORIZON_HALF_WIDTH
  }px ${HORIZON_Y}px, ${CENTER_X + halfWidthAtBottom}px ${H}px, ${CENTER_X - halfWidthAtBottom}px ${H}px)`;
}

const OBSTACLE_PALETTE_DARK = ["#ff5c6c", "#ffb454", "#5ec8ff", "#c98cff", "#ffe066"];
const OBSTACLE_PALETTE_LIGHT = ["#e5484d", "#e08a1e", "#2f7fc7", "#7a4fc9", "#c9a520"];

export interface TrackObstacle {
  id: number;
  x: number; // -1..1
  progress: number; // 0..1
}

export interface TrackProps {
  playerX: number; // -1..1
  obstacles: TrackObstacle[];
  distance: number;
  crashed?: boolean;
  /** -1 steering left, 1 steering right, 0 straight — purely cosmetic tilt. */
  steerDir?: number;
}

export default function Track({ playerX, obstacles, distance, crashed, steerDir = 0 }: TrackProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const palette = isDark
    ? {
        sky: "linear-gradient(180deg, #060815 0%, #171233 55%, #2c1f42 78%, #472a3f 100%)",
        ground: "#0c0d16",
        road: "linear-gradient(180deg, #1c1e2b 0%, #22242f 60%, #26283a 100%)",
        shoulder: "#3a3d4d",
        railPost: "#7d8cff",
        railPostGlow: "0 0 6px rgba(125,140,255,0.65)",
        railStripe: "#ffe066",
        dash: "#ffe066",
        obstaclePalette: OBSTACLE_PALETTE_DARK,
        obstacleGlass: "#1c1c22",
        obstacleGlow: "0 0 8px rgba(255,255,255,0.25)",
        playerBody: "#39e6a4",
        playerGlass: "#0f2a20",
        playerGlow: "0 0 10px rgba(57,230,164,0.7)",
        wheel: "#05060a",
        crashedBody: "#7d8190",
        crashedGlass: "#41444d",
      }
    : {
        sky: "linear-gradient(180deg, #79c4f2 0%, #bfe7ff 45%)",
        ground: "#4f8f3f",
        road: "linear-gradient(180deg, #6b6f76 0%, #54575e 60%, #494c53 100%)",
        shoulder: "#d8d8da",
        railPost: "#c62828",
        railPostGlow: "none",
        railStripe: "#f2f2f2",
        dash: "#f4e04d",
        obstaclePalette: OBSTACLE_PALETTE_LIGHT,
        obstacleGlass: "#20242a",
        obstacleGlow: "none",
        playerBody: "#2ea043",
        playerGlass: "#0f3d1c",
        playerGlow: "none",
        wheel: "#1a1a1a",
        crashedBody: "#9a9a9a",
        crashedGlass: "#5c5c5c",
      };

  const dashes = useMemo(() => {
    const phase = (distance * 0.06) % 1;
    return Array.from({ length: DASH_COUNT }, (_, i) => (i / DASH_COUNT + phase) % 1);
  }, [distance]);

  // Guardrail posts along both edges, same scrolling technique as the
  // center dashes — deterministic function of distance, not its own RNG.
  const posts = useMemo(() => {
    const phase = (distance * 0.05) % 1;
    return Array.from({ length: POST_COUNT }, (_, i) => (i / POST_COUNT + phase) % 1);
  }, [distance]);

  const player = depthMetrics(1);
  const playerW = 26 * player.scale;
  const playerH = 46 * player.scale;
  const playerEffectiveHalfWidth = Math.max(0, player.halfWidth - playerW / 2);
  const playerScreenX = CENTER_X + playerX * playerEffectiveHalfWidth;
  const playerBody = crashed ? palette.crashedBody : palette.playerBody;
  const playerGlass = crashed ? palette.crashedGlass : palette.playerGlass;
  const playerTilt = crashed ? 0 : steerDir * 10;

  const renderCar = (
    key: React.Key,
    screenX: number,
    bottomY: number,
    w: number,
    h: number,
    body: string,
    glass: string,
    glow: string,
    z: number,
    tiltDeg = 0
  ) => {
    const wheelW = Math.max(1.5, w * 0.16);
    const wheelH = Math.max(3, h * 0.16);
    return (
      <Box
        key={key}
        sx={{
          position: "absolute",
          left: screenX - w / 2,
          top: bottomY - h,
          width: w,
          height: h,
          transform: tiltDeg ? `rotate(${tiltDeg}deg)` : undefined,
          transition: "transform 120ms ease-out",
          zIndex: z,
        }}
      >
        {[0.12, 0.66].map((topFrac, i) => (
          <React.Fragment key={i}>
            <Box
              sx={{
                position: "absolute",
                left: -wheelW * 0.55,
                top: h * topFrac,
                width: wheelW,
                height: wheelH,
                bgcolor: palette.wheel,
                borderRadius: 0.5,
              }}
            />
            <Box
              sx={{
                position: "absolute",
                right: -wheelW * 0.55,
                top: h * topFrac,
                width: wheelW,
                height: wheelH,
                bgcolor: palette.wheel,
                borderRadius: 0.5,
              }}
            />
          </React.Fragment>
        ))}

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            bgcolor: body,
            borderRadius: Math.max(1, w * 0.28),
            boxShadow: glow,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            left: "20%",
            top: "14%",
            width: "60%",
            height: "30%",
            bgcolor: glass,
            borderRadius: Math.max(1, w * 0.14),
            opacity: 0.9,
          }}
        />
      </Box>
    );
  };

  return (
    <Box
      sx={{
        position: "relative",
        width: W,
        height: H,
        overflow: "hidden",
        borderRadius: 2,
        background: palette.sky,
      }}
    >
      <Box sx={{ position: "absolute", left: 0, top: HORIZON_Y, width: W, height: H - HORIZON_Y, bgcolor: palette.ground }} />

      {/* Shoulder strip just outside the drivable road. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          bgcolor: palette.shoulder,
          clipPath: roadPolygon(BOTTOM_HALF_WIDTH + SHOULDER_WIDTH),
        }}
      />

      {/* Road surface */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          background: palette.road,
          clipPath: roadPolygon(BOTTOM_HALF_WIDTH),
        }}
      />

      {/* Guardrail — a striped rail line along both edges plus posts, right
          at the true road boundary, so it's an unambiguous "don't cross
          this" marker rather than just a color change. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          clipPath: `polygon(
            ${CENTER_X - HORIZON_HALF_WIDTH - 1}px ${HORIZON_Y}px, ${CENTER_X + HORIZON_HALF_WIDTH + 1}px ${HORIZON_Y}px,
            ${CENTER_X + BOTTOM_HALF_WIDTH + RAIL_WIDTH}px ${H}px, ${CENTER_X + BOTTOM_HALF_WIDTH}px ${H}px,
            ${CENTER_X + HORIZON_HALF_WIDTH}px ${HORIZON_Y}px, ${CENTER_X - HORIZON_HALF_WIDTH}px ${HORIZON_Y}px,
            ${CENTER_X - BOTTOM_HALF_WIDTH}px ${H}px, ${CENTER_X - BOTTOM_HALF_WIDTH - RAIL_WIDTH}px ${H}px
          )`,
          background: `repeating-linear-gradient(180deg, ${palette.railStripe} 0px, ${palette.railStripe} 10px, ${palette.railPost} 10px, ${palette.railPost} 20px)`,
        }}
      />

      {/* Guardrail posts, scrolling with distance for a sense of speed. */}
      <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {posts.map((p, i) => {
          const { y, halfWidth, scale } = depthMetrics(p);
          const postW = Math.max(2, 5 * scale);
          const postH = Math.max(6, 16 * scale);
          return (
            <React.Fragment key={i}>
              <Box
                sx={{
                  position: "absolute",
                  left: CENTER_X - halfWidth - postW / 2,
                  top: y - postH,
                  width: postW,
                  height: postH,
                  bgcolor: palette.railPost,
                  boxShadow: palette.railPostGlow,
                  borderRadius: 0.5,
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  left: CENTER_X + halfWidth - postW / 2,
                  top: y - postH,
                  width: postW,
                  height: postH,
                  bgcolor: palette.railPost,
                  boxShadow: palette.railPostGlow,
                  borderRadius: 0.5,
                }}
              />
            </React.Fragment>
          );
        })}
      </Box>

      {/* Center-line dashes — clipped to the road polygon so they can never
          render outside it, with a size floor so they stay visible ticks
          instead of degenerating into artifact-prone slivers near the
          horizon. */}
      <Box sx={{ position: "absolute", inset: 0, clipPath: roadPolygon(BOTTOM_HALF_WIDTH), pointerEvents: "none" }}>
        {dashes.map((p, i) => {
          const { y, scale } = depthMetrics(p);
          const w = Math.max(2, 4 * scale);
          const h = Math.max(6, 14 * scale);
          return (
            <Box
              key={i}
              sx={{
                position: "absolute",
                left: CENTER_X - w / 2,
                top: y,
                width: w,
                height: h,
                bgcolor: palette.dash,
                borderRadius: 1,
              }}
            />
          );
        })}
      </Box>

      {/* Obstacles — continuous depth position, no CSS transition needed:
          the simulation already advances them every fixed tick. Color is a
          deterministic function of the obstacle's own id (already fixed by
          the seed), not a fresh RNG draw — same replay guarantees, just more
          visual variety. */}
      {obstacles.map((ob) => {
        const { y, halfWidth, scale } = depthMetrics(ob.progress);
        const w = 30 * scale;
        const effectiveHalfWidth = Math.max(0, halfWidth - w / 2);
        const screenX = CENTER_X + ob.x * effectiveHalfWidth;
        const color = palette.obstaclePalette[ob.id % palette.obstaclePalette.length];
        return renderCar(
          ob.id,
          screenX,
          y,
          w,
          50 * scale,
          color,
          palette.obstacleGlass,
          palette.obstacleGlow,
          Math.round(ob.progress * 100)
        );
      })}

      {/* Player car — tilts slightly toward the steering direction, a purely
          cosmetic touch (the underlying position is still the exact
          simulated playerX). */}
      {renderCar(
        "player",
        playerScreenX,
        PLAYER_Y,
        playerW,
        playerH,
        playerBody,
        playerGlass,
        palette.playerGlow,
        200,
        playerTilt
      )}
    </Box>
  );
}
