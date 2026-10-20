const FALLBACK = "#2E6DA4";
const DARK = "#0B1020";
const LIGHT = "#F8F9FD";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Admin-chosen role color, or a safe default if missing or malformed. */
export function roleColorOrDefault(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : FALLBACK;
}

/** Text color (dark or light) with the best contrast on the given background. */
export function readableOn(bg: string): string {
  const l = luminance(bg);
  const onDark = (l + 0.05) / (luminance(DARK) + 0.05);
  const onLight = (luminance(LIGHT) + 0.05) / (l + 0.05);
  return onDark >= onLight ? DARK : LIGHT;
}
