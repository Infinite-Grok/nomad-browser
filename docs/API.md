# API Reference

```
     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     Every endpoint.
       ':::::::::'       Every field.
        ':::::::'        curl it.
         ':::::'
          ':::'
           ':'
            '
```

All endpoints return JSON. The server runs on `http://127.0.0.1:5000` by default.

---

## Page API

### GET /api/pages/fetch/\<node_hash\>

Fetch a `.mu` page from a NomadNet node over Reticulum.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | `/page/index.mu` | Page path on the remote node |

**Example:**

```bash
curl "http://127.0.0.1:5000/api/pages/fetch/ff6878439a8502913b9a5f2abc0f452b?path=/page/index.mu"
```

**Success response:**

```json
{
  "status": "success",
  "content": "`!Micron formatted page content here...`\n\nWelcome to my node.",
  "error": null
}
```

**Error responses:**

```json
{"status": "error", "error": "No path to destination", "content": ""}
{"status": "error", "error": "Could not recall identity", "content": ""}
{"status": "error", "error": "Timeout", "content": ""}
```

**Notes:**
- Default timeout is 30 seconds. The browser waits for Reticulum path resolution, then link establishment, then page fetch.
- Active links are cached. Subsequent requests to the same node reuse the link (much faster).

---

### GET /api/nodes

List all discovered nodes. Nodes appear here when their announce is received via Reticulum.

**Example:**

```bash
curl http://127.0.0.1:5000/api/nodes
```

**Response:**

```json
[
  {
    "hash": "ff6878439a8502913b9a5f2abc0f452b",
    "name": "Nomad AI",
    "last_seen": "2026-03-17T14:30:00",
    "announce_count": 3,
    "last_seen_relative": "5m ago",
    "hops": 2,
    "next_hop_interface": "via TCPInterface"
  },
  {
    "hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "name": "Digital Sovereignty",
    "last_seen": "2026-03-17T14:25:00",
    "announce_count": 1,
    "last_seen_relative": "10m ago",
    "hops": 4,
    "next_hop_interface": "via LoRaInterface"
  }
]
```

---

### GET /api/status

System status — connection state, node count, uptime, identity.

**Example:**

```bash
curl http://127.0.0.1:5000/api/status
```

**Response:**

```json
{
  "connection_state": "active",
  "reticulum_ready": true,
  "node_count": 12,
  "announce_count": 47,
  "uptime": 3621.4,
  "identity_hash": "ff6878439a8502913b9a5f2abc0f452b"
}
```

**Connection states:**

| State | Meaning |
|-------|---------|
| `connecting` | Reticulum is starting up |
| `connected` | RNS running, no announces received yet |
| `active` | Announces received, nodes discovered |
| `failed` | Reticulum initialization failed |

---

### GET /api/connection-status

Traffic-light style connection status for UI indicators.

**Example:**

```bash
curl http://127.0.0.1:5000/api/connection-status
```

**Response:**

```json
{
  "status": "online",
  "message": "Online — Reticulum connected",
  "color": "green"
}
```

**Status values:**

| Status | Color | Meaning |
|--------|-------|---------|
| `online` | green | Active, nodes discovered, recent announces |
| `waiting` | yellow | Connected but no activity, or no recent announces |
| `connerror` | red | Reticulum failed or unknown state |

---

### GET /api/cache/search

Search across all cached pages.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | (required) | Search query |
| `mode` | string | `partial` | `partial` (case-insensitive substring) or `exact` (whole-word, case-sensitive) |

**Example:**

```bash
curl "http://127.0.0.1:5000/api/cache/search?q=reticulum"
```

**Response:**

```json
[
  {
    "node_hash": "ff6878439a8502913b9a5f2abc0f452b",
    "node_name": "Nomad AI",
    "snippet": "...this node runs <mark>Reticulum</mark> over TCP and LoRa...",
    "url": "ff6878439a8502913b9a5f2abc0f452b:/page/index.mu",
    "page_name": "index.mu",
    "page_path": "/page/index.mu",
    "cached_at": "2026-03-17 14:00:00",
    "cache_status": "fresh"
  }
]
```

**Cache status values:** `fresh` (<=3 days), `good` (<=10 days), `moderate` (<=20 days), `old` (>20 days).

---

### GET /api/favorites

Load bookmarked nodes.

**Example:**

```bash
curl http://127.0.0.1:5000/api/favorites
```

**Response:**

```json
{
  "status": "success",
  "favorites": [
    {"hash": "ff6878439a8502913b9a5f2abc0f452b", "name": "Nomad AI"},
    {"hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "name": "Digital Sovereignty"}
  ]
}
```

