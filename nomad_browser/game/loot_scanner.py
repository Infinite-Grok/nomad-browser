"""Page scanner — detects #!loot: tags in Micron and HTML content."""
import json

VALID_MODES = {"once", "per_player", "timed"}
REQUIRED_FIELDS = {"item", "mode"}

def _extract_json_at(text, start):
    """Extract a JSON object starting at `start` by counting brace depth."""
    if text[start] != '{':
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None

class LootScanner:
    def scan(self, content):
        """Scan page content for loot tags. Returns list of valid drop dicts.
        Handles nested JSON via brace-depth parsing."""
        drops = []
        marker = '#!loot:'
        idx = 0
        while True:
            pos = content.find(marker, idx)
            if pos == -1:
                break
            json_start = pos + len(marker)
            raw = _extract_json_at(content, json_start)
            if raw is None:
                idx = json_start
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                idx = json_start + 1
                continue
            idx = json_start + len(raw)
            if not REQUIRED_FIELDS.issubset(data.keys()):
                continue
            if data["mode"] not in VALID_MODES:
                continue
            drops.append(data)
        return drops
