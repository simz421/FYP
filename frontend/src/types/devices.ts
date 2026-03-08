export interface DeviceItem {
  id?: number; // if you have numeric IDs
  device_id: string; // your main identifier
  name?: string | null;
  status?: string | null; // online/offline
  ip_address?: string | null;
  last_seen?: string | null;
}
