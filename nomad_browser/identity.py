"""RNS identity manager for Nomad Browser."""

import os
import RNS

_reticulum = None
_identity = None


def init(data_dir=None):
    """Initialize Reticulum and load or create identity.

    Args:
        data_dir: Path to data directory. Defaults to ~/.nomad-browser
    """
    global _reticulum, _identity

    if data_dir is None:
        data_dir = os.path.expanduser("~/.nomad-browser")

    os.makedirs(data_dir, exist_ok=True)

    # Start Reticulum
    _reticulum = RNS.Reticulum()

    # Load or create identity
    id_path = os.path.join(data_dir, "identity")
    if os.path.exists(id_path):
        _identity = RNS.Identity.from_file(id_path)
        RNS.log(f"[NomadBrowser] Loaded identity from {id_path}")
    else:
        _identity = RNS.Identity()
        _identity.to_file(id_path)
        RNS.log(f"[NomadBrowser] Created new identity, saved to {id_path}")

    return _identity


def get_identity():
    """Return the shared RNS identity."""
    return _identity


def get_reticulum():
    """Return the Reticulum instance."""
    return _reticulum
