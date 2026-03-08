"""
Data export and import service for Smart Farm NMS
"""
import csv
import json
import io
import zipfile
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from flask import send_file

from app.extensions import db
from app.models import (
    SensorReading, Node, AlertEvent, ThresholdRule, 
    SensorProfile, Link, RouteEvent
)


class DataExporter:
    """
    Export farm data in various formats for sharing or backup
    """
    
    @staticmethod
    def export_readings_csv(
        device_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        parameters: Optional[List[str]] = None
    ) -> io.BytesIO:
        """
        Export sensor readings as CSV
        """
        query = SensorReading.query
        
        if device_id:
            query = query.filter(SensorReading.device_id == device_id)
        if start_date:
            query = query.filter(SensorReading.timestamp >= start_date)
        if end_date:
            query = query.filter(SensorReading.timestamp <= end_date)
        if parameters:
            query = query.filter(SensorReading.sensor_type.in_(parameters))
        
        readings = query.order_by(SensorReading.timestamp.asc()).limit(100000).all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'Timestamp (UTC)', 'Device ID', 'Device Name', 
            'Parameter', 'Value', 'Unit', 'Node ID', 'Created At'
        ])
        
        # Write data
        for r in readings:
            device_name = Node.query.filter_by(device_id=r.device_id).first()
            device_name = device_name.name if device_name else r.device_id
            
            writer.writerow([
                r.timestamp.isoformat() if r.timestamp else '',
                r.device_id,
                device_name,
                r.sensor_type,
                r.value,
                r.unit or '',
                r.node_id or '',
                r.created_at.isoformat() if r.created_at else ''
            ])
        
        output.seek(0)
        return io.BytesIO(output.getvalue().encode('utf-8'))
    
    @staticmethod
    def export_alerts_csv(
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        device_id: Optional[str] = None
    ) -> io.BytesIO:
        """
        Export alerts as CSV
        """
        query = AlertEvent.query
        
        if device_id:
            query = query.filter(AlertEvent.device_id == device_id)
        if start_date:
            query = query.filter(AlertEvent.created_at >= start_date)
        if end_date:
            query = query.filter(AlertEvent.created_at <= end_date)
        
        alerts = query.order_by(AlertEvent.created_at.desc()).limit(10000).all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'Alert ID', 'Created At', 'Device ID', 'Parameter',
            'Value', 'Min Threshold', 'Max Threshold',
            'Severity', 'Level', 'Message',
            'Active', 'Acknowledged', 'Resolved At'
        ])
        
        # Write data
        for a in alerts:
            writer.writerow([
                a.id,
                a.created_at.isoformat() if a.created_at else '',
                a.device_id,
                a.parameter,
                a.value,
                a.min_value or '',
                a.max_value or '',
                a.severity,
                a.level,
                a.message,
                'Yes' if a.is_active else 'No',
                'Yes' if a.is_acked else 'No',
                a.resolved_at.isoformat() if a.resolved_at else ''
            ])
        
        output.seek(0)
        return io.BytesIO(output.getvalue().encode('utf-8'))
    
    @staticmethod
    def export_devices_csv() -> io.BytesIO:
        """
        Export device registry as CSV
        """
        devices = Node.query.order_by(Node.id.asc()).all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'Device ID', 'Name', 'Type', 'Status',
            'IP Address', 'Last Seen', 'Heartbeat Interval',
            'Registered', 'RSSI', 'Packets Received',
            'Created At'
        ])
        
        # Write data
        for d in devices:
            writer.writerow([
                d.device_id,
                d.name,
                d.node_type or '',
                d.status,
                d.ip_address or '',
                d.last_seen.isoformat() if d.last_seen else '',
                d.heartbeat_interval_sec or '',
                'Yes' if d.is_registered else 'No',
                d.last_rssi or '',
                d.packets_received or 0,
                d.last_seen.isoformat() if d.last_seen else ''
            ])
        
        output.seek(0)
        return io.BytesIO(output.getvalue().encode('utf-8'))
    
    @staticmethod
    def export_network_topology_json() -> Dict[str, Any]:
        """
        Export network topology as JSON
        """
        nodes = Node.query.all()
        links = Link.query.all()
        
        topology = {
            'exported_at': datetime.utcnow().isoformat(),
            'format_version': '1.0',
            'network': {
                'nodes': [],
                'links': [],
                'metadata': {
                    'total_nodes': len(nodes),
                    'online_nodes': len([n for n in nodes if n.status == 'online']),
                    'gateway_count': len([n for n in nodes if n.node_type == 'gateway'])
                }
            }
        }
        
        # Export nodes
        for node in nodes:
            topology['network']['nodes'].append({
                'id': node.id,
                'device_id': node.device_id,
                'name': node.name,
                'type': node.node_type,
                'status': node.status,
                'ip_address': node.ip_address,
                'last_rssi': node.last_rssi,
                'last_seen': node.last_seen.isoformat() if node.last_seen else None
            })
        
        # Export links
        for link in links:
            topology['network']['links'].append({
                'id': link.id,
                'from_node': link.from_node,
                'to_node': link.to_node,
                'rssi': link.rssi,
                'latency': link.latency,
                'status': link.status
            })
        
        return topology
    
    @staticmethod
    def export_full_backup() -> io.BytesIO:
        """
        Export complete system backup as ZIP file
        """
        # Create in-memory ZIP file
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Export metadata
            metadata = {
                'export_type': 'full_backup',
                'exported_at': datetime.utcnow().isoformat(),
                'system': 'Smart Farm NMS',
                'version': '1.0',
                'records_exported': {
                    'devices': Node.query.count(),
                    'readings': SensorReading.query.count(),
                    'alerts': AlertEvent.query.count(),
                    'thresholds': ThresholdRule.query.count()
                }
            }
            
            zip_file.writestr(
                'metadata.json',
                json.dumps(metadata, indent=2, default=str)
            )
            
            # 2. Export devices
            devices_data = []
            for device in Node.query.all():
                device_dict = {c.name: getattr(device, c.name) 
                             for c in device.__table__.columns}
                # Convert datetime to string
                for key, value in device_dict.items():
                    if hasattr(value, 'isoformat'):
                        device_dict[key] = value.isoformat()
                devices_data.append(device_dict)
            
            zip_file.writestr(
                'devices.json',
                json.dumps(devices_data, indent=2, default=str)
            )
            
            # 3. Export recent readings (last 30 days)
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            readings = SensorReading.query.filter(
                SensorReading.timestamp >= thirty_days_ago
            ).limit(50000).all()
            
            readings_data = []
            for reading in readings:
                reading_dict = {c.name: getattr(reading, c.name) 
                              for c in reading.__table__.columns}
                for key, value in reading_dict.items():
                    if hasattr(value, 'isoformat'):
                        reading_dict[key] = value.isoformat()
                readings_data.append(reading_dict)
            
            zip_file.writestr(
                'readings.json',
                json.dumps(readings_data, indent=2, default=str)
            )
            
            # 4. Export configuration
            config_data = {
                'threshold_rules': [
                    {c.name: getattr(r, c.name) 
                     for c in r.__table__.columns}
                    for r in ThresholdRule.query.all()
                ],
                'sensor_profiles': [
                    {c.name: getattr(p, c.name) 
                     for c in p.__table__.columns}
                    for p in SensorProfile.query.all()
                ]
            }
            
            zip_file.writestr(
                'configuration.json',
                json.dumps(config_data, indent=2, default=str)
            )
            
            # 5. Export README
            readme = """
            Smart Farm NMS Backup Archive
            =============================
            
            Contents:
            1. metadata.json    - Backup metadata
            2. devices.json     - Device registry
            3. readings.json    - Sensor readings (last 30 days)
            4. configuration.json - System configuration
            
            To restore:
            1. Deploy Smart Farm NMS
            2. Use the import endpoint
            3. Upload this ZIP file
            
            Exported on: {}
            """.format(datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))
            
            zip_file.writestr('README.txt', readme)
        
        zip_buffer.seek(0)
        return zip_buffer


