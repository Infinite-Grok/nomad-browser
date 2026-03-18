const InventoryPanel = {
    visible: false,
    items: [],
    identity: null,

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
            this.identity = status.identity || {};
            this._renderPlayer();
            this._renderItems();
            if (this.countEl) this.countEl.textContent = this.items.length;
        } catch (e) {
            console.error('[Inventory] refresh failed:', e);
        }
    },

    _renderPlayer() {
        const container = document.getElementById('inv-player-section');
        if (!container) return;
        const name = this.identity.display_name || '';
        const cls = this.identity.class || 'nomad';
        const addr = this.identity.rns_address || '???';

        container.innerHTML = `
            <div class="inv-player-row">
                <input type="text" id="inv-name-input" class="inv-input" placeholder="Display name" value="${this._escapeAttr(name)}">
                <select id="inv-class-select" class="inv-select">
                    <option value="scout" ${cls === 'scout' ? 'selected' : ''}>Scout</option>
                    <option value="smuggler" ${cls === 'smuggler' ? 'selected' : ''}>Smuggler</option>
                    <option value="commander" ${cls === 'commander' ? 'selected' : ''}>Commander</option>
                    <option value="courier" ${cls === 'courier' ? 'selected' : ''}>Courier</option>
                    <option value="nomad" ${cls === 'nomad' ? 'selected' : ''}>Nomad</option>
                </select>
                <button id="inv-save-btn" class="inv-save-btn">Save</button>
            </div>
            <div class="inv-player-addr">${addr.slice(0, 16)}...</div>
        `;

        document.getElementById('inv-save-btn').addEventListener('click', () => this._saveIdentity());
        document.getElementById('inv-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._saveIdentity();
        });
    },

    async _saveIdentity() {
        const name = document.getElementById('inv-name-input').value.trim();
        const cls = document.getElementById('inv-class-select').value;
        const btn = document.getElementById('inv-save-btn');
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            const body = {};
            if (name) body.display_name = name;
            body.class = cls;
            await fetch('/api/game/identity', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });
            btn.textContent = 'Saved!';
            setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
            // Update GameController if present
            if (typeof GameController !== 'undefined') {
                GameController.identity = { ...GameController.identity, display_name: name, class: cls };
            }
        } catch (e) {
            btn.textContent = 'Error';
            setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
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
                    <span class="inv-item-name">${this._escapeHtml(item.name)}</span>
                    <span class="inv-item-rarity rarity-${item.rarity}">${item.rarity}</span>
                </div>
                <div class="inv-item-meta">
                    L${item.evolution_level} · ${new Date(item.acquired).toLocaleDateString()}
                    ${item.claim_context?.type ? ` · <span class="inv-claim-type">${item.claim_context.type}</span>` : ''}
                </div>
            </div>
        `).join('');
    },

    _escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    _escapeAttr(str) {
        return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    },
};
