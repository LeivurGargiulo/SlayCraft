import { useEffect, useState } from 'react';

/**
 * Returns a translateY offset that grows as the page scrolls, scaled by `factor`.
 * Returns 0 (no motion) when the OS-level reduced-motion preference is set.
 */
export function useParallax(factor: number): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setOffset(window.scrollY * factor);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [factor]);

  return offset;
}
