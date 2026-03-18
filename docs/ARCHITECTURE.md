# Architecture

```
     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     How the pieces fit.
       ':::::::::'
        ':::::::'
         ':::::'
          ':::'
           ':'
            '
```

---

## System Overview

Nomad Browser is a **Flask backend + vanilla JS frontend** with no build step, no npm, no frameworks. The backend handles Reticulum networking, LXMF messaging, and game logic. The frontend renders pages, manages the UI, and calls the API.

```
+------------------+       HTTP/JSON       +------------------+
|                  | <-------------------> |                  |
|   Browser Tab    |                       |   Flask Server   |
|   (vanilla JS)   |                       |   (Python)       |
|                  |                       |                  |
|  app.js          |                       |  app.py          |
|  browser.js      |                       |  browser.py --+  |
|  chat.js         |                       |  messenger.py |  |
|  contacts.js     |                       |  identity.py  |  |
|  drawer.js       |                       |  cache.py     |  |
|  game-engine.js  |                       |  routes_*.py  |  |
|  loot-overlay.js |                       |  game/        |  |
|  inventory-panel |                       |    engine.py  |  |
|  micron.js       |                       |    claims.py  |  |
|  purify.min.js   |                       |    inventory  |  |
|                  |                       |    scanner    |  |
+------------------+                       |    library    |  |
                                           |    identity   |  |
                                           +-------+------+  |
                                                   |         |
                                           +-------v------+  |
                                           |  Reticulum   |  |
                                           |  (RNS)       |  |
                                           |  + LXMF      |  |
                                           +--------------+  |
                                                   |         |
                                           ~~~~~~~~|~~~~~~~~~|
                                              The Mesh       |
                                           (TCP/LoRa/etc)    |
                                                             |
                                           +--------------+  |
                                           | ~/.nomad-    |<-+
                                           |   browser/   |
                                           | (local disk) |
                                           +--------------+
```

---

## Backend Modules

### `app.py` — Flask app factory

Creates and configures the Flask application. Two modes:

1. **Normal mode:** Initializes RNS identity, LXMF messenger, page browser, cache manager, and game engine. Registers all route blueprints.
2. **`--no-rns` mode:** Skips all Reticulum/LXMF initialization. Only the game engine and index route are active.

The server tries **Waitress** first (production WSGI, 8 threads). Falls back to Flask's development server if Waitress isn't installed.

### `identity.py` — RNS identity management

Manages the shared Reticulum identity. On init:

1. Creates `~/.nomad-browser/` if it doesn't exist
2. Starts `RNS.Reticulum()` (connects to `rnsd` if running, else creates standalone transport)
3. Loads identity from `~/.nomad-browser/identity` or generates a new keypair

All other modules access the identity via `identity.get_identity()`. There is exactly one Reticulum instance and one identity per process.

### `browser.py` — Page fetching and node discovery

Three components:

- **Browser** — main controller. Tracks discovered nodes, manages cached RNS links, provides `fetch_page()` for the API.
- **PageFetcher** — short-lived object per request. Resolves path, establishes link, requests page, returns content.
- **AnnounceHandler** — registered with RNS Transport. Listens for `nomadnetwork.node` announces and feeds them to Browser.

Link caching: after a successful page fetch, the RNS link is cached by destination hash. Subsequent requests to the same node reuse the active link, skipping path resolution and link establishment (significantly faster).

### `messenger.py` — LXMF messaging

Handles send/receive of LXMF messages:

- Registers an LXMF delivery identity with display name "Nomad Browser"
- Routes outgoing messages through LXMF (or HTTP bridge for local peers)
- Stores all messages to disk per-conversation
- Maintains an incoming message queue drained by `GET /api/chat/new`

Local peer support: for testing, you can register `--local-peer` addresses that bypass LXMF and use direct HTTP POST to the peer's `/api/chat/inject` endpoint.

### `cache.py` — Background page caching

A background worker thread that caches pages from announced nodes:

