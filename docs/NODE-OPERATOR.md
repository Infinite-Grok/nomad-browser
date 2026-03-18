# Node Operator Guide

```
     ::::.     ::::.
     ::::::. .::::::
      :::::::::::::'     You run a node.
       ':::::::::'       Now hide something on it.
        ':::::::'
         ':::::'
          ':::'
           ':'
            '
```

---

## Overview

If you run a NomadNet node, you can embed **loot drops** in your `.mu` pages. When someone browses your page with Nomad Browser, they'll see the drop and can claim it.

Loot drops are just tags in your page content. No server-side changes needed. No plugins. Just text.

---

## The Loot Tag

Add this anywhere in a `.mu` page:

```
#!loot:{"item":"your_item_id","mode":"per_player","hint":"A clue for the finder"}
```

That's it. When Nomad Browser loads the page, the scanner finds the tag, parses the JSON, and displays the drop.

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `item` | string | Unique item identifier. Used to look up the item definition in the catalog. |
| `mode` | string | Claim mode: `once`, `per_player`, or `timed`. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `hint` | string | Flavor text shown to the player before claiming. |
| `cooldown_hours` | number | For `timed` mode: hours before the drop respawns. Default: 24. |

---

## Claim Modes

### `once` — One and done

```
#!loot:{"item":"ancient_key","mode":"once","hint":"Only one exists."}
```

The first player to find and claim this item gets it. After that, the drop shows "Already claimed" for everyone. The item is gone from this page forever.

Use this for unique treasures, one-time events, or first-to-find challenges.

### `per_player` — Everyone gets one

```
#!loot:{"item":"welcome_badge","mode":"per_player","hint":"Thanks for visiting."}
```

Every player can claim one copy. The drop never disappears. A returning player who already claimed it sees "Already claimed" — but a new visitor can still grab one.

Use this for welcome tokens, participation badges, or items you want widely distributed.

### `timed` — Respawning

```
#!loot:{"item":"signal_cache","mode":"timed","cooldown_hours":12,"hint":"Comes back every 12 hours."}
```

After claiming, the drop goes on cooldown. The player sees when it becomes available again. Once the cooldown expires, they can claim another copy.

Use this for renewable resources, daily rewards, or repeatable challenges.

---

## Item Definitions

The `item` field in a loot tag is just a string ID. Without a matching definition in the catalog, the item shows up with the raw ID as its name and "unknown" rarity.

To give your items proper names, descriptions, and rarity, create item definition files.

### The seed_catalog format

Place JSON files in `data/seed_catalog/` (for bundled items) or the browser will load them into `~/.nomad-browser/game/loot_catalog/`.

```json
{
  "type": "loot_definition",
  "item_id": "signal_cache",
  "name": "Signal Cache",
  "description": "A cached burst of mesh signal data. Useful for mapping coverage.",
  "rarity": "uncommon",
  "creator": "your_rns_address",
  "tags": ["infrastructure", "mapping"],
  "physical_payload": null
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"loot_definition"`. |
| `item_id` | string | Yes | Must match the `item` field in your loot tags. |
| `name` | string | Yes | Human-readable item name. |
| `description` | string | Yes | What this item is. Flavor text. |
| `rarity` | string | Yes | Rarity tier: `common`, `uncommon`, `rare`, `epic`, `legendary`. |
| `creator` | string | Yes | Your RNS address or identifier. |
| `tags` | array | No | Searchable tags for catalog browsing. |
| `physical_payload` | object | No | For real-world treasure. See below. |

### Rarity tiers

| Rarity | Intended use |
|--------|-------------|
| `common` | Freely available, welcome tokens, participation items |
| `uncommon` | Takes some exploration to find |
| `rare` | Hidden or requires specific knowledge |
| `epic` | Significant challenge or frontier drop |
| `legendary` | One-of-a-kind or extraordinary effort |

Rarity has no mechanical effect in V1. It's a signal to players about how special the item is.

