"""End-to-end test: scan page -> find loot -> claim -> verify inventory."""
import json, tempfile, pytest
from nomad_browser.app import create_app


@pytest.fixture
def client():
    with tempfile.TemporaryDirectory() as d:
        app = create_app(data_dir=d, local_peers=None, skip_rns=True)
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client


def test_full_game_loop(client):
    """Complete V1 game loop: scan -> claim -> inventory."""
    # 1. Game starts with empty inventory
    resp = client.get("/api/game/inventory")
    assert resp.get_json()["items"] == []

    # 2. Set player identity
    client.post("/api/game/identity", json={
        "display_name": "ghostrunner",
        "class": "scout",
    })

    # 3. Scan a page with loot
    page_content = """
`!Hidden Treasure Page
Some normal content here.
#!loot:{"item":"mesh_compass","mode":"per_player","hint":"Where signals cross"}
#!loot:{"item":"bridge_token","mode":"once","hint":"One shot only"}
More content.
"""
    resp = client.post("/api/game/scan", json={
        "content": page_content,
        "node_hash": "abc123def456",
        "page_path": "/page/treasure.mu",
    })
    drops = resp.get_json()["drops"]
    assert len(drops) == 2

    # 4. Claim the per_player drop
    resp = client.post("/api/game/claim", json={
        "drop": drops[0],
        "node_hash": "abc123def456",
        "page_path": "/page/treasure.mu",
    })
    assert resp.get_json()["status"] == "claimed"

    # 5. Claim the once drop
    resp = client.post("/api/game/claim", json={
        "drop": drops[1],
        "node_hash": "abc123def456",
        "page_path": "/page/treasure.mu",
    })
    assert resp.get_json()["status"] == "claimed"

    # 6. Verify inventory has both items
    resp = client.get("/api/game/inventory")
    inv = resp.get_json()
    assert len(inv["items"]) == 2
    assert inv["version"] == 2
    item_ids = [i["item_id"] for i in inv["items"]]
    assert "mesh_compass" in item_ids
    assert "bridge_token" in item_ids

    # 7. Can't re-claim per_player
    resp = client.post("/api/game/claim", json={
        "drop": drops[0],
        "node_hash": "abc123def456",
        "page_path": "/page/treasure.mu",
    })
    assert resp.get_json()["status"] == "already_claimed"

    # 8. Can't re-claim once
    resp = client.post("/api/game/claim", json={
        "drop": drops[1],
        "node_hash": "abc123def456",
        "page_path": "/page/treasure.mu",
    })
    assert resp.get_json()["status"] == "already_claimed"

    # 9. Game status reflects everything
    resp = client.get("/api/game/status")
    status = resp.get_json()
    assert status["identity"]["display_name"] == "ghostrunner"
    assert status["identity"]["class"] == "scout"
    assert status["inventory_count"] == 2
