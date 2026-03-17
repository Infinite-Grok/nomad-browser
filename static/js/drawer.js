/* ============================================================
   Nomad Browser — Node Drawer
   Collapsible right-side panel showing discovered nodes,
   search filter, favorites, and click-to-browse navigation.
   ============================================================ */

const NodeDrawer = {
    nodes: [],
    favorites: [],
    isOpen: false,
    pollInterval: null,

    init() {
        document.getElementById('btn-drawer').addEventListener('click', () => this.toggle());
        document.getElementById('drawer-close').addEventListener('click', () => this.close());
        document.getElementById('node-search').addEventListener('input', (e) => this.filterNodes(e.target.value));

        // Close drawer when clicking outside of it
        document.addEventListener('click', (e) => {
            if (this.isOpen) {
                const drawer = document.getElementById('node-drawer');
                const drawerBtn = document.getElementById('btn-drawer');
                if (!drawer.contains(e.target) && !drawerBtn.contains(e.target)) {
                    this.close();
                }
            }
        });

        // Load favorites from server
        this.loadFavorites();

        // Start polling nodes every 5 seconds
        this.pollInterval = setInterval(() => this.pollNodes(), 5000);
        this.pollNodes(); // Initial load
    },

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    },

    open() {
        document.getElementById('node-drawer').classList.remove('hidden');
        this.isOpen = true;
        this.pollNodes(); // Refresh on open
    },

    close() {
        document.getElementById('node-drawer').classList.add('hidden');
        this.isOpen = false;
    },

    async pollNodes() {
        try {
            const resp = await fetch('/api/nodes');
            if (!resp.ok) return;
            this.nodes = await resp.json();
            if (this.isOpen) this.renderNodes(this.nodes);
        } catch (e) { /* silently fail — network may not be ready */ }
    },

    renderNodes(nodes) {
        const list = document.getElementById('node-list');
        const searchValue = document.getElementById('node-search').value.toLowerCase().trim();
        list.innerHTML = '';

        // Favorites section
        if (this.favorites.length > 0) {
            const favHeader = document.createElement('div');
            favHeader.className = 'drawer-section-header';
            favHeader.textContent = 'Favorites';
            list.appendChild(favHeader);

            for (const fav of this.favorites) {
                if (searchValue && !fav.name.toLowerCase().includes(searchValue) && !fav.hash.includes(searchValue)) continue;
                list.appendChild(this.createNodeItem(fav.hash, fav.name, null, true));
            }
        }

        // All nodes section
        const allHeader = document.createElement('div');
        allHeader.className = 'drawer-section-header';
        allHeader.textContent = `Nodes (${nodes.length})`;
        list.appendChild(allHeader);

        if (nodes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'drawer-empty';
            empty.textContent = 'No nodes discovered yet.';
            list.appendChild(empty);
            return;
        }

        const filtered = searchValue
            ? nodes.filter(n =>
                n.name.toLowerCase().includes(searchValue) ||
                n.hash.includes(searchValue))
            : nodes;

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'drawer-empty';
            empty.textContent = 'No nodes match your search.';
            list.appendChild(empty);
            return;
        }

        for (const node of filtered) {
            list.appendChild(this.createNodeItem(node.hash, node.name, node.hops, this.isFavorite(node.hash)));
        }
    },

    createNodeItem(hash, name, hops, isFav) {
        const item = document.createElement('div');
        item.className = 'node-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'node-name';
        nameEl.textContent = (isFav ? '★ ' : '') + name;
        item.appendChild(nameEl);

        const hashEl = document.createElement('div');
        hashEl.className = 'node-hash';
        const hopStr = (hops !== null && hops !== undefined)
            ? ` · ${hops} hop${hops !== 1 ? 's' : ''}`
            : '';
        hashEl.textContent = hash + hopStr;
        item.appendChild(hashEl);

        // Click to navigate to the node's index page
        item.addEventListener('click', () => {
            if (typeof PageBrowser !== 'undefined') {
                PageBrowser.navigate(hash, '/page/index.mu');
            }
            this.close();
        });

        // Favorite toggle button
        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn';
        favBtn.textContent = isFav ? '★' : '☆';
        favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isFav) this.removeFavorite(hash);
            else this.addFavorite(hash, name);
        });
        item.appendChild(favBtn);

        return item;
    },

    filterNodes(query) {
        this.renderNodes(this.nodes);
    },

    isFavorite(hash) {
        return this.favorites.some(f => f.hash === hash);
    },

    async addFavorite(hash, name) {
        if (this.isFavorite(hash)) return;
        this.favorites.push({ hash, name });
        await this.saveFavorites();
        this.renderNodes(this.nodes);
    },

    async removeFavorite(hash) {
        this.favorites = this.favorites.filter(f => f.hash !== hash);
        await this.saveFavorites();
        this.renderNodes(this.nodes);
    },

    async loadFavorites() {
        try {
            const resp = await fetch('/api/favorites');
            if (!resp.ok) { this.favorites = []; return; }
            const data = await resp.json();
            this.favorites = Array.isArray(data) ? data : (data.favorites || []);
        } catch (e) {
            this.favorites = [];
        }
    },

    async saveFavorites() {
        try {
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ favorites: this.favorites })
            });
        } catch (e) { /* silently fail */ }
    }
};