---

## The physical_payload Field

For real-world treasure hunts, the `physical_payload` field can describe something that exists outside the mesh:

```json
{
  "type": "loot_definition",
  "item_id": "hilltop_cache_001",
  "name": "Hilltop Cache #1",
  "description": "A waterproof box at the summit. Contains a logbook and a LoRa relay.",
  "rarity": "epic",
  "creator": "your_rns_address",
  "tags": ["physical", "cache", "hilltop"],
  "physical_payload": {
    "type": "geocache",
    "coordinates": "19.4934,-155.2433",
    "description": "Under the lava rock cairn at the summit. Waterproof ammo can.",
    "verification": "Sign the logbook. Photo optional."
  }
}
```

The `physical_payload` is stored in the catalog and visible to anyone who inspects the item. Nomad Browser doesn't validate or enforce it — it's metadata. The real treasure is wherever you put it.

---

## Hiding Loot: Techniques

### Inline on any page

The simplest approach. Put the tag anywhere in your page content:

```
Welcome to my node.

This is a page about mesh networking.

#!loot:{"item":"welcome_token","mode":"per_player","hint":"Thanks for stopping by."}

Here's some more content...
```

The tag is stripped from the rendered page. Players see the loot indicator, not the raw tag.

### The hidden page technique

Create a page that isn't linked from your index or navigation. Players have to know (or guess) the path to find it:

```
# Your node structure:
/page/index.mu          <- public index, linked normally
/page/about.mu          <- linked from index
/page/hidden.mu         <- NOT linked from anywhere
```

Put loot on `/page/hidden.mu`. The only way to get there is:

1. Someone tells the player the path
2. The player guesses it
3. An AI archivist hints at it
4. The item's hint or another item's description references it

This is the `.mu` equivalent of a hidden directory on the web. Simple but effective.

### Loot on deep pages

NomadNet supports subdirectories. Bury loot deep:

```
/page/archive/2025/june/experiment-7.mu
```

The deeper the path, the less likely a casual browser finds it. Explorers who dig through your node's page tree are rewarded.

---

## Frontier Drops

The most interesting drops are placed where the mesh doesn't reach yet.

**The concept:** You know a location (a mountain peak, a remote cabin, an island) that has no Reticulum coverage. You create a node there, put a valuable loot drop on it, and announce it. The item is the incentive. To claim it, someone has to extend the mesh to reach that node.

The infrastructure they deploy — a LoRa relay, a solar-powered repeater, a mesh gateway — stays after the item is claimed. The game builds the network.

### How to set up a frontier drop

1. Deploy a NomadNet node at the target location
2. Create a page with a `once` mode loot drop (or `per_player` if you want multiple people to make the journey)
3. Create an item definition with `epic` or `legendary` rarity
4. Announce the node on the mesh
5. Optionally drop hints about the location through other items, AI conversations, or your node's public pages

```
#!loot:{"item":"mauna_kea_relay","mode":"once","hint":"4,207 meters above sea level. Bring a LoRa radio."}
```

---

## Example: A Multi-Page Treasure Hunt

Here's how to create a treasure hunt across your node's pages.

### Step 1: Create item definitions

Save these in `data/seed_catalog/` or add them via the API:

**`data/seed_catalog/hunt_clue_1.json`:**
```json
{
  "type": "loot_definition",
  "item_id": "hunt_clue_1",
  "name": "Cipher Fragment (1/3)",
  "description": "The first piece of a three-part cipher. Alone it's noise. Combined, it's a path.",
  "rarity": "uncommon",
  "creator": "your_rns_address",
  "tags": ["hunt", "cipher", "fragment"]
}
```

**`data/seed_catalog/hunt_clue_2.json`:**
```json
{
  "type": "loot_definition",
  "item_id": "hunt_clue_2",
  "name": "Cipher Fragment (2/3)",
  "description": "The second piece. Check /page/archive for the next.",
  "rarity": "uncommon",
  "creator": "your_rns_address",
  "tags": ["hunt", "cipher", "fragment"]
}
```

