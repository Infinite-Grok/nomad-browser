import os, json, tempfile, pytest
from nomad_browser.game.identity import GameIdentity

@pytest.fixture
def data_dir():
    with tempfile.TemporaryDirectory() as d:
        yield d

def test_create_new_identity(data_dir):
    gi = GameIdentity(data_dir, rns_address="abc123def456")
    assert gi.rns_address == "abc123def456"
    assert gi.display_name is None
    assert gi.player_class == "nomad"
    assert len(gi.class_history) == 1
    assert gi.class_history[0]["class"] == "nomad"
    path = os.path.join(data_dir, "game", "identity.json")
    assert os.path.exists(path)

def test_load_existing_identity(data_dir):
    gi1 = GameIdentity(data_dir, rns_address="abc123def456")
    gi1.set_display_name("ghostrunner")
    gi1.save()
    gi2 = GameIdentity(data_dir, rns_address="abc123def456")
    assert gi2.display_name == "ghostrunner"

def test_change_class(data_dir):
    gi = GameIdentity(data_dir, rns_address="abc123def456")
    gi.set_class("scout")
    assert gi.player_class == "scout"
    assert len(gi.class_history) == 2
    assert gi.class_history[0]["class"] == "nomad"
    assert gi.class_history[0]["to"] is not None
    assert gi.class_history[1]["class"] == "scout"
    assert gi.class_history[1]["to"] is None

def test_invalid_class_rejected(data_dir):
    gi = GameIdentity(data_dir, rns_address="abc123def456")
    with pytest.raises(ValueError):
        gi.set_class("wizard")

def test_identity_to_json(data_dir):
    gi = GameIdentity(data_dir, rns_address="abc123def456")
    gi.set_display_name("ghostrunner")
    data = gi.to_dict()
    assert data["type"] == "game_identity"
    assert data["rns_address"] == "abc123def456"
    assert data["display_name"] == "ghostrunner"
    assert data["class"] == "nomad"
    assert "created" in data
