"""
Data export and import endpoints
"""
from flask import Blueprint, jsonify, request, send_file
from datetime import datetime
import io

from app.services.data_export_service import DataExporter, DataImporter

export_bp = Blueprint("export", __name__, url_prefix="/api/export")

# =========================
# EXPORT ENDPOINTS
# =========================

@export_bp.get("/readings.csv")
def export_readings_csv():
    """
    GET /api/export/readings.csv
    Export sensor readings as CSV
    
    Query parameters:
    - device_id: Filter by device
    - start: Start date (ISO format)
    - end: End date (ISO format)
    - parameters: Comma-separated list
    """
    try:
        device_id = request.args.get("device_id")
        start_str = request.args.get("start")
        end_str = request.args.get("end")
        parameters_str = request.args.get("parameters")
        
        # Parse dates
        start_date = None
        end_date = None
        parameters = None
        
        if start_str:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        if end_str:
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
        if parameters_str:
            parameters = [p.strip() for p in parameters_str.split(',')]
        
        # Generate CSV
        csv_data = DataExporter.export_readings_csv(
            device_id=device_id,
            start_date=start_date,
            end_date=end_date,
            parameters=parameters
        )
        
        filename = f"sensor_readings_{datetime.utcnow().date().isoformat()}.csv"
        
        return send_file(
            csv_data,
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@export_bp.get("/alerts.csv")
def export_alerts_csv():
    """
    GET /api/export/alerts.csv
    Export alerts as CSV
    """
    try:
        device_id = request.args.get("device_id")
        start_str = request.args.get("start")
        end_str = request.args.get("end")
        
        start_date = None
        end_date = None
        
        if start_str:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        if end_str:
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
        
        csv_data = DataExporter.export_alerts_csv(
            device_id=device_id,
            start_date=start_date,
            end_date=end_date
        )
        
        filename = f"alerts_{datetime.utcnow().date().isoformat()}.csv"
        
        return send_file(
            csv_data,
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@export_bp.get("/devices.csv")
def export_devices_csv():
    """
    GET /api/export/devices.csv
    Export device registry as CSV
    """
    try:
        csv_data = DataExporter.export_devices_csv()
        
        filename = f"devices_{datetime.utcnow().date().isoformat()}.csv"
        
        return send_file(
            csv_data,
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@export_bp.get("/topology.json")
def export_topology_json():
    """
    GET /api/export/topology.json
    Export network topology as JSON
    """
    try:
        topology = DataExporter.export_network_topology_json()
        return jsonify({"ok": True, "data": topology}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@export_bp.get("/backup.zip")
def export_backup_zip():
    
    """
    GET /api/export/backup.zip
    Export complete system backup as ZIP
    """
    try:
        zip_data = DataExporter.export_full_backup()
        
        filename = f"nms_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
        
        return send_file(
            zip_data,
            mimetype="application/zip",
            as_attachment=True,
            download_name=filename,
            conditional=True
        )
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# IMPORT ENDPOINTS
# =========================

@export_bp.post("/import/devices/csv")
def import_devices_csv():
    """
    POST /api/import/devices/csv
    Import devices from CSV file
    
    Form data:
    - file: CSV file with device data
    """
    try:
        if 'file' not in request.files:
            return jsonify({"ok": False, "error": "No file provided"}), 400
        
        file = request.files['file']
        filename = file.filename
        
        # Explicit check for None or empty string
        if filename is None or filename == '':
            return jsonify({"ok": False, "error": "No file selected"}), 400
        
        # Now the type checker knows filename is a string
        if not filename.lower().endswith('.csv'):
            return jsonify({"ok": False, "error": "File must be CSV"}), 400
        
        result = DataImporter.import_devices_from_csv(file)
        
        return jsonify({
            "ok": True,
            "message": f"Imported {result['imported_count']} devices",
            "data": result
        }), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@export_bp.post("/import/validate-backup")
def validate_backup_file():
    """
    POST /api/import/validate-backup
    Validate backup ZIP file before import
    """
    try:
        if 'file' not in request.files:
            return jsonify({"ok": False, "error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename is None or file.filename == '':
            return jsonify({"ok": False, "error": "No file selected"}), 400
        
        result = DataImporter.validate_backup_file(file)
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# EXPORT MANAGEMENT
# =========================

@export_bp.get("/available-formats")
def get_available_formats():
    """
    GET /api/export/available-formats
    List available export formats
    """
    formats = [
        {
            "name": "Sensor Readings CSV",
            "endpoint": "/api/export/readings.csv",
            "description": "Export sensor readings in CSV format",
            "parameters": ["device_id", "start", "end", "parameters"],
            "mime_type": "text/csv"
        },
        {
            "name": "Alerts CSV",
            "endpoint": "/api/export/alerts.csv",
            "description": "Export alert history in CSV format",
            "parameters": ["device_id", "start", "end"],
            "mime_type": "text/csv"
        },
        {
            "name": "Devices CSV",
            "endpoint": "/api/export/devices.csv",
            "description": "Export device registry in CSV format",
            "parameters": [],
            "mime_type": "text/csv"
        },
        {
            "name": "Network Topology JSON",
            "endpoint": "/api/export/topology.json",
            "description": "Export network topology in JSON format",
            "parameters": [],
            "mime_type": "application/json"
        },
        {
            "name": "Full Backup ZIP",
            "endpoint": "/api/export/backup.zip",
            "description": "Complete system backup (ZIP archive)",
            "parameters": [],
            "mime_type": "application/zip"
        }
    ]
    
    return jsonify({"ok": True, "formats": formats}), 200