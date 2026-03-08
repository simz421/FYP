#!/usr/bin/env python3
"""
Production entry point for Smart Farm NMS
"""
import os
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app import create_app
from app.services.websocket_service import socketio

app = create_app()

if __name__ == '__main__':
    # For development with WebSocket support
    socketio.run(app, 
                 host='0.0.0.0', 
                 port=5000, 
                 debug=True, 
                 use_reloader=True,
                 log_output=True)