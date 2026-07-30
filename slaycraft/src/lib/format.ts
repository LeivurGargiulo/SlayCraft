export function formatCoordinates(coords: { x: number; y: number; z: number }): string {
  return `X: ${coords.x} Y: ${coords.y} Z: ${coords.z}`;
}

export function formatFecha(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
