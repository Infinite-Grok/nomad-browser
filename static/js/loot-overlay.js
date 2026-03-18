const LootOverlay = {
    enabled: true,

    async scanPage(content, nodeHash, pagePath) {
        if (!this.enabled) return [];
        try {
            const resp = await fetch('/api/game/scan', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({content, node_hash: nodeHash, page_path: pagePath}),
            });
            const data = await resp.json();
            return data.drops || [];
        } catch (e) {
            console.error('[LootOverlay] scan failed:', e);
            return [];
        }
    },

    showDrops(drops, container, nodeHash, pagePath) {
        container.querySelectorAll('.loot-indicator').forEach(el => el.remove());
        container.querySelectorAll('.loot-banner').forEach(el => el.remove());
        if (drops.length === 0) return;

        const banner = document.createElement('div');
        banner.className = 'loot-banner';
        banner.innerHTML = `<span class="loot-icon">✦</span> ${drops.length} loot drop${drops.length > 1 ? 's' : ''} on this page`;
        container.insertBefore(banner, container.firstChild);

        drops.forEach((drop, i) => {
            const indicator = document.createElement('div');
            indicator.className = 'loot-indicator';
            indicator.innerHTML = `
                <span class="loot-glow">✦</span>
                <span class="loot-name">${drop.item}</span>
                ${drop.hint ? `<span class="loot-hint">${drop.hint}</span>` : ''}
                <button class="loot-claim-btn" data-index="${i}">Claim</button>
            `;
            indicator.querySelector('.loot-claim-btn').addEventListener('click', async () => {
                await this.claimDrop(drop, nodeHash, pagePath, indicator);
            });
            container.insertBefore(indicator, banner.nextSibling);
        });
    },

    async claimDrop(drop, nodeHash, pagePath, indicatorEl) {
        const btn = indicatorEl.querySelector('.loot-claim-btn');
        btn.disabled = true;
        btn.textContent = 'Claiming...';
        try {
            const resp = await fetch('/api/game/claim', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({drop, node_hash: nodeHash, page_path: pagePath}),
            });
            const result = await resp.json();
            if (result.status === 'claimed') {
                indicatorEl.classList.add('loot-claimed');
                btn.textContent = 'Claimed!';
                this._showClaimToast(result.item);
                if (typeof InventoryPanel !== 'undefined') InventoryPanel.refresh();
            } else if (result.status === 'already_claimed') {
                indicatorEl.classList.add('loot-already');
                btn.textContent = 'Already claimed';
            } else if (result.status === 'cooldown') {
                btn.textContent = 'On cooldown';
                btn.disabled = false;
            }
        } catch (e) {
            console.error('[LootOverlay] claim failed:', e);
            btn.textContent = 'Error';
            btn.disabled = false;
        }
    },

    _showClaimToast(item) {
        const toast = document.createElement('div');
        toast.className = 'loot-toast';
        toast.innerHTML = `<span class="loot-icon">✦</span> <strong>${item.name}</strong> added to inventory! <span class="loot-rarity">${item.rarity}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
};
