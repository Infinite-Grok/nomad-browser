"""
Cache management for Nomad Browser.

Handles background caching of NomadNet node pages, search across cached content,
size limit enforcement, and expiry cleanup.

Directory layout per node:
    {data_dir}/cache/nodes/{hash}/
        index.mu        -- cached index page content
        node_name.txt   -- human-readable node name
        cached_at.txt   -- ISO timestamp of last cache run
"""

from __future__ import annotations

import json
import queue
import shutil
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# TYPE_CHECKING import to avoid circular at runtime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .browser import Browser


# (node_hash, node_name, page_path)
CacheTask = Tuple[str, str, str]


class CacheManager:
    """Background worker-based cache for NomadNet pages."""

    DEFAULT_SETTINGS: Dict[str, Any] = {
        "auto_cache_enabled": True,
        "size_limit_mb": 100,
        "expiry_days": 30,
        "search_limit": 50,
    }

    def __init__(self, browser: "Browser", data_dir: str) -> None:
        self.browser = browser
        self.cache_dir = Path(data_dir) / "cache" / "nodes"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.settings: Dict[str, Any] = dict(self.DEFAULT_SETTINGS)
        self._settings_file = Path(data_dir) / "settings.json"
        self._load_settings()

        self._queue: "queue.Queue[CacheTask]" = queue.Queue()

        self._worker = threading.Thread(target=self._cache_worker, daemon=True, name="cache-worker")
        self._worker.start()

        print("[CacheManager] Started.")

    # -- settings ----------------------------------------------------------- #

    def _load_settings(self) -> None:
        if self._settings_file.exists():
            try:
                saved = json.loads(self._settings_file.read_text(encoding="utf-8"))
                self.settings.update(saved.get("cache", {}))
            except Exception as exc:
                print(f"[CacheManager] Could not load settings: {exc}")

    def save_settings(self) -> None:
        """Persist current settings to {data_dir}/settings.json."""
        try:
            existing: Dict[str, Any] = {}
            if self._settings_file.exists():
                try:
                    existing = json.loads(self._settings_file.read_text(encoding="utf-8"))
                except Exception:
                    pass
            existing["cache"] = self.settings
            self._settings_file.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"[CacheManager] Could not save settings: {exc}")

    # -- public API --------------------------------------------------------- #

    def schedule_node(self, node_hash: str, node_name: str) -> None:
        """Decide whether to queue a cache job for *node_hash*."""
        if not self.settings.get("auto_cache_enabled", True):
            return

        node_dir = self.cache_dir / node_hash
        index_file = node_dir / "index.mu"

        needs_cache = False
        if not node_dir.exists():
            print(f"[CacheManager] New node, queuing: {node_name}")
            needs_cache = True
        elif not index_file.exists():
            print(f"[CacheManager] Missing index, re-queuing: {node_name}")
            needs_cache = True
        else:
            try:
                content = index_file.read_text(encoding="utf-8", errors="ignore")
                if len(content.strip()) < 10:
                    print(f"[CacheManager] Empty index, re-queuing: {node_name}")
                    needs_cache = True
            except Exception:
                needs_cache = True

        if needs_cache:
            self.enqueue(node_hash, node_name)

    def enqueue(self, node_hash: str, node_name: str, page_path: str = "/page/index.mu") -> None:
        """Queue *node_hash* for caching regardless of current state."""
        self._queue.put((node_hash, node_name, page_path))

    def clear_cache(self) -> None:
        """Wipe the entire cache directory."""
        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        print("[CacheManager] Cache cleared.")

    # -- search ------------------------------------------------------------- #

    def search(self, query: str, mode: str = "partial") -> List[Dict[str, Any]]:
        """
        Search cached pages for *query*.

        mode="partial"  -- case-insensitive substring match (default)
        mode="exact"    -- whole-word match (case-sensitive)

        Returns list of result dicts with node_hash, node_name, snippet, page_path.
        """
        if not query:
            return []

        import re

        results: List[Dict[str, Any]] = []
        limit = int(self.settings.get("search_limit", 50))
        query_lc = query.lower()

        for node_dir in self._iter_node_dirs():
            if len(results) >= limit:
                break

            node_name = _read_text(node_dir / "node_name.txt", "Unknown")
            cached_at_raw = _read_text(node_dir / "cached_at.txt", "")
            cached_at, cache_status = _parse_cache_time(cached_at_raw)

            for mu_file in _iter_mu_files(node_dir):
                if len(results) >= limit:
                    break
                try:
                    content = mu_file.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue

                content_lc = content.lower()
                node_name_lc = node_name.lower()

                if mode == "exact":
                    pattern = re.compile(rf"\b{re.escape(query)}\b")
                    hit = pattern.search(content) or pattern.search(node_name)
                else:
                    hit = query_lc in content_lc or query_lc in node_name_lc

                if not hit:
                    continue

                snippet = _extract_snippet(content, query)
                page_path = "/page/index.mu" if mu_file.name == "index.mu" else f"/page/{mu_file.name}"

                results.append({
                    "node_hash": node_dir.name,
                    "node_name": node_name,
                    "snippet": snippet,
                    "url": f"{node_dir.name}:{page_path}",
                    "page_name": mu_file.name,
                    "page_path": page_path,
                    "cached_at": cached_at,
                    "cache_status": cache_status,
                })

        return results

    # -- maintenance -------------------------------------------------------- #

    def enforce_size_limit(self) -> None:
        """Remove oldest entries if total cache exceeds size_limit_mb."""
        limit_mb = int(self.settings.get("size_limit_mb", -1))
        if limit_mb <= 0 or not self.cache_dir.exists():
            return

        entries = []
        total = 0
        for node_dir in self._iter_node_dirs():
            size = sum(f.stat().st_size for f in node_dir.rglob("*") if f.is_file())
            total += size
            ts_raw = _read_text(node_dir / "cached_at.txt", "")
            try:
                ts = datetime.fromisoformat(ts_raw.strip())
            except Exception:
                ts = datetime.now()
            entries.append({"path": node_dir, "size": size, "time": ts})

        limit_bytes = limit_mb * 1024 * 1024
        if total <= limit_bytes:
            return

        entries.sort(key=lambda e: e["time"])
        print(f"[CacheManager] Size {total // (1024*1024)}MB > limit {limit_mb}MB, pruning...")
        for e in entries:
            if total <= limit_bytes:
                break
            try:
                shutil.rmtree(e["path"])
                total -= e["size"]
                print(f"[CacheManager] Removed {e['path'].name}")
            except Exception as exc:
                print(f"[CacheManager] Remove error: {exc}")

    def cleanup_expired(self) -> None:
        """Remove entries older than expiry_days."""
        expiry = int(self.settings.get("expiry_days", -1))
        if expiry <= 0 or not self.cache_dir.exists():
            return

        cutoff = datetime.now() - timedelta(days=expiry)
        removed = 0
        for node_dir in self._iter_node_dirs():
            ts_raw = _read_text(node_dir / "cached_at.txt", "")
            if not ts_raw:
                continue
            try:
                ts = datetime.fromisoformat(ts_raw.strip())
            except Exception:
                continue
            if ts < cutoff:
                try:
                    shutil.rmtree(node_dir)
                    removed += 1
                except Exception as exc:
                    print(f"[CacheManager] Expiry remove error: {exc}")
        if removed:
            print(f"[CacheManager] Removed {removed} expired entries.")

    # -- internal ----------------------------------------------------------- #

    def _cache_worker(self) -> None:
        while True:
            try:
                node_hash, node_name, page_path = self._queue.get(timeout=5)
                self._cache_page(node_hash, node_name, page_path)
                self._queue.task_done()
            except queue.Empty:
                continue
            except Exception as exc:
                print(f"[CacheManager] Worker error: {exc}")

    def _cache_page(self, node_hash: str, node_name: str, page_path: str) -> None:
        print(f"[CacheManager] Caching {node_name} ({node_hash[:16]}...) {page_path}")
        response = self.browser.fetch_page(node_hash, page_path)

        if response["status"] != "success" or not response.get("content", "").strip():
            print(f"[CacheManager] Fetch failed for {node_name}: {response.get('error', 'empty')}")
            return

        node_dir = self.cache_dir / node_hash
        node_dir.mkdir(parents=True, exist_ok=True)

        content = response["content"]
        try:
            (node_dir / "index.mu").write_text(content, encoding="utf-8")
            (node_dir / "node_name.txt").write_text(node_name, encoding="utf-8")
            (node_dir / "cached_at.txt").write_text(datetime.now().isoformat(), encoding="utf-8")
        except UnicodeEncodeError:
            safe = content.encode("utf-8", errors="replace").decode("utf-8")
            safe_name = node_name.encode("utf-8", errors="replace").decode("utf-8")
            (node_dir / "index.mu").write_text(safe, encoding="utf-8")
            (node_dir / "node_name.txt").write_text(safe_name, encoding="utf-8")
            (node_dir / "cached_at.txt").write_text(datetime.now().isoformat(), encoding="utf-8")

        print(f"[CacheManager] Cached {node_name} ({len(content)} chars)")
        self.enforce_size_limit()
        self.cleanup_expired()

    def _iter_node_dirs(self) -> Iterable[Path]:
        if not self.cache_dir.exists():
            return []
        return (d for d in self.cache_dir.iterdir() if d.is_dir())


