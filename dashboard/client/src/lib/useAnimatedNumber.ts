import { useEffect, useRef, useState } from 'react';

/**
 * Animates from the previous value to `target` over `duration` ms.
 * Renders `target` immediately (no animation) under reduced-motion.
 */
export function useAnimatedNumber(target: number, duration = 500): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      previous.current = target;
      return;
    }

    const from = previous.current;
    const delta = target - from;
    if (delta === 0) return;

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(from + delta * progress);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = target;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
