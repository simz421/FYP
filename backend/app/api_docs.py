"""
Swagger/OpenAPI documentation for Smart Farm NMS API
Visit /api/docs/ui for interactive documentation
"""
from flask_restx import Api, Resource, fields, Namespace
from flask import Blueprint, current_app

# Create blueprint
api_bp = Blueprint('api_docs', __name__, url_prefix='/api/docs')
api = Api(
    api_bp,
    version='1.0',
    title='Smart Farm Network Management System API',
    description='''
    ## 📡 Offline-First NMS for Rural Smart Farming
    
    **Key Features:**
    - Offline-first operation (no internet required)
    - Real-time IoT device monitoring
    - Predictive network analytics
    - Automated alerts with actionable recommendations
    - Network topology visualization
    - Configuration management for 50+ devices
    
    **Contact:** Your University/Project Team
    ''',
    doc='/ui',
    default='Smart Farm NMS',
    default_label='API Endpoints',
    security=[{'Bearer Auth': []}],
    authorizations={
        'Bearer Auth': {
            'type': 'apiKey',
            'in': 'header',
            'name': 'Authorization',
            'description': "Enter: 'Bearer <your-token>'"
        }
    }
)

# ============================================
# NAMESPACES (Organized by functionality)
# ============================================

# Core Monitoring
ns_devices = Namespace('devices', description='Device registration & monitoring')
ns_sensors = Namespace('sensors', description='Sensor telemetry data')
ns_alerts = Namespace('alerts', description='Alert management')
ns_reports = Namespace('reports', description='Report generation')

# Network Management
ns_network = Namespace('network', description='Network diagnostics & analytics')
ns_routing = Namespace('routing', description='Network topology & routing')
ns_config = Namespace('configuration', description='Device configuration management')

# System Operations
ns_system = Namespace('system', description='System health & operations')
ns_export = Namespace('data-export', description='Data export utilities')

# Add all namespaces
for ns in [ns_devices, ns_sensors, ns_alerts, ns_reports, 
           ns_network, ns_routing, ns_config, ns_system, ns_export]:
    api.add_namespace(ns)

# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

# Device Models
device_model = ns_devices.model('Device', {
    'device_id': fields.String(required=True, example='ESP32_01', 
                              description='Unique device identifier'),
    'name': fields.String(example='Field Sensor 1', 
                         description='Human-readable name'),
    'node_type': fields.String(enum=['sensor', 'gateway', 'server'], 
                              example='sensor',
                              description='Type of network node'),
    'status': fields.String(enum=['online', 'offline', 'degraded'], 
                           example='online',
                           description='Current device status'),
    'ip_address': fields.String(example='192.168.1.50'),
    'heartbeat_interval_sec': fields.Integer(example=30, 
                                           description='Expected heartbeat interval'),
    'last_rssi': fields.Integer(example=-65, 
                               description='Signal strength in dBm')
})

device_registration_model = ns_devices.model('DeviceRegistration', {
    'device_id': fields.String(required=True, example='ESP32_01'),
    'name': fields.String(example='Soil Moisture Sensor'),
    'node_type': fields.String(example='sensor'),
    'ip_address': fields.String(example='192.168.1.50'),
    'heartbeat_interval_sec': fields.Integer(example=30)
})

# Sensor Data Models
sensor_reading_model = ns_sensors.model('SensorReading', {
    'device_id': fields.String(required=True, example='ESP32_01'),
    'sensor_type': fields.String(required=True, example='temperature',
                                description='Parameter name'),
    'value': fields.Float(required=True, example=25.4),
    'unit': fields.String(example='°C'),
    'timestamp': fields.DateTime(example='2025-02-08T14:30:00Z',
                                description='Optional device timestamp')
})

batch_reading_model = ns_sensors.model('BatchReading', {
    'device_id': fields.String(required=True, example='ESP32_01'),
    'readings': fields.List(fields.Nested(sensor_reading_model))
})

# Alert Models
alert_model = ns_alerts.model('Alert', {
    'id': fields.Integer(example=1),
    'device_id': fields.String(example='ESP32_01'),
    'parameter': fields.String(example='soil_moisture'),
    'value': fields.Float(example=15.2),
    'min_value': fields.Float(example=20.0),
    'max_value': fields.Float(example=80.0),
    'severity': fields.String(enum=['BELOW_MIN', 'ABOVE_MAX'], example='BELOW_MIN'),
    'level': fields.String(enum=['WARNING', 'CRITICAL'], example='WARNING'),
    'message': fields.String(example='[WARNING] soil_moisture below min by 4.8'),
    'is_active': fields.Boolean(example=True),
    'created_at': fields.DateTime(example='2025-02-08T14:30:00Z')
})

