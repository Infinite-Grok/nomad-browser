/* ============================================================
   Nomad Browser — Chat Panel
   LXMF tabbed conversations, send/receive via API polling
   ============================================================ */

const ChatPanel = {
    conversations: {},   // {address: {name, messages: [], element, unread}}
    activeAddress: null,
    ourAddress: null,
    pollInterval: null,
    waitingTimer: null,
    waitingStart: null,
    pendingAttachment: null,  // {name, content} or null

    // Configurable AI address — override from app config if available
    aiAddress: window.NOMAD_AI_ADDRESS || '89b6a6633e51cb8b9de6b26bb139e45d',

    async init() {
        // Fetch our LXMF address
        try {
            const resp = await fetch('/api/chat/identity');
            const data = await resp.json();
            this.ourAddress = data.address;
        } catch (e) {
            this.ourAddress = null;
        }

        // Load existing conversations
        try {
            const convResp = await fetch('/api/chat/conversations');
            const convs = await convResp.json();
            for (const conv of convs) {
                this.addTab(conv.address, conv.name || null);
            }
        } catch (e) { /* no existing convs */ }

        // Always add the "+" new conversation tab last
        this._addNewTab();

        // If we have any convs, activate the first one
        const addresses = Object.keys(this.conversations);
        if (addresses.length > 0) {
            this.switchTab(addresses[0]);
        }

        // Event listeners
        document.getElementById('msg-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('msg-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // File attachment
        document.getElementById('btn-attach').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', (e) => this._handleFileSelect(e));
        document.getElementById('attachment-remove').addEventListener('click', () => this._clearAttachment());

        // Start polling for new messages every 2 seconds
        this.pollInterval = setInterval(() => this.pollMessages(), 2000);
    },

    // ----------------------------------------------------------------
    // Tab management
    // ----------------------------------------------------------------

    _addNewTab() {
        const existing = document.getElementById('chat-tab-new');
        if (existing) existing.remove();

        const tab = document.createElement('div');
        tab.className = 'chat-tab';
        tab.id = 'chat-tab-new';
        tab.textContent = '+';
        tab.title = 'New conversation';
        tab.style.fontSize = '16px';
        tab.style.padding = '6px 14px';
        tab.style.color = 'var(--text-muted)';
        tab.addEventListener('click', () => this._promptNewConversation());
        document.getElementById('chat-tabs').appendChild(tab);
    },

    addTab(address, name) {
        if (this.conversations[address]) {
            // Already exists — update name if provided
            if (name) {
                this.conversations[address].name = name;
                if (this.conversations[address].element) {
                    this.conversations[address].element.dataset.name = name;
                    this._updateTabLabel(address);
                }
            }
            return;
        }

        const displayName = name || this._shortAddress(address);

        // Create tab element
        const tab = document.createElement('div');
        tab.className = 'chat-tab';
        tab.dataset.address = address;
        tab.dataset.name = displayName;
        tab.title = address;
        tab.textContent = displayName;

        tab.addEventListener('click', () => this.switchTab(address));
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.clearConversation(address);
        });

        // Insert before the "+" tab
        const newTab = document.getElementById('chat-tab-new');
        const container = document.getElementById('chat-tabs');
        if (newTab) {
            container.insertBefore(tab, newTab);
        } else {
            container.appendChild(tab);
        }

        // Store conversation state
        this.conversations[address] = {
            name: displayName,
            messages: [],
            element: tab,
            unread: 0
        };

        // If this is the first real conversation, activate it
        const addresses = Object.keys(this.conversations);
        if (addresses.length === 1) {
            this.switchTab(address);
        }
    },

    _updateTabLabel(address) {
        const conv = this.conversations[address];
        if (!conv || !conv.element) return;
        const unreadDot = conv.unread > 0 ? ' •' : '';
        conv.element.textContent = conv.name + unreadDot;
        conv.element.style.fontWeight = conv.unread > 0 ? 'bold' : '';
        conv.element.style.color = conv.unread > 0 ? 'var(--text-primary)' : '';
    },

    async switchTab(address) {
        if (!this.conversations[address]) return;

        // Deactivate all tabs
        document.querySelectorAll('#chat-tabs .chat-tab').forEach(t => t.classList.remove('active'));

        // Activate this tab
        const conv = this.conversations[address];
        if (conv.element) {
            conv.element.classList.add('active');
        }

        // Clear unread
        conv.unread = 0;
        this._updateTabLabel(address);

        this.activeAddress = address;

        // Load messages from API
        await this.loadMessages(address);
    },

    // ----------------------------------------------------------------
    // Message loading
    // ----------------------------------------------------------------

    async loadMessages(address) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        try {
            const resp = await fetch(`/api/chat/messages/${encodeURIComponent(address)}`);
            const messages = await resp.json();

            // Cache in conversation store
            if (this.conversations[address]) {
                this.conversations[address].messages = messages;
            }

            // Deduplicate messages (same content + timestamp = duplicate)
            const seen = new Set();
            for (const msg of messages) {
                const key = `${msg.from}:${msg.timestamp}:${msg.content}`;
                if (seen.has(key)) continue;
                seen.add(key);
                this._renderMessage(msg);
            }
        } catch (e) {
            // Show error inline
            this._renderSystemMessage('Could not load messages.');
        }

        this._scrollToBottom();
    },

    // ----------------------------------------------------------------
    // Sending messages
    // ----------------------------------------------------------------

    async sendMessage() {
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        const attachment = this.pendingAttachment;
        if (!text && !attachment) return;
        if (!this.activeAddress) return;
        input.value = '';

        // Pack attachment into the message content
        const content = this._buildMessageContent(text, attachment);
        this._clearAttachment();

        // Display outgoing message immediately (optimistic)
        const outgoing = {
            from: this.ourAddress,
            to: this.activeAddress,
            content: content,
            timestamp: new Date().toISOString(),
            status: 'sending'
        };
        this._renderMessage(outgoing);

        // Cache
        const conv = this.conversations[this.activeAddress];
        if (conv) conv.messages.push(outgoing);

        this._scrollToBottom();

        // Send via API
        try {
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: this.activeAddress, content })
            });
            // Show waiting state
            this.showWaiting();
        } catch (e) {
            this._renderSystemMessage('Failed to send message.');
            this._scrollToBottom();
        }
    },

    // ----------------------------------------------------------------
    // Polling
    // ----------------------------------------------------------------

    async pollMessages() {
        try {
            const resp = await fetch('/api/chat/new');
            const messages = await resp.json();

            for (const msg of messages) {
                const addr = msg.address || msg.from;
                if (!addr) continue;

                // Add tab if this is a new conversation
                if (!this.conversations[addr]) {
                    this.addTab(addr, null);
                }

                // Cache message
                const conv = this.conversations[addr];
                if (conv) conv.messages.push(msg);

                if (addr === this.activeAddress) {
                    // Active conversation: remove waiting state, render message
                    this.removeWaiting();
                    this._renderMessage(msg);
                    this._scrollToBottom();
                } else {
                    // Inactive: increment unread badge
                    if (conv) {
                        conv.unread = (conv.unread || 0) + 1;
                        this._updateTabLabel(addr);
                    }
                }
            }
        } catch (e) { /* silently fail */ }
    },

    // ----------------------------------------------------------------
    // Waiting state
    // ----------------------------------------------------------------

    showWaiting() {
        // Remove any existing waiting indicator first
        this.removeWaiting();

        const conv = this.conversations[this.activeAddress];
        const peerName = (conv && conv.name) ? conv.name : 'Nomad AI';

        const container = document.getElementById('chat-messages');

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message incoming ai';
        msgEl.id = 'waiting-indicator-msg';

        const senderEl = document.createElement('div');
        senderEl.className = 'sender';
        senderEl.textContent = peerName;

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'bubble waiting-indicator';
        bubbleEl.id = 'waiting-indicator-bubble';

        msgEl.appendChild(senderEl);
        msgEl.appendChild(bubbleEl);
        container.appendChild(msgEl);
        this._scrollToBottom();

        this.waitingStart = Date.now();

        // Update elapsed time every second
        this.waitingTimer = setInterval(() => {
            const el = document.getElementById('waiting-indicator-bubble');
            if (!el) {
                clearInterval(this.waitingTimer);
                this.waitingTimer = null;
                return;
            }
            const elapsed = Math.floor((Date.now() - this.waitingStart) / 1000);
            el.textContent = `● Message sent, waiting for reply... ${elapsed}s`;
        }, 1000);

        // Initial text
        bubbleEl.textContent = '● Message sent, waiting for reply... 0s';
    },

    removeWaiting() {
        if (this.waitingTimer) {
            clearInterval(this.waitingTimer);
            this.waitingTimer = null;
        }
        this.waitingStart = null;
        const el = document.getElementById('waiting-indicator-msg');
        if (el) el.remove();
    },

    // ----------------------------------------------------------------
    // Message rendering
    // ----------------------------------------------------------------

    _renderMessage(msg) {
        const container = document.getElementById('chat-messages');

        const isOutgoing = msg.from === this.ourAddress;
        const isAI = !isOutgoing && (
            msg.from === this.aiAddress ||
            (this.activeAddress === this.aiAddress)
        );

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        if (isOutgoing) {
            msgEl.classList.add('outgoing');
        } else if (isAI) {
            msgEl.classList.add('ai');
        } else {
            msgEl.classList.add('incoming');
        }

        // Sender label
        const senderEl = document.createElement('div');
        senderEl.className = 'sender';
        if (isOutgoing) {
            senderEl.textContent = 'You';
        } else if (isAI) {
            const conv = this.conversations[this.activeAddress];
            senderEl.textContent = (conv && conv.name) ? conv.name : 'Nomad AI';
        } else {
            const addr = msg.from || '';
            const conv = this.conversations[addr];
            senderEl.textContent = (conv && conv.name) ? conv.name : this._shortAddress(addr);
        }

        // Timestamp
        if (msg.timestamp) {
            const ts = document.createElement('span');
            ts.style.cssText = 'margin-left:8px; font-size:9px; color:var(--text-muted); font-weight:normal;';
            ts.textContent = this._formatTime(msg.timestamp);
            senderEl.appendChild(ts);
        }

        // Bubble content — parse attachments, sanitize
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'bubble';
        const rawContent = msg.content || '';
        const parsed = this._parseAttachment(rawContent);

        if (parsed.attachment) {
            const labelEl = document.createElement('div');
            labelEl.className = 'attachment-label';
            labelEl.textContent = parsed.attachment.name;
            bubbleEl.appendChild(labelEl);

            const blockEl = document.createElement('div');
            blockEl.className = 'attachment-block';
            blockEl.textContent = parsed.attachment.content;
            bubbleEl.appendChild(blockEl);
        }

        if (parsed.text) {
            const textEl = document.createElement('div');
            if (window.DOMPurify) {
                textEl.innerHTML = DOMPurify.sanitize(parsed.text, { ALLOWED_TAGS: [] });
            } else {
                textEl.textContent = parsed.text;
            }
            bubbleEl.appendChild(textEl);
        }

        msgEl.appendChild(senderEl);
        msgEl.appendChild(bubbleEl);
        container.appendChild(msgEl);
    },

    _renderSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center; color:var(--text-muted); font-size:11px; padding:8px; font-style:italic;';
        el.textContent = text;
        container.appendChild(el);
    },

    // ----------------------------------------------------------------
    // New conversation prompt
    // ----------------------------------------------------------------

    _promptNewConversation() {
        const address = window.prompt('Enter LXMF address to start a conversation:');
        if (!address) return;
        const trimmed = address.trim();
        if (!trimmed) return;
        const name = window.prompt(`Name for ${trimmed} (optional):`);
        this.newConversation(trimmed, name ? name.trim() : null);
    },

    async clearConversation(address) {
        if (!confirm('Clear this conversation?')) return;
        try {
            await fetch(`/api/chat/clear/${encodeURIComponent(address)}`, {method: 'DELETE'});
        } catch (e) { /* ok */ }
        // Clear local state
        if (this.conversations[address]) {
            this.conversations[address].messages = [];
        }
        if (address === this.activeAddress) {
            document.getElementById('chat-messages').innerHTML = '';
        }
    },

    // Public method — called externally (e.g. from drawer.js when clicking a node)
    newConversation(address, name) {
        if (!this.conversations[address]) {
            this.addTab(address, name || null);
        } else if (name && this.conversations[address].name !== name) {
            this.conversations[address].name = name;
            this._updateTabLabel(address);
        }
        this.switchTab(address);
        document.getElementById('msg-input').focus();
    },

    // ----------------------------------------------------------------
    // File attachments
    // ----------------------------------------------------------------

    _handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Max 64KB — LXMF messages have size limits on the mesh
        if (file.size > 65536) {
            this._renderSystemMessage('File too large. Max 64 KB for mesh transport.');
            this._scrollToBottom();
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            this.pendingAttachment = { name: file.name, content: ev.target.result };
            document.getElementById('attachment-name').textContent = file.name + ' (' + this._formatSize(file.size) + ')';
            document.getElementById('attachment-preview').classList.remove('hidden');
        };
        reader.readAsText(file);
        e.target.value = '';  // reset so same file can be re-selected
    },

    _clearAttachment() {
        this.pendingAttachment = null;
        document.getElementById('attachment-preview').classList.add('hidden');
        document.getElementById('attachment-name').textContent = '';
    },

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        return (bytes / 1024).toFixed(1) + ' KB';
    },

    _buildMessageContent(text, attachment) {
        // Pack attachment inline with delimiters the AI and peers can parse
        if (!attachment) return text;
        let packed = '--- ATTACHED FILE: ' + attachment.name + ' ---\n';
        packed += attachment.content;
        packed += '\n--- END FILE ---';
        if (text) packed += '\n\n' + text;
        return packed;
    },

    _parseAttachment(content) {
        // Extract attachment block if present
        const startMarker = '--- ATTACHED FILE: ';
        const endMarker = '\n--- END FILE ---';
        if (!content.startsWith(startMarker)) return { text: content, attachment: null };

        const nameEnd = content.indexOf(' ---\n', startMarker.length);
        if (nameEnd < 0) return { text: content, attachment: null };

        const fileName = content.substring(startMarker.length, nameEnd);
        const fileStart = nameEnd + 5; // ' ---\n'.length
        const fileEnd = content.indexOf(endMarker, fileStart);
        if (fileEnd < 0) return { text: content, attachment: null };

        const fileContent = content.substring(fileStart, fileEnd);
        const remaining = content.substring(fileEnd + endMarker.length).replace(/^\n\n/, '');
        return { text: remaining, attachment: { name: fileName, content: fileContent } };
    },

    // ----------------------------------------------------------------
    // Utilities
    // ----------------------------------------------------------------

    _scrollToBottom() {
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
    },

    _shortAddress(address) {
        if (!address) return 'Unknown';
        return address.substring(0, 12) + '…';
    },

    _formatTime(isoString) {
        try {
            const d = new Date(isoString);
            const now = new Date();
            const isToday =
                d.getFullYear() === now.getFullYear() &&
                d.getMonth() === now.getMonth() &&
                d.getDate() === now.getDate();
            if (isToday) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                   d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }
};
