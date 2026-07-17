import { useEffect, useRef, useState } from "react";
import { TetrisEngine } from "./engine";

const FLASH_MS = 220;

/** True for a brief moment right after the engine's cosmetic line-clear
 *  counter increases — drives `TetrisGrid`'s flash overlay. Purely a
 *  rendering signal; doesn't touch game logic or timing. */
export function useLineClearFlash(engine: TetrisEngine | null | undefined): boolean {
  const prevRef = useRef(0);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const total = engine?.getTotalLinesCleared() ?? 0;
    if (total > prevRef.current) {
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), FLASH_MS);
      prevRef.current = total;
      return () => clearTimeout(timer);
    }
    prevRef.current = total;
  });

  return flashing;
}
