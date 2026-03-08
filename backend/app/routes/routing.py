from datetime import datetime, timedelta
from platform import node
import random

from flask import Blueprint, jsonify, request
from app.extensions import db
from app.services.routing_service import dijkstra, log_route_event
from app.models import Node, RouteEvent, Link, SensorReading
from app.services.network_analytics_service import calculate_node_delivery_rate

routing_bp = Blueprint("routing", __name__, url_prefix="/api/routing")

# simple in-memory cache (OK for demo). Resets when server restarts.
_last_routes = {}

@routing_bp.route("/route/<string:device_id>", methods=["GET"])
def get_route(device_id):
    gateway = Node.query.filter_by(node_type="gateway").first()
    if not gateway:
        return jsonify({"error": "Gateway not found"}), 404

    src = Node.query.filter_by(device_id=device_id).first()
    if not src:
        return jsonify({"error": f"Device not found: {device_id}"}), 404

    new_route, new_cost = dijkstra(src.id, gateway.id)

    old_route = _last_routes.get(device_id)
    if old_route != new_route:
        reason = "Topology change or link/node status changed"
        log_route_event(device_id, old_route, new_route, reason)
        _last_routes[device_id] = new_route

    # --- JSON-safe handling (Infinity is invalid JSON) ---
    no_route = (new_route is None) or (new_cost is None)
    try:
        if isinstance(new_cost, float) and new_cost == float("inf"):
            no_route = True
    except Exception:
        pass

    if no_route:
        return jsonify({
            "device_id": device_id,
            "gateway_id": gateway.id,
            "route": [],
            "total_cost": None,
            "ok": False,
            "reason": "No route found (disconnected topology or down links)"
        }), 200

    return jsonify({
        "device_id": device_id,
        "gateway_id": gateway.id,
        "route": new_route,
        "total_cost": float(new_cost),
        "ok": True
    }), 200
    

@routing_bp.route("/events")
def routing_events():
    events = RouteEvent.query.order_by(RouteEvent.timestamp.desc()).limit(50).all()
    return jsonify([
        {
            "id": e.id,
            "device_id": e.device_id,
            "old_route": e.old_route,
            "new_route": e.new_route,
            "reason": e.reason,
            "timestamp": e.timestamp.isoformat()
        } for e in events
    ])

#Visualization endpoint to get current network topology
@routing_bp.route("/topology", methods=["GET"])
def get_topology():
    nodes = Node.query.all()
    links = Link.query.all()

    node_map = {n.id: n for n in nodes}

    return jsonify({
        "nodes": [
            {
                "id": n.id,
                "name": n.name,
                "type": n.node_type,   # sensor/gateway/server
                "status": n.status     # online/offline
            } for n in nodes
        ],
        "links": [
            {
                "id": l.id,
                "from": l.from_node,
                "to": l.to_node,
                "status": l.status,     # up/down
                "rssi": l.rssi,
                "latency": l.latency
            } for l in links
        ]
    })

@routing_bp.get("/events/timeline")
def routing_events_timeline():
    events = RouteEvent.query.order_by(RouteEvent.timestamp.desc()).limit(100).all()
    return jsonify([
        {
            "id": e.id,
            "device_id": e.device_id,
            "old_route": e.old_route,
            "new_route": e.new_route,
            "reason": e.reason,
            "timestamp": e.timestamp.isoformat()
        } for e in events
    ])  
# Add this new endpoint function BEFORE the last line of the file
@routing_bp.route("/topology/enhanced", methods=["GET"])
def get_enhanced_topology():
    """
    Enhanced topology with network performance metrics.
    Returns nodes with health status, signal quality, and delivery rates.
    """
    nodes = Node.query.all()
    links = Link.query.all()
    
    enhanced_nodes = []
    
    for node in nodes:
       # Calculate delivery rate for this node
        # Gateways typically do not produce SensorReadings, so treat them as infrastructure nodes.
        if node.node_type == "gateway":
            health_data = {
            "delivery_rate": 1.0,
            "status": "excellent",
            "color": "green",
            "readings_received": 0,
            "delivery_rate_percent": "100.0%"}
        else:
            health_data = calculate_node_delivery_rate(node.device_id, hours=24)
        
        # Use node.last_rssi when available.
        # For gateways, derive RSSI from connected links (average).
        rssi_value = node.last_rssi

        if node.node_type == "gateway" and rssi_value is None:
            link_rssis = []
            for l in links:
                if l.rssi is None:
                    continue
                if l.from_node == node.id or l.to_node == node.id:
                    link_rssis.append(l.rssi)

            if link_rssis:
                rssi_value = int(sum(link_rssis) / len(link_rssis))
        
        # Determine health status color
        if "error" in health_data:
            health_status = "unknown"
            health_color = "gray"
        else:
            delivery = health_data.get("delivery_rate", 1)
            if delivery >= 0.95:
                health_status = "excellent"
                health_color = "green"
            elif delivery >= 0.85:
                health_status = "good"
                health_color = "lightgreen"
            elif delivery >= 0.70:
                health_status = "fair"
                health_color = "yellow"
            else:
                health_status = "poor"
                health_color = "red"
        
        # Determine signal quality based on RSSI
        signal_quality = "unknown"
        if rssi_value is not None:
            if rssi_value >= -60:
                signal_quality = "excellent"
            elif rssi_value >= -70:
                signal_quality = "good"
            elif rssi_value >= -80:
                signal_quality = "fair"
            else:
                signal_quality = "poor"
        
        enhanced_nodes.append({
            "id": node.id,
            "device_id": node.device_id,
            "name": node.name,
            "type": node.node_type,
            "status": node.status,
            "health": {
                "status": health_status,
                "color": health_color,
                "delivery_rate": health_data.get("delivery_rate_percent", "N/A") if "error" not in health_data else "N/A",
                "readings_received": health_data.get("actual_readings", 0) if "error" not in health_data else 0
            },
            "signal": {
                "rssi": rssi_value,
                "quality": signal_quality
            },
            "last_seen": node.last_seen.isoformat() if node.last_seen else None,
            "packets_received": node.packets_received or 0
        })
    
    return jsonify({
        "nodes": enhanced_nodes,
        "links": [
            {
                "id": link.id,
                "from": link.from_node,
                "to": link.to_node,
                "status": link.status,
                "rssi": link.rssi,
                "latency": link.latency,
                "strength": "strong" if (link.rssi or -100) >= -70 else "weak"
            }
            for link in links
        ],
        "summary": {
            "total_nodes": len(nodes),
            "online_nodes": len([n for n in nodes if n.status == "online"]),
            "gateways": len([n for n in nodes if n.node_type == "gateway"]),
            "last_updated": datetime.utcnow().isoformat()
        }
    })

