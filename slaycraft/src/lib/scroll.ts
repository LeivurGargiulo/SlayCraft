export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function parallaxOffset(scrollY: number, speed: number, maxOffset: number): number {
  return clamp(scrollY * speed, -maxOffset, maxOffset);
}