- When a node announces, `schedule_node()` checks if the cache is empty or stale
- Queues fetch jobs on a thread-safe queue
- Worker thread fetches pages and writes them to `~/.nomad-browser/cache/nodes/<hash>/`
- Enforces size limits (default 100MB) by pruning oldest entries
- Cleans up expired entries (default 30 days)
- Provides `search()` for full-text search across cached pages

### `routes_pages.py` — Page API routes

Registers: page fetch, node listing, status, connection status, cache search, favorites.

### `routes_chat.py` — Chat API routes

Registers: send message, get messages, poll new, list conversations, set name, clear conversation, identity, contacts CRUD, debug log, reset, inject.

### `routes_game.py` — Game API routes

Registers as a Flask Blueprint: game status, inventory, scan, claim, identity, catalog, catalog search.

---

## Frontend Modules

All vanilla JS. No transpilation. No bundling. Loaded as `<script>` tags in `templates/index.html`.

### `app.js` — Main controller

Initializes all modules, sets up panel resizing, wires keyboard shortcuts. The global `NomadBrowser` object provides cross-module coordination.

### `browser.js` — Page browser

Manages tabs, address bar, back/forward navigation, page fetching via API, and Micron rendering. When a page loads, it triggers the loot scanner.

### `chat.js` — Chat panel

Manages conversation tabs, message rendering, send/receive, polling for new messages, and the AI conversation context.

### `contacts.js` — Contacts drawer

CRUD for contacts via the contacts API. Search, add, remove, click-to-chat.

### `drawer.js` — Node drawer

Fetches and displays discovered nodes. Search, filter, click-to-navigate.

### `micron.js` — Micron renderer

Parses NomadNet's Micron markup format and renders it to HTML. Handles text formatting, links, headings, and layout.

### `game-engine.js` — Game controller

Lightweight frontend coordinator. Checks game status on init, provides game context for AI conversations.

### `loot-overlay.js` — Loot display and claiming

After a page loads, scans for loot via the API, renders drop indicators and claim buttons, handles claim flow with toast notifications.

### `inventory-panel.js` — Inventory display

Slide-out panel showing player identity and collected items. Refreshes from the API when toggled open or after a claim.

### `purify.min.js` — DOMPurify

XSS sanitization for rendered page content. All Micron-to-HTML output is sanitized before injection into the DOM.

---

## Game Engine Architecture

The game layer is a self-contained package under `nomad_browser/game/`:

```
game/
  __init__.py        <- exports GameEngine
  engine.py          <- orchestrator, wires subsystems
  identity.py        <- player identity (name, class, history)
  inventory.py       <- item collection, versioned, with provenance
  loot_scanner.py    <- page content parser, finds #!loot: tags
  loot_library.py    <- item catalog, definitions, search
  claims.py          <- claim validation, mode enforcement, persistence
```

### How subsystems connect

```
GameEngine
  |
  +-- GameIdentity     player name, class, RNS address link
  |
  +-- Inventory        items[], version counter, add/remove/get
  |
  +-- LootLibrary      catalog of item definitions, search
  |
  +-- LootScanner      stateless parser, scans content for tags
  |
  +-- ClaimProcessor   validates claims against mode rules
         |
         +-- uses Inventory (to add claimed items)
         +-- uses LootLibrary (to resolve item names/rarity)
         +-- uses claims/ dir (to persist claim records)
```

### Initialization

`GameEngine.__init__()`:
1. Creates `GameIdentity` (loads or creates `game/identity.json`)
2. Creates `Inventory` (loads or creates `game/inventory.json`)
3. Creates `LootLibrary` (reads `game/loot_catalog/`)
4. Creates `LootScanner` (stateless, no init)
5. Creates `ClaimProcessor` (creates `game/claims/` dir)
6. Loads seed catalog from `data/seed_catalog/` if the library is empty

The game engine works in both normal and `--no-rns` mode. It only needs a data directory and an address string.

---

## Data Flow Diagrams

### Page browsing flow

