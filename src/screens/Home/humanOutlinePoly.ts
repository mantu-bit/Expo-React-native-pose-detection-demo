// humanOutlinePoly.ts
export const VIEWBOX_W = 80; // from 50 to 130 in cropped viewBox
export const VIEWBOX_H = 206;

// These polygon points are shifted left by -50 (to match viewBox="50 0 80 206")
// and scaled a bit to fit within the visible cropped figure frame.
export const VIEWBOX_POLY = [
  { x: 54.0, y: 2.0 },
  { x: 68.0, y: 6.0 },
  { x: 82.0, y: 18.0 },
  { x: 100.0, y: 34.0 },
  { x: 110.0, y: 52.0 },
  { x: 114.0, y: 72.0 },
  { x: 110.0, y: 92.0 },
  { x: 102.0, y: 104.0 },
  { x: 94.0, y: 124.0 },
  { x: 90.0, y: 150.0 },
  { x: 88.0, y: 176.0 },
  { x: 86.0, y: 194.0 },
  { x: 78.0, y: 204.0 },
  { x: 60.0, y: 206.0 },
  { x: 46.0, y: 206.0 },
  { x: 28.0, y: 204.0 },
  { x: 20.0, y: 194.0 },
  { x: 18.0, y: 176.0 },
  { x: 16.0, y: 150.0 },
  { x: 12.0, y: 124.0 },
  { x: 4.0, y: 104.0 },
  { x: -4.0, y: 92.0 },
  { x: -8.0, y: 72.0 },
  { x: -4.0, y: 52.0 },
  { x: 6.0, y: 34.0 },
  { x: 24.0, y: 18.0 },
  { x: 38.0, y: 6.0 },
];
