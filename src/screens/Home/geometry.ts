// geometry.ts
export type Pt = { x: number; y: number };

// Ray-casting point-in-polygon
export function isPointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const onY = yi > p.y !== yj > p.y;
    if (onY) {
      const xCross = ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

export function mapViewBoxPtsToPixels(
  pts: Pt[],
  vbW: number,
  vbH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): Pt[] {
  const sx = boxW / vbW;
  const sy = boxH / vbH;
  return pts.map((p) => ({ x: boxX + p.x * sx, y: boxY + p.y * sy }));
}