```
User enters address    Browser (JS)         Flask API            Browser.py         Reticulum
      |                    |                    |                    |                  |
      +---> address bar    |                    |                    |                  |
      |     submit ------->|                    |                    |                  |
      |                    +--- GET /api/pages  |                    |                  |
      |                    |    /fetch/<hash>-->|                    |                  |
      |                    |                    +--- fetch_page() -->|                  |
      |                    |                    |                    +-- wait_for_path ->|
      |                    |                    |                    |                  |
      |                    |                    |                    |<-- path found ----|
      |                    |                    |                    |                  |
      |                    |                    |                    +-- Link() -------->|
      |                    |                    |                    |                  |
      |                    |                    |                    |<-- link ready ----|
      |                    |                    |                    |                  |
      |                    |                    |                    +-- request page -->|
      |                    |                    |                    |                  |
      |                    |                    |                    |<-- page content --|
      |                    |                    |                    |                  |
      |                    |                    |<-- {content} ------|                  |
      |                    |<-- JSON response --|                    |                  |
      |                    |                    |                    |                  |
      |                    +--- render Micron   |                    |                  |
      |                    +--- DOMPurify       |                    |                  |
      |                    +--- scan for loot   |                    |                  |
      |<--- rendered page -|                    |                    |                  |
```

### Chat message flow

```
User types message     Chat (JS)            Flask API           Messenger.py        LXMF/RNS
      |                    |                    |                    |                  |
      +---> send click --->|                    |                    |                  |
      |                    +--- POST /api/chat  |                    |                  |
      |                    |    /send --------->|                    |                  |
      |                    |                    +--- send() -------->|                  |
      |                    |                    |                    +-- LXMessage() -->|
      |                    |                    |                    +-- store msg      |
      |                    |                    |<-- {message_id} ---|                  |
      |                    |<-- JSON response --|                    |                  |
      |                    |                    |                    |                  |
      |                    +--- poll new msgs   |                    |                  |
      |                    |    (interval) ---->|                    |                  |
      |                    |                    +--- get_new() ----->|                  |
      |                    |                    |                    +-- drain queue    |
      |                    |                    |<-- [] or [msgs] ---|                  |
      |                    |<-- JSON response --|                    |                  |
      |<--- new message ---|                    |                    |                  |
```

### Loot claim flow

```
Page loaded           LootOverlay (JS)     Flask API           GameEngine          ClaimProcessor
      |                    |                    |                    |                  |
      +--- page content -->|                    |                    |                  |
      |                    +--- POST /api/game  |                    |                  |
      |                    |    /scan --------->|                    |                  |
      |                    |                    +--- scan_page() -->|                  |
      |                    |                    |    (LootScanner)  |                  |
      |                    |                    |<-- drops[] -------|                  |
      |                    |<-- {drops} --------|                    |                  |
      |                    |                    |                    |                  |
      |                    +--- show indicators |                    |                  |
      |<--- loot banner ---|                    |                    |                  |
      |                    |                    |                    |                  |
User clicks Claim          |                    |                    |                  |
      +---> claim btn ---->|                    |                    |                  |
      |                    +--- POST /api/game  |                    |                  |
      |                    |    /claim -------->|                    |                  |
      |                    |                    +--- claim_drop() ->|                  |
      |                    |                    |                    +--- claim() ----->|
      |                    |                    |                    |                  |
      |                    |                    |                    |  check mode/state|
      |                    |                    |                    |  add to inventory|
      |                    |                    |                    |  save claim rec  |
      |                    |                    |                    |                  |
      |                    |                    |                    |<-- {claimed} ----|
      |                    |                    |<-- {item} ---------|                  |
      |                    |<-- JSON response --|                    |                  |
      |                    |                    |                    |                  |
      |                    +--- toast notify    |                    |                  |
      |                    +--- update indicator|                    |                  |
      |                    +--- refresh inv.    |                    |                  |
      |<--- "Claimed!" ----|                    |                    |                  |
```

---

## Storage

Everything is local. Nothing leaves your machine unless you explicitly send it.

