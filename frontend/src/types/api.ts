export type DeviceStatus = "online" | "offline" | "unknown";

export type Device = {
  id?: number; // DB internal id (optional)
  device_id: string; // ESP32_01 etc
  node_type?: string; // sensor/gateway/server
  status?: DeviceStatus; // online/offline
  ip_address?: string | null;
  last_seen?: string | null;
  last_rssi?: number | null;
  is_registered?: boolean;
};

export type AlertEvent = {
  id: number;

  device_id?: string | null;
  node_id?: number | null;

  parameter?: string | null;
  value?: number | null;

  severity?: string | null; // ABOVE_MAX / BELOW_MIN etc
  level?: string | null; // CRITICAL / WARNING etc

  message?: string | null;

  min_value?: number | null;
  max_value?: number | null;

  distance?: number | null;
  distance_pct?: number | null;

  is_active?: boolean;
  is_acked?: boolean;

  created_at?: string | null;
  acked_at?: string | null;
  ack_note?: string | null;

  resolved_at?: string | null;
  resolution_note?: string | null;

  reading_id?: number | null;
  resolved_by_reading_id?: number | null;
};
export type SensorReading = {
  id: number;

  device_id?: string | null;
  sensor_type?: string | null;

  value?: number | null;

  created_at?: string | null;
  timestamp?: string | null; // 👈 ADD THIS

  // (keep flexible for future expansion)
};