---

### POST /api/favorites

Save bookmarked nodes. Replaces the entire favorites list.

**Body:**

```json
{
  "favorites": [
    {"hash": "ff6878439a8502913b9a5f2abc0f452b", "name": "Nomad AI"}
  ]
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/favorites \
  -H "Content-Type: application/json" \
  -d '{"favorites":[{"hash":"ff6878439a8502913b9a5f2abc0f452b","name":"Nomad AI"}]}'
```

**Response:**

```json
{"status": "success", "message": "Favorites saved"}
```

---

## Chat API

### POST /api/chat/send

Send an LXMF message.

**Body:**

```json
{
  "to": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "content": "Hello from the mesh",
  "game_context": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Recipient's LXMF address (hex hash) |
| `content` | string | Yes | Message text |
| `game_context` | object | No | Game state context (sent to AI-enabled peers) |

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"to":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6","content":"Hello from the mesh"}'
```

**Success response:**

```json
{"status": "ok", "message_id": "<0a1b2c3d4e5f>"}
```

**Error responses:**

```json
{"status": "error", "error": "Missing 'to' field"}           // 400
{"status": "error", "error": "No path to destination"}        // 504
{"status": "error", "error": "Cannot recall identity for destination"}  // 400
```

---

### GET /api/chat/messages/\<address\>

Get stored messages for a conversation.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `since` | string | No | ISO timestamp — only return messages after this time |

**Example:**

```bash
curl "http://127.0.0.1:5000/api/chat/messages/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

# With since filter
curl "http://127.0.0.1:5000/api/chat/messages/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6?since=2026-03-17T14:00:00"
```

**Response:**

```json
[
  {
    "from": "ff6878439a8502913b9a5f2abc0f452b",
    "to": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "content": "Hello from the mesh",
    "timestamp": "2026-03-17T14:30:00",
    "status": "sent"
  },
  {
    "from": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "to": "ff6878439a8502913b9a5f2abc0f452b",
    "content": "Hey! Good to see you on here.",
    "timestamp": "2026-03-17T14:31:00",
    "status": "received"
  }
]
```

---

### GET /api/chat/new

Poll for new incoming messages. Drains the queue — each message is returned only once.

**Example:**

```bash
curl http://127.0.0.1:5000/api/chat/new
```

**Response:**

```json
[
  {
    "address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "from": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "to": "ff6878439a8502913b9a5f2abc0f452b",
    "content": "Incoming message text",
    "timestamp": "2026-03-17T14:35:00",
    "status": "received"
  }
]
```

Returns an empty array if no new messages.

---

### GET /api/chat/conversations

List all known conversations with metadata.

**Example:**

```bash
curl http://127.0.0.1:5000/api/chat/conversations
```

**Response:**

```json
[
  {
    "address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "name": "Alice",
    "last_seen": "2026-03-17T14:31:00"
  },
  {
    "address": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d600",
    "name": "b2c3d4e5f6a7b8c9...",
    "last_seen": "2026-03-16T10:00:00"
  }
]
```

---

### POST /api/chat/name

Set a display name for a conversation.

**Body:**

```json
{
  "address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "name": "Alice"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/chat/name \
  -H "Content-Type: application/json" \
  -d '{"address":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6","name":"Alice"}'
```

**Response:**

```json
{"status": "ok"}
```

---

### DELETE /api/chat/clear/\<address\>

Clear all messages for a conversation. Deletes the conversation directory.

**Example:**

