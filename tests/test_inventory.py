# tests/test_inventory.py
import os, json, tempfile, pytest
from nomad_browser.game.inventory import Inventory

@pytest.fixture
def data_dir():
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "game"), exist_ok=True)
        yield d

def test_empty_inventory(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    assert inv.owner == "abc123"
    assert inv.items == []
    assert inv.version == 0

def test_add_item(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    item = inv.add_item(item_id="mesh_compass", name="Mesh Compass", rarity="rare")
    assert item["item_id"] == "mesh_compass"
    assert item["name"] == "Mesh Compass"
    assert item["evolution_level"] == 0
    assert "acquired" in item
    assert "item_hash" in item
    assert inv.version == 1
    assert len(inv.items) == 1
    inv2 = Inventory(data_dir, owner="abc123")
    assert len(inv2.items) == 1
    assert inv2.version == 1

def test_add_item_with_claim_context(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    ctx = {"type": "frontier_claim", "hop_count": 7}
    item = inv.add_item("compass", "Compass", "rare", claim_context=ctx)
    assert item["claim_context"]["type"] == "frontier_claim"

def test_remove_item(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    item = inv.add_item("compass", "Compass", "rare")
    inv.remove_item(item["item_hash"])
    assert len(inv.items) == 0
    assert inv.version == 2

def test_remove_nonexistent_raises(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    with pytest.raises(KeyError):
        inv.remove_item("nonexistent_hash")

def test_get_item(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    item = inv.add_item("compass", "Compass", "rare")
    found = inv.get_item(item["item_hash"])
    assert found["name"] == "Compass"

def test_to_dict(data_dir):
    inv = Inventory(data_dir, owner="abc123")
    inv.add_item("compass", "Compass", "rare")
    data = inv.to_dict()
    assert data["type"] == "inventory"
    assert data["owner"] == "abc123"
    assert len(data["items"]) == 1
    assert data["version"] == 1
