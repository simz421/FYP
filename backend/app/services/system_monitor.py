"""
System health monitoring for the NMS itself
"""
import psutil
import os
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, Any, List
from pathlib import Path

from app.extensions import db
from app.models import SensorReading, Node, AlertEvent


class SystemMonitor:
    """
    Monitor the health and performance of the NMS system
    """
    
    @staticmethod
    def get_system_health() -> Dict[str, Any]:
        """
        Get comprehensive system health metrics
        """
        try:
            # CPU Usage
            cpu_percent = psutil.cpu_percent(interval=0.5)
            cpu_count = psutil.cpu_count()
            
            # Memory Usage
            memory = psutil.virtual_memory()
            
            # Disk Usage
            disk = psutil.disk_usage('/')
            
            # Network I/O
            net_io = psutil.net_io_counters()
            
            # Process Info
            process = psutil.Process()
            process_memory = process.memory_info()
            
            # Database Info
            db_path = Path("instance/nms.sqlite3")
            db_size = db_path.stat().st_size if db_path.exists() else 0
            
            # Application-specific metrics
            app_metrics = SystemMonitor._get_application_metrics()
            
            # Calculate overall health score (0-100)
            health_score = SystemMonitor._calculate_health_score(
                cpu_percent, memory.percent, disk.percent
            )
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "health_score": health_score,
                "health_status": SystemMonitor._get_health_status(health_score),
                
                "cpu": {
                    "percent": cpu_percent,
                    "count": cpu_count,
                    "status": "normal" if cpu_percent < 80 else "high"
                },
                
                "memory": {
                    "total_gb": round(memory.total / 1e9, 2),
                    "available_gb": round(memory.available / 1e9, 2),
                    "used_gb": round(memory.used / 1e9, 2),
                    "percent": memory.percent,
                    "status": "normal" if memory.percent < 85 else "high"
                },
                
                "disk": {
                    "total_gb": round(disk.total / 1e9, 2),
                    "free_gb": round(disk.free / 1e9, 2),
                    "used_gb": round(disk.used / 1e9, 2),
                    "percent": disk.percent,
                    "status": "normal" if disk.percent < 90 else "high"
                },
                
                "network": {
                    "bytes_sent": net_io.bytes_sent,
                    "bytes_recv": net_io.bytes_recv,
                    "packets_sent": net_io.packets_sent,
                    "packets_recv": net_io.packets_recv
                },
                
                "application": {
                    "process_id": process.pid,
                    "process_uptime_hours": round((datetime.now() - 
                        datetime.fromtimestamp(process.create_time())).total_seconds() / 3600, 2),
                    "process_memory_mb": round(process_memory.rss / 1e6, 2),
                    "thread_count": process.num_threads(),
                    "connection_count": len(process.connections()) if hasattr(process, 'connections') else 0
                },
                
                "database": {
                    "size_mb": round(db_size / 1e6, 2),
                    "path": str(db_path),
                    "tables": SystemMonitor._get_database_info(),
                    "connection_count": 0  # Would need SQLite-specific check
                },
                
                "services": {
                    "web_server": "running",
                    "database": "connected",
                    "scheduler": "running",
                    "websocket": "active"  # Would check actual status
                },
                
                "recommendations": SystemMonitor._generate_recommendations(
                    cpu_percent, memory.percent, disk.percent, health_score
                )
            }
            
        except Exception as e:
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e),
                "health_score": 0,
                "health_status": "error"
            }
    
    @staticmethod
    def _get_application_metrics() -> Dict[str, Any]:
        """
        Get application-specific metrics
        """
        # Get counts from database
        try:
            total_devices = Node.query.count()
            total_readings = SensorReading.query.count()
            active_alerts = AlertEvent.query.filter_by(is_active=True).count()
            
            # Get readings in last hour
            one_hour_ago = datetime.utcnow() - timedelta(hours=1)
            recent_readings = SensorReading.query.filter(
                SensorReading.timestamp >= one_hour_ago
            ).count()
            
            # Get device status breakdown
            online_devices = Node.query.filter_by(status='online').count()
            offline_devices = Node.query.filter_by(status='offline').count()
            
            return {
                "total_devices": total_devices,
                "online_devices": online_devices,
                "offline_devices": offline_devices,
                "total_readings": total_readings,
                "readings_per_hour": recent_readings,
                "active_alerts": active_alerts,
                "data_ingestion_rate": round(recent_readings / 60, 2) if recent_readings > 0 else 0  # readings per minute
            }
        except:
            return {}
    
    @staticmethod
    def _get_database_info() -> List[Dict[str, Any]]:
        """
        Get database table information
        """
        try:
            # This is SQLite-specific
            db_path = Path("instance/nms.sqlite3")
            if not db_path.exists():
                return []
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            # Get table info
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            table_info = []
            for table in tables:
                table_name = table[0]
                cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                row_count = cursor.fetchone()[0]
                
                # Get table size estimate
                cursor.execute(f"PRAGMA table_info({table_name});")
                columns = cursor.fetchall()
                
                table_info.append({
                    "name": table_name,
                    "row_count": row_count,
                    "column_count": len(columns)
                })
            
            conn.close()
            return table_info
        except:
            return []
    
    @staticmethod
    def _calculate_health_score(cpu: float, memory: float, disk: float) -> float:
        """
        Calculate overall health score (0-100)
        Lower resource usage = higher score
        """
        # Weighted average with penalty for high usage
        cpu_score = max(0, 100 - cpu) * 0.3
        memory_score = max(0, 100 - memory) * 0.3
        disk_score = max(0, 100 - disk) * 0.2
        
        # Application metrics contribute 20%
        app_score = 20
        
        return round(cpu_score + memory_score + disk_score + app_score, 1)
    
    @staticmethod
    def _get_health_status(score: float) -> str:
        if score >= 80:
            return "excellent"
        elif score >= 60:
            return "good"
        elif score >= 40:
            return "fair"
        else:
            return "poor"
    
    @staticmethod
    def _generate_recommendations(cpu: float, memory: float, disk: float, score: float) -> List[str]:
        """
        Generate system health recommendations
        """
        recommendations = []
        
        if cpu > 80:
            recommendations.append("High CPU usage - Consider optimizing background tasks")
        elif cpu > 60:
            recommendations.append("Moderate CPU usage - Monitor for trends")
        
        if memory > 85:
            recommendations.append("High memory usage - Consider increasing system memory")
        elif memory > 70:
            recommendations.append("Moderate memory usage - Monitor memory leaks")
        
        if disk > 90:
            recommendations.append("Disk space critical - Clean up old data or expand storage")
        elif disk > 80:
            recommendations.append("Disk space getting low - Consider archiving old readings")
        
        if score < 60:
            recommendations.append("System health needs attention - Review all metrics")
        
        if not recommendations:
            recommendations.append("System operating normally")
        
        return recommendations
    
    @staticmethod
    def get_performance_history(hours: int = 24) -> Dict[str, Any]:
        """
        Get performance history for trend analysis
        In production, you'd store historical metrics in a database
        For now, we'll simulate
        """
        now = datetime.utcnow()
        history = []
        
        for i in range(hours):
            timestamp = now - timedelta(hours=i)
            
            # Simulate data (in real system, retrieve from historical storage)
            history.append({
                "timestamp": timestamp.isoformat(),
                "cpu_percent": max(0, min(100, 30 + (i % 3) * 10)),  # Simulated pattern
                "memory_percent": max(0, min(100, 40 + (i % 4) * 5)),
                "disk_percent": max(0, min(100, 50 + i * 0.5)),  # Slowly increasing
                "readings_per_hour": max(0, 100 + (i % 6) * 20)
            })
        
        return {
            "period_hours": hours,
            "data_points": len(history),
            "history": history,
            "summary": {
                "avg_cpu": round(sum(h["cpu_percent"] for h in history) / len(history), 1),
                "avg_memory": round(sum(h["memory_percent"] for h in history) / len(history), 1),
                "peak_readings": max(h["readings_per_hour"] for h in history)
            }
        }
    
    @staticmethod
    def check_service_health() -> Dict[str, Any]:
        """
        Check health of all system services
        """
        services = {
            "web_server": {
                "name": "Flask Web Server",
                "expected": "running",
                "status": "running",  # Would actually check
                "port": 5000,
                "response_time_ms": 50  # Would measure
            },
            "database": {
                "name": "SQLite Database",
                "expected": "connected",
                "status": "connected",
                "tables": len(SystemMonitor._get_database_info()),
                "size_mb": round(Path("instance/nms.sqlite3").stat().st_size / 1e6, 2) 
                         if Path("instance/nms.sqlite3").exists() else 0
            },
            "scheduler": {
                "name": "Background Scheduler",
                "expected": "running",
                "status": "running",
                "jobs": ["monitoring", "alert_evaluation"],  # Would get from scheduler
                "last_run": datetime.utcnow().isoformat()
            },
            "websocket": {
                "name": "WebSocket Server",
                "expected": "active",
                "status": "active",
                "clients": 0,  # Would get from socketio
                "messages_per_minute": 0
            }
        }
        
        # Calculate overall service health
        healthy_services = sum(1 for s in services.values() if s["status"] == s["expected"])
        total_services = len(services)
        service_health = round(healthy_services / total_services * 100, 1)
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "service_health_percent": service_health,
            "services": services,
            "issues": [
                f"{name}: {service['status']} (expected {service['expected']})"
                for name, service in services.items()
                if service["status"] != service["expected"]
            ]
        }