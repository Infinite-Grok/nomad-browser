"""
NomadNet browser core for Nomad Browser.

Provides page fetching, node discovery via announce handling, and link caching.
Uses the shared identity from identity.py rather than managing its own RNS instance.
"""

from __future__ import annotations

import sys, io, threading, time
from datetime import datetime
from typing import Any, Dict, Optional

# Fix Windows cp1252 encoding crashes from mesh node names with emoji/unicode
if sys.platform == "win32" and not isinstance(sys.stdout, io.TextIOWrapper):
    pass  # already wrapped
elif sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import RNS
import RNS.vendor.umsgpack as msgpack

from . import identity as id_manager


# --------------------------------------------------------------------------- #
# Low-level RNS helpers                                                        #
# --------------------------------------------------------------------------- #

def _clean_hash(destination_hash: str) -> bytes:
    """Convert a NomadNet destination hash string to raw bytes."""
    stripped = destination_hash.replace("<", "").replace(">", "").replace(":", "")
    return bytes.fromhex(stripped)


def _wait_for_path(destination_hash: bytes, timeout: float = 30) -> bool:
    """
    Block until Reticulum has a path to *destination_hash* or *timeout* expires.

    Returns True if a path is available, False on timeout.
    """
    if RNS.Transport.has_path(destination_hash):
        return True

    RNS.Transport.request_path(destination_hash)
    deadline = time.time() + timeout

    while not RNS.Transport.has_path(destination_hash):
        if time.time() > deadline:
            return False
        time.sleep(0.1)

    return True


def _recall_destination(destination_hash: bytes) -> Optional[RNS.Identity]:
    """Recall an RNS identity for the given destination hash, or None."""
    identity = RNS.Identity.recall(destination_hash)
    if not identity:
        print(
            f"[NomadBrowser] Could not recall identity for "
            f"{RNS.prettyhexrep(destination_hash)[:16]}..."
        )
    return identity


# --------------------------------------------------------------------------- #
# PageFetcher                                                                   #
# --------------------------------------------------------------------------- #

class PageFetcher:
    """
    Short-lived object that establishes an RNS link and fetches a .mu page.

    Create one per request (or reuse a cached link via Browser.fetch_page).
    """

    def __init__(self, destination_hash: str) -> None:
        self.destination_hash = _clean_hash(destination_hash)
        self.link: Optional[RNS.Link] = None

        self._result_data: Any = None
        self._result_received = False
        self._response_event = threading.Event()
        self._page_path = "/page/index.mu"

    def fetch(self, page_path: str = "/page/index.mu", timeout: float = 30) -> Dict[str, Any]:
        """Fetch *page_path* from the remote node.

        Returns a dict with keys: status ("success" | "error"), content, error.
        """
        try:
            pretty = RNS.prettyhexrep(self.destination_hash)[:16]
            print(f"[PageFetcher] Checking path to {pretty}...")

            if not _wait_for_path(self.destination_hash, timeout=timeout):
                return {"status": "error", "error": "No path to destination", "content": ""}

            identity = _recall_destination(self.destination_hash)
            if not identity:
                return {"status": "error", "error": "Could not recall identity", "content": ""}

            destination = RNS.Destination(
                identity,
                RNS.Destination.OUT,
                RNS.Destination.SINGLE,
                "nomadnetwork",
                "node",
            )

            self._page_path = page_path
            self._result_data = None
            self._result_received = False
            self._response_event.clear()

            self.link = RNS.Link(destination)
            self.link.set_link_established_callback(self._on_link_established)

            print(f"[PageFetcher] Waiting for link to {pretty}...")
            success = self._response_event.wait(timeout=timeout)

            if success and self._result_received:
                return {
                    "status": "success",
                    "content": self._result_data or "",
                    "error": None,
                }

            return {"status": "error", "error": "Timeout", "content": ""}

        except Exception as exc:
            print(f"[PageFetcher] Exception: {exc}")
            return {"status": "error", "error": str(exc), "content": ""}

    def fetch_via_link(self, link: RNS.Link, page_path: str, timeout: float = 30) -> Dict[str, Any]:
        """Request a page over an already-established *link*."""
        result: Dict[str, Any] = {"data": None, "received": False}
        event = threading.Event()

        def on_response(receipt):
            try:
                data = receipt.response
                if isinstance(data, bytes):
                    result["data"] = data.decode("utf-8")
                elif data:
                    result["data"] = str(data)
                else:
                    result["data"] = ""
            except Exception as exc:
                result["data"] = f"Response error: {exc}"
            result["received"] = True
            event.set()

        def on_failed(_receipt):
            result["data"] = ""
            result["received"] = True
            event.set()

        link.request(page_path, data=None, response_callback=on_response, failed_callback=on_failed)

        if event.wait(timeout=timeout) and result["received"]:
            return {"status": "success", "content": result["data"] or "", "error": None}

        return {"status": "error", "error": "Timeout on cached link", "content": ""}

    # -- callbacks ---------------------------------------------------------- #

    def _on_link_established(self, link: RNS.Link) -> None:
        try:
            print(f"[PageFetcher] Link established, requesting {self._page_path}")
            link.request(
                self._page_path,
                data=None,
                response_callback=self._on_response,
                failed_callback=self._on_failed,
            )
        except Exception as exc:
            print(f"[PageFetcher] Request error: {exc}")
            self._result_data = ""
            self._result_received = True
            self._response_event.set()

    def _on_response(self, receipt: RNS.RequestReceipt) -> None:
        try:
            data = receipt.response
            if isinstance(data, bytes):
                self._result_data = data.decode("utf-8")
            elif data:
                self._result_data = str(data)
            else:
                self._result_data = ""
            print(f"[PageFetcher] Received {len(self._result_data)} chars")
        except Exception as exc:
            print(f"[PageFetcher] Response decode error: {exc}")
            self._result_data = ""
        self._result_received = True
        self._response_event.set()

    def _on_failed(self, _receipt: RNS.RequestReceipt) -> None:
        print("[PageFetcher] Request failed")
        self._result_data = ""
        self._result_received = True
        self._response_event.set()


