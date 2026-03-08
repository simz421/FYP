from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum

from app.extensions import db
from app.models import Node


class ConfigType(Enum):
    """Types of configurations that can be managed."""
    NETWORK = "network"
    SENSOR = "sensor"
    POWER = "power"
    SCHEDULE = "schedule"


class DeviceConfiguration:
    """
    Manages device configurations centrally.
    Allows pushing settings to multiple devices at once.
    """
    
    @staticmethod
    def get_device_config(device_id: str) -> Dict[str, Any]:
        """
        Get current configuration for a device.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        # This is a simplified config - in reality, you'd have a DeviceConfig model
        config = {
            "device_id": device_id,
            "node_name": node.name,
            "network": {
                "heartbeat_interval": node.heartbeat_interval_sec or 30,
                "transmission_power": "high" if (node.last_rssi or -100) < -80 else "medium",
                "retry_count": 3,
                "sleep_mode": "normal"
            },
            "sensors": {
                "sampling_rate": 30,  # seconds
                "reporting_interval": 300,  # seconds
                "enabled_sensors": ["temperature", "humidity", "soil_moisture"]
            },
            "power": {
                "battery_saver": False,
                "sleep_duration": 0,
                "wake_on_movement": False
            },
            "last_config_update": node.last_seen.isoformat() if node.last_seen else None,
            "config_version": "1.0"
        }
        
        return config
    
    @staticmethod
    def update_device_config(device_id: str, config_updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update configuration for a device.
        In a real system, this would push config to the actual device.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        changes = []
        
        # Update network settings
        if "heartbeat_interval" in config_updates.get("network", {}):
            new_interval = config_updates["network"]["heartbeat_interval"]
            if 10 <= new_interval <= 300:  # Validate range
                old_interval = node.heartbeat_interval_sec
                node.heartbeat_interval_sec = new_interval
                changes.append(f"Heartbeat interval: {old_interval} → {new_interval} seconds")
        
        # Update node name if provided
        if "node_name" in config_updates:
            new_name = config_updates["node_name"]
            if new_name and len(new_name) <= 50:
                old_name = node.name
                node.name = new_name
                changes.append(f"Device name: {old_name} → {new_name}")
        
        if changes:
            # Log configuration change
            from app.models import RouteEvent
            db.session.add(RouteEvent(
                device_id=device_id,
                old_route=None,
                new_route=None,
                reason=f"CONFIG_UPDATED: {', '.join(changes)}",
                timestamp=datetime.utcnow()
            ))
            db.session.commit()
        
        return {
            "device_id": device_id,
            "status": "updated" if changes else "no_changes",
            "changes": changes,
            "new_config": DeviceConfiguration.get_device_config(device_id),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def apply_bulk_configuration(
        device_ids: List[str], 
        config_template: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply the same configuration to multiple devices.
        """
        results = []
        successful = 0
        failed = 0
        
        for device_id in device_ids:
            try:
                result = DeviceConfiguration.update_device_config(device_id, config_template)
                if result["status"] == "updated":
                    successful += 1
                results.append({
                    "device_id": device_id,
                    "status": result["status"],
                    "changes": result.get("changes", [])
                })
            except Exception as e:
                failed += 1
                results.append({
                    "device_id": device_id,
                    "status": "failed",
                    "error": str(e)
                })
        
        return {
            "operation": "bulk_configuration",
            "total_devices": len(device_ids),
            "successful": successful,
            "failed": failed,
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def create_configuration_profile(
        profile_name: str,
        config: Dict[str, Any],
        description: str = ""
    ) -> Dict[str, Any]:
        """
        Create a reusable configuration profile.
        In a real system, this would be stored in a ConfigurationProfile model.
        """
        # Simplified - in reality, store in database
        profile = {
            "profile_id": f"profile_{datetime.utcnow().timestamp():.0f}",
            "profile_name": profile_name,
            "description": description,
            "config": config,
            "created_at": datetime.utcnow().isoformat(),
            "applicable_to": ["sensor", "gateway"]  # Device types this applies to
        }
        
        return {
            "status": "created",
            "profile": profile,
            "note": "In a full implementation, this would be saved to database."
        }
    
    @staticmethod
    def get_configuration_templates() -> Dict[str, Any]:
        """
        Returns pre-defined configuration templates for different scenarios.
        """
        templates = {
            "power_saver": {
                "name": "Power Saver Mode",
                "description": "Optimize for battery life, reduces transmission frequency",
                "config": {
                    "network": {
                        "heartbeat_interval": 120,
                        "transmission_power": "low",
                        "retry_count": 1,
                        "sleep_mode": "deep"
                    },
                    "sensors": {
                        "sampling_rate": 60,
                        "reporting_interval": 600
                    },
                    "power": {
                        "battery_saver": True,
                        "sleep_duration": 30
                    }
                },
                "applicable_devices": ["battery_powered_sensors"]
            },
            "high_performance": {
                "name": "High Performance Mode",
                "description": "Maximize data collection frequency and reliability",
                "config": {
                    "network": {
                        "heartbeat_interval": 15,
                        "transmission_power": "high",
                        "retry_count": 5,
                        "sleep_mode": "light"
                    },
                    "sensors": {
                        "sampling_rate": 10,
                        "reporting_interval": 60
                    },
                    "power": {
                        "battery_saver": False,
                        "sleep_duration": 0
                    }
                },
                "applicable_devices": ["gateways", "ac_powered_sensors"]
            },
            "balanced": {
                "name": "Balanced Mode",
                "description": "Default balanced settings for most farm sensors",
                "config": {
                    "network": {
                        "heartbeat_interval": 30,
                        "transmission_power": "medium",
                        "retry_count": 3,
                        "sleep_mode": "normal"
                    },
                    "sensors": {
                        "sampling_rate": 30,
                        "reporting_interval": 300
                    },
                    "power": {
                        "battery_saver": False,
                        "sleep_duration": 5
                    }
                },
                "applicable_devices": ["all_sensors"]
            }
        }
        
        return {
            "templates": templates,
            "count": len(templates),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def check_config_compliance(device_id: str) -> Dict[str, Any]:
        """
        Check if a device's configuration complies with network policies.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        compliance_checks = []
        all_passed = True
        
        # Check 1: Heartbeat interval compliance
        if node.heartbeat_interval_sec:
            if node.heartbeat_interval_sec > 120:
                compliance_checks.append({
                    "check": "heartbeat_interval",
                    "status": "fail",
                    "message": f"Heartbeat interval ({node.heartbeat_interval_sec}s) exceeds maximum (120s)",
                    "severity": "medium"
                })
                all_passed = False
            else:
                compliance_checks.append({
                    "check": "heartbeat_interval",
                    "status": "pass",
                    "message": f"Heartbeat interval ({node.heartbeat_interval_sec}s) within limits"
                })
        
        # Check 2: Device registration
        if not node.is_registered:
            compliance_checks.append({
                "check": "registration",
                "status": "fail",
                "message": "Device is not registered",
                "severity": "high"
            })
            all_passed = False
        else:
            compliance_checks.append({
                "check": "registration",
                "status": "pass",
                "message": "Device is properly registered"
            })
        
        # Check 3: Signal strength
        if node.last_rssi and node.last_rssi < -85:
            compliance_checks.append({
                "check": "signal_strength",
                "status": "warning",
                "message": f"Signal strength is weak (RSSI: {node.last_rssi} dBm)",
                "severity": "low"
            })
            # This is a warning, not a failure
        else:
            compliance_checks.append({
                "check": "signal_strength",
                "status": "pass",
                "message": f"Signal strength is adequate (RSSI: {node.last_rssi} dBm)" if node.last_rssi else "Signal strength unknown"
            })
        
        return {
            "device_id": device_id,
            "node_name": node.name,
            "compliance_status": "compliant" if all_passed else "non_compliant",
            "checks_passed": len([c for c in compliance_checks if c["status"] == "pass"]),
            "checks_failed": len([c for c in compliance_checks if c["status"] == "fail"]),
            "checks_warning": len([c for c in compliance_checks if c["status"] == "warning"]),
            "checks": compliance_checks,
            "timestamp": datetime.utcnow().isoformat()
        }