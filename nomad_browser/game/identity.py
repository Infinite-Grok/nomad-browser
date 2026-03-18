"""Game identity management — links to RNS identity, self-sovereign."""
import os
import json
from datetime import datetime, timezone

VALID_CLASSES = {"scout", "smuggler", "commander", "courier", "nomad"}

class GameIdentity:
    def __init__(self, data_dir, rns_address):
        self.data_dir = data_dir
        self.rns_address = rns_address
        self._path = os.path.join(data_dir, "game", "identity.json")
        self.display_name = None
        self.player_class = "nomad"
        self.class_history = []
        self.created = None
        self._load_or_create()

    def _load_or_create(self):
        if os.path.exists(self._path):
            with open(self._path, "r") as f:
                data = json.load(f)
            self.display_name = data.get("display_name")
            self.player_class = data.get("class", "nomad")
            self.class_history = data.get("class_history", [])
            self.created = data.get("created")
        else:
            now = datetime.now(timezone.utc).isoformat()
            self.created = now
            self.class_history = [{"class": "nomad", "from": now, "to": None}]
            self.save()

    def set_display_name(self, name):
        self.display_name = name
        self.save()

    def set_class(self, new_class):
        if new_class not in VALID_CLASSES:
            raise ValueError(f"Invalid class: {new_class}. Must be one of {VALID_CLASSES}")
        if new_class == self.player_class:
            return
        now = datetime.now(timezone.utc).isoformat()
        if self.class_history:
            self.class_history[-1]["to"] = now
        self.class_history.append({"class": new_class, "from": now, "to": None})
        self.player_class = new_class
        self.save()

    def to_dict(self):
        return {
            "type": "game_identity",
            "rns_address": self.rns_address,
            "display_name": self.display_name,
            "class": self.player_class,
            "class_history": self.class_history,
            "created": self.created,
        }

    def save(self):
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
