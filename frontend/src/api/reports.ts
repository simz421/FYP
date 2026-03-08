// frontend/src/api/reports.ts
import { httpGet } from "./http";

export type ReportType = "daily" | "weekly" | "period";
export type ReportBucket = "minute" | "hour" | "day";

export type ReportScope = {
  device_id?: string | null;
  node_id?: number | null;
  start?: string;
  end?: string;
  bucket?: string;
  parameters?: string[];
};

export type ReportJson = {
  ok: boolean;
  scope?: ReportScope;

  thresholds?: any; // backend returns threshold preview object/list
  summary?: Record<string, any>;
  data_quality?: Record<string, any>;
  series?: Record<string, any>;
  alerts?: any;
  recommendations?: any;

  error?: string;
};

export type ReportQuery = {
  // daily
  day?: string; // YYYY-MM-DD

  // weekly
  week_start?: string; // YYYY-MM-DD

  // period
  start?: string; // ISO string
  end?: string; // ISO string

  // shared filters
  device_id?: string;
  node_id?: number | string;
  bucket?: ReportBucket;
  parameters?: string; // comma list: "temperature,humidity"
};

function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function getDailyReport(q: ReportQuery) {
  return httpGet<ReportJson>(`/api/reports/daily${qs(q as any)}`);
}

export async function getWeeklyReport(q: ReportQuery) {
  return httpGet<ReportJson>(`/api/reports/weekly${qs(q as any)}`);
}

export async function getPeriodReport(q: ReportQuery) {
  return httpGet<ReportJson>(`/api/reports/period${qs(q as any)}`);
}

// PDF download endpoints (we build URL; frontend can open or fetch blob)
export function getDailyReportPdfUrl(q: ReportQuery) {
  return `/api/reports/daily.pdf${qs(q as any)}`;
}
export function getWeeklyReportPdfUrl(q: ReportQuery) {
  return `/api/reports/weekly.pdf${qs(q as any)}`;
}
export function getPeriodReportPdfUrl(q: ReportQuery) {
  return `/api/reports/period.pdf${qs(q as any)}`;
}

export async function downloadPdf(url: string, filename: string) {
  // Works even when API is behind same origin; if proxied, still OK.
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `PDF download failed (${res.status})`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(objectUrl);
}
