import { useEffect, useState } from "react";

/**
 * Frames per second, measured by counting requestAnimationFrame callbacks over 500 ms.
 * It measures the MAIN THREAD's health, not a renderer's: if anything (DOM updates, JS,
 * layout) makes frames late, the number drops — which is exactly what we want to compare.
 */
export function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++; // считаем кадры
      // Раз в 500 мс переводим кадры в FPS. Обновляем state редко, чтобы сам счётчик не тормозил страницу.
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

// ---------- Страница ----------
