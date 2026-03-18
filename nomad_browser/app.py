"""Flask app factory for Nomad Browser."""

import os
from flask import Flask, render_template

from . import identity as id_manager


def create_app(data_dir=None, local_peers=None, skip_rns=False):
    """Create and configure the Flask application.

    Args:
        data_dir: Path to data directory for RNS identity storage.
                  Defaults to ~/.nomad-browser
        local_peers: List of "address=url" strings for direct HTTP delivery.
        skip_rns: If True, skip all Reticulum/LXMF initialization (for testing).

    Returns:
        Configured Flask app instance.
    """
    if data_dir is None:
        data_dir = os.path.expanduser("~/.nomad-browser")

    # Paths relative to the nomad_browser package directory
    package_dir = os.path.dirname(os.path.abspath(__file__))
    static_folder = os.path.join(package_dir, "..", "static")
    template_folder = os.path.join(package_dir, "..", "templates")

    app = Flask(
        __name__,
        static_folder=os.path.normpath(static_folder),
        template_folder=os.path.normpath(template_folder),
    )

    if skip_rns:
        # Test mode — no Reticulum, no LXMF, no Browser, no CacheManager
        rns_address = "test_address_000000"

        @app.route("/")
        def index():
            return render_template("index.html", identity=rns_address)

    else:
        # Initialize RNS identity (must run first so Reticulum is ready)
        id_manager.init(data_dir)

        # Initialize LXMF messenger (shares the same RNS identity)
        from .messenger import Messenger
        from .routes_chat import register_chat_routes
        messenger = Messenger(data_dir)

        # Register local peers for HTTP-bridged delivery (testing)
        if local_peers:
            for peer_spec in local_peers:
                # Format: "hexaddress=http://host:port"
                addr, url = peer_spec.split("=", 1)
                messenger.local_peers[addr] = url
                print(f"[NomadBrowser] Local peer: {addr[:16]}... -> {url}")

        register_chat_routes(app, messenger)

        # Initialize page browser + cache
        from .browser import Browser
        from .cache import CacheManager
        from .routes_pages import register_page_routes
        browser = Browser(data_dir)
        browser.cache = CacheManager(browser, data_dir)
        register_page_routes(app, browser)

        ident = id_manager.get_identity()
        rns_address = RNS_hash_str(ident) if ident else "unknown"

        @app.route("/")
        def index():
            return render_template("index.html", identity=rns_address)

    # Initialize GameEngine (both modes)
    from .game import GameEngine
    from .routes_game import game_bp
    game_engine = GameEngine(data_dir, rns_address)
    app.config["game_engine"] = game_engine
    app.register_blueprint(game_bp)

    return app


def RNS_hash_str(identity):
    """Return the hex hash string for an RNS identity."""
    try:
        import RNS
        return RNS.prettyhexrep(identity.hash)
    except Exception:
        return "unknown"


def start_server(app, host="127.0.0.1", port=5000):
    """Start the web server.

    Tries Waitress first (production-grade, 8 threads).
    Falls back to Flask development server if Waitress is unavailable.

    Args:
        app: Flask application instance.
        host: Host address to bind to.
        port: Port number to listen on.
    """
    try:
        from waitress import serve
        print(f"[NomadBrowser] Starting Waitress server on http://{host}:{port}")
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        print("[NomadBrowser] Waitress not available, falling back to Flask dev server")
        print(f"[NomadBrowser] Starting Flask dev server on http://{host}:{port}")
        app.run(host=host, port=port)
