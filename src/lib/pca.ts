function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: number[]): number[] {
  const n = norm(v);
  return n === 0 ? v : v.map((x) => x / n);
}

function matVec(G: number[][], v: number[]): number[] {
  return G.map((row) => dot(row, v));
}

function powerIteration(G: number[][], iterations = 100): { vector: number[]; eigenvalue: number } {
  const n = G.length;
  let v = normalize(Array.from({ length: n }, () => Math.random() - 0.5));
  let eigenvalue = 0;
  for (let i = 0; i < iterations; i++) {
    const Gv = matVec(G, v);
    eigenvalue = norm(Gv);
    if (eigenvalue === 0) break;
    v = normalize(Gv);
  }
  return { vector: v, eigenvalue };
}

/**
 * PCA a 2 componenti via trucco duale (Gram matrix N x N invece di covarianza D x D),
 * conveniente quando il numero di punti N è molto minore delle dimensioni D (qui 1536).
 */
export function pca2d(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  if (n === 0 || d === 0) return [];
  if (n === 1) return [[0, 0]];

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  const centered = vectors.map((v) => v.map((x, j) => x - mean[j]));

  const G: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(dot(centered[i], centered[j]));
    G.push(row);
  }

  const { vector: v1, eigenvalue: lambda1 } = powerIteration(G);
  const G2 = G.map((row, i) => row.map((val, j) => val - lambda1 * v1[i] * v1[j]));
  const { vector: v2, eigenvalue: lambda2 } = powerIteration(G2);

  const scale1 = Math.sqrt(Math.max(lambda1, 0));
  const scale2 = Math.sqrt(Math.max(lambda2, 0));

  return v1.map((_, i) => [v1[i] * scale1, v2[i] * scale2]);
}
