# User Guide

```
     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     How to use the thing.
       ':::::::::'
        ':::::::'
         ':::::'
          ':::'
           ':'
            '
```

---

## Layout

Nomad Browser has a two-panel layout:

```
+---------------------+----------------------------------+
|   CHAT PANEL        |         PAGE BROWSER             |
|                     |                                  |
|  [AI] [Mom] [Peer]  |  [< back] [> fwd] [reload]      |
|  -----------------  |  [   address bar   ] [Nodes]     |
|                     |  [Tab 1] [Tab 2] [+]             |
|  You: What nodes    |                                  |
|  have LoRa guides?  |  +----------------------------+  |
|                     |  |                            |  |
|  AI: Check the      |  |    Rendered .mu page       |  |
|  Digital Sovereignty |  |                            |  |
|  node...            |  |    (Micron markup)          |  |
|                     |  |                            |  |
|  [message input]    |  +----------------------------+  |
|                     |                                  |
+---------------------+----------------------------------+
```

**Left:** Tabbed LXMF conversations. Chat with anyone on the mesh.

**Right:** Page browser with Micron rendering, tabs, back/forward navigation, and a node drawer.

The panels are resizable — drag the divider between them. Or collapse the chat panel entirely for full-width browsing.

---

## Browsing Pages

### The address bar

Enter a node hash to load its index page:

```
ff6878439a8502913b9a5f2abc0f452b
```

Or a full path to a specific page:

```
ff6878439a8502913b9a5f2abc0f452b:/page/guide.mu
```

Press Enter to navigate.

### The node drawer

Click **Nodes** (or press `Ctrl+Shift+D`) to open the node drawer. It lists all nodes discovered via Reticulum announces. Each entry shows:

- Node name
- Truncated hash
- Last seen time
- Hop count and interface

Click a node to load its index page. Use the search bar at the top to filter nodes by name.

### Favorites

Right-click a node in the drawer (or use the API) to bookmark it. Favorites persist across sessions in `~/.nomad-browser/settings.json`.

### Tabs

- **Ctrl+T** — open a new tab
- **Ctrl+W** — close the current tab
- Click a tab to switch between loaded pages

### Navigation

- **Back/Forward buttons** — navigate page history within a tab
- **Reload button** — re-fetch the current page from the node
- **Ctrl+L** — focus the address bar

### Cache and search

