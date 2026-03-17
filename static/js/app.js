/**
 * app.js — Nomad Browser main controller
 * Initializes all modules, wires cross-panel communication,
 * handles panel resizing, and sets up keyboard shortcuts.
 */

const NomadBrowser = {
    chatCollapsed: false,

    init() {
        // 1. Initialize all modules
        ChatPanel.init();
        PageBrowser.init();
        NodeDrawer.init();

        // 2. Set up global navigation handler (called by Micron links)
        window.nomadBrowser = {
            navigateTo: (hash, path) => this.navigateTo(hash, path)
        };

        // 3. Set up panel resize
        this.setupResize();

        // 4. Set up keyboard shortcuts
        this.setupKeyboard();

        // 5. Set up chat collapse toggle
        document.getElementById('btn-collapse-chat').addEventListener('click', () => this.toggleChatPanel());

        console.log('Nomad Browser initialized');
    },

    navigateTo(hash, path) {
        // Global navigation — called by Micron links, AI recommendations, drawer
        PageBrowser.navigate(hash, path);
    },

    toggleChatPanel() {
        const chatPanel = document.getElementById('chat-panel');
        const resizeHandle = document.getElementById('panel-resize');
        this.chatCollapsed = !this.chatCollapsed;

        if (this.chatCollapsed) {
            chatPanel.style.display = 'none';
            resizeHandle.style.display = 'none';
        } else {
            chatPanel.style.display = '';
            resizeHandle.style.display = '';
        }
    },

    setupResize() {
        const handle = document.getElementById('panel-resize');
        const chatPanel = document.getElementById('chat-panel');
        let isResizing = false;
        let startX, startWidth;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = chatPanel.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(startWidth + delta, window.innerWidth * 0.6));
            chatPanel.style.width = newWidth + 'px';
            chatPanel.style.flex = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    },

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+C — toggle chat panel
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                this.toggleChatPanel();
            }
            // Ctrl+Shift+N — new conversation
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault();
                const address = prompt('Enter LXMF address:');
                if (address) {
                    const name = prompt('Display name (optional):') || address.substring(0, 16) + '...';
                    ChatPanel.newConversation(address.trim(), name);
                }
            }
            // Ctrl+Shift+D — toggle node drawer
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                NodeDrawer.toggle();
            }
            // Ctrl+T — new page tab
            if (e.ctrlKey && !e.shiftKey && e.key === 't') {
                e.preventDefault();
                PageBrowser.addTab();
            }
            // Ctrl+W — close current page tab
            if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
                e.preventDefault();
                if (PageBrowser.activeTabId) {
                    PageBrowser.closeTab(PageBrowser.activeTabId);
                }
            }
            // Ctrl+L — focus address bar
            if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
                e.preventDefault();
                const bar = document.getElementById('address-bar');
                bar.focus();
                bar.select();
            }
        });
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    NomadBrowser.init();
});