@routing_bp.post("/demo/seed")
def seed_demo_topology_and_traffic():
    """
    Enterprise demo utility:
    - Ensures at least 1 gateway exists
    - Auto-creates links between gateway and sensors (bidirectional)
    - Optionally generates synthetic telemetry for last N hours (default 24h)

    Body (optional):
    {
      "gateway_device_id": "GATEWAY_01",
      "gateway_name": "Local Gateway",
      "create_links": true,
      "generate_readings": true,
      "hours": 24
    }
    """
    payload = request.get_json(silent=True) or {}
    gateway_device_id = payload.get("gateway_device_id", "GATEWAY_01")
    gateway_name = payload.get("gateway_name", "Local Gateway")
    create_links = bool(payload.get("create_links", True))
    generate_readings = bool(payload.get("generate_readings", True))
    hours = int(payload.get("hours", 24))

    # 1) Ensure gateway exists
    gateway = Node.query.filter_by(node_type="gateway").first()
    if not gateway:
        gateway = Node(
            name=gateway_name,
            node_type="gateway",
            status="online",
            device_id=gateway_device_id,
            is_registered=True,
            last_seen=datetime.utcnow(),
        )
        db.session.add(gateway)
        db.session.commit()

    # 2) Create links: star topology (gateway <-> each sensor)
    sensors = Node.query.filter_by(node_type="sensor").all()

    created_links = 0
    if create_links and sensors:
        existing = {(l.from_node, l.to_node) for l in Link.query.all()}

        for s in sensors:
            if s.id == gateway.id:
                continue

            # gateway -> sensor
            if (gateway.id, s.id) not in existing:
                db.session.add(Link(
                    from_node=gateway.id,
                    to_node=s.id,
                    status="up",
                    rssi=random.randint(-78, -55),
                    latency=round(random.uniform(3.0, 25.0), 1),
                ))
                created_links += 1
                existing.add((gateway.id, s.id))

            # sensor -> gateway (bidirectional for routing safety)
            if (s.id, gateway.id) not in existing:
                db.session.add(Link(
                    from_node=s.id,
                    to_node=gateway.id,
                    status="up",
                    rssi=random.randint(-78, -55),
                    latency=round(random.uniform(3.0, 25.0), 1),
                ))
                created_links += 1
                existing.add((s.id, gateway.id))

        db.session.commit()

    # 3) Generate synthetic sensor readings (so health != 0% in demos)
    generated = 0
    if generate_readings and sensors:
        now = datetime.utcnow()
        start = now - timedelta(hours=hours)

        # Simple realistic ranges
        # You can expand this later into your crop-specific engine.
        templates = [
            ("temperature", "temperature", "°C", 18.0, 35.0),
            ("humidity", "humidity", "%", 35.0, 90.0),
            ("soil_moisture", "soil_moisture", "%", 10.0, 80.0),
        ]

        for s in sensors:
            # Update node "signal" + counters (enterprise feeling)
            s.last_seen = now
            s.status = "online"
            s.last_rssi = random.randint(-80, -55)

            # 1 reading every 30 minutes per template
            t = start
            while t <= now:
                for sensor_type, parameter, unit, lo, hi in templates:
                    val = round(random.uniform(lo, hi), 2)

                    db.session.add(SensorReading(
                        device_id=s.device_id,
                        node_id=s.id,
                        sensor_type=sensor_type,
                        parameter=parameter,
                        unit=unit,
                        value=val,
                        timestamp=t,
                    ))
                    generated += 1

                # increment packet counters
                s.packets_received = (s.packets_received or 0) + len(templates)
                t += timedelta(minutes=30)

        db.session.commit()

    return jsonify({
        "ok": True,
        "gateway": {
            "id": gateway.id,
            "device_id": gateway.device_id,
            "name": gateway.name
        },
        "sensors_found": len(sensors),
        "links_created": created_links,
        "readings_generated": generated,
        "note": "Reopen /topology to see gateway + links + improved health."
    })