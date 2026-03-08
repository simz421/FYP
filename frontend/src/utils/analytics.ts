export type Trend = "rising" | "falling" | "stable";

export function mean(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function min(nums: number[]) {
  if (!nums.length) return 0;
  return Math.min(...nums);
}

export function max(nums: number[]) {
  if (!nums.length) return 0;
  return Math.max(...nums);
}

export function stddev(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = mean(nums.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

// Simple linear regression slope for trend:
// x = index (0..n-1), y = value
export function slope(values: number[]) {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

// Decide rising/falling/stable using slope threshold
export function classifyTrend(values: number[], threshold = 0.03): Trend {
  const s = slope(values);
  if (s > threshold) return "rising";
  if (s < -threshold) return "falling";
  return "stable";
}

// Count anomalies based on z-score on bucket averages
export function countAnomalies(values: number[], zThreshold = 2.0) {
  if (values.length < 4) return 0;
  const m = mean(values);
  const sd = stddev(values);
  if (sd === 0) return 0;

  let count = 0;
  for (const v of values) {
    const z = Math.abs((v - m) / sd);
    if (z >= zThreshold) count += 1;
  }
  return count;
}

export function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
