"""Public chat room — Loot Hunters' Lodge.

A node-hosted public message board. Anyone visiting this node via
Nomad Browser can read and post messages. Messages are stored on
the node operator's machine.
"""
import os
import json
import time
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory, current_app

chatroom_bp = Blueprint("chatroom", __name__)

# In-memory + file-backed message store
_messages = []
_messages_path = None
_max_messages = 500


def init_chatroom(data_dir):
    """Load existing messages from disk."""
    global _messages, _messages_path
    _messages_path = os.path.join(data_dir, "chatroom.json")
    if os.path.exists(_messages_path):
        try:
            with open(_messages_path, "r", encoding="utf-8") as f:
                _messages = json.load(f)
        except (json.JSONDecodeError, IOError):
            _messages = []


def _save():
    if _messages_path:
        with open(_messages_path, "w", encoding="utf-8") as f:
            json.dump(_messages[-_max_messages:], f, indent=2)


@chatroom_bp.route("/api/chatroom/messages")
def get_messages():
    """Get chat room messages.

    Query params:
        since  -- Unix timestamp, return only messages after this time
        limit  -- max messages to return (default 100)
    """
    since = request.args.get("since", type=float, default=0)
    limit = request.args.get("limit", type=int, default=100)
    filtered = [m for m in _messages if m.get("ts", 0) > since]
    return jsonify(filtered[-limit:])


@chatroom_bp.route("/api/chatroom/post", methods=["POST"])
def post_message():
    """Post a message to the chat room.

    Body: {"name": "display name", "text": "message", "address": "rns_address"}
    """
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "").strip()
    name = data.get("name", "").strip() or "Anonymous"
    address = data.get("address", "").strip() or "unknown"

    if not text:
        return jsonify({"error": "Empty message"}), 400
    if len(text) > 2000:
        return jsonify({"error": "Message too long (2000 char max)"}), 400

    msg = {
        "name": name[:32],
        "address": address,
        "text": text,
        "ts": time.time(),
        "time": datetime.now(timezone.utc).isoformat(),
    }
    _messages.append(msg)

    # Trim and save
    if len(_messages) > _max_messages:
        _messages[:] = _messages[-_max_messages:]
    _save()

    return jsonify({"status": "ok"})


@chatroom_bp.route("/chatroom")
def chatroom_page():
    """Serve the chat room HTML page."""
    return send_from_directory(current_app.static_folder, "chatroom.html")


@chatroom_bp.route("/api/chatroom/info")
def chatroom_info():
    """Room metadata."""
    return jsonify({
        "name": "Loot Hunters' Lodge",
        "description": "Where gossip is traded and hints are dropped.",
        "message_count": len(_messages),
        "max_messages": _max_messages,
    })
