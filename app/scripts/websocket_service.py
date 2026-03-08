"""
WebSocket service for real-time updates
"""
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
import json
from datetime import datetime

socketio = SocketIO(cors_allowed_origins="*", logger=True, engineio_logger=True)

# Track connected clients
connected_clients = {}

def init_websocket(app):
    """Initialize WebSocket with Flask app"""
    socketio.init_app(app)
    return socketio

# ============================================
# WebSocket Event Handlers
# ============================================

@socketio.on('connect')
def handle_connect():
    """Client connected"""
    client_id = request.sid
    connected_clients[client_id] = {
        'connected_at': datetime.utcnow(),
        'rooms': []
    }
    
    print(f"📡 Client connected: {client_id}")
    emit('connection_ack', {
        'status': 'connected',
        'client_id': client_id,
        'timestamp': datetime.utcnow().isoformat()
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Client disconnected"""
    client_id = request.sid
    if client_id in connected_clients:
        print(f"📡 Client disconnected: {client_id}")
        del connected_clients[client_id]

@socketio.on('join_room')
def handle_join_room(data):
    """Join a specific room (device, alert, etc.)"""
    client_id = request.sid
    room = data.get('room')
    
    if room:
        join_room(room)
        if client_id in connected_clients:
            connected_clients[client_id]['rooms'].append(room)
        
        print(f"📡 Client {client_id} joined room: {room}")
        emit('room_joined', {
            'room': room,
            'client_id': client_id,
            'timestamp': datetime.utcnow().isoformat()
        }, room=room)

@socketio.on('leave_room')
def handle_leave_room(data):
    """Leave a room"""
    client_id = request.sid
    room = data.get('room')
    
    if room:
        leave_room(room)
        if client_id in connected_clients and room in connected_clients[client_id]['rooms']:
            connected_clients[client_id]['rooms'].remove(room)
        
        emit('room_left', {
            'room': room,
            'client_id': client_id
        })

# ============================================
# Real-time Event Broadcasters
# ============================================

def broadcast_new_reading(reading_data):
    """
    Broadcast new sensor reading to relevant rooms
    """
    device_id = reading_data.get('device_id')
    
    # Broadcast to device-specific room
    socketio.emit('new_reading', reading_data, room=f"device_{device_id}")
    
    # Broadcast to telemetry room
    socketio.emit('new_reading', reading_data, room="telemetry")
    
    # Broadcast to parameter-specific room
    parameter = reading_data.get('parameter')
    if parameter:
        socketio.emit('new_reading', reading_data, room=f"parameter_{parameter}")

def broadcast_new_alert(alert_data):
    """
    Broadcast new alert to relevant rooms
    """
    # Broadcast to alerts room
    socketio.emit('new_alert', alert_data, room="alerts")
    
    # Broadcast to device-specific room
    device_id = alert_data.get('device_id')
    socketio.emit('new_alert', alert_data, room=f"device_{device_id}")
    
    # Broadcast to dashboard room
    socketio.emit('alert_update', alert_data, room="dashboard")

def broadcast_device_status(device_data):
    """
    Broadcast device status change
    """
    device_id = device_data.get('device_id')
    
    socketio.emit('device_status', device_data, room=f"device_{device_id}")
    socketio.emit('device_status', device_data, room="devices")
    socketio.emit('network_update', device_data, room="dashboard")

def broadcast_network_metrics(metrics_data):
    """
    Broadcast network health metrics
    """
    socketio.emit('network_metrics', metrics_data, room="dashboard")
    socketio.emit('network_metrics', metrics_data, room="admin")

# ============================================
# Client Status & Management
# ============================================

@socketio.on('get_client_status')
def handle_client_status():
    """Return status of connected clients"""
    client_id = request.sid
    
    status = {
        'client_id': client_id,
        'connected_at': connected_clients.get(client_id, {}).get('connected_at'),
        'rooms': connected_clients.get(client_id, {}).get('rooms', []),
        'total_clients': len(connected_clients),
        'timestamp': datetime.utcnow().isoformat()
    }
    
    emit('client_status', status)

def get_connection_stats():
    """Get WebSocket connection statistics"""
    return {
        'total_clients': len(connected_clients),
        'clients': [
            {
                'client_id': cid,
                'connected_at': data['connected_at'].isoformat() if data['connected_at'] else None,
                'rooms': data['rooms']
            }
            for cid, data in connected_clients.items()
        ],
        'timestamp': datetime.utcnow().isoformat()
    }