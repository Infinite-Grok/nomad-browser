"""Entry point for Nomad Browser.

Default: launches as a standalone desktop app (native window).
Use --web to run as a web server instead (open localhost in your browser).
"""

import argparse
import threading


def main():
    parser = argparse.ArgumentParser(
        description="Nomad Browser — unified Reticulum mesh network client"
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host address to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="Port number to listen on (default: 5000)",
    )
    parser.add_argument(
        "--data-dir",
        default=None,
        help="Data directory for RNS identity and storage (default: ~/.nomad-browser)",
    )
    parser.add_argument(
        "--local-peer",
        action="append",
        metavar="ADDRESS=URL",
        help="Register a local peer for direct HTTP delivery (e.g. abc123=http://localhost:5001). Repeatable.",
    )
    parser.add_argument(
        "--no-rns",
        action="store_true",
        help="Skip Reticulum/LXMF init (game-only mode for testing)",
    )
    parser.add_argument(
        "--web",
        action="store_true",
        help="Run as web server only (don't open native window)",
    )

    args = parser.parse_args()

    from nomad_browser.app import create_app, start_server
    app = create_app(data_dir=args.data_dir, local_peers=args.local_peer, skip_rns=args.no_rns)

    if args.web:
        # Web mode: just start the server, user opens their own browser
        start_server(app, host=args.host, port=args.port)
    else:
        # Standalone mode: start server in background, open native window
        _launch_standalone(app, args.host, args.port)


def _launch_standalone(app, host, port):
    """Launch Nomad Browser as a standalone desktop application."""
    try:
        import webview
    except ImportError:
        print("[NomadBrowser] pywebview not installed. Install it with:")
        print("  pip install pywebview")
        print("")
        print("Falling back to web server mode...")
        from nomad_browser.app import start_server
        start_server(app, host=host, port=port)
        return

    # Start Flask in a background thread
    server_thread = threading.Thread(
        target=_run_flask_quiet,
        args=(app, host, port),
        daemon=True,
    )
    server_thread.start()

    # Give the server a moment to start
    import time
    time.sleep(1)

    url = f"http://{host}:{port}"
    print(f"[NomadBrowser] Starting standalone app at {url}")

    # Create native window
    webview.create_window(
        "Nomad Browser",
        url,
        width=1280,
        height=800,
        min_size=(800, 500),
        text_select=True,
    )
    webview.start()


def _run_flask_quiet(app, host, port):
    """Run Flask/Waitress in a thread without blocking."""
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8, _quiet=True)
    except ImportError:
        import logging
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)
        app.run(host=host, port=port, use_reloader=False)


if __name__ == "__main__":
    main()
