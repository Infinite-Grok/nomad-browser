"""Game API endpoints — /api/game/*"""
from flask import Blueprint, request, jsonify, current_app

game_bp = Blueprint("game", __name__)


def get_engine():
    return current_app.config["game_engine"]


@game_bp.route("/api/game/status")
def game_status():
    return jsonify(get_engine().get_status())


@game_bp.route("/api/game/inventory")
def game_inventory():
    engine = get_engine()
    return jsonify(engine.inventory.to_dict())


@game_bp.route("/api/game/scan", methods=["POST"])
def game_scan():
    data = request.get_json()
    engine = get_engine()
    drops = engine.scan_page(
        data["content"],
        data["node_hash"],
        data["page_path"],
    )
    return jsonify({"drops": drops})


@game_bp.route("/api/game/claim", methods=["POST"])
def game_claim():
    data = request.get_json()
    engine = get_engine()
    result = engine.claim_drop(
        data["drop"],
        data["node_hash"],
        data["page_path"],
        claim_context=data.get("claim_context"),
    )
    return jsonify(result)


@game_bp.route("/api/game/identity", methods=["GET", "POST"])
def game_identity():
    engine = get_engine()
    if request.method == "POST":
        data = request.get_json()
        if "display_name" in data:
            engine.identity.set_display_name(data["display_name"])
        if "class" in data:
            engine.identity.set_class(data["class"])
    return jsonify(engine.identity.to_dict())


@game_bp.route("/api/game/catalog")
def game_catalog():
    engine = get_engine()
    return jsonify({"items": engine.library.list_items()})


@game_bp.route("/api/game/catalog/search")
def game_catalog_search():
    engine = get_engine()
    q = request.args.get("q")
    tag = request.args.get("tag")
    results = engine.library.search(query=q, tag=tag)
    return jsonify({"items": results})
