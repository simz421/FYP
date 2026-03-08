import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:5000";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

export function useAlertsSocket(
  onEvent: (event: string, payload: any) => void,
) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Your backend listens for join_room
      s.emit("join_room", { room: "alerts" });
      s.emit("join_room", { room: "dashboard" }); // optional, because backend also emits alert_update to dashboard
    };

    const onDisconnect = () => setConnected(false);
    const wrap = (name: string) => (payload: any) => onEvent(name, payload);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    // From your backend websocket_service.py:
    // - broadcast_new_alert -> 'new_alert' (room "alerts")
    // - broadcast_new_alert -> 'alert_update' (room "dashboard")
    s.on("new_alert", wrap("new_alert"));
    s.on("alert_update", wrap("alert_update"));

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("new_alert");
      s.off("alert_update");
    };
  }, [onEvent]);

  return useMemo(() => ({ connected }), [connected]);
}
