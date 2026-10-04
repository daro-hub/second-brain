interface ScatterPoint {
  x: number;
  y: number;
  source: string;
  title: string;
}

const COLORS: Record<string, string> = {
  profile: "#8ab4f8",
  telegram: "#6ee7a0",
  fitness_note: "#f6c177",
};

function colorFor(source: string): string {
  return COLORS[source] ?? "#c792ea";
}

export function ScatterChart({ points, width = 640, height = 360 }: { points: ScatterPoint[]; width?: number; height?: number }) {
  if (points.length === 0) {
    return <p style={{ color: "#9aa0a6" }}>Nessun dato ancora.</p>;
  }

  const padding = 20;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (x: number) =>
    maxX === minX ? width / 2 : padding + ((x - minX) / (maxX - minX)) * (width - 2 * padding);
  const scaleY = (y: number) =>
    maxY === minY ? height / 2 : padding + ((y - minY) / (maxY - minY)) * (height - 2 * padding);

  const sources = [...new Set(points.map((p) => p.source))];

  return (
    <div>
      <svg width={width} height={height} role="img">
        {points.map((p, i) => (
          <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r={5} fill={colorFor(p.source)} opacity={0.85}>
            <title>{p.title}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {sources.map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9aa0a6" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: colorFor(s),
                display: "inline-block",
              }}
            />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
