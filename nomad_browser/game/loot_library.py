"""Loot catalog — distributed definitions, local storage."""
import os
import json
from datetime import datetime, timezone


class LootLibrary:
    def __init__(self, data_dir):
        self._catalog_dir = os.path.join(data_dir, "game", "loot_catalog")
        os.makedirs(self._catalog_dir, exist_ok=True)

    def add_definition(self, item_id, name, description, rarity, creator, tags=None, physical_payload=None, evolution_chain=None):
        defn = {
            "type": "loot_definition",
            "item_id": item_id,
            "name": name,
            "description": description,
            "rarity": rarity,
            "creator": creator,
            "created": datetime.now(timezone.utc).isoformat(),
            "tags": tags or [],
            "physical_payload": physical_payload,
            "evolution_chain": evolution_chain,
        }
        path = os.path.join(self._catalog_dir, f"{item_id}.json")
        with open(path, "w") as f:
            json.dump(defn, f, indent=2)
        return defn

    def get_definition(self, item_id):
        path = os.path.join(self._catalog_dir, f"{item_id}.json")
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return json.load(f)

    def list_items(self):
        items = []
        for fname in os.listdir(self._catalog_dir):
            if fname.endswith(".json"):
                with open(os.path.join(self._catalog_dir, fname), "r") as f:
                    items.append(json.load(f))
        return items

    def search(self, query=None, tag=None):
        results = []
        for item in self.list_items():
            if tag and tag not in item.get("tags", []):
                continue
            if query:
                q = query.lower()
                if q not in item["name"].lower() and q not in item.get("description", "").lower():
                    continue
            results.append(item)
        return results
