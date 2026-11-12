/** Keep each branch's hue, with a quiet surface and a readable tonal accent. */
export function artifactColors(hex: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  const lightness = (high + low) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const sector = !delta ? 0 : high === r ? ((g - b) / delta + 6) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const hue = Math.round(sector * 60);
  return {
    background: `hsl(${hue}, ${Math.round(saturation * 35)}%, 96%)`,
    foreground: `hsl(${hue}, ${Math.round(saturation * 60)}%, 30%)`,
    border: `hsl(${hue}, ${Math.round(saturation * 30)}%, 82%)`,
  };
}
