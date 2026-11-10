import { useId } from "react";

// Lightness and chroma curve taken from the ten original home tile swatches.
// Only hue/saturation follow the course; geometry, alpha and blur match home.
const shades = [[0.950832, 0.140692], [0.916730, 0.241696], [0.867868, 0.390948], [0.792934, 0.592167], [0.703196, 0.805033], [0.611973, 0.993185], [0.539703, 1.055290], [0.477944, 1.054075], [0.397504, 0.909341], [0.353372, 0.730703]];
export function CourseAmbient() {
  const id = useId();
  return <svg className="course-ambient" width="900" height="820" viewBox="0 0 900 820" fill="none" aria-hidden="true">
    <defs><radialGradient id={`${id}-glow`}><stop stopColor="oklch(from var(--course-color) 0.62 c h)" stopOpacity={0.3} /><stop offset="1" stopColor="var(--course-color)" stopOpacity={0} /></radialGradient><filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={0.65} /></filter></defs>
    <ellipse cx={780} cy={750} rx={540} ry={490} fill={`url(#${id}-glow)`} />
    <g filter={`url(#${id}-soft)`}>{Array.from({ length: 8 }, (_, row) => Array.from({ length: 10 - Math.max(0, 6 - row) }, (_, offset) => {
      const column = Math.max(0, 6 - row) + offset;
      const level = Math.min(9, Math.max(0, row + column - 6));
      const [lightness, chroma] = shades[level];
      return <rect key={`${row}:${column}`} x={2 + column * 90} y={65 + row * 90} width={88} height={88} rx={9} fill={`oklch(from var(--course-color) ${lightness} calc(c * ${chroma}) h)`} opacity={0.24 + level * 0.075} stroke="white" strokeOpacity={0.52} />;
    }))}</g>
  </svg>;
}
