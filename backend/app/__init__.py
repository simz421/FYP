import os
from flask import Flask, app
from flask_cors import CORS
from app.jobs.alert_jobs import evaluate_latest_readings_job

from .config import Config
from .extensions import db, cors, scheduler
from .routes import register_routes
from .routes.health import  health_bp
from .routes.sensors import sensors_bp
from .services.monitoring import check_nodes_online_status
from .routes.devices import devices_bp
from .routes.routing import routing_bp
from .routes.telemetry_queries import telemetry_query_bp
from .routes.reports import reports_bp
from .routes.reports_pdf import reports_pdf_bp
from app.routes.settings_sensors import settings_sensors_bp
from app.routes.settings_thresholds import settings_thresholds_bp
from app.routes.alerts import alerts_bp
from app.routes.recommendations import recommendations_bp
from app.routes.telemetry import bp as telemetry_bp

# helper function to run monitoring job within app context
def _run_monitor_job(app: Flask):
    with app.app_context():
        check_nodes_online_status()


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    app.config.from_object(Config)

    # ensure instance folder exists
    os.makedirs(app.instance_path, exist_ok=True)

    # init extensions
    db.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # register blueprints
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(sensors_bp, url_prefix="/api")
    app.register_blueprint(devices_bp)
    app.register_blueprint(routing_bp, url_prefix="/api")
    app.register_blueprint(telemetry_query_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api")
    app.register_blueprint(reports_pdf_bp, url_prefix="/api")
    app.register_blueprint(settings_sensors_bp)
    app.register_blueprint(settings_thresholds_bp, url_prefix="/api")
    app.register_blueprint(alerts_bp, url_prefix="/api")
    app.register_blueprint(recommendations_bp, url_prefix="/api")
    app.register_blueprint(telemetry_bp)

    

    # create tables
    with app.app_context():
        db.create_all()

    # -------------------------------
    # START DEVICE MONITOR SCHEDULER
    # -------------------------------
    should_start = (not app.debug) or (os.environ.get("WERKZEUG_RUN_MAIN") == "true")
    if should_start and not scheduler.running:
        scheduler.add_job(
        id="evaluate_latest_readings_job",
        func=evaluate_latest_readings_job,
        args=[app],
        trigger="interval",
        seconds=60,
        replace_existing=True,
        )
        scheduler.start()

    return app
