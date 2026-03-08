"""
Audit logging service for tracking all system actions
"""
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import json
from flask import request

from app.extensions import db
from app.models import AuditLog


class AuditLogger:
    """
    Centralized audit logging service
    """
    
    @staticmethod
    def log_action(
        action_type: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        actor_type: str = 'system',
        actor_id: Optional[str] = None,
        status: str = 'success',
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None
    ) -> AuditLog:
        """
        Log an action to the audit trail
        """
        # Get request context if available
        ip_address = None
        user_agent = None
        request_method = None
        request_path = None
        
        if hasattr(request, 'remote_addr'):
            ip_address = request.remote_addr
        if hasattr(request, 'user_agent'):
            user_agent = str(request.user_agent)
        if hasattr(request, 'method'):
            request_method = request.method
        if hasattr(request, 'path'):
            request_path = request.path
        
        # Create audit log entry
        audit_log = AuditLog(
            action_type=action_type,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_type=actor_type,
            actor_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            request_method=request_method,
            request_path=request_path,
            details=json.dumps(details, default=str) if details else None,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
            created_at=datetime.utcnow()
        )
        
        db.session.add(audit_log)
        db.session.commit()
        
        return audit_log
    
    @staticmethod
    def log_device_registration(device_id: str, is_new: bool, details: Dict[str, Any]) -> AuditLog:
        """Log device registration"""
        return AuditLogger.log_action(
            action_type='CREATE' if is_new else 'UPDATE',
            action=f'Device {"registered" if is_new else "re-registered"}',
            resource_type='device',
            resource_id=device_id,
            details=details,
            actor_type='device',
            actor_id=device_id
        )
    
    @staticmethod
    def log_telemetry_ingestion(device_id: str, count: int, details: Dict[str, Any]) -> AuditLog:
        """Log telemetry ingestion"""
        return AuditLogger.log_action(
            action_type='CREATE',
            action=f'Telemetry ingested ({count} readings)',
            resource_type='telemetry',
            resource_id=device_id,
            details=details,
            actor_type='device',
            actor_id=device_id
        )
    
    @staticmethod
    def log_alert_creation(alert_id: int, device_id: str, details: Dict[str, Any]) -> AuditLog:
        """Log alert creation"""
        return AuditLogger.log_action(
            action_type='CREATE',
            action='Alert created',
            resource_type='alert',
            resource_id=str(alert_id),
            details=details,
            actor_type='system',
            actor_id='alerting_service'
        )
    
    @staticmethod
    def log_configuration_change(
        user: str,
        resource_type: str,
        resource_id: str,
        changes: Dict[str, Any]
    ) -> AuditLog:
        """Log configuration changes"""
        return AuditLogger.log_action(
            action_type='UPDATE',
            action=f'{resource_type.capitalize()} configuration updated',
            resource_type=resource_type,
            resource_id=resource_id,
            details={'changes': changes},
            actor_type='user',
            actor_id=user
        )
    
    @staticmethod
    def log_system_event(event_type: str, details: Dict[str, Any]) -> AuditLog:
        """Log system-level events"""
        return AuditLogger.log_action(
            action_type='SYSTEM',
            action=f'System event: {event_type}',
            resource_type='system',
            details=details,
            actor_type='system',
            actor_id='system_monitor'
        )
    
    @staticmethod
    def get_audit_logs(
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        resource_type: Optional[str] = None,
        action_type: Optional[str] = None,
        actor_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Retrieve audit logs with filtering"""
        query = AuditLog.query
        
        if start_date:
            query = query.filter(AuditLog.created_at >= start_date)
        if end_date:
            query = query.filter(AuditLog.created_at <= end_date)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if action_type:
            query = query.filter(AuditLog.action_type == action_type)
        if actor_id:
            query = query.filter(AuditLog.actor_id == actor_id)
        
        logs = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
        return [log.to_dict() for log in logs]
    
    @staticmethod
    def get_audit_summary(days: int = 7) -> Dict[str, Any]:
        """Get audit log summary"""
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get logs in period
        logs = AuditLog.query.filter(
            AuditLog.created_at >= start_date,
            AuditLog.created_at <= end_date
        ).all()
        
        # Calculate statistics
        total_actions = len(logs)
        
        # Group by action type
        action_counts = {}
        resource_counts = {}
        actor_counts = {}
        
        for log in logs:
            action_counts[log.action_type] = action_counts.get(log.action_type, 0) + 1
            resource_counts[log.resource_type] = resource_counts.get(log.resource_type, 0) + 1
            if log.actor_id:
                actor_counts[log.actor_id] = actor_counts.get(log.actor_id, 0) + 1
        
        # Get success rate
        success_count = sum(1 for log in logs if log.status == 'success')
        success_rate = (success_count / total_actions * 100) if total_actions > 0 else 0
        
        # Get recent activities
        recent_activities = [
            {
                'action': log.action,
                'resource': f"{log.resource_type}:{log.resource_id or 'N/A'}",
                'actor': f"{log.actor_type}:{log.actor_id or 'system'}",
                'timestamp': log.created_at.isoformat() if log.created_at else None,
                'status': log.status
            }
            for log in logs[:10]
        ]
        
        return {
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
                'days': days
            },
            'summary': {
                'total_actions': total_actions,
                'success_rate': round(success_rate, 1),
                'unique_actors': len(actor_counts),
                'unique_resources': len(resource_counts)
            },
            'breakdown': {
                'by_action_type': [
                    {'action': action, 'count': count}
                    for action, count in sorted(action_counts.items(), key=lambda x: x[1], reverse=True)
                ],
                'by_resource_type': [
                    {'resource': resource, 'count': count}
                    for resource, count in sorted(resource_counts.items(), key=lambda x: x[1], reverse=True)
                ],
                'top_actors': [
                    {'actor': actor, 'count': count}
                    for actor, count in sorted(actor_counts.items(), key=lambda x: x[1], reverse=True)[:10]
                ]
            },
            'recent_activities': recent_activities
        }