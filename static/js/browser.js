/**
 * browser.js — Page Browser for Nomad Browser
 *
 * Manages browser tabs, address bar, back/forward navigation,
 * and fetching + rendering Micron pages via the /api/pages/fetch endpoint.
 *
 * Depends on:
 *   - micron.js  (MicronParser.render)
 *   - purify.min.js  (DOMPurify, used by MicronParser)
 *
 * Exposes:
 *   window.PageBrowser  — for app.js to wire up
 */

const PageBrowser = {

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /** @type {Array<{id: string, title: string, hash: string|null, path: string|null, history: Array<{hash: string, path: string}>, historyIndex: number, element: HTMLElement, contentElement: HTMLElement}>} */
    tabs: [],

    /** @type {string|null} */
    activeTabId: null,

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    init() {
        document.getElementById('nav-back').addEventListener('click',   () => this.goBack());
        document.getElementById('nav-fwd').addEventListener('click',    () => this.goForward());
        document.getElementById('nav-reload').addEventListener('click', () => this.reload());
        document.getElementById('address-bar').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.navigateFromAddressBar();
        });

        // Clear static welcome message — tabs manage their own content
        const pageContentEl = document.getElementById('page-content');
        pageContentEl.innerHTML = '';

        // Start with one blank tab
        this.addTab();

        // Update nav button states whenever the active tab changes
        this._updateNavButtons();
    },

    // -------------------------------------------------------------------------
    // Tab management
    // -------------------------------------------------------------------------

    addTab(hash = null, path = null) {
        const id = this._generateId();
        const tabsEl = document.getElementById('browser-tabs');
        const pageContentEl = document.getElementById('page-content');

        // --- Tab label element ---
        const tabEl = document.createElement('div');
        tabEl.className = 'browser-tab';
        tabEl.dataset.tabId = id;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'browser-tab-label';
        labelSpan.textContent = 'New Tab';
        tabEl.appendChild(labelSpan);

        // Close button (only show if more than one tab)
        const closeBtn = document.createElement('span');
        closeBtn.className = 'browser-tab-close';
        closeBtn.textContent = ' ×';
        closeBtn.title = 'Close tab';
        closeBtn.style.marginLeft = '6px';
        closeBtn.style.opacity = '0.5';
        closeBtn.style.fontSize = '14px';
        closeBtn.style.lineHeight = '1';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(id);
        });
        tabEl.appendChild(closeBtn);

        tabEl.addEventListener('click', () => this.switchTab(id));

        // --- Content div ---
        const contentEl = document.createElement('div');
        contentEl.className = 'tab-page-content';
        contentEl.style.display = 'none';
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
        // Welcome message for blank tabs
        contentEl.innerHTML = `<div class="welcome-message">
            <h2>Nomad Browser</h2>
            <p>The first unified client for the Reticulum mesh network.</p>
            <p style="color: #8b949e;">Enter a node hash in the address bar to begin.</p>
        </div>`;
        pageContentEl.appendChild(contentEl);

        // --- Tab record ---
        const tab = {
            id,
            title: 'New Tab',
            hash: hash,
            path: path,
            history: [],
            historyIndex: -1,
            element: tabEl,
            contentElement: contentEl,
        };
        this.tabs.push(tab);

        // Insert tab before the "+" button (or at end if no "+" yet)
        const addBtn = tabsEl.querySelector('.browser-tab-add');
        if (addBtn) {
            tabsEl.insertBefore(tabEl, addBtn);
        } else {
            tabsEl.appendChild(tabEl);
        }

        // Ensure there's a "+" new-tab button at the end
        this._ensureAddButton();

        // Switch to the new tab
        this.switchTab(id);

        // If we have a destination, navigate there
        if (hash) {
            this.navigate(hash, path);
        }

        return id;
    },

    switchTab(tabId) {
        // Hide all tab content divs
        for (const tab of this.tabs) {
            tab.contentElement.style.display = 'none';
            tab.element.classList.remove('active');
        }

        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        tab.contentElement.style.display = 'block';
        tab.element.classList.add('active');
        this.activeTabId = tabId;

        // Sync address bar
        this._syncAddressBar(tab);
        this._updateNavButtons();
    },

    closeTab(tabId) {
        const idx = this.tabs.findIndex(t => t.id === tabId);
        if (idx === -1) return;

        const tab = this.tabs[idx];

        // Remove DOM elements
        tab.element.remove();
        tab.contentElement.remove();

        // Remove from array
        this.tabs.splice(idx, 1);

        // If this was the last tab, create a new blank one
        if (this.tabs.length === 0) {
            this.addTab();
            return;
        }

        // Switch to adjacent tab: prefer previous, else next
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.switchTab(this.tabs[newIdx].id);
    },

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    /**
     * Main navigation entry point.
     * Called by the address bar, Micron links (via window.nomadBrowser.navigateTo),
     * and the node drawer.
     *
     * @param {string|null} hash  — node hash, or null to use the current tab's node
     * @param {string|null} path  — page path e.g. "/page/index.mu"
     */
    async navigate(hash, path) {
        const tab = this.getActiveTab();
        if (!tab) return;

        // Resolve null hash to the current tab's hash
        if (!hash && tab.hash) {
            hash = tab.hash;
        }
        if (!hash) {
            this._showError(tab, 'No node hash specified.');
            return;
        }

        // Default path
        if (!path) path = '/page/index.mu';

        // Push to history (truncate forward history if mid-stack)
        const newEntry = { hash, path };
        if (tab.historyIndex < tab.history.length - 1) {
            tab.history.splice(tab.historyIndex + 1);
        }
        tab.history.push(newEntry);
        tab.historyIndex = tab.history.length - 1;

        await this._fetchAndRender(tab, hash, path);
    },

    navigateFromAddressBar() {
        const value = document.getElementById('address-bar').value.trim();
        if (!value) return;

        let hash, path;
        const colonSlash = value.indexOf(':/');
        if (colonSlash > 0) {
            hash = value.substring(0, colonSlash);
            path = value.substring(colonSlash + 1); // includes leading slash
        } else {
            hash = value;
            path = '/page/index.mu';
        }

        this.navigate(hash, path);
    },

    goBack() {
        const tab = this.getActiveTab();
        if (!tab || tab.historyIndex <= 0) return;
        tab.historyIndex--;
        const entry = tab.history[tab.historyIndex];
        this._navigateWithoutHistory(entry.hash, entry.path);
    },

    goForward() {
        const tab = this.getActiveTab();
        if (!tab || tab.historyIndex >= tab.history.length - 1) return;
        tab.historyIndex++;
        const entry = tab.history[tab.historyIndex];
        this._navigateWithoutHistory(entry.hash, entry.path);
    },

    reload() {
        const tab = this.getActiveTab();
        if (!tab || !tab.hash) return;
        this._navigateWithoutHistory(tab.hash, tab.path || '/page/index.mu');
    },

    // -------------------------------------------------------------------------
    // Internal navigation helpers
    // -------------------------------------------------------------------------

    async _navigateWithoutHistory(hash, path) {
        const tab = this.getActiveTab();
        if (!tab) return;
        if (!path) path = '/page/index.mu';
        await this._fetchAndRender(tab, hash, path);
    },

    async _fetchAndRender(tab, hash, path) {
        // Update tab state immediately
        tab.hash = hash;
        tab.path = path;

        // Sync address bar
        this._syncAddressBar(tab);
        this._updateNavButtons();

        // Show loading state
        this._showLoading(tab);

        let data;
        try {
            const url = `/api/pages/fetch/${encodeURIComponent(hash)}?path=${encodeURIComponent(path)}`;
            const resp = await fetch(url);
            data = await resp.json();
        } catch (err) {
            this._showError(tab, `Network error: ${err.message}`);
            return;
        }

        if (data.error || data.status === 'error') {
            this._showError(tab, data.error || 'Unknown error fetching page.');
            return;
        }

        if (!data.content) {
            this._showError(tab, 'Empty response from node.');
            return;
        }

        // Clear the content area and render
        const contentEl = tab.contentElement;
        contentEl.innerHTML = '';

        // Detect HTML vs Micron content
        const trimmed = data.content.trimStart();
        const isHTML = trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')
            || trimmed.startsWith('<body') || trimmed.startsWith('<div');

        let title;
        if (isHTML) {
            // Render HTML in a sandboxed iframe
            const iframe = document.createElement('iframe');
            iframe.className = 'html-page-frame';
            iframe.sandbox = 'allow-scripts allow-same-origin';
            iframe.style.cssText = 'width:100%; height:100%; border:none; background:#fff;';
            contentEl.appendChild(iframe);
            iframe.srcdoc = data.content;
            // Try to extract title from HTML
            const titleMatch = data.content.match(/<title[^>]*>([^<]+)<\/title>/i);
            title = titleMatch ? titleMatch[1] : this._shortHash(hash);
        } else {
            // Micron markup (.mu)
            const pageDiv = document.createElement('div');
            pageDiv.className = 'mu-page';
            pageDiv.style.padding = '12px 16px';
            contentEl.appendChild(pageDiv);
            MicronParser.render(data.content, pageDiv, { nodeHash: hash });
            title = this._extractTitle(data.content) || this._shortHash(hash);
        }

        // Scan for loot drops
        if (typeof LootOverlay !== 'undefined' && LootOverlay.enabled) {
            const drops = await LootOverlay.scanPage(data.content, hash, path);
            if (drops.length > 0) {
                LootOverlay.showDrops(drops, contentEl, hash, path);
            }
        }

        // Extract a title
        tab.title = title;
        tab.element.querySelector('.browser-tab-label').textContent = title;
    },

    // -------------------------------------------------------------------------
    // UI state helpers
    // -------------------------------------------------------------------------

    _showLoading(tab) {
        tab.contentElement.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center;
                        height:100%; color: var(--text-muted); font-family: Consolas, monospace;
                        font-size: 13px;">
                <span class="waiting-indicator">Loading...</span>
            </div>`;
    },

    _showError(tab, message) {
        tab.contentElement.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:flex-start;
                        padding: 24px 20px; font-family: Consolas, monospace; font-size: 12px;">
                <div style="color: #f85149; white-space: pre-wrap; word-break: break-all;">
                    Error: ${this._escapeHtml(message)}
                </div>
            </div>`;
    },

    _syncAddressBar(tab) {
        const addressBar = document.getElementById('address-bar');
        if (tab.hash && tab.path) {
            addressBar.value = `${tab.hash}:${tab.path}`;
        } else if (tab.hash) {
            addressBar.value = tab.hash;
        } else {
            addressBar.value = '';
        }
    },

    _updateNavButtons() {
        const tab = this.getActiveTab();
        const backBtn = document.getElementById('nav-back');
        const fwdBtn  = document.getElementById('nav-fwd');

        const canBack = tab && tab.historyIndex > 0;
        const canFwd  = tab && tab.historyIndex < tab.history.length - 1;

        backBtn.style.opacity = canBack ? '1' : '0.35';
        backBtn.style.cursor  = canBack ? 'pointer' : 'default';
        fwdBtn.style.opacity  = canFwd  ? '1' : '0.35';
        fwdBtn.style.cursor   = canFwd  ? 'pointer' : 'default';
    },

    _ensureAddButton() {
        const tabsEl = document.getElementById('browser-tabs');
        let addBtn = tabsEl.querySelector('.browser-tab-add');
        if (!addBtn) {
            addBtn = document.createElement('div');
            addBtn.className = 'browser-tab browser-tab-add';
            addBtn.title = 'New tab';
            addBtn.textContent = '+';
            addBtn.style.padding = '6px 12px';
            addBtn.addEventListener('click', () => this.addTab());
            tabsEl.appendChild(addBtn);
        }
    },

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId) || null;
    },

    /**
     * Extract a human-readable title from Micron content.
     * Looks for the first heading line (starts with '>') or first non-empty line.
     */
    _extractTitle(content) {
        if (!content) return null;
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            // Micron heading: one or more leading '>'
            if (trimmed.startsWith('>')) {
                const text = trimmed.replace(/^>+/, '').replace(/`[^`]*/g, '').trim();
                if (text) return text.substring(0, 40);
            }
            // First non-comment, non-empty line
            const text = trimmed.replace(/`[^`]*/g, '').replace(/^\[.*?\]/, '').trim();
            if (text && !text.startsWith('#!')) return text.substring(0, 40);
        }
        return null;
    },

    _shortHash(hash) {
        if (!hash) return 'Unknown';
        return hash.substring(0, 8) + '...';
    },

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    _generateId() {
        return 'tab-' + Math.random().toString(36).substr(2, 9);
    },
};

// Expose globally for app.js wiring
window.PageBrowser = PageBrowser;
