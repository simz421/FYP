import os
import logging
from flask import Flask, app
from flask_cors import CORS

from .config import Config
from .extensions import db, cors, migrate, scheduler
from .services.websocket_service import init_websocket

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def register_blueprints(app):
    """Register all blueprints to avoid circular imports"""
    # Import here to avoid circular imports
    from .routes.health import health_bp
    from .routes.sensors import sensors_bp
    from .routes.devices import devices_bp
    from .routes.routing import routing_bp
    from .routes.telemetry_queries import telemetry_query_bp
    from .routes.reports import reports_bp
    from .routes.reports_pdf import reports_pdf_bp
    from .routes.settings_sensors import settings_sensors_bp
    from .routes.settings_thresholds import settings_thresholds_bp
    from .routes.alerts import alerts_bp
    from .routes.recommendations import recommendations_bp
    from .routes.telemetry import bp as telemetry_bp
    from .routes.network import network_bp
    from .routes.network_management import network_mgmt_bp
    from .api_docs import api_bp
    from .routes.websocket import websocket_bp
    from app.routes.mqtt_status import bp as mqtt_status_bp
    from app.routes.predictive import predictive_bp
    from app.routes.system_monitor import system_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(routing_bp)
    app.register_blueprint(telemetry_query_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(reports_pdf_bp)
    app.register_blueprint(settings_sensors_bp)
    app.register_blueprint(settings_thresholds_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(telemetry_bp)
    app.register_blueprint(network_bp)
    app.register_blueprint(network_mgmt_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(websocket_bp)
    app.register_blueprint(mqtt_status_bp)
    app.register_blueprint(predictive_bp)
    app.register_blueprint(system_bp)

def setup_database(app):
    """Setup database with error handling"""
    with app.app_context():
        try:
            # Create tables if they don't exist
            db.create_all()
            logger.info("Database tables created/verified")
        except Exception as e:
            logger.error(f"Database setup failed: {e}")
            raise

def setup_scheduler(app):
    """Setup background scheduler with error handling"""
    try:
        # Import job functions here to avoid circular imports
        from .jobs.alert_jobs import evaluate_latest_readings_job
        from .services.monitoring import check_nodes_online_status
        from app.services.predictive_analytics_service import PredictiveAnalytics

        # -----------------------------
        # Job wrappers (app-context safe)
        # -----------------------------
        def job_check_nodes():
            with app.app_context():
                check_nodes_online_status()

        def job_eval_alerts():
            with app.app_context():
                evaluate_latest_readings_job(app)

        def job_predictive_alerts():
            """
            Periodic predictive alert generation:
            - scans fleet for imminent breaches
            - creates predictive AlertEvent rows (deduped)
            """
            with app.app_context():
                params = ["temperature", "humidity", "soil_moisture"]

                for p in params:
                    try:
                        PredictiveAnalytics.create_predictive_breach_alerts(
                            parameter=p,
                            hours_ahead=24,
                            eta_max_hours=6,
                            limit=200,
                            only_registered=True,
                            create_only_if_threshold_exists=True,
                        )
                    except Exception:
                        # keep scheduler resilient
                        continue
                    PredictiveAnalytics.auto_resolve_predictive_alerts(
                        parameter=p,
                        hours_ahead=24,
                        eta_max_hours=6,
                        limit=500,
                        resolve_if_no_threshold=True,
                        resolve_if_insufficient_data=True,
                    )
        # -----------------------------
        # Register jobs
        # -----------------------------
        scheduler.add_job(
            id="check_nodes_online_status",
            func=job_check_nodes,
            trigger="interval",
            seconds=300,  # every 5 minutes
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        scheduler.add_job(
            id="evaluate_latest_readings_job",
            func=job_eval_alerts,
            trigger="interval",
            seconds=60,  # every 1 minute
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        # ✅ Predictive Alerts (every 15 minutes)
        scheduler.add_job(
            id="predictive_alerts_15m",
            func=job_predictive_alerts,
            trigger="interval",
            minutes=15,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        if not scheduler.running:
            scheduler.start()
            logger.info("Background scheduler started")

        # ✅ Optional: run once at startup (great for demos)
        try:
            job_predictive_alerts()
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Scheduler setup failed: {e}")
        # Don't raise - allow app to run without scheduler for debugging
def create_app():
    """Application factory"""
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    
    # Ensure instance folder exists
    os.makedirs(app.instance_path, exist_ok=True)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    init_websocket(app)
    
    # Register blueprints
    register_blueprints(app)
    
    # Setup database
    setup_database(app)
    
    from app.services.mqtt_service import MQTTService

# ... inside create_app(), near the end ...

    mqtt_service = MQTTService(
        broker_host=app.config.get("MQTT_BROKER_HOST", "127.0.0.1"),
        broker_port=int(app.config.get("MQTT_BROKER_PORT", 1883)),
        topic=app.config.get("MQTT_TELEMETRY_TOPIC", "nms/telemetry/#"),
        username=app.config.get("MQTT_USERNAME"),
        password=app.config.get("MQTT_PASSWORD"),
    )

    mqtt_service.attach_app(app)
    mqtt_service.start()

    # store on app for later access
    app.extensions["mqtt_service"] = mqtt_service

    # Setup scheduler (only in production or when explicitly enabled)
    if app.config.get("ENABLE_SCHEDULER", not app.debug):
        setup_scheduler(app)
    
    # Add error handlers
    @app.errorhandler(404)
    def not_found(error):
        return {"error": "Resource not found"}, 404
    
    @app.errorhandler(500)
    def server_error(error):
        logger.error(f"Server error: {error}")
        return {"error": "Internal server error"}, 500
    
    return app