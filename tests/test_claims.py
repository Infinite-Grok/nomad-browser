# tests/test_claims.py
import os, tempfile, pytest
from nomad_browser.game.claims import ClaimProcessor
from nomad_browser.game.inventory import Inventory
from nomad_browser.game.loot_library import LootLibrary

@pytest.fixture
def data_dir():
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "game", "loot_catalog"), exist_ok=True)
        os.makedirs(os.path.join(d, "game", "claims"), exist_ok=True)
        yield d

@pytest.fixture
def setup(data_dir):
    inv = Inventory(data_dir, owner="player1")
    lib = LootLibrary(data_dir)
    lib.add_definition("compass", "Compass", "A compass", "rare", "creator1")
    proc = ClaimProcessor(data_dir, inv, lib)
    return proc, inv, lib

def test_claim_per_player(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "per_player"}
    result = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result["status"] == "claimed"
    assert len(inv.items) == 1
    assert inv.items[0]["item_id"] == "compass"

def test_claim_per_player_no_duplicate(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "per_player"}
    proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    result = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result["status"] == "already_claimed"
    assert len(inv.items) == 1

def test_claim_once(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "once"}
    result = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result["status"] == "claimed"

def test_claim_once_already_taken(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "once"}
    proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    result = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result["status"] == "already_claimed"

def test_claim_timed_respawn(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "timed", "cooldown_hours": 0}
    result1 = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result1["status"] == "claimed"
    result2 = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result2["status"] == "claimed"

def test_claim_unknown_item(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "unknown_thing", "mode": "per_player"}
    result = proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    assert result["status"] == "claimed"
    assert inv.items[0]["item_id"] == "unknown_thing"

def test_claim_record_persisted(setup, data_dir):
    proc, inv, _ = setup
    drop = {"item": "compass", "mode": "per_player"}
    proc.claim(drop, node_hash="node1", page_path="/page/index.mu")
    claims_dir = os.path.join(data_dir, "game", "claims")
    files = os.listdir(claims_dir)
    assert len(files) == 1
