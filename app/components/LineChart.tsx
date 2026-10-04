interface Point {
  x: number;
  y: number;
  label: string;
}

export function LineChart({ points, width = 640, height = 220 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length === 0) {
    return <p style={{ color: "#9aa0a6" }}>Nessun dato.</p>;
  }

  const padding = 30;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) * 0.95;
  const maxY = Math.max(...ys) * 1.05;

  const scaleX = (x: number) =>
    maxX === minX ? padding : padding + ((x - minX) / (maxX - minX)) * (width - 2 * padding);
  const scaleY = (y: number) =>
    maxY === minY ? height - padding : height - padding - ((y - minY) / (maxY - minY)) * (height - 2 * padding);

  const path = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

  return (
    <svg width={width} height={height} role="img">
      <polyline points={path} fill="none" stroke="#8ab4f8" strokeWidth={2} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={scaleX(p.x)} cy={scaleY(p.y)} r={3} fill="#8ab4f8" />
        </g>
      ))}
      <text x={padding} y={height - 6} fontSize={11} fill="#9aa0a6">
        {points[0]?.label}
      </text>
      <text x={width - padding} y={height - 6} fontSize={11} fill="#9aa0a6" textAnchor="end">
        {points[points.length - 1]?.label}
      </text>
    </svg>
  );
}
