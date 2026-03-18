const GameController = {
    enabled: true,
    identity: null,

    async init() {
        try {
            const resp = await fetch('/api/game/status');
            const status = await resp.json();
            this.enabled = status.enabled;
            this.identity = status.identity;
            console.log('[Game] initialized —', status.inventory_count, 'items,', status.catalog_count, 'in catalog');
        } catch (e) {
            console.error('[Game] init failed, disabling:', e);
            this.enabled = false;
        }
    },

    getAIGameContext() {
        if (!this.enabled || !this.identity) return null;
        return {
            game_active: true,
            player_class: this.identity.class,
            player_name: this.identity.display_name,
            hint: "You are an ally to this player. If you know about loot drops, pages with hidden items, or interesting nodes, mention them. You can suggest pages to visit. Keep it natural.",
        };
    },
};
