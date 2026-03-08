// frontend/src/api/http.ts
const BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:5000";

type Json = unknown;

type HttpOptions = {
  headers?: Record<string, string>;
};

export type ApiResult<T> = {
  ok: boolean;
  data: T;
  count?: number;
  error?: string;
  usedPath?: string;
};

export function okResult<T>(
  data: T,
  extra?: Partial<ApiResult<T>>,
): ApiResult<T> {
  return { ok: true, data, ...(extra || {}) };
}

export function errResult<T>(
  message: string,
  fallback: T,
  extra?: Partial<ApiResult<T>>,
): ApiResult<T> {
  return { ok: false, data: fallback, error: message, ...(extra || {}) };
}
async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Json,
  opts: HttpOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text().catch(() => "");

  // Non-2xx → show useful preview (not JSON.parse errors)
  if (!res.ok) {
    const preview = raw ? raw.slice(0, 600) : res.statusText;
    throw new Error(
      `HTTP ${res.status} ${res.statusText} @ ${path}\n${preview}`,
    );
  }

  // Some endpoints might legitimately return empty body
  if (!raw.trim()) {
    return undefined as unknown as T;
  }

  // If backend didn’t send JSON, fail with a clear message + preview
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Non-JSON response @ ${path} (content-type: ${contentType || "unknown"})\n` +
        raw.slice(0, 600),
    );
  }

  // Parse JSON safely
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON @ ${path}\n` + raw.slice(0, 600));
  }
}

// Named export used by your other api files
export async function httpGet<T>(path: string, opts?: HttpOptions): Promise<T> {
  return request<T>("GET", path, undefined, opts);
}

// Optional helper (some of your files used http.get)
export const http = {
  get: httpGet,
  post: <T>(path: string, body?: Json, opts?: HttpOptions) =>
    request<T>("POST", path, body, opts),
  put: <T>(path: string, body?: Json, opts?: HttpOptions) =>
    request<T>("PUT", path, body, opts),
  patch: <T>(path: string, body?: Json, opts?: HttpOptions) =>
    request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: HttpOptions) =>
    request<T>("DELETE", path, undefined, opts),
};
