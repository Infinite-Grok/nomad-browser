const InventoryPanel = {
    visible: false,
    items: [],

    init() {
        this.panel = document.getElementById('inventory-panel');
        this.itemsList = document.getElementById('inventory-items');
        this.countEl = document.getElementById('inventory-count');
        this.classEl = document.getElementById('player-class');
        this.nameEl = document.getElementById('player-name');
        if (this.panel) this.refresh();
    },

    toggle() {
        this.visible = !this.visible;
        if (this.panel) this.panel.classList.toggle('open', this.visible);
        if (this.visible) this.refresh();
    },

    async refresh() {
        try {
            const [invResp, statusResp] = await Promise.all([
                fetch('/api/game/inventory'),
                fetch('/api/game/status'),
            ]);
            const inv = await invResp.json();
            const status = await statusResp.json();
            this.items = inv.items || [];
            this._renderItems();
            if (this.countEl) this.countEl.textContent = this.items.length;
            if (this.classEl) this.classEl.textContent = status.identity?.class || 'nomad';
            if (this.nameEl) this.nameEl.textContent = status.identity?.display_name || status.identity?.rns_address?.slice(0, 12) || '???';
        } catch (e) {
            console.error('[Inventory] refresh failed:', e);
        }
    },

    _renderItems() {
        if (!this.itemsList) return;
        if (this.items.length === 0) {
            this.itemsList.innerHTML = '<div class="inv-empty">No items yet. Explore pages to find loot!</div>';
            return;
        }
        this.itemsList.innerHTML = this.items.map(item => `
            <div class="inv-item">
                <div class="inv-item-header">
                    <span class="inv-item-name">${item.name}</span>
                    <span class="inv-item-rarity rarity-${item.rarity}">${item.rarity}</span>
                </div>
                <div class="inv-item-meta">
                    L${item.evolution_level} · ${new Date(item.acquired).toLocaleDateString()}
                    ${item.claim_context?.type ? ` · <span class="inv-claim-type">${item.claim_context.type}</span>` : ''}
                </div>
            </div>
        `).join('');
    },
};
