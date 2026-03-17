"""Flask app factory for Nomad Browser."""

import os
from flask import Flask, render_template

from . import identity as id_manager


def create_app(data_dir=None):
    """Create and configure the Flask application.

    Args:
        data_dir: Path to data directory for RNS identity storage.
                  Defaults to ~/.nomad-browser

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

    # Initialize RNS identity (must run first so Reticulum is ready)
    id_manager.init(data_dir)

    # Initialize LXMF messenger (shares the same RNS identity)
    from .messenger import Messenger
    from .routes_chat import register_chat_routes
    messenger = Messenger(data_dir)
    register_chat_routes(app, messenger)

    # Initialize page browser + cache
    from .browser import Browser
    from .cache import CacheManager
    from .routes_pages import register_page_routes
    browser = Browser(data_dir)
    browser.cache = CacheManager(browser, data_dir)
    register_page_routes(app, browser)

    # Register base routes
    @app.route("/")
    def index():
        ident = id_manager.get_identity()
        identity_hex = RNS_hash_str(ident) if ident else "unknown"
        return render_template("index.html", identity=identity_hex)

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