```
~/.nomad-browser/
  |
  +-- identity                 RNS keypair (Ed25519). YOUR KEY. BACK IT UP.
  |
  +-- settings.json            Favorites, contacts, cache settings
  |
  +-- conversations/           LXMF message storage
  |     +-- <address>/
  |           +-- meta.json    Conversation name, last seen
  |           +-- messages.json  All messages in this conversation
  |
  +-- lxmf_storage/            LXMF router internal state
  |
  +-- cache/
  |     +-- nodes/
  |           +-- <hash>/
  |                 +-- index.mu       Cached page content
  |                 +-- node_name.txt  Human-readable name
  |                 +-- cached_at.txt  ISO timestamp
  |
  +-- game/
        +-- identity.json      Display name, class, class history
        +-- inventory.json     Collected items, version, provenance
        +-- claims/
        |     +-- <key>.json   One file per claim record
        +-- loot_catalog/
              +-- <item_id>.json  Item definitions
```

### Data sizes

- **identity:** ~100 bytes (Ed25519 keypair)
- **settings.json:** < 10KB typically
- **conversations:** grows with message volume, a few KB per conversation
- **cache:** bounded by `size_limit_mb` setting (default 100MB)
- **game data:** a few KB for identity/inventory, grows slowly with claims and catalog

---

## Network

### How RNS shared instance works

Reticulum supports a shared-instance model. When you run `rnsd` (the Reticulum daemon), it creates the transport instance. All other RNS applications (NomadNet, Sideband, Nomad Browser) connect to it via a local socket.

```
+------------+     +------------+     +---------------+
| NomadNet   |     | Sideband   |     | Nomad Browser |
+-----+------+     +-----+------+     +-------+-------+
      |                   |                     |
      +-------------------+---------------------+
                          |
                  +-------v-------+
                  |     rnsd      |
                  | (shared RNS)  |
                  +-------+-------+
                          |
                  +-------v-------+
                  | Transport     |
                  | TCP, LoRa,    |
                  | AutoInterface |
                  +---------------+
```

Benefits:
- All apps see the same nodes and announces
- One identity for everything
- One set of transport interfaces
- Lower resource usage

If `rnsd` isn't running, Nomad Browser creates its own standalone transport — it works, but doesn't share state with other apps.

### Why rnsd is recommended

Without `rnsd`, each RNS application creates its own transport. This means:
- Duplicate announce processing
- Separate link caches
- Separate path tables
- Higher resource usage
- NomadNet and Nomad Browser might see different nodes at different times

With `rnsd`, they share everything. One transport, one view of the mesh.

---

## Security

### XSS prevention

All page content goes through two layers:
1. **Micron renderer** — converts markup to HTML, doesn't pass through raw HTML
2. **DOMPurify** — sanitizes the rendered HTML before DOM injection

The `purify.min.js` library is bundled locally (no CDN dependency).

### Signed inventories

Inventory items include provenance chains — who claimed what, when. In V1 these are locally stored and not cryptographically signed (that's V2). The structure is there for future signing with the RNS keypair.

### Local-only storage

All data lives on your disk. No telemetry, no analytics, no phone-home. The only network traffic is Reticulum mesh communication that you initiate (fetching pages, sending messages).

### Identity security

Your `~/.nomad-browser/identity` file is an Ed25519 keypair. It's the root of your mesh identity, your LXMF address, and your game identity. Treat it like a private key — because it is one.

The file is not encrypted at rest. If you need encryption, use filesystem-level encryption (LUKS, FileVault, BitLocker).

---

## Test Suite

```bash
python -m pytest tests/ -v
```

41 tests across 7 test files:

| File | Coverage |
|------|----------|
| `test_claims.py` | Claim modes (once, per_player, timed), cooldowns, duplicate detection |
| `test_game_api.py` | All `/api/game/*` endpoints via Flask test client |
| `test_game_e2e.py` | Full game loop: scan page, find drops, claim, check inventory |
| `test_game_identity.py` | Identity creation, class changes, class history, validation |
| `test_inventory.py` | Add/remove items, versioning, provenance, persistence |
| `test_loot_library.py` | Catalog CRUD, search by text, search by tag |
| `test_loot_scanner.py` | Tag parsing, nested JSON, invalid tags, edge cases |

All tests use `--no-rns` mode (no Reticulum needed) with temporary data directories.
