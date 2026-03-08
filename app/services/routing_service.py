from datetime import datetime
import heapq
from ..extensions import db
from ..models import Link, RouteEvent
from app.services.websocket_service import socketio, broadcast_noc_refresh

def calculate_cost(link: Link) -> float:
    """
    Examiner-friendly cost metric:
    - Strong RSSI => low penalty
    - Weak RSSI => higher penalty
    + latency contribution
    """
    rssi = link.rssi if link.rssi is not None else -85
    latency = link.latency if link.latency is not None else 1.0

    if rssi > -60:
        rssi_penalty = 1
    elif rssi > -75:
        rssi_penalty = 3
    else:
        rssi_penalty = 6

    return float(rssi_penalty + latency)


def build_graph():
    """
    Build an adjacency list from LINKS that are UP.
    graph[node_id] = [(neighbor_id, cost), ...]
    """
    graph = {}

    links = Link.query.filter_by(status="up").all()
    for link in links:
        cost = calculate_cost(link)

        graph.setdefault(link.from_node, []).append((link.to_node, cost))
        graph.setdefault(link.to_node, []).append((link.from_node, cost))

    return graph


def dijkstra(start: int, end: int):
    """
    Returns: (path_list, total_cost)
    If no route exists: (None, inf)
    """
    graph = build_graph()

    pq = [(0.0, start, [])]
    visited = set()

    while pq:
        cost, node, path = heapq.heappop(pq)

        if node in visited:
            continue

        visited.add(node)
        path = path + [node]

        if node == end:
            return path, cost

        for neighbor, weight in graph.get(node, []):
            if neighbor not in visited:
                heapq.heappush(pq, (cost + weight, neighbor, path))

    return None, None


def log_route_event(device_id: str, old_route, new_route, reason: str):
    """
    Persist route changes/failures to RouteEvent table.
    device_id: string device identifier
    old_route/new_route: list of node IDs or None
    """
    ev = RouteEvent(
        device_id=device_id,
        old_route="->".join(map(str, old_route)) if old_route else None,
        new_route="->".join(map(str, new_route)) if new_route else None,
        reason=reason,
    )
    db.session.add(ev)
    db.session.commit()

    # Emit realtime event to NOC
    socketio.emit("noc_route_event", {
        "id": ev.id,
        "device_id": ev.device_id,
        "old_route": ev.old_route,
        "new_route": ev.new_route,
        "reason": ev.reason,
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else None
    }, room="noc")

    # Trigger snapshot refresh (overview/timeline/topology)
    broadcast_noc_refresh({
        "reason": "route_event",
        "device_id": device_id,
        "timestamp": datetime.utcnow().isoformat()
    })

    return ev