from datetime import datetime, timedelta

from app.extensions import db
from app.models import Node, RouteEvent

OFFLINE_MULTIPLIER = 3  # offline if now - last_seen > heartbeat_interval * multiplier


def _log_device_event(node: Node, event_type: str, text: str):
    # ✅ FIX: RouteEvent.device_id is STRING in your models
    db.session.add(
        RouteEvent(
            device_id=node.device_id,
            old_route=None,
            new_route=None,
            reason=f"{event_type}: {text}",
            # timestamp default is fine
        )
    )


def check_nodes_online_status():
    now = datetime.utcnow()
    nodes = Node.query.filter(Node.is_registered == True).all()  # noqa: E712

    changed = 0
    for n in nodes:
        interval = n.heartbeat_interval_sec or 30
        cutoff = now - timedelta(seconds=interval * OFFLINE_MULTIPLIER)

        should_be_offline = (n.last_seen is None) or (n.last_seen < cutoff)

        if should_be_offline and n.status != "offline":
            n.status = "offline"
            _log_device_event(n, "DEVICE_OFFLINE", f"Device {n.name or n.device_id} went offline")
            changed += 1

        if (not should_be_offline) and n.status == "offline":
            n.status = "online"
            _log_device_event(n, "DEVICE_ONLINE", f"Device {n.name or n.device_id} is back online")
            changed += 1

    if changed:
        db.session.commit()
