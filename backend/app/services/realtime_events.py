# app/services/realtime_events.py
from app.services.websocket_service import socketio

ROOM_NOC = "noc"          # network console room
ROOM_DASHBOARD = "dashboard"

def emit_network_snapshot(payload: dict):
    """Push full network snapshot (metrics + topology)"""
    socketio.emit("network:snapshot", payload, room=ROOM_NOC)

def emit_topology_update(payload: dict):
    """Push topology-only update"""
    socketio.emit("network:topology", payload, room=ROOM_NOC)

def emit_route_event(payload: dict):
    """Push a newly created route event"""
    socketio.emit("network:route_event", payload, room=ROOM_NOC)

def emit_node_status(payload: dict):
    """Push node online/offline/degraded changes"""
    socketio.emit("network:node_status", payload, room=ROOM_NOC)

def emit_alert_event(payload: dict):
    """Optional: push alerts to dashboard room"""
    socketio.emit("alerts:new", payload, room=ROOM_DASHBOARD)