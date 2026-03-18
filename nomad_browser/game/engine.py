"""GameEngine — orchestrates identity, inventory, library, scanner, claims."""
import os
import json

from .identity import GameIdentity
from .inventory import Inventory
from .loot_library import LootLibrary
from .loot_scanner import LootScanner
from .claims import ClaimProcessor


class GameEngine:
    def __init__(self, data_dir, rns_address):
        self.data_dir = data_dir
        self.enabled = True
        self.identity = GameIdentity(data_dir, rns_address)
        self.inventory = Inventory(data_dir, owner=rns_address)
        self.library = LootLibrary(data_dir)
        self.scanner = LootScanner()
        self.claims = ClaimProcessor(data_dir, self.inventory, self.library)
        self._load_seed_catalog()

    def _load_seed_catalog(self):
        """Load bundled seed loot definitions if catalog is empty."""
        if self.library.list_items():
            return
        seed_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "seed_catalog"
        )
        seed_dir = os.path.normpath(seed_dir)
        if not os.path.isdir(seed_dir):
            return
        for fname in os.listdir(seed_dir):
            if not fname.endswith(".json"):
                continue
            with open(os.path.join(seed_dir, fname), "r") as f:
                defn = json.load(f)
            self.library.add_definition(
                item_id=defn["item_id"],
                name=defn["name"],
                description=defn.get("description", ""),
                rarity=defn.get("rarity", "common"),
                creator=defn.get("creator", "unknown"),
                tags=defn.get("tags", []),
                physical_payload=defn.get("physical_payload"),
            )

    def scan_page(self, content, node_hash, page_path):
        """Scan a page for loot. Returns list of drops found."""
        if not self.enabled:
            return []
        return self.scanner.scan(content)

    def claim_drop(self, drop, node_hash, page_path, claim_context=None):
        """Attempt to claim a loot drop."""
        return self.claims.claim(drop, node_hash, page_path, claim_context)

    def get_status(self):
        """Summary for API/UI."""
        return {
            "enabled": self.enabled,
            "identity": self.identity.to_dict(),
            "inventory_count": len(self.inventory.items),
            "inventory_version": self.inventory.version,
            "catalog_count": len(self.library.list_items()),
        }
