export type AlertStatus = "active" | "acked" | "resolved";
export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertEvent {
  id: number;

  device_id?: string | null;
  node_id?: number | null;

  parameter: string;
  value: number;

  min_value?: number | null;
  max_value?: number | null;

  severity: AlertSeverity;
  status: AlertStatus;

  message?: string | null;

  created_at: string; // ISO
  updated_at?: string | null;

  acked_at?: string | null;
  ack_note?: string | null;

  resolved_at?: string | null;
  resolved_note?: string | null;

  // optional extras if your backend returns them
  rule_id?: number | null;
}

export interface AlertsListResponse {
  count: number;
  data: AlertEvent[];
}

export interface AlertsQuery {
  limit: number;
  offset: number;

  status?: AlertStatus | "all";
  severity?: AlertSeverity | "all";

  device_id?: string | "all";
  parameter?: string | "all";

  since?: string; // ISO
  until?: string; // ISO

  q?: string; // free-text search
}
