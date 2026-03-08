// frontend/src/api/tryPaths.ts
export type PathHit<T> = { usedPath: string; data: T };

export async function tryPaths<T>(
  paths: string[],
  fn: (path: string) => Promise<T>,
): Promise<PathHit<T> | null> {
  let lastErr: unknown = null;

  for (const p of paths) {
    try {
      const data = await fn(p);
      return { usedPath: p, data };
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) {
    // optional: console log to debug which endpoints failed
    // console.warn("tryPaths failed:", lastErr);
  }

  return null;
}
