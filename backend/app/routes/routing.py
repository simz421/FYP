from flask import Blueprint, jsonify, request
from app.services.routing_service import dijkstra, log_route_event
from app.models import Node, RouteEvent, Link

routing_bp = Blueprint("routing", __name__, url_prefix="/api/routing")

# simple in-memory cache (OK for demo). Resets when server restarts.
_last_routes = {}

@routing_bp.route("/route/<int:device_id>", methods=["GET"])
def get_route(device_id):
    gateway = Node.query.filter_by(node_type="gateway").first()
    if not gateway:
        return jsonify({"error": "Gateway not found"}), 404

    new_route, new_cost = dijkstra(device_id, gateway.id)

    old_route = _last_routes.get(device_id)
    if old_route != new_route:
        reason = "Topology change or link/node status changed"
        log_route_event(device_id, old_route, new_route, reason)
        _last_routes[device_id] = new_route

    return jsonify({
        "device_id": device_id,
        "gateway_id": gateway.id,
        "route": new_route,
        "total_cost": new_cost
    })

    

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