class DataImporter:
    """
    Import data from various formats
    """
    
    @staticmethod
    def import_devices_from_csv(csv_file) -> Dict[str, Any]:
        """
        Import devices from CSV file
        """
        import csv
        
        csv_content = csv_file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        
        imported = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, 2):  # Start at 2 (header is row 1)
            try:
                device_id = row.get('Device ID') or row.get('device_id')
                if not device_id:
                    errors.append(f"Row {row_num}: Missing device_id")
                    continue
                
                # Check if device exists
                existing = Node.query.filter_by(device_id=device_id).first()
                if existing:
                    # Update existing device
                    existing.name = row.get('Name') or row.get('name') or existing.name
                    existing.node_type = row.get('Type') or row.get('type') or existing.node_type
                    existing.status = row.get('Status') or row.get('status') or existing.status
                    existing.ip_address = row.get('IP Address') or row.get('ip_address') or existing.ip_address
                    db.session.add(existing)
                else:
                    # Create new device
                    new_device = Node(
                        device_id=device_id,
                        name=row.get('Name') or row.get('name') or device_id,
                        node_type=row.get('Type') or row.get('type') or 'sensor',
                        status=row.get('Status') or row.get('status') or 'offline',
                        ip_address=row.get('IP Address') or row.get('ip_address'),
                        is_registered=True
                    )
                    db.session.add(new_device)
                
                imported += 1
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        if imported > 0:
            db.session.commit()
        
        return {
            'imported_count': imported,
            'error_count': len(errors),
            'errors': errors,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def validate_backup_file(zip_file) -> Dict[str, Any]:
        """
        Validate backup ZIP file structure
        """
        try:
            with zipfile.ZipFile(io.BytesIO(zip_file.read()), 'r') as zip_ref:
                file_list = zip_ref.namelist()
                
                required_files = ['metadata.json', 'devices.json']
                missing_files = [f for f in required_files if f not in file_list]
                
                if missing_files:
                    return {
                        'valid': False,
                        'errors': [f'Missing required files: {missing_files}'],
                        'files_found': file_list
                    }
                
                # Check metadata
                metadata = json.loads(zip_ref.read('metadata.json').decode('utf-8'))
                
                return {
                    'valid': True,
                    'metadata': metadata,
                    'files_found': file_list,
                    'system': metadata.get('system'),
                    'export_type': metadata.get('export_type'),
                    'exported_at': metadata.get('exported_at')
                }
                
        except zipfile.BadZipFile:
            return {'valid': False, 'errors': ['Invalid ZIP file']}
        except Exception as e:
            return {'valid': False, 'errors': [str(e)]}