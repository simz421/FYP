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

export function useNocSocket(onEvent: (event: string, payload: any) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setConnected(true);
      // server expects join_room
      s.emit("join_room", { room: "noc" });
    };
    const onDisconnect = () => setConnected(false);

    const wrap = (name: string) => (payload: any) => onEvent(name, payload);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    // If later you broadcast these, they’ll be handled
    s.on("noc_snapshot", wrap("noc_snapshot"));
    s.on("noc_topology", wrap("noc_topology"));
    s.on("noc_route_event", wrap("noc_route_event"));
    s.on("noc_ready", wrap("noc_ready"));
    s.on("noc_refresh", wrap("noc_refresh"));

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("noc_snapshot");
      s.off("noc_topology");
      s.off("noc_route_event");
      s.off("noc_ready");
      s.off("noc_refresh");
    };
  }, [onEvent]);

  return useMemo(() => ({ connected }), [connected]);
}
