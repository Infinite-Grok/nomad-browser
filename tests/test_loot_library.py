# tests/test_loot_library.py
import os, json, tempfile, pytest
from nomad_browser.game.loot_library import LootLibrary

@pytest.fixture
def data_dir():
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "game", "loot_catalog"), exist_ok=True)
        yield d

def test_empty_library(data_dir):
    lib = LootLibrary(data_dir)
    assert lib.list_items() == []

def test_add_definition(data_dir):
    lib = LootLibrary(data_dir)
    defn = lib.add_definition(item_id="mesh_compass", name="Mesh Compass", description="Points to the nearest active node.", rarity="rare", creator="abc123", tags=["navigation"])
    assert defn["item_id"] == "mesh_compass"
    assert defn["type"] == "loot_definition"
    lib2 = LootLibrary(data_dir)
    assert len(lib2.list_items()) == 1

def test_get_definition(data_dir):
    lib = LootLibrary(data_dir)
    lib.add_definition("compass", "Compass", "Desc", "rare", "abc")
    found = lib.get_definition("compass")
    assert found["name"] == "Compass"

def test_get_nonexistent(data_dir):
    lib = LootLibrary(data_dir)
    assert lib.get_definition("nope") is None

def test_physical_payload(data_dir):
    lib = LootLibrary(data_dir)
    payload = {"type": "hardware", "description": "LoRa relay"}
    defn = lib.add_definition("relay", "LoRa Relay", "A solar relay", "legendary", "abc", physical_payload=payload)
    assert defn["physical_payload"]["type"] == "hardware"

def test_search_by_tag(data_dir):
    lib = LootLibrary(data_dir)
    lib.add_definition("compass", "Compass", "Nav tool", "rare", "abc", tags=["navigation"])
    lib.add_definition("badge", "Badge", "A badge", "common", "abc", tags=["cosmetic"])
    results = lib.search(tag="navigation")
    assert len(results) == 1
    assert results[0]["item_id"] == "compass"

def test_search_by_text(data_dir):
    lib = LootLibrary(data_dir)
    lib.add_definition("compass", "Mesh Compass", "Points to nodes", "rare", "abc")
    lib.add_definition("badge", "Explorer Badge", "For explorers", "common", "abc")
    results = lib.search(query="compass")
    assert len(results) == 1
    assert results[0]["item_id"] == "compass"
