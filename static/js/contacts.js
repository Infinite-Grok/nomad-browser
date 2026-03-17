/* ============================================================
   Nomad Browser — Contacts Drawer
   Left-side panel showing saved contacts,
   search filter, and click-to-chat functionality.
   ============================================================ */

const ContactsDrawer = {
    contacts: [],
    isOpen: false,

    init() {
        document.getElementById('btn-contacts').addEventListener('click', () => this.toggle());
        document.getElementById('contacts-drawer-close').addEventListener('click', () => this.close());
        document.getElementById('contact-search').addEventListener('input', (e) => this.filterContacts(e.target.value));
        document.getElementById('btn-add-contact').addEventListener('click', () => this.showAddContactDialog());

        // Close drawer when clicking outside of it
        document.addEventListener('click', (e) => {
            if (this.isOpen) {
                const drawer = document.getElementById('contacts-drawer');
                const contactsBtn = document.getElementById('btn-contacts');
                if (!drawer.contains(e.target) && !contactsBtn.contains(e.target)) {
                    this.close();
                }
            }
        });

        // Load contacts from server
        this.loadContacts();
    },

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    },

    open() {
        document.getElementById('contacts-drawer').classList.remove('hidden');
        this.isOpen = true;
        this.loadContacts(); // Refresh on open
    },

    close() {
        document.getElementById('contacts-drawer').classList.add('hidden');
        this.isOpen = false;
    },

    async loadContacts() {
        try {
            const resp = await fetch('/api/contacts');
            if (!resp.ok) { this.contacts = []; return; }
            this.contacts = await resp.json();
            this.renderContacts();
        } catch (e) {
            this.contacts = [];
        }
    },

    renderContacts() {
        const list = document.getElementById('contacts-list');
        const searchValue = document.getElementById('contact-search').value.toLowerCase().trim();
        list.innerHTML = '';

        if (this.contacts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'drawer-empty';
            empty.textContent = 'No contacts yet. Add someone to chat with!';
            list.appendChild(empty);
            return;
        }

        const filtered = searchValue
            ? this.contacts.filter(c =>
                c.name.toLowerCase().includes(searchValue) ||
                c.address.toLowerCase().includes(searchValue))
            : this.contacts;

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'drawer-empty';
            empty.textContent = 'No contacts match your search.';
            list.appendChild(empty);
            return;
        }

        for (const contact of filtered) {
            list.appendChild(this.createContactItem(contact));
        }
    },

    createContactItem(contact) {
        const item = document.createElement('div');
        item.className = 'contact-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'contact-name';
        nameEl.textContent = contact.name;
        item.appendChild(nameEl);

        const addressEl = document.createElement('div');
        addressEl.className = 'contact-address';
        addressEl.textContent = contact.address;
        item.appendChild(addressEl);

        // Click to start chat
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking action buttons
            if (e.target.classList.contains('play-checkers-btn') || e.target.classList.contains('remove-contact-btn')) {
                return;
            }
            if (typeof ChatPanel !== 'undefined') {
                ChatPanel.newConversation(contact.address, contact.name);
            }
            this.close();
        });

        // Play Checkers button
        const gameBtn = document.createElement('button');
        gameBtn.className = 'play-checkers-btn';
        gameBtn.textContent = '🎮';
        gameBtn.title = 'Play Checkers';
        gameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
            if (typeof CheckersGame !== 'undefined') {
                CheckersGame.newGame(contact.address, contact.name);
            }
        });
        item.appendChild(gameBtn);

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-contact-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove contact';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeContact(contact.address);
        });
        item.appendChild(removeBtn);

        return item;
    },

    filterContacts(query) {
        this.renderContacts();
    },

    async showAddContactDialog() {
        const address = prompt('Enter LXMF address:');
        if (!address) return;
        
        const name = prompt('Display name (optional):') || address.substring(0, 16) + '...';
        
        try {
            const resp = await fetch('/api/contacts/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: address.trim(), name: name.trim() })
            });
            const data = await resp.json();
            if (data.status === 'ok') {
                this.loadContacts();
            } else {
                alert('Error adding contact: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Error adding contact: ' + e.message);
        }
    },

    async removeContact(address) {
        if (!confirm('Remove this contact?')) return;
        
        try {
            const resp = await fetch('/api/contacts/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address })
            });
            const data = await resp.json();
            if (data.status === 'ok') {
                this.loadContacts();
            } else {
                alert('Error removing contact: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Error removing contact: ' + e.message);
        }
    }
};
