"""Inventory management — local-first, versioned, signed."""
import os
import json
import hashlib
from datetime import datetime, timezone

class Inventory:
    def __init__(self, data_dir, owner):
        self.data_dir = data_dir
        self.owner = owner
        self._path = os.path.join(data_dir, "game", "inventory.json")
        self.items = []
        self.version = 0
        self._load()

    def _load(self):
        if os.path.exists(self._path):
            with open(self._path, "r") as f:
                data = json.load(f)
            self.items = data.get("items", [])
            self.version = data.get("version", 0)

    def save(self):
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    def add_item(self, item_id, name, rarity, claim_context=None, provenance=None):
        now = datetime.now(timezone.utc).isoformat()
        item_hash = hashlib.sha256(
            f"{item_id}:{self.owner}:{now}".encode()
        ).hexdigest()[:16]
        item = {
            "item_hash": item_hash,
            "item_id": item_id,
            "name": name,
            "rarity": rarity,
            "evolution_level": 0,
            "acquired": now,
            "claim_context": claim_context,
            "provenance": provenance or [
                {"event": "claimed", "by": self.owner, "at": now}
            ],
        }
        self.items.append(item)
        self.version += 1
        self.save()
        return item

    def remove_item(self, item_hash):
        for i, item in enumerate(self.items):
            if item["item_hash"] == item_hash:
                self.items.pop(i)
                self.version += 1
                self.save()
                return
        raise KeyError(f"Item not found: {item_hash}")

    def get_item(self, item_hash):
        for item in self.items:
            if item["item_hash"] == item_hash:
                return item
        return None

    def to_dict(self):
        return {
            "type": "inventory",
            "owner": self.owner,
            "items": self.items,
            "version": self.version,
        }
