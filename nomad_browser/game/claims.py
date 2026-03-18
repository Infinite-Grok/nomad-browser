"""Claim processing — validate, resolve conflicts, persist."""
import os
import json
import hashlib
from datetime import datetime, timezone, timedelta

class ClaimProcessor:
    def __init__(self, data_dir, inventory, loot_library):
        self.inventory = inventory
        self.loot_library = loot_library
        self._claims_dir = os.path.join(data_dir, "game", "claims")
        os.makedirs(self._claims_dir, exist_ok=True)

    def _claim_key(self, drop, node_hash, page_path):
        raw = f"{drop['item']}:{node_hash}:{page_path}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _get_claim_record(self, claim_key):
        path = os.path.join(self._claims_dir, f"{claim_key}.json")
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return json.load(f)

    def _save_claim_record(self, claim_key, record):
        path = os.path.join(self._claims_dir, f"{claim_key}.json")
        with open(path, "w") as f:
            json.dump(record, f, indent=2)

    def claim(self, drop, node_hash, page_path, claim_context=None):
        claim_key = self._claim_key(drop, node_hash, page_path)
        existing = self._get_claim_record(claim_key)
        mode = drop["mode"]
        now = datetime.now(timezone.utc)

        if mode == "once":
            if existing:
                return {"status": "already_claimed"}
        elif mode == "per_player":
            if existing:
                return {"status": "already_claimed"}
        elif mode == "timed":
            if existing:
                cooldown_hours = drop.get("cooldown_hours", 24)
                last_claim = datetime.fromisoformat(existing["claimed_at"])
                if now - last_claim < timedelta(hours=cooldown_hours):
                    return {"status": "cooldown", "available_at": (last_claim + timedelta(hours=cooldown_hours)).isoformat()}

        defn = self.loot_library.get_definition(drop["item"])
        name = defn["name"] if defn else drop["item"]
        rarity = defn["rarity"] if defn else "unknown"

        item = self.inventory.add_item(
            item_id=drop["item"], name=name, rarity=rarity, claim_context=claim_context,
        )

        record = {
            "claim_key": claim_key,
            "item_id": drop["item"],
            "mode": mode,
            "node_hash": node_hash,
            "page_path": page_path,
            "claimed_at": now.isoformat(),
            "item_hash": item["item_hash"],
        }
        self._save_claim_record(claim_key, record)
        return {"status": "claimed", "item": item}
