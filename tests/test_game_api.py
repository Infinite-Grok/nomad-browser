import json, tempfile, pytest
from nomad_browser.app import create_app


@pytest.fixture
def client():
    with tempfile.TemporaryDirectory() as d:
        app = create_app(data_dir=d, local_peers=None, skip_rns=True)
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client


def test_game_status(client):
    resp = client.get("/api/game/status")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["enabled"] is True
    assert "identity" in data
    assert data["inventory_count"] == 0


def test_game_inventory(client):
    resp = client.get("/api/game/inventory")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["items"] == []
    assert data["version"] == 0


def test_game_scan_page(client):
    resp = client.post("/api/game/scan", json={
        "content": '#!loot:{"item":"compass","mode":"per_player","hint":"test"}',
        "node_hash": "abc123",
        "page_path": "/page/index.mu",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["drops"]) == 1
    assert data["drops"][0]["item"] == "compass"


def test_game_claim(client):
    resp = client.post("/api/game/claim", json={
        "drop": {"item": "compass", "mode": "per_player"},
        "node_hash": "abc123",
        "page_path": "/page/index.mu",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "claimed"
    resp2 = client.get("/api/game/inventory")
    assert len(resp2.get_json()["items"]) == 1


def test_game_identity_update(client):
    resp = client.post("/api/game/identity", json={
        "display_name": "ghostrunner",
        "class": "scout",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["display_name"] == "ghostrunner"
    assert data["class"] == "scout"


def test_game_catalog(client):
    resp = client.get("/api/game/catalog")
    assert resp.status_code == 200
    assert resp.get_json()["items"] == []


def test_game_catalog_search(client):
    # Add a definition to the catalog directly
    with client.application.app_context():
        from flask import current_app
        engine = current_app.config["game_engine"]
        engine.library.add_definition("compass", "Mesh Compass", "Nav tool", "rare", "abc", tags=["nav"])
        engine.library.add_definition("badge", "Badge", "A badge", "common", "abc", tags=["cosmetic"])
    resp = client.get("/api/game/catalog/search?q=compass")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    assert len(items) == 1
    assert items[0]["item_id"] == "compass"
