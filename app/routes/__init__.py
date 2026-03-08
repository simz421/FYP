from .routing import routing_bp
from .health import health_bp
from .sensors import sensors_bp
from .devices import devices_bp 
from .telemetry import bp as telemetry_bp

def register_routes(app):
    app.register_blueprint(routing_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(telemetry_bp)