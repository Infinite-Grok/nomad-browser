"""
Page API routes for Nomad Browser.

Registers all /api/* endpoints against a Flask app instance.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

import RNS
from flask import jsonify, request

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask
    from .browser import Browser


def register_page_routes(app: "Flask", browser: "Browser") -> None:
    """Attach all page-related API routes to *app*."""

    # ------------------------------------------------------------------ #
    # Page fetch                                                          #
    # ------------------------------------------------------------------ #

    @app.route("/api/pages/fetch/<node_hash>")
    def api_fetch_page(node_hash):
        """Fetch a .mu page from a NomadNet node.

        Query params:
            path  -- page path, default /page/index.mu
        """
        page_path = request.args.get("path", "/page/index.mu")
        print(f"[API] fetch {page_path} from {node_hash[:16]}...")
        response = browser.fetch_page(node_hash, page_path)
        if response["status"] == "success":
            print(f"[API] fetch OK ({len(response.get('content', ''))} chars)")
        else:
            print(f"[API] fetch FAIL: {response.get('error')}")
        return jsonify(response)

    # ------------------------------------------------------------------ #
    # Node discovery                                                      #
    # ------------------------------------------------------------------ #

    @app.route("/api/nodes")
    def api_nodes():
        """List all discovered nodes with names, hashes, and hop counts."""
        nodes = browser.get_nodes()
        for node in nodes:
            hop_info = browser.get_node_hops(node["hash"])
            node["hops"] = hop_info["hops"]
            node["next_hop_interface"] = hop_info["next_hop_interface"]
        return jsonify(nodes)

    # ------------------------------------------------------------------ #
    # Status                                                              #
    # ------------------------------------------------------------------ #

    @app.route("/api/status")
    def api_status():
        """Return connection status, node count, and uptime."""
        status = browser.get_status()
        ident = RNS.prettyhexrep(id_hash()) if id_hash() else None
        return jsonify({
            "connection_state": status["connection_state"],
            "reticulum_ready": status["reticulum_ready"],
            "node_count": status["node_count"],
            "announce_count": status["announce_count"],
            "uptime": round(status["uptime"], 1),
            "identity_hash": ident,
        })

    @app.route("/api/connection-status")
    def api_connection_status():
        """Return a traffic-light style connection status for UI indicators."""
        status = browser.get_status()

        if not status["reticulum_ready"] or status["connection_state"] == "failed":
            return jsonify({"status": "connerror", "message": "Reticulum failed", "color": "red"})

        state = status["connection_state"]
        uptime = status["uptime"]
        has_nodes = status["has_nodes"]
        since_announce = status["time_since_last_announce"]

        if state in ("initializing", "connecting"):
            return jsonify({"status": "waiting", "message": f"{state.capitalize()}...", "color": "yellow"})

        if state == "connected":
            if uptime < 60:
                return jsonify({"status": "waiting", "message": "Connected — waiting for announces...", "color": "green"})
            return jsonify({"status": "waiting", "message": "Connected, no activity yet", "color": "yellow"})

        if state == "active":
            if has_nodes:
                if since_announce and since_announce > 300:
                    return jsonify({"status": "waiting", "message": "No recent announces", "color": "yellow"})
                return jsonify({"status": "online", "message": "Online — Reticulum connected", "color": "green"})
            return jsonify({"status": "waiting", "message": "Active but no nodes found", "color": "yellow"})

        return jsonify({"status": "connerror", "message": f"Unknown state: {state}", "color": "red"})

    # ------------------------------------------------------------------ #
    # Cache search                                                        #
    # ------------------------------------------------------------------ #

    @app.route("/api/cache/search")
    def api_cache_search():
        """Search cached pages.

        Query params:
            q     -- search query (required)
            mode  -- "partial" (default) or "exact"
        """
        query = request.args.get("q", "").strip()
        mode = request.args.get("mode", "partial")

        if not query:
            return jsonify([])

        if browser.cache is None:
            return jsonify({"error": "Cache not initialized"}), 503

        try:
            results = browser.cache.search(query, mode)
            return jsonify(results)
        except Exception as exc:
            print(f"[API] cache search error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # Favorites                                                           #
    # ------------------------------------------------------------------ #

    @app.route("/api/favorites", methods=["GET"])
    def api_get_favorites():
        """Load bookmarked nodes from settings.json."""
        try:
            favorites = _load_favorites(browser.data_dir)
            return jsonify({"status": "success", "favorites": favorites})
        except Exception as exc:
            return jsonify({"status": "error", "error": str(exc)}), 500

    @app.route("/api/favorites", methods=["POST"])
    def api_save_favorites():
        """Save bookmarked nodes to settings.json."""
        try:
            payload = request.get_json() or {}
            favorites = payload.get("favorites", [])
            _save_favorites(browser.data_dir, favorites)
            return jsonify({"status": "success", "message": "Favorites saved"})
        except Exception as exc:
            return jsonify({"status": "error", "error": str(exc)}), 500


# --------------------------------------------------------------------------- #
# Helpers                                                                       #
# --------------------------------------------------------------------------- #

def _settings_path(data_dir: str) -> Path:
    return Path(data_dir) / "settings.json"


def _load_settings(data_dir: str) -> Dict[str, Any]:
    path = _settings_path(data_dir)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _write_settings(data_dir: str, settings: Dict[str, Any]) -> None:
    path = _settings_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def _load_favorites(data_dir: str) -> list:
    settings = _load_settings(data_dir)
    return settings.get("favorites", [])


def _save_favorites(data_dir: str, favorites: list) -> None:
    settings = _load_settings(data_dir)
    settings["favorites"] = favorites
    _write_settings(data_dir, settings)


def id_hash():
    """Return the identity hash bytes for the status endpoint, or None."""
    try:
        from . import identity as id_manager
        ident = id_manager.get_identity()
        return ident.hash if ident else None
    except Exception:
        return None