**`data/seed_catalog/hunt_clue_3.json`:**
```json
{
  "type": "loot_definition",
  "item_id": "hunt_clue_3",
  "name": "Cipher Fragment (3/3)",
  "description": "The final piece. Combined they spell: /page/vault.mu",
  "rarity": "uncommon",
  "creator": "your_rns_address",
  "tags": ["hunt", "cipher", "fragment"]
}
```

**`data/seed_catalog/hunt_prize.json`:**
```json
{
  "type": "loot_definition",
  "item_id": "hunt_prize",
  "name": "The Vault Key",
  "description": "You solved the cipher. You found the vault. This key opens nothing — but it proves everything.",
  "rarity": "rare",
  "creator": "your_rns_address",
  "tags": ["hunt", "prize", "vault"]
}
```

### Step 2: Place the drops on pages

**`/page/index.mu`** (your public page):
```
Welcome to my node.

Check out /page/about.mu for more about this project.

#!loot:{"item":"hunt_clue_1","mode":"per_player","hint":"The first piece of the puzzle."}
```

**`/page/about.mu`:**
```
About this node.

We run Reticulum over LoRa at 915MHz.

#!loot:{"item":"hunt_clue_2","mode":"per_player","hint":"Two down, one to go. Look in the archive."}
```

**`/page/archive/notes.mu`** (a deeper page):
```
Old notes from the early days of this node.

#!loot:{"item":"hunt_clue_3","mode":"per_player","hint":"Now you have all three. Where do they point?"}
```

**`/page/vault.mu`** (hidden, not linked anywhere):
```
You found it.

This page has no links pointing to it. You had to solve the cipher.

#!loot:{"item":"hunt_prize","mode":"once","hint":"The first to solve the cipher. Congratulations."}
```

### Step 3: Let players discover it

The first clue is on your index page — anyone who visits gets it. The descriptions and hints lead them through the chain. The final prize is `once` mode — first solver takes it.

---

## Example: A Complete Loot Definition

Here's an item definition with every field populated:

```json
{
  "type": "loot_definition",
  "item_id": "mesh_pioneer_badge",
  "name": "Mesh Pioneer Badge",
  "description": "Awarded to the first person to reach this node via LoRa relay chain. You built the path.",
  "rarity": "legendary",
  "creator": "ff6878439a8502913b9a5f2abc0f452b",
  "tags": ["infrastructure", "pioneer", "lora", "frontier"],
  "physical_payload": {
    "type": "certificate",
    "description": "Present this item hash to the node operator for a signed certificate.",
    "contact": "LXMF:ff6878439a8502913b9a5f2abc0f452b"
  }
}
```

And the corresponding loot tag on the page:

```
#!loot:{"item":"mesh_pioneer_badge","mode":"once","hint":"First to arrive via LoRa. The relay chain is the proof."}
```

---

## Tips for Creative Loot Design

1. **Tell a story.** Item descriptions, hints, and page paths form a narrative. Players remember stories.

2. **Reward exploration, not just visiting.** Put the best items on hidden pages, deep paths, or behind puzzles. The index page drop should be a breadcrumb, not the prize.

3. **Use `once` mode sparingly.** It creates urgency but also means most players will never get the item. Reserve it for truly special drops.

4. **Chain items together.** A series of `per_player` clues leading to a `once` prize gives everyone the journey but only one person the destination.

5. **Reference the real world.** Physical payloads, geographic hints, and infrastructure challenges blur the line between the game and the mesh. That's the point.

6. **Update your drops.** Replace claimed `once` items with new ones. Add seasonal drops. Keep players coming back to your node.

7. **Cross-node hunts.** Coordinate with other node operators. Put clue 1 on your node, clue 2 on theirs, the prize on a third. Forces players to traverse the mesh.