# Network Models
ping_result_model = ns_network.model('PingResult', {
    'device_id': fields.String(example='ESP32_01'),
    'status': fields.String(example='online'),
    'packet_loss': fields.Float(example=0.0, description='Percentage'),
    'avg_latency': fields.Float(example=25.5, description='Milliseconds'),
    'jitter': fields.Float(example=2.1)
})

topology_node_model = ns_routing.model('TopologyNode', {
    'id': fields.Integer(example=1),
    'device_id': fields.String(example='ESP32_01'),
    'name': fields.String(example='Field Sensor'),
    'type': fields.String(example='sensor'),
    'status': fields.String(example='online'),
    'health': fields.Raw(example={'status': 'good', 'color': 'green'}),
    'signal': fields.Raw(example={'rssi': -65, 'quality': 'excellent'})
})

# Report Models
report_request_model = ns_reports.model('ReportRequest', {
    'device_id': fields.String(example='ESP32_01'),
    'start': fields.DateTime(required=True, example='2025-02-08T00:00:00Z'),
    'end': fields.DateTime(required=True, example='2025-02-08T23:59:59Z'),
    'bucket': fields.String(enum=['minute', 'hour', 'day'], example='hour'),
    'parameters': fields.List(fields.String, example=['temperature', 'humidity'])
})

# ============================================
# API ENDPOINT DOCUMENTATION
# ============================================

# Example: Device Registration Endpoint Documentation
@ns_devices.route('/register')
class DeviceRegistration(Resource):
    @ns_devices.doc('register_device')
    @ns_devices.expect(device_registration_model)
    @ns_devices.response(201, 'Device registered successfully')
    @ns_devices.response(400, 'Invalid request data')
    @ns_devices.response(409, 'Device already registered')
    def post(self):
        """
        Register a new IoT device with the network
        
        This endpoint registers ESP32/Arduino devices with the NMS.
        Devices must register before sending telemetry data.
        """
        pass

# Example: Telemetry Ingestion Endpoint
@ns_sensors.route('/telemetry/ingest')
class TelemetryIngestion(Resource):
    @ns_sensors.doc('ingest_telemetry')
    @ns_sensors.expect(sensor_reading_model)
    @ns_sensors.response(201, 'Telemetry ingested successfully')
    @ns_sensors.response(400, 'Invalid telemetry data')
    @ns_sensors.response(403, 'Device not registered')
    def post(self):
        """
        Ingest sensor telemetry data
        
        Accepts single readings or batch readings.
        Automatically triggers alert evaluation.
        """
        pass

# Example: Network Health Endpoint
@ns_network.route('/health')
class NetworkHealth(Resource):
    @ns_network.doc('get_network_health')
    @ns_network.response(200, 'Network health data retrieved')
    def get(self):
        """
        Get comprehensive network health overview
        
        Returns:
        - Overall network health score
        - Device connectivity status
        - Data delivery rates
        - Signal strength metrics
        - Problem node identification
        """
        pass

# Example: Report Generation Endpoint
@ns_reports.route('/daily')
class DailyReport(Resource):
    @ns_reports.doc('get_daily_report')
    @ns_reports.response(200, 'Daily report generated')
    @ns_reports.response(400, 'Invalid date parameters')
    def get(self):
        """
        Generate daily farm condition report
        
        Optional filters:
        - device_id: Specific device
        - parameters: Specific sensor types
        - bucket: Aggregation period (hour/day)
        
        Returns JSON and PDF formats.
        """
        pass

# ============================================
# API SUMMARY & STATISTICS
# ============================================

@api.route('/summary')
class APISummary(Resource):
    def get(self):
        """Get API summary and statistics"""
        return {
            'api_version': '1.0',
            'total_endpoints': len(api.endpoints),
            'namespaces': [ns.name for ns in api.namespaces],
            'documentation': {
                'swagger_ui': '/api/docs/ui',
                'openapi_spec': '/api/docs/swagger.json'
            },
            'contact': {
                'project': 'Smart Farm Network Management System',
                'description': 'Final Year Project - University',
                'features': [
                    'Offline-first IoT network management',
                    'Real-time monitoring & alerting',
                    'Predictive analytics',
                    'Network topology visualization',
                    'Configuration management'
                ]
            }
        }