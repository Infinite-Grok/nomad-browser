"""Chat API routes for the LXMF messenger."""

import json, os
from flask import Blueprint, jsonify, request


def _load_contacts(data_dir):
    """Load contacts from settings.json."""
    settings_path = os.path.join(data_dir, "settings.json")
    if os.path.exists(settings_path):
        with open(settings_path, 'r', encoding='utf-8') as f:
            settings = json.load(f)
        return settings.get("contacts", [])
    return []


def _save_contacts(data_dir, contacts):
    """Save contacts to settings.json."""
    settings_path = os.path.join(data_dir, "settings.json")
    settings = {}
    if os.path.exists(settings_path):
        with open(settings_path, 'r', encoding='utf-8') as f:
            settings = json.load(f)
    settings["contacts"] = contacts
    with open(settings_path, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2)


def register_chat_routes(app, messenger):
    """Register all /api/chat/* routes on the given Flask app.

    Args:
        app: Flask application instance.
        messenger: Messenger instance to delegate to.
    """
    chat_bp = Blueprint("chat", __name__)

    @chat_bp.route("/api/chat/send", methods=["POST"])
    def send_message():
        """Send an LXMF message.

        Body: {"to": "<lxmf_address>", "content": "message text"}
        Returns: {"status": "ok", "message_id": "<id>"}
        """
        data = request.get_json(force=True, silent=True) or {}
        to_address = data.get("to", "").strip()
        content = data.get("content", "").strip()

        if not to_address:
            return jsonify({"status": "error", "error": "Missing 'to' field"}), 400
        if not content:
            return jsonify({"status": "error", "error": "Missing 'content' field"}), 400

        try:
            message_id = messenger.send(to_address, content)
            return jsonify({"status": "ok", "message_id": message_id})
        except TimeoutError as e:
            return jsonify({"status": "error", "error": str(e)}), 504
        except ValueError as e:
            return jsonify({"status": "error", "error": str(e)}), 400
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/messages/<path:address>", methods=["GET"])
    def get_messages(address):
        """Return stored messages for a conversation.

        Query params:
            since (optional): ISO timestamp — only return messages after this time.

        Returns: list of message objects
        """
        since = request.args.get("since")
        try:
            messages = messenger.get_messages(address, since=since)
            return jsonify(messages)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/new", methods=["GET"])
    def get_new_messages():
        """Poll for new incoming messages (drains the queue).

        Returns: list of new message objects (may be empty)
        """
        try:
            messages = messenger.get_new_messages()
            return jsonify(messages)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/conversations", methods=["GET"])
    def list_conversations():
        """List all known conversations with metadata.

        Returns: list of conversation meta objects
        """
        try:
            convs = messenger.list_conversations()
            return jsonify(convs)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/name", methods=["POST"])
    def set_name():
        """Set a display name for a conversation.

        Body: {"address": "<lxmf_address>", "name": "display name"}
        Returns: {"status": "ok"}
        """
        data = request.get_json(force=True, silent=True) or {}
        address = data.get("address", "").strip()
        name = data.get("name", "").strip()

        if not address:
            return jsonify({"status": "error", "error": "Missing 'address' field"}), 400
        if not name:
            return jsonify({"status": "error", "error": "Missing 'name' field"}), 400

        try:
            messenger.set_conversation_name(address, name)
            return jsonify({"status": "ok"})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/clear/<path:address>", methods=["DELETE"])
    def clear_conversation(address):
        """Clear all messages for a conversation."""
        try:
            addr_clean = address.replace("<","").replace(">","").replace(" ","")
            import os, shutil
            conv_dir = os.path.join(messenger.conversations_dir, addr_clean)
            if os.path.exists(conv_dir):
                shutil.rmtree(conv_dir)
            return jsonify({"status": "ok"})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/chat/identity", methods=["GET"])
    def get_identity():
        """Return this node's LXMF address.

        Returns: {"address": "<lxmf_address>"}
        """
        return jsonify({"address": messenger.lxmf_address})

    # ----------------------------------------------------------------
    # Contacts
    # ----------------------------------------------------------------

    @chat_bp.route("/api/contacts", methods=["GET"])
    def get_contacts():
        """Return saved contacts list from settings."""
        try:
            contacts = _load_contacts(messenger.data_dir)
            return jsonify(contacts)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/contacts", methods=["POST"])
    def save_contacts():
        """Save full contacts list to settings."""
        data = request.get_json(force=True, silent=True) or {}
        contacts = data.get("contacts", [])
        try:
            _save_contacts(messenger.data_dir, contacts)
            return jsonify({"status": "ok"})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/contacts/add", methods=["POST"])
    def add_contact():
        """Add a single contact. Body: {address, name}"""
        data = request.get_json(force=True, silent=True) or {}
        address = data.get("address", "").strip()
        name = data.get("name", "").strip()
        if not address:
            return jsonify({"status": "error", "error": "Missing address"}), 400
        if not name:
            name = address[:16] + "..."
        try:
            contacts = _load_contacts(messenger.data_dir)
            # Don't duplicate
            if not any(c["address"] == address for c in contacts):
                contacts.append({"address": address, "name": name})
                _save_contacts(messenger.data_dir, contacts)
            return jsonify({"status": "ok"})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @chat_bp.route("/api/contacts/remove", methods=["POST"])
    def remove_contact():
        """Remove a contact by address. Body: {address}"""
        data = request.get_json(force=True, silent=True) or {}
        address = data.get("address", "").strip()
        if not address:
            return jsonify({"status": "error", "error": "Missing address"}), 400
        try:
            contacts = _load_contacts(messenger.data_dir)
            contacts = [c for c in contacts if c["address"] != address]
            _save_contacts(messenger.data_dir, contacts)
            return jsonify({"status": "ok"})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    # ----------------------------------------------------------------
    # Reset (clear all game/chat state for testing)
    # ----------------------------------------------------------------

    _debug_log = []

    @chat_bp.route("/api/debug/log", methods=["POST"])
    def debug_log():
        """Receive JS debug logs from the browser."""
        data = request.get_json(force=True, silent=True) or {}
        msg = data.get("msg", "")
        _debug_log.append(msg)
        if len(_debug_log) > 200:
            _debug_log.pop(0)
        return jsonify({"status": "ok"})

    @chat_bp.route("/api/debug/log", methods=["GET"])
    def get_debug_log():
        """Return collected debug logs."""
        return jsonify(_debug_log)

    @chat_bp.route("/api/reset", methods=["GET"])
    def reset_all():
        """Clear all conversations and return a page that clears localStorage."""
        import shutil
        if os.path.exists(messenger.conversations_dir):
            shutil.rmtree(messenger.conversations_dir)
            os.makedirs(messenger.conversations_dir, exist_ok=True)
        with messenger._lock:
            messenger._incoming.clear()
        return """<html><body style="background:#1a1a2e;color:#4caf50;font-family:monospace;
            display:flex;align-items:center;justify-content:center;height:100vh;font-size:24px;">
            <div id="msg">Clearing...</div>
            <script>
                localStorage.clear();
                document.getElementById('msg').textContent = 'All cleared! Redirecting...';
                setTimeout(() => window.location.href = '/', 1000);
            </script></body></html>"""

    # ----------------------------------------------------------------
    # Local test injection (bypasses LXMF for local peer testing)
    # ----------------------------------------------------------------

    @chat_bp.route("/api/chat/inject", methods=["POST"])
    def inject_message():
        """Inject a message as if it arrived via LXMF.

        Used by local peers to deliver messages directly over HTTP
        instead of going through the mesh. Same format as _on_message.

        Body: {"from": "<address>", "content": "message text"}
        Returns: {"status": "ok"}
        """
        data = request.get_json(force=True, silent=True) or {}
        from_addr = data.get("from", "").strip()
        content = data.get("content", "").strip()

        if not from_addr or not content:
            return jsonify({"status": "error", "error": "Missing from/content"}), 400

        from datetime import datetime
        msg_data = {
            "from": from_addr,
            "to": messenger.lxmf_address,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "received"
        }
        messenger._store_message(from_addr, msg_data)
        with messenger._lock:
            messenger._incoming.append({"address": from_addr, **msg_data})

        return jsonify({"status": "ok"})

    app.register_blueprint(chat_bp)
