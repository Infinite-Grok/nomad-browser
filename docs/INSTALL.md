# Installation Guide

```
     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     Getting on the mesh.
       ':::::::::'
        ':::::::'        No accounts. No servers.
         ':::::'         Just you and your keys.
          ':::'
           ':'
            '
```

---

## Prerequisites

- **Python 3.8+** (3.10+ recommended)
- **pip** (comes with Python)
- A working TCP/IP stack (the mesh rides on top of it, or on LoRa, or on carrier pigeons — Reticulum doesn't care)

### Optional but recommended

- **rnsd** — the Reticulum Network Stack daemon. If you're already running NomadNet or Sideband, you have this. Running `rnsd` means all your Reticulum apps share one identity and one view of the network.

---

## Install

```bash
# Clone the repo
git clone https://github.com/Infinite-Grok/nomad-browser.git
cd nomad-browser

# Install Python dependencies
pip install -r requirements.txt
```

That installs:
- `rns` (Reticulum Network Stack)
- `lxmf` (Lightweight Extensible Message Format)
- `flask` (web framework)
- `waitress` (production WSGI server)

### Verify the install

```bash
python -c "import RNS; print('RNS', RNS.__version__)"
python -c "import LXMF; print('LXMF OK')"
python -c "import flask; print('Flask', flask.__version__)"
```

All three should print without errors.

---

## Running

### Option 1: With rnsd (recommended)

If you're already running `rnsd`, NomadNet, or Sideband, Nomad Browser will connect to the shared Reticulum instance automatically. This is the recommended setup — your browser sees the same nodes, the same announces, and shares your existing identity.

```bash
# Make sure rnsd is running (in another terminal or as a service)
rnsd

# Start Nomad Browser
python run.py
```

Open `http://127.0.0.1:5000` in your browser.

### Option 2: Standalone

If no shared Reticulum instance is running, Nomad Browser creates its own. This works fine but means it won't share network state with NomadNet or Sideband.

```bash
python run.py
```

Same result, just isolated. The browser creates its own RNS transport instance.

### Option 3: Game-only mode (no Reticulum)

Don't have Reticulum installed? Just want to poke around the UI and game layer?

```bash
python run.py --no-rns
```

This skips all Reticulum and LXMF initialization. Page browsing and chat won't work, but the game engine, inventory, loot scanning, and the full UI are functional. Good for development and testing.

---

## First-Time Setup

On first run, Nomad Browser:

1. Creates `~/.nomad-browser/` (your data directory)
2. Generates a new RNS identity keypair at `~/.nomad-browser/identity`
3. Registers an LXMF delivery identity for messaging
4. Starts listening for node announces

**Your identity file is your key to everything.** Back it up. Lose it and you lose your LXMF address, your inventory, your game identity. There's no recovery. This is the mesh.

```
~/.nomad-browser/
  identity              <- your RNS keypair (BACK THIS UP)
  settings.json         <- favorites, contacts, cache settings
  conversations/        <- stored LXMF conversations
  lxmf_storage/         <- LXMF router data
  cache/nodes/          <- cached page content
  game/
    identity.json       <- game display name + class
    inventory.json      <- your items
    claims/             <- claim records
    loot_catalog/       <- item definitions
```

### Custom data directory

```bash
python run.py --data-dir /path/to/your/data
```

Useful if you want to run multiple instances with separate identities.

---

## Command-Line Options

```
python run.py [OPTIONS]

  --host HOST          Bind address (default: 127.0.0.1)
  --port PORT          Port number (default: 5000)
  --data-dir DIR       Data directory (default: ~/.nomad-browser)
  --local-peer ADDR=URL  Register a local peer for HTTP delivery (repeatable)
  --no-rns             Skip Reticulum/LXMF init (game-only mode)
```

Examples:

```bash
# Bind to all interfaces on port 8080
python run.py --host 0.0.0.0 --port 8080

# Use a custom data directory
python run.py --data-dir ~/my-nomad-data

# Connect two local instances for chat testing
python run.py --port 5000 --local-peer abc123def456=http://localhost:5001
python run.py --port 5001 --local-peer 789abc012def=http://localhost:5000 --data-dir ~/.nomad-browser-2
```

---

## Troubleshooting

### Port already in use

```
OSError: [Errno 98] Address already in use
```

Another process is on port 5000. Either kill it or use a different port:

```bash
python run.py --port 5001
```

### RNS initialization hangs

If the browser hangs on startup, Reticulum is likely waiting for a network interface. Check your RNS config:

```bash
cat ~/.reticulum/config
```

If you have TCP peers configured that are unreachable, RNS will block trying to connect. Comment them out or ensure they're reachable.

### Multicast errors on startup

```
OSError: [Errno 101] Network is unreachable (multicast)
```

Reticulum uses multicast for local discovery by default. If you're on a network that blocks multicast (some VPNs, Docker networks), add this to `~/.reticulum/config`:

```
[interfaces]
  [[Default Interface]]
    type = AutoInterface
    enabled = false
```

Then configure an explicit TCP interface instead.

### TCP peer timeouts

If you have a TCP peer defined in `~/.reticulum/config` and it's not reachable:

```
[interfaces]
  [[My TCP Peer]]
    type = TCPClientInterface
    enabled = true
    target_host = some.host.example
    target_port = 4242
```

RNS will retry in the background but may be slow to initialize. Disable unreachable peers or set `enabled = false` until they're available.

### No nodes appearing

After startup, it takes time for announces to arrive. On a fresh install with no peers configured, you may not see any nodes. To connect to the wider Reticulum testnet:

```
[interfaces]
  [[RNS Testnet]]
    type = TCPClientInterface
    enabled = true
    target_host = reticulum.network
    target_port = 7822
```

Add that to `~/.reticulum/config` and restart `rnsd` or the browser.

### Windows: encoding crashes

If you see `UnicodeEncodeError` in the console from node names with emoji/unicode, this is a known Windows console issue. Nomad Browser patches `sys.stdout` to handle it, but if you're running in a terminal that doesn't support UTF-8:

```bash
# Set console to UTF-8 before running
chcp 65001
python run.py
```

Or use Windows Terminal (default on Windows 11) which handles UTF-8 natively.

### Windows: MINGW path mangling

If you're running in Git Bash (MINGW) and paths like `/page/index.mu` get mangled to `C:/Program Files/Git/page/index.mu`:

```bash
# Prefix commands with MSYS_NO_PATHCONV=1
MSYS_NO_PATHCONV=1 python run.py
```

Or set it globally:

```bash
export MSYS_NO_PATHCONV=1
```

### macOS: Python version

macOS ships with Python 3 on recent versions. Use `python3` and `pip3` if `python` points to Python 2:

```bash
python3 run.py
pip3 install -r requirements.txt
```

---

## Updating

```bash
cd nomad-browser
git pull
pip install -r requirements.txt
```

Your data in `~/.nomad-browser/` is preserved across updates.

---

## Reticulum Documentation

- Reticulum: https://reticulum.network/
- RNS Manual: https://markqvist.github.io/Reticulum/manual/
- LXMF: https://github.com/markqvist/LXMF
- NomadNet: https://github.com/markqvist/NomadNet
