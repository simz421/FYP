from __future__ import annotations

import subprocess
import socket
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.extensions import db
from app.models import Node, Link


class NetworkDiagnostics:
    """
    Advanced network diagnostics and troubleshooting tools.
    These simulate what a network administrator would do manually.
    """
    
    @staticmethod
    def ping_device(device_id: str, count: int = 3) -> Dict[str, Any]:
        """
        Simulate ICMP ping to a device (in reality, would use actual ping).
        For offline systems, we simulate based on device status.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        # In a real system, you would actually ping the IP
        # For simulation, we'll use device status and RSSI
        
        if node.status != "online":
            return {
                "device_id": device_id,
                "ip_address": node.ip_address,
                "status": "offline",
                "packet_loss": 100,
                "avg_latency": None,
                "timestamp": datetime.utcnow().isoformat(),
                "note": "Device is marked as offline in system"
            }
        
        # Simulate ping results based on RSSI
        rssi = node.last_rssi or -85
        
        if rssi >= -65:
            # Excellent signal
            packet_loss = 0
            avg_latency = 25.5  # ms
            jitter = 2.1
        elif rssi >= -75:
            # Good signal
            packet_loss = 5
            avg_latency = 45.2
            jitter = 5.3
        elif rssi >= -85:
            # Fair signal
            packet_loss = 15
            avg_latency = 78.9
            jitter = 12.7
        else:
            # Poor signal
            packet_loss = 40
            avg_latency = 120.5
            jitter = 25.3
        
        return {
            "device_id": device_id,
            "ip_address": node.ip_address,
            "status": "online",
            "packet_loss": packet_loss,
            "avg_latency": avg_latency,
            "jitter": jitter,
            "rssi": rssi,
            "packets_sent": count,
            "packets_received": count * (1 - packet_loss/100),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def traceroute_to_gateway(device_id: str) -> Dict[str, Any]:
        """
        Simulate traceroute from device to gateway.
        Shows the network path and hop-by-hop performance.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        # Find gateway
        gateway = Node.query.filter_by(node_type="gateway").first()
        if not gateway:
            return {"error": "No gateway found in network"}
        
        # Get links to build path
        links = Link.query.filter(
            (Link.from_node == node.id) | (Link.to_node == node.id)
        ).all()
        
        # Simple path simulation based on links
        hops = []
        
        # First hop: device to first neighbor
        for link in links:
            if link.from_node == node.id or link.to_node == node.id:
                neighbor_id = link.to_node if link.from_node == node.id else link.from_node
                neighbor = Node.query.get(neighbor_id)
                
                hops.append({
                    "hop": 1,
                    "node_id": neighbor.id if neighbor else None,
                    "device_id": neighbor.device_id if neighbor else None,
                    "node_name": neighbor.name if neighbor else "Unknown",
                    "latency": link.latency or 10.0,
                    "rssi": link.rssi,
                    "status": link.status
                })
                break
        
        # Second hop: to gateway (simulated)
        if gateway:
            # Simulate gateway hop
            hops.append({
                "hop": 2,
                "node_id": gateway.id,
                "device_id": gateway.device_id,
                "node_name": gateway.name,
                "latency": 5.0,  # Usually fast to gateway
                "rssi": -65,  # Strong signal at gateway
                "status": gateway.status
            })
        
        total_latency = sum(h.get("latency", 0) for h in hops)
        
        return {
            "source_device": device_id,
            "source_name": node.name,
            "destination_device": gateway.device_id,
            "destination_name": gateway.name,
            "total_hops": len(hops),
            "total_latency": total_latency,
            "path_status": "complete" if len(hops) >= 2 else "partial",
            "hops": hops,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def bandwidth_test_simulation(device_id: str) -> Dict[str, Any]:
        """
        Simulate bandwidth/latency test for a device.
        In a real system, this would run actual network tests.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}
        
        # Simulate results based on RSSI
        rssi = node.last_rssi or -85
        
        if rssi >= -65:
            throughput = 54.0  # Mbps (simulating 802.11g)
            latency = 25
            signal_quality = "Excellent"
        elif rssi >= -75:
            throughput = 36.0
            latency = 45
            signal_quality = "Good"
        elif rssi >= -85:
            throughput = 18.0
            latency = 80
            signal_quality = "Fair"
        else:
            throughput = 6.0
            latency = 120
            signal_quality = "Poor"
        
        return {
            "device_id": device_id,
            "node_name": node.name,
            "throughput_mbps": throughput,
            "latency_ms": latency,
            "signal_strength_dbm": rssi,
            "signal_quality": signal_quality,
            "test_duration_sec": 5,
            "timestamp": datetime.utcnow().isoformat(),
            "recommendation": NetworkDiagnostics._get_bandwidth_recommendation(rssi, throughput)
        }
    
    @staticmethod
    def _get_bandwidth_recommendation(rssi: float, throughput: float) -> str:
        if rssi >= -70 and throughput >= 36:
            return "Network performance is optimal. No action needed."
        elif rssi >= -80 and throughput >= 18:
            return "Performance is acceptable. Consider repositioning device for better signal."
        else:
            return "Performance is suboptimal. Check device placement, antenna orientation, or consider adding a repeater."
    
    @staticmethod
    def network_sweep() -> Dict[str, Any]:
        """
        Perform a network-wide diagnostic sweep.
        Identifies common network issues.
        """
        nodes = Node.query.filter_by(is_registered=True).all()
        
        if not nodes:
            return {"error": "No registered nodes found"}
        
        issues = []
        recommendations = []
        
        # Check each node
        for node in nodes:
            node_issues = []
            
            # 1. Check if offline
            if node.status != "online":
                node_issues.append({
                    "type": "offline",
                    "severity": "critical",
                    "message": f"Node {node.name} ({node.device_id}) is offline"
                })
            
            # 2. Check RSSI
            if node.last_rssi and node.last_rssi < -85:
                node_issues.append({
                    "type": "weak_signal",
                    "severity": "warning",
                    "message": f"Node {node.name} has weak signal (RSSI: {node.last_rssi} dBm)"
                })
            
            # 3. Check heartbeat age
            if node.last_seen:
                age = (datetime.utcnow() - node.last_seen).total_seconds()
                max_age = (node.heartbeat_interval_sec or 30) * 3
                if age > max_age:
                    node_issues.append({
                        "type": "stale_heartbeat",
                        "severity": "warning",
                        "message": f"Node {node.name} hasn't reported in {age:.0f} seconds"
                    })
            
            if node_issues:
                issues.append({
                    "device_id": node.device_id,
                    "node_name": node.name,
                    "issues": node_issues
                })
        
        # Generate recommendations
        if issues:
            offline_count = sum(1 for i in issues for issue in i["issues"] if issue["type"] == "offline")
            weak_signal_count = sum(1 for i in issues for issue in i["issues"] if issue["type"] == "weak_signal")
            
            if offline_count > 0:
                recommendations.append(f"🔴 {offline_count} device(s) are offline. Check power and connectivity.")
            if weak_signal_count > 0:
                recommendations.append(f"🟡 {weak_signal_count} device(s) have weak signal. Consider repositioning or adding repeaters.")
        
        # Overall network health score (0-100)
        total_issues = sum(len(i["issues"]) for i in issues)
        max_issues = len(nodes) * 3  # 3 checks per node
        health_score = 100 - (total_issues / max_issues * 100) if max_issues > 0 else 100
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "nodes_scanned": len(nodes),
            "issues_found": total_issues,
            "health_score": round(health_score, 1),
            "health_status": "healthy" if health_score >= 80 else "degraded" if health_score >= 60 else "unhealthy",
            "detailed_issues": issues,
            "recommendations": recommendations,
            "summary": {
                "offline_devices": offline_count if 'offline_count' in locals() else 0,
                "weak_signal_devices": weak_signal_count if 'weak_signal_count' in locals() else 0,
                "optimal_devices": len([n for n in nodes if n.status == "online" and (not n.last_rssi or n.last_rssi >= -75)])
            }
        }
    
    @staticmethod
    def simulate_link_failure(link_id: int) -> Dict[str, Any]:
        """
        Simulate a link failure for testing redundancy.
        This would be used in a lab/testing environment.
        """
        link = Link.query.get(link_id)
        if not link:
            return {"error": f"Link {link_id} not found"}
        
        original_status = link.status
        
        # Toggle status
        new_status = "down" if link.status == "up" else "up"
        link.status = new_status
        
        # Log the change
        from app.models import RouteEvent
        db.session.add(RouteEvent(
            device_id=f"link_{link_id}",
            old_route=None,
            new_route=None,
            reason=f"SIMULATED_LINK_{new_status.upper()}",
            timestamp=datetime.utcnow()
        ))
        
        db.session.commit()
        
        return {
            "link_id": link_id,
            "from_node": link.from_node,
            "to_node": link.to_node,
            "original_status": original_status,
            "new_status": new_status,
            "action": "simulated",
            "timestamp": datetime.utcnow().isoformat(),
            "note": "This is a simulation for testing network redundancy."
        }


def diagnose_network_bottlenecks() -> Dict[str, Any]:
    """
    Identify potential network bottlenecks.
    Analyzes link utilization and latency patterns.
    """
    # Get all links
    links = Link.query.filter_by(status="up").all()
    
    if not links:
        return {"error": "No active links found"}
    
    bottlenecks = []
    
    for link in links:
        # Simple bottleneck detection based on RSSI and latency
        score = 0
        issues = []
        
        if link.rssi and link.rssi < -80:
            score += 30
            issues.append(f"Weak signal (RSSI: {link.rssi} dBm)")
        
        if link.latency and link.latency > 100:  # ms
            score += 40
            issues.append(f"High latency ({link.latency} ms)")
        
        if score > 30:  # Threshold for bottleneck
            from_node = Node.query.get(link.from_node)
            to_node = Node.query.get(link.to_node)
            
            bottlenecks.append({
                "link_id": link.id,
                "from_device": from_node.device_id if from_node else None,
                "from_name": from_node.name if from_node else None,
                "to_device": to_node.device_id if to_node else None,
                "to_name": to_node.name if to_node else None,
                "severity_score": score,
                "severity": "high" if score > 50 else "medium",
                "issues": issues,
                "rssi": link.rssi,
                "latency": link.latency,
                "recommendation": "Consider repositioning devices or adding a repeater" if link.rssi and link.rssi < -80 else "Investigate latency source"
            })
    
    # Sort by severity
    bottlenecks.sort(key=lambda x: x["severity_score"], reverse=True)
    
    return {
        "analysis_time": datetime.utcnow().isoformat(),
        "links_analyzed": len(links),
        "bottlenecks_found": len(bottlenecks),
        "bottlenecks": bottlenecks,
        "summary": {
            "critical_bottlenecks": len([b for b in bottlenecks if b["severity"] == "high"]),
            "medium_bottlenecks": len([b for b in bottlenecks if b["severity"] == "medium"])
        }
    }