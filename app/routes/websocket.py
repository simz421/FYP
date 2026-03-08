"""
WebSocket endpoints for real-time updates
"""
import datetime
from flask import Blueprint, jsonify
from app.services.websocket_service import get_connection_stats

websocket_bp = Blueprint("websocket", __name__, url_prefix="/api/websocket")

@websocket_bp.get("/stats")
def websocket_stats():
    """
    GET /api/websocket/stats
    Get WebSocket connection statistics
    """
    try:
        stats = get_connection_stats()
        return jsonify({"ok": True, "data": stats}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@websocket_bp.get("/test-broadcast")
def test_broadcast():
    """
    GET /api/websocket/test-broadcast
    Test WebSocket broadcasting (admin only)
    """
    from app.services.websocket_service import socketio
    
    # Test broadcast
    test_data = {
        'test': True,
        'message': 'WebSocket test broadcast',
        'timestamp': datetime.utcnow().isoformat()
    }
    
    socketio.emit('test_message', test_data, room="dashboard")
    
    return jsonify({
        "ok": True,
        "message": "Test broadcast sent",
        "data": test_data
    }), 200