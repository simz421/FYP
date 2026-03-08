// frontend/src/api/recommendations.ts
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };

export type RecommendationItem = {
  id?: string | number;
  title?: string;
  label?: string;
  message?: string;
  detail?: string;
  action?: string;
  priority?: "low" | "medium" | "high" | "critical";
  device_id?: string;
  node_id?: number | string;
  parameter?: string;
  evidence?: any;
  source_alert_ids?: Array<number | string>;
  created_at?: string;
};

export type RecommendationsBundle = {
  generated_at?: string;
  count?: number;
  items?: RecommendationItem[];
  recommendations?: RecommendationItem[]; // tolerate alternative key
};

function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  return u.toString();
}

async function getJson<T>(url: string): Promise<ApiOk<T> | ApiErr> {
  const res = await fetch(url);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j)
    return { ok: false, error: j?.error || `HTTP ${res.status}` };
  return j as ApiOk<T>;
}

export function getLatestRecommendations(args?: {
  device_id?: string;
  node_id?: number | string;
  limit?: number;
}) {
  return getJson<RecommendationsBundle>(
    `/api/recommendations/latest?${qs(args || {})}`,
  );
}