Pages are cached automatically as nodes announce themselves. Use `GET /api/cache/search?q=your+query` to search across all cached pages (this powers the AI's knowledge of the network).

---

## Chat

### Starting a conversation

1. Press **Ctrl+Shift+N** to start a new conversation
2. Enter the recipient's LXMF address (32-byte hex hash)
3. Optionally set a display name
4. Start typing

Or open the **Contacts** drawer (`Ctrl+Shift+O`), add a contact, and click their name to start chatting.

### LXMF addresses

Every Nomad Browser instance has an LXMF address — a hex string derived from your RNS identity. You can find yours at:

```
GET /api/chat/identity
```

Share this address with people who want to message you. They need it, and you need theirs. No usernames, no phone numbers. Just keys.

### Message delivery states

| State | Meaning |
|-------|---------|
| `sent` | Message handed to LXMF router, delivery attempted |
| `delivered` | Confirmed delivered to recipient's node |
| `received` | Incoming message from someone else |

Messages are stored locally in `~/.nomad-browser/conversations/<address>/messages.json`. Nothing goes to a server. If both parties are online and have a path to each other, delivery is near-instant. If not, LXMF will retry.

### The Nomad AI tab

If your node has an AI archivist configured, it appears as a conversation tab. Ask it about the network, about pages you're reading, about nodes you should visit. It has context about your current page and your game state.

### Contacts

Open the contacts drawer with **Ctrl+Shift+O** or the **Contacts** button. Add, remove, and search contacts. Contacts are stored in `settings.json`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Toggle chat panel (collapse/expand) |
| `Ctrl+Shift+N` | New conversation |
| `Ctrl+Shift+D` | Toggle node drawer |
| `Ctrl+Shift+O` | Toggle contacts drawer |
| `Ctrl+Shift+I` | Toggle inventory panel |
| `Ctrl+T` | New page tab |
| `Ctrl+W` | Close current page tab |
| `Ctrl+L` | Focus address bar |

---

## The Game Layer

Hidden in the pages of the mesh, there are things to find.

The game layer is opt-in. If you don't care about loot drops, ignore them — they won't affect your browsing. But if you're curious...

### Loot drops

When you load a page that contains a loot drop, you'll see a banner at the top:

```
+--------------------------------------------------+
| * 1 loot drop on this page                       |
+--------------------------------------------------+
| * Nomad AI Welcome Token                         |
|   "You found the home node"            [Claim]   |
+--------------------------------------------------+
```

The `*` icon marks loot indicators. Each drop shows:
- The item name (or item ID if no catalog definition exists)
- An optional hint from the node operator
- A **Claim** button

### Claiming loot

Click **Claim**. If successful:
- A toast notification confirms the claim
- The item is added to your inventory
- The indicator updates to "Claimed!"

If someone already took it (mode: `once`) or you already claimed it (mode: `per_player`), you'll see "Already claimed". If it's on cooldown (mode: `timed`), you'll see when it becomes available again.

### Claim modes

| Mode | Behavior |
|------|----------|
| `once` | First player to claim gets it. Gone forever. |
| `per_player` | Every player can claim one copy. The drop never disappears. |
| `timed` | Respawns after a cooldown period. Claim it again later. |

### Inventory

Press **Ctrl+Shift+I** to open your inventory panel. It shows:

- Your display name
- Your class
- Item count
- All collected items with name, rarity, evolution level, and acquisition date

Items are stored locally in `~/.nomad-browser/game/inventory.json`. They're versioned and include provenance chains (who claimed what, when).

### Your identity

You have a game identity linked to your RNS keypair. It includes:

- **Display name** — whatever you want to call yourself
- **Class** — one of: `scout`, `smuggler`, `commander`, `courier`, `nomad`

Set them via the API:

```bash
# Set your display name
curl -X POST http://127.0.0.1:5000/api/game/identity \
  -H "Content-Type: application/json" \
  -d '{"display_name": "ghostrunner"}'

# Set your class
curl -X POST http://127.0.0.1:5000/api/game/identity \
  -H "Content-Type: application/json" \
  -d '{"class": "scout"}'

# Get your current identity
curl http://127.0.0.1:5000/api/game/identity
```

Response:

```json
{
  "type": "game_identity",
  "rns_address": "ff6878439a8502913b9a5f2abc0f452b",
  "display_name": "ghostrunner",
  "class": "scout",
  "class_history": [
    {"class": "nomad", "from": "2026-03-15T00:00:00+00:00", "to": "2026-03-16T12:00:00+00:00"},
    {"class": "scout", "from": "2026-03-16T12:00:00+00:00", "to": null}
  ],
  "created": "2026-03-15T00:00:00+00:00"
}
```

Classes have no mechanical effect in V1. They're declarations. Nobody verifies what you claim. Trust is earned on the mesh, not assigned.

### The five classes

| Class | Archetype |
|-------|-----------|
| **Scout** | Explorer. First to find new nodes, hidden pages, frontier drops. |
| **Smuggler** | Moves items and information across the mesh. Knows the routes. |
| **Commander** | Builds infrastructure. Deploys relays. Extends the network. |
| **Courier** | Delivers messages. Reliable. Always reachable. |
| **Nomad** | Default. No allegiance. Drifts. |

---

## Tips

### Collapse the chat for full-width browsing

Press `Ctrl+Shift+C` to hide the chat panel. The browser expands to fill the window. Press it again to bring chat back.

### Use the AI to discover content

If you have an AI archivist tab, ask it things like:
- "What nodes have LoRa guides?"
- "Show me pages about off-grid communication"
- "What's hidden on this page?"

The AI has context about cached pages and your game state. It can navigate the browser for you.

### Search cached pages

The cache search endpoint lets you find content across all nodes you've seen:

```bash
curl "http://127.0.0.1:5000/api/cache/search?q=reticulum"
```

Results include node hash, node name, a snippet with highlighted matches, and the page path. Navigate directly to any result.