```bash
curl -X DELETE "http://127.0.0.1:5000/api/chat/clear/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

**Response:**

```json
{"status": "ok"}
```

---

### GET /api/chat/identity

Get this node's LXMF address.

**Example:**

```bash
curl http://127.0.0.1:5000/api/chat/identity
```

**Response:**

```json
{"address": "ff6878439a8502913b9a5f2abc0f452b"}
```

---

### GET /api/contacts

Get saved contacts list.

**Example:**

```bash
curl http://127.0.0.1:5000/api/contacts
```

**Response:**

```json
[
  {"address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "name": "Alice"},
  {"address": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d600", "name": "Bob"}
]
```

---

### POST /api/contacts

Save the full contacts list. Replaces all existing contacts.

**Body:**

```json
{
  "contacts": [
    {"address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "name": "Alice"}
  ]
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"contacts":[{"address":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6","name":"Alice"}]}'
```

**Response:**

```json
{"status": "ok"}
```

---

### POST /api/contacts/add

Add a single contact. Deduplicates by address.

**Body:**

```json
{
  "address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "name": "Alice"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/contacts/add \
  -H "Content-Type: application/json" \
  -d '{"address":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6","name":"Alice"}'
```

**Response:**

```json
{"status": "ok"}
```

If `name` is omitted, defaults to the first 16 chars of the address.

---

### POST /api/contacts/remove

Remove a contact by address.

**Body:**

```json
{
  "address": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/contacts/remove \
  -H "Content-Type: application/json" \
  -d '{"address":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"}'
```

**Response:**

```json
{"status": "ok"}
```

---

## Game API

### GET /api/game/status

Get game engine status — enabled state, identity, inventory count, catalog size.

**Example:**

```bash
curl http://127.0.0.1:5000/api/game/status
```

**Response:**

```json
{
  "enabled": true,
  "identity": {
    "type": "game_identity",
    "rns_address": "ff6878439a8502913b9a5f2abc0f452b",
    "display_name": "ghostrunner",
    "class": "scout",
    "class_history": [
      {"class": "nomad", "from": "2026-03-15T00:00:00+00:00", "to": "2026-03-16T12:00:00+00:00"},
      {"class": "scout", "from": "2026-03-16T12:00:00+00:00", "to": null}
    ],
    "created": "2026-03-15T00:00:00+00:00"
  },
  "inventory_count": 3,
  "inventory_version": 3,
  "catalog_count": 5
}
```

---

### GET /api/game/inventory

Get your full inventory.

**Example:**

```bash
curl http://127.0.0.1:5000/api/game/inventory
```

**Response:**

```json
{
  "type": "inventory",
  "owner": "ff6878439a8502913b9a5f2abc0f452b",
  "items": [
    {
      "item_hash": "a1b2c3d4e5f6a7b8",
      "item_id": "nomad_ai_welcome",
      "name": "Nomad AI Welcome Token",
      "rarity": "common",
      "evolution_level": 0,
      "acquired": "2026-03-15T10:00:00+00:00",
      "claim_context": null,
      "provenance": [
        {"event": "claimed", "by": "ff6878439a8502913b9a5f2abc0f452b", "at": "2026-03-15T10:00:00+00:00"}
      ]
    }
  ],
  "version": 1
}
```

---

### POST /api/game/scan

Scan page content for loot drops. Called by the frontend after loading a page.

**Body:**

```json
{
  "content": "Page content with #!loot:{\"item\":\"test_item\",\"mode\":\"per_player\"} embedded",
  "node_hash": "ff6878439a8502913b9a5f2abc0f452b",
  "page_path": "/page/index.mu"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/game/scan \
  -H "Content-Type: application/json" \
  -d '{"content":"Some text #!loot:{\"item\":\"test\",\"mode\":\"per_player\",\"hint\":\"found it\"} more text","node_hash":"abc123","page_path":"/page/index.mu"}'
```

**Response:**

```json
{
  "drops": [
    {
      "item": "test",
      "mode": "per_player",
      "hint": "found it"
    }
  ]
}
```

Returns `{"drops": []}` if no loot tags found.

---

### POST /api/game/claim

Claim a loot drop. Pass the drop object from a scan result.

**Body:**

```json
{
  "drop": {
    "item": "nomad_ai_welcome",
    "mode": "per_player",
    "hint": "You found the home node"
  },
  "node_hash": "ff6878439a8502913b9a5f2abc0f452b",
  "page_path": "/page/index.mu",
  "claim_context": {"type": "browser", "page_title": "Nomad AI Home"}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `drop` | object | Yes | The drop object from scan results |
| `node_hash` | string | Yes | Node where the drop was found |
| `page_path` | string | Yes | Page path where the drop was found |
| `claim_context` | object | No | Optional metadata about the claim |

**Example:**

```bash
curl -X POST http://127.0.0.1:5000/api/game/claim \
  -H "Content-Type: application/json" \
  -d '{"drop":{"item":"nomad_ai_welcome","mode":"per_player"},"node_hash":"ff6878439a8502913b9a5f2abc0f452b","page_path":"/page/index.mu"}'
```

**Success response:**

```json
{
  "status": "claimed",
  "item": {
    "item_hash": "a1b2c3d4e5f6a7b8",
    "item_id": "nomad_ai_welcome",
    "name": "Nomad AI Welcome Token",
    "rarity": "common",
    "evolution_level": 0,
    "acquired": "2026-03-17T14:30:00+00:00",
    "claim_context": null,
    "provenance": [
      {"event": "claimed", "by": "ff6878439a8502913b9a5f2abc0f452b", "at": "2026-03-17T14:30:00+00:00"}
    ]
  }
}
```

**Already claimed:**

```json
{"status": "already_claimed"}
```

**On cooldown (timed mode):**

```json
{"status": "cooldown", "available_at": "2026-03-18T14:30:00+00:00"}
```

---

### GET /api/game/identity

Get your game identity.

**Example:**

```bash
curl http://127.0.0.1:5000/api/game/identity
```

**Response:**

```json
{
  "type": "game_identity",
  "rns_address": "ff6878439a8502913b9a5f2abc0f452b",
  "display_name": null,
  "class": "nomad",
  "class_history": [
    {"class": "nomad", "from": "2026-03-15T00:00:00+00:00", "to": null}
  ],
  "created": "2026-03-15T00:00:00+00:00"
}
```

---

### POST /api/game/identity

Update your game identity. Both fields are optional — include only what you want to change.

**Body:**

```json
{
  "display_name": "ghostrunner",
  "class": "scout"
}
```

**Valid classes:** `scout`, `smuggler`, `commander`, `courier`, `nomad`

**Example:**

```bash
# Set display name only
curl -X POST http://127.0.0.1:5000/api/game/identity \
  -H "Content-Type: application/json" \
  -d '{"display_name":"ghostrunner"}'

# Set class only
curl -X POST http://127.0.0.1:5000/api/game/identity \
  -H "Content-Type: application/json" \
  -d '{"class":"smuggler"}'

# Set both
curl -X POST http://127.0.0.1:5000/api/game/identity \
  -H "Content-Type: application/json" \
  -d '{"display_name":"ghostrunner","class":"scout"}'
```

**Response:** Same as GET — returns the full updated identity object.

**Error (invalid class):**

Returns 500 with `ValueError: Invalid class: warrior. Must be one of {'scout', 'smuggler', 'commander', 'courier', 'nomad'}`

---

### GET /api/game/catalog

List all item definitions in the catalog.

**Example:**

```bash
curl http://127.0.0.1:5000/api/game/catalog
```

**Response:**

```json
{
  "items": [
    {
      "type": "loot_definition",
      "item_id": "nomad_ai_welcome",
      "name": "Nomad AI Welcome Token",
      "description": "Awarded to visitors of the Nomad AI home node. A mark of curiosity.",
      "rarity": "common",
      "creator": "nomad_ai",
      "created": "2026-03-15T00:00:00+00:00",
      "tags": ["welcome", "nomad_ai"],
      "physical_payload": null,
      "evolution_chain": null
    },
    {
      "type": "loot_definition",
      "item_id": "deep_explorer",
      "name": "Deep Explorer Badge",
      "description": "Found the hidden page. You dig deeper than most.",
      "rarity": "uncommon",
      "creator": "nomad_ai",
      "created": "2026-03-15T00:00:00+00:00",
      "tags": ["exploration", "hidden"],
      "physical_payload": null,
      "evolution_chain": null
    }
  ]
}
```

---

### GET /api/game/catalog/search

Search the item catalog by name/description or tag.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | No | Text search (case-insensitive, matches name and description) |
| `tag` | string | No | Filter by tag (exact match) |

At least one of `q` or `tag` should be provided for meaningful results.

**Examples:**

```bash
# Search by text
curl "http://127.0.0.1:5000/api/game/catalog/search?q=explorer"

# Search by tag
curl "http://127.0.0.1:5000/api/game/catalog/search?tag=welcome"

# Both (AND filter)
curl "http://127.0.0.1:5000/api/game/catalog/search?q=token&tag=nomad_ai"
```

**Response:**

```json
{
  "items": [
    {
      "type": "loot_definition",
      "item_id": "nomad_ai_welcome",
      "name": "Nomad AI Welcome Token",
      "description": "Awarded to visitors of the Nomad AI home node. A mark of curiosity.",
      "rarity": "common",
      "creator": "nomad_ai",
      "created": "2026-03-15T00:00:00+00:00",
      "tags": ["welcome", "nomad_ai"],
      "physical_payload": null,
      "evolution_chain": null
    }
  ]
}
```

---

## Debug / Utility Endpoints

These exist for development and testing. Not part of the stable API.

### POST /api/chat/inject

Inject a message as if it arrived via LXMF. Used by local peers for HTTP-bridged delivery.

**Body:**

```json
{"from": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "content": "Test message"}
```

### GET /api/reset

Clear all conversations and localStorage. Returns an HTML page that wipes the browser state and redirects to `/`.

### POST /api/debug/log

Receive JS debug logs from the browser frontend.

### GET /api/debug/log

Return collected debug log entries (max 200).