# --------------------------------------------------------------------------- #
# AnnounceHandler                                                               #
# --------------------------------------------------------------------------- #

class AnnounceHandler:
    """
    Reticulum announce handler that listens for nomadnetwork.node announces
    and forwards them to the Browser instance.
    """

    aspect_filter = "nomadnetwork.node"

    def __init__(self, browser: "Browser") -> None:
        self._browser = browser

    def received_announce(
        self,
        destination_hash: bytes,
        announced_identity: RNS.Identity,
        app_data: Optional[bytes],
    ) -> None:
        self._browser._process_announce(destination_hash, announced_identity, app_data)


# --------------------------------------------------------------------------- #
# Browser                                                                       #
# --------------------------------------------------------------------------- #

class Browser:
    """
    Main controller for Nomad Browser runtime state.

    Tracks discovered nodes, manages cached RNS links, and exposes
    fetch_page() used by the API routes.
    """

    def __init__(self, data_dir: str) -> None:
        self.data_dir = data_dir
        self.start_time = time.time()

        # Node registry: keyed by pretty-hex hash string
        self.nodes: Dict[str, Dict[str, Any]] = {}

        # Cached active links: keyed by raw destination hash bytes
        self._cached_links: Dict[bytes, RNS.Link] = {}
        self._link_lock = threading.Lock()

        # Connection state
        self.connection_state = "connecting"
        self.reticulum_ready = False
        self.announce_count = 0
        self.last_announce_time: Optional[float] = None

        # Status cache (avoid hammering callers)
        self._status_cache: Optional[Dict[str, Any]] = None
        self._status_cache_ts: Optional[float] = None
        self._status_lock = threading.Lock()
        self._status_ttl = 1.0

        # Cache manager (set by create_app after construction)
        self.cache = None

        self._init()

    def _init(self) -> None:
        """Register the announce handler against the shared Reticulum instance."""
        try:
            # identity.py already called RNS.Reticulum() in its init()
            self._announce_handler = AnnounceHandler(self)
            RNS.Transport.register_announce_handler(self._announce_handler)
            self.reticulum_ready = True
            self.connection_state = "connected"

            ident = id_manager.get_identity()
            if ident:
                print(
                    f"[Browser] Ready. Identity: {RNS.prettyhexrep(ident.hash)}"
                )
            else:
                print("[Browser] Ready (no identity).")
        except Exception as exc:
            self.reticulum_ready = False
            self.connection_state = "failed"
            print(f"[Browser] Failed to register announce handler: {exc}")

    # -- node tracking ------------------------------------------------------ #

    def _process_announce(
        self,
        destination_hash: bytes,
        announced_identity: RNS.Identity,
        app_data: Optional[bytes],
    ) -> None:
        """Handle an incoming nomadnetwork.node announce."""
        self.announce_count += 1
        self.last_announce_time = time.time()

        pretty = RNS.prettyhexrep(destination_hash)
        clean = pretty.replace("<", "").replace(">", "").replace(":", "")
        node_name = self._decode_node_name(app_data, clean)

        # Filter obviously junk nodes
        if node_name.startswith(("EmptyNode_", "BinaryNode_")) or node_name == "UNKNOWN":
            return

        entry = self.nodes.setdefault(
            pretty,
            {
                "hash": clean,
                "name": node_name,
                "last_seen": datetime.now().isoformat(),
                "announce_count": 0,
                "last_seen_relative": "Just now",
            },
        )
        entry["announce_count"] += 1
        entry["name"] = node_name
        entry["last_seen"] = datetime.now().isoformat()
        entry["last_seen_relative"] = "Just now"

        if self.connection_state == "connected":
            self.connection_state = "active"

        try:
            print(f"[Browser] Announce #{self.announce_count}: {clean[:16]}... -> {node_name}")
        except UnicodeEncodeError:
            safe_name = node_name.encode('ascii', 'replace').decode('ascii')
            print(f"[Browser] Announce #{self.announce_count}: {clean[:16]}... -> {safe_name}")

        # Kick off caching if a CacheManager is attached
        if self.cache is not None:
            self.cache.schedule_node(clean, node_name)

    @staticmethod
    def _decode_node_name(app_data: Optional[bytes], hash_str: str) -> str:
        if not app_data:
            return f"EmptyNode_{hash_str[:8]}"
        try:
            return app_data.decode("utf-8").strip()
        except Exception:
            pass
        try:
            decoded = msgpack.unpackb(app_data)
            if isinstance(decoded, str):
                return decoded
            return f"Node_{hash_str[:8]}"
        except Exception:
            return f"BinaryNode_{hash_str[:8]}"

    def get_nodes(self) -> list:
        """Return node list with up-to-date relative timestamps."""
        now = datetime.now()
        for entry in self.nodes.values():
            try:
                diff = (now - datetime.fromisoformat(entry["last_seen"])).total_seconds()
            except Exception:
                diff = 0
            if diff < 60:
                entry["last_seen_relative"] = "Just now"
            elif diff < 3600:
                entry["last_seen_relative"] = f"{int(diff / 60)}m ago"
            else:
                entry["last_seen_relative"] = f"{int(diff / 3600)}h ago"
        return list(self.nodes.values())

    def get_node_hops(self, destination_hash: str) -> Dict[str, Any]:
        """Return hop count and next-hop interface for a node hash."""
        try:
            dest_bytes = _clean_hash(destination_hash) if isinstance(destination_hash, str) else destination_hash
            hops = RNS.Transport.hops_to(dest_bytes)

            try:
                next_hop_bytes = RNS.Transport.next_hop(dest_bytes)
                if next_hop_bytes:
                    iface = RNS.Transport.next_hop_interface(dest_bytes)
                    next_hop = f"via {iface.name}" if iface and hasattr(iface, "name") else f"via {RNS.prettyhexrep(next_hop_bytes)[:16]}..."
                else:
                    next_hop = "Unknown"
            except Exception:
                next_hop = "Unknown"

            return {"hops": hops if hops is not None else "Unknown", "next_hop_interface": next_hop}
        except Exception as exc:
            print(f"[Browser] hops error for {destination_hash}: {exc}")
            return {"hops": "Unknown", "next_hop_interface": "Unknown"}

    # -- page fetching ------------------------------------------------------ #

    def fetch_page(self, node_hash: str, page_path: str = "/page/index.mu") -> Dict[str, Any]:
        """
        Fetch *page_path* from the node at *node_hash*.

        Reuses a cached active link when available, otherwise creates a new one.
        """
        try:
            dest_bytes = _clean_hash(node_hash)

            with self._link_lock:
                cached = self._cached_links.get(dest_bytes)

            if cached and cached.status == RNS.Link.ACTIVE:
                print(f"[Browser] Reusing cached link for {node_hash[:16]}...")
                fetcher = PageFetcher(node_hash)
                return fetcher.fetch_via_link(cached, page_path)

            print(f"[Browser] New link for {node_hash[:16]}... path={page_path}")
            fetcher = PageFetcher(node_hash)
            response = fetcher.fetch(page_path)

            if response["status"] == "success" and fetcher.link is not None:
                with self._link_lock:
                    self._cached_links[dest_bytes] = fetcher.link

            return response

        except Exception as exc:
            print(f"[Browser] fetch_page error: {exc}")
            return {"status": "error", "error": str(exc), "content": ""}

    # -- status ------------------------------------------------------------- #

    def get_status(self) -> Dict[str, Any]:
        """Return connection status dict (cached for 1 s)."""
        with self._status_lock:
            now = time.time()
            if (
                self._status_cache is not None
                and self._status_cache_ts is not None
                and now - self._status_cache_ts < self._status_ttl
            ):
                return self._status_cache

            uptime = now - self.start_time
            self._status_cache = {
                "connection_state": self.connection_state,
                "reticulum_ready": self.reticulum_ready,
                "node_count": len(self.nodes),
                "announce_count": self.announce_count,
                "uptime": uptime,
                "has_nodes": bool(self.nodes),
                "time_since_last_announce": (now - self.last_announce_time) if self.last_announce_time else None,
            }
            self._status_cache_ts = now
            return self._status_cache
