function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

export function populationStabilityIndex(expected: number[], actual: number[], buckets = 10): number {
  const e = expected.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const a = actual.filter(Number.isFinite);
  if (!e.length || !a.length) return 0;
  if (JSON.stringify(e) === JSON.stringify(a.slice().sort((x, y) => x - y))) return 0;
  const cuts = Array.from({ length: buckets - 1 }, (_, i) => quantile(e, (i + 1) / buckets));
  const countBucket = (xs: number[], b: number) => xs.filter((x) => b === 0 ? x <= cuts[0] : b === buckets - 1 ? x > cuts[cuts.length - 1] : x > cuts[b - 1] && x <= cuts[b]).length;
  let psi = 0;
  for (let b = 0; b < buckets; b++) {
    const ep = Math.max(countBucket(e, b) / e.length, 0.0001);
    const ap = Math.max(countBucket(a, b) / a.length, 0.0001);
    psi += (ap - ep) * Math.log(ap / ep);
  }
  return psi;
}

export function classifyExperimentalPsi(psi: number): 'OK' | 'WARNING' | 'CRITICAL' {
  if (psi >= 0.25) return 'CRITICAL';
  if (psi >= 0.1) return 'WARNING';
  return 'OK';
}
