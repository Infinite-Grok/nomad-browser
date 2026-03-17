"""Entry point for Nomad Browser."""

import argparse
from nomad_browser.app import create_app, start_server


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

    args = parser.parse_args()

    app = create_app(data_dir=args.data_dir)
    start_server(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