# --------------------------------------------------------------------------- #
# Helpers                                                                       #
# --------------------------------------------------------------------------- #

def _read_text(path: Path, default: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return default


def _parse_cache_time(raw: str) -> Tuple[str, str]:
    """Return (formatted_timestamp, cache_status_label) from an ISO string."""
    try:
        ts = datetime.fromisoformat(raw.strip())
        age_seconds = (datetime.now() - ts).total_seconds()
        label = _cache_status(age_seconds)
        return ts.strftime("%Y-%m-%d %H:%M:%S"), label
    except Exception:
        return "Unknown", "unknown"


def _cache_status(age_seconds: float) -> str:
    days = age_seconds / 86400
    if days <= 3:
        return "fresh"
    if days <= 10:
        return "good"
    if days <= 20:
        return "moderate"
    return "old"


def _iter_mu_files(node_dir: Path) -> Iterable[Path]:
    """Yield index.mu first, then any pages/ subdirectory .mu files."""
    index = node_dir / "index.mu"
    if index.exists():
        yield index
    pages_dir = node_dir / "pages"
    if pages_dir.exists():
        yield from pages_dir.glob("*.mu")


def _extract_snippet(content: str, query: str, context: int = 150) -> str:
    """Return a short snippet of *content* around the first occurrence of *query*."""
    import re

    pos = content.lower().find(query.lower())
    if pos == -1:
        raw = content[:context]
        return (raw + "...") if len(content) > context else raw

    start = max(0, pos - context // 2)
    end = min(len(content), pos + len(query) + context // 2)
    snippet = content[start:end]

    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(content) else ""
    snippet = prefix + snippet + suffix

    highlighted = re.sub(f"({re.escape(query)})", r"<mark>\1</mark>", snippet, flags=re.IGNORECASE)
    return highlighted
