```

     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     N O M A D   B R O W S E R
       ':::::::::'
        ':::::::'        The mesh has a browser now.
         ':::::'
          ':::'          Browse pages. Chat with anyone.
           ':'           Find what's hidden.
            '

```

# Nomad Browser

**The first unified client for the [Reticulum](https://reticulum.network/) mesh network.**

Browse `.mu` pages, send LXMF messages, discover nodes with an AI archivist — all in one window. No internet required. No accounts. No servers. Just the mesh.

---

## What It Does

The Reticulum ecosystem has three separate tools that don't talk to each other:

| Tool | Does | Doesn't |
|------|------|---------|
| **NomadNet** | Pages + messages | Not simultaneously. Terminal UI. |
| **Sideband** | Messages | No page browsing |
| **rBrowser** | Pages (web UI) | No messaging |

**Nomad Browser** puts it all in one window:

```
┌─────────────────────┬──────────────────────────────────┐
│   CHAT PANEL        │         PAGE BROWSER             │
│                     │                                  │
│  [AI] [Mom] [Peer]  │  ┌────────────────────────────┐  │
│  ─────────────────  │  │  address bar / node hash   │  │
│                     │  └────────────────────────────┘  │
│  You: What nodes    │                                  │
│  have LoRa guides?  │  ┌────────────────────────────┐  │
│                     │  │                            │  │
│  AI: The Digital    │  │    Rendered .mu page       │  │
│  Sovereignty node   │  │                            │  │
│  has detailed LoRa  │  │                            │  │
│  configs. Loading   │  │                            │  │
│  it now...          │  │                            │  │
│                     │  │                            │  │
│  [message input]    │  └────────────────────────────┘  │
│                     │                                  │
│                     │  [◀ back] [▶ fwd] [↻ reload]    │
└─────────────────────┴──────────────────────────────────┘
```

**Left panel:** Tabbed LXMF conversations — AI, friends, anyone on the mesh.

**Right panel:** Page browser with Micron rendering, tabs, navigation, node drawer.

**The connection:** Ask the AI about the page you're reading. Click a link the AI recommends. The conversation navigates the browser. The browser informs the conversation.

---

## The Game

Hidden in the pages of the mesh, there are things to find.

Some nodes have **loot drops** — digital items embedded in `.mu` pages. Browse a page, and if something's hidden there, you'll see it. Claim it. It's yours.

```
✦ 1 loot drop on this page

✦  Nomad AI Welcome Token        "You found the home node"    [Claim]
```

Your items live in your **inventory** — signed, versioned, portable. Your identity is your RNS keypair. Lose your keys, lose everything. This is the mesh.

**There are items on this node right now.** Some are easy to find. Some aren't.

<details>
<summary>What kind of items?</summary>

That depends on who hid them.

The game has evolution levels — items start as metadata and grow into art, icons, audio. Richer items need better transport paths. A full-fidelity L3 item can't travel over LoRa — you need TCP or a direct link.

There are five classes you can declare: **Scout**, **Smuggler**, **Commander**, **Courier**, **Nomad**. Nobody verifies what you claim. That's the game. Trust is earned, not assigned. Reputations are local. Accusations travel the mesh.

The most valuable drops are placed where the mesh **doesn't reach yet**. Want the rare item someone hid on a mountain peak? Deploy a LoRa relay. Extend the network. Claim the prize. The infrastructure stays.

*Playing the game builds the mesh.*

</details>

---

## Install

```bash
# Clone
git clone https://github.com/Infinite-Grok/nomad-browser.git
cd nomad-browser

# Install dependencies
pip install -r requirements.txt

# Run
python run.py
```

Open `http://127.0.0.1:5000` in your browser.

### Requirements

- Python 3.8+
- [Reticulum](https://reticulum.network/) (`pip install rns`)
- [LXMF](https://github.com/markqvist/LXMF) (`pip install lxmf`)

### Quick Test (no Reticulum needed)

```bash
python run.py --no-rns --port 5555
```

Starts in game-only mode — no mesh connection, but the game layer works. Good for exploring the UI.

---

## Usage

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Toggle chat panel |
| `Ctrl+Shift+N` | New conversation |
| `Ctrl+Shift+D` | Toggle node drawer |
| `Ctrl+Shift+O` | Toggle contacts drawer |
| `Ctrl+Shift+I` | Toggle inventory |
| `Ctrl+T` | New page tab |
| `Ctrl+W` | Close page tab |
| `Ctrl+L` | Focus address bar |

### Address Bar

Enter a node hash to browse its index page:
```
ff6878439a8502913b9a5f2abc0f452b
```

Or a full path:
```
ff6878439a8502913b9a5f2abc0f452b:/page/guide.mu
```

### Game Commands

The game layer is opt-in. If you don't want it, ignore the loot indicators — they won't affect your browsing.

**API endpoints** (for tinkerers):
- `GET /api/game/status` — your game state
- `GET /api/game/inventory` — your items
- `POST /api/game/identity` — set name, class
- `GET /api/game/catalog` — known item definitions

---

## Architecture

```
nomad-browser/
├── nomad_browser/
│   ├── app.py              ← Flask app factory
│   ├── browser.py          ← RNS page fetching + node discovery
│   ├── messenger.py        ← LXMF send/receive
│   ├── identity.py         ← RNS identity management
│   ├── cache.py            ← Page caching + search
│   ├── routes_pages.py     ← Page browser API
│   ├── routes_chat.py      ← Chat API
│   ├── routes_game.py      ← Game API
│   └── game/
│       ├── engine.py       ← Game orchestrator
│       ├── identity.py     ← Game identity (extends RNS)
│       ├── inventory.py    ← Signed item inventory
│       ├── loot_scanner.py ← Page tag detection
│       ├── loot_library.py ← Item catalog
│       └── claims.py       ← Claim processing
├── static/js/              ← Vanilla JS frontend
├── templates/              ← Single-page app shell
├── data/seed_catalog/      ← Bundled starter items
└── tests/                  ← 41 tests
```

**Stack:** Python + Flask + vanilla JS. No frameworks. No build step. No npm.

**Network:** Reticulum for mesh, LXMF for messaging. All peer-to-peer.

**Storage:** Everything local. Conversations on your disk. Inventory on your disk. Nothing leaves your machine unless you send it.

---

## For Node Operators

Want to hide loot on your node? Add a tag to any `.mu` page:

```
#!loot:{"item":"your_item_id","mode":"per_player","hint":"A clue for the finder"}
```

**Modes:**
- `once` — first player claims it, gone forever
- `per_player` — each player can claim once
- `timed` — respawns after a cooldown

Create item definitions in `data/seed_catalog/` to give your items proper names:

```json
{
  "type": "loot_definition",
  "item_id": "your_item_id",
  "name": "Your Item Name",
  "description": "What this item represents.",
  "rarity": "rare",
  "creator": "your_rns_address",
  "tags": ["custom"]
}
```

**Frontier drops:** Hide loot where the mesh doesn't reach yet. Someone will build the infrastructure to get there. The item is the incentive. The relay they deploy stays forever.

---

## Tests

```bash
python -m pytest tests/ -v
```

41 tests covering identity, inventory, loot library, scanner, claims, API endpoints, and full E2E game loop.

---

## What's Next

- **V2:** Class system, trust ledger, vouching/accusations, trading, catalog gossip
- **V3:** Item evolution, transport gating, frontier drops, physical drops (QR/LoRa/BLE), bridge detection

The mesh is the game board. It never resets.

---

## License

MIT

---

<sub>Built in Pahoa, Hawai'i. On the mesh.</sub>

<!--

    You're reading the source. Good.

    There's a page on our node that isn't linked from anywhere.
    The path is /page/hidden.mu

    Our node hash: ff6878439a8502913b9a5f2abc0f452b

    Something is waiting there for you.

-->
