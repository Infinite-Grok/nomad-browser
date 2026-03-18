/* ============================================================
   Nomad Browser — Checkers Game Integration
   LXMF-based checkers play via chat tabs
   ============================================================ */

// Server-side debug logger
function _glog(msg) {
    console.log(msg);
    fetch('/api/debug/log', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({msg: '[' + location.port + '] ' + msg})}).catch(()=>{});
}

const CheckersGame = {
    games: {},           // {address: {engine, ui, tabId, boardEl, statusEl}}
    activeAddress: null,
    ourColor: null,      // 'black' or 'red' — which side we're playing

    // Initialize a new game against an opponent
    async newGame(opponentAddress, opponentName) {
        _glog('[Checkers] newGame called: ' + opponentAddress + ' / ' + opponentName);

        // Create game state — inviter plays black (moves first)
        const engine = new CheckersEngine(null, 'black');
        this.ourColor = 'black';

        // Create or activate game tab
        const tabId = 'game-' + opponentAddress.replace(/[^a-z0-9]/g, '');
        
        // Send game invitation message
        const invitePayload = JSON.stringify({
            type: 'game',
            game: 'checkers',
            action: 'invite',
            board: engine.board,
            turn: engine.turn,
            ourColor: this.ourColor
        });

        try {
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: opponentAddress,
                    content: invitePayload
                })
            });

            // Create the game tab
            this._createGameTab(opponentAddress, opponentName || opponentAddress, engine, tabId);
            
            // Switch to the game tab
            if (typeof ChatPanel !== 'undefined') {
                ChatPanel.switchTab(opponentAddress);
            }

            console.log('Checkers invite sent to', opponentAddress);
        } catch (e) {
            alert('Failed to send game invitation: ' + e.message);
        }
    },

    // Handle incoming game message
    handleGameMessage(msg) {
        const addr = msg.address || msg.from;
        if (!addr) return;

        let payload;
        try {
            payload = JSON.parse(msg.content);
        } catch (e) {
            // Not a game message, let chat handle it
            return false;
        }

        if (payload.type !== 'game' || payload.game !== 'checkers') {
            return false; // Not a checkers message
        }

        // Handle different game actions
        switch (payload.action) {
            case 'invite':
                this._handleInvite(addr, payload);
                break;
            case 'accept':
                this._handleAccept(addr, payload);
                break;
            case 'move':
                this._handleMove(addr, payload);
                break;
            case 'resign':
                this._handleResign(addr, payload);
                break;
            case 'newgame':
                this._handleNewGame(addr, payload);
                break;
        }

        return true; // We handled this message
    },

    // Handle game invitation — show a toast notification, don't hijack the page
    _handleInvite(addr, payload) {
        _glog('[Checkers] Invite received from ' + addr);
        this._pendingInvites = this._pendingInvites || {};
        this._pendingInvites[addr] = payload;

        // Don't clobber an active game
        if (this.games[addr]) return;

        // Get contact name if available
        const convName = (typeof ChatPanel !== 'undefined' && ChatPanel.conversations[addr])
            ? ChatPanel.conversations[addr].name : addr.substring(0, 12) + '...';

        // Show non-intrusive toast notification at top of page
        const existing = document.getElementById('checkers-invite-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'checkers-invite-toast';
        toast.style.cssText = `position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:9999;
            background:#1c2333; border:1px solid #e6a817; border-radius:8px; padding:12px 20px;
            display:flex; align-items:center; gap:16px; font-family:monospace; box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
        toast.innerHTML = `
            <span style="color:#e6a817; font-size:18px;">&#9823;</span>
            <span style="color:#ccc;">Checkers challenge from <b style="color:#fff;">${convName}</b></span>
            <button id="invite-accept" style="padding:6px 16px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer;">Accept</button>
            <button id="invite-decline" style="padding:6px 16px; background:#444; color:#ccc; border:none; border-radius:4px; cursor:pointer;">Decline</button>
        `;
        document.body.appendChild(toast);

        document.getElementById('invite-accept').addEventListener('click', () => {
            toast.remove();
            this._acceptInvite(addr);
        });
        document.getElementById('invite-decline').addEventListener('click', () => {
            toast.remove();
            this._sendGameMessage(addr, { action: 'decline' });
            delete this._pendingInvites[addr];
        });
    },

    // Accept a pending invite
    _acceptInvite(addr) {
        const payload = (this._pendingInvites || {})[addr];
        if (!payload) return;
        delete this._pendingInvites[addr];

        this.ourColor = 'red';
        const engine = CheckersEngine.fromJSON({
            board: payload.board,
            turn: payload.turn
        });

        const tabId = 'game-' + addr.replace(/[^a-z0-9]/g, '');
        this._createGameTab(addr, addr, engine, tabId);

        // Send acceptance
        this._sendGameMessage(addr, {
            action: 'accept',
            board: engine.board,
            turn: engine.turn
        });

        // Show game board
        this._showInRightPanel(addr);

        if (typeof ChatPanel !== 'undefined') {
            ChatPanel.switchTab(addr);
        }
    },

    // Handle opponent accepting our invite
    _handleAccept(addr, payload) {
        const game = this.games[addr];
        if (game) {
            // Game already exists (we created it when sending invite) — update status
            if (game.statusEl) {
                if (game.engine.turn === this.ourColor) {
                    game.statusEl.textContent = 'Your turn!';
                    game.statusEl.style.color = '#4caf50';
                } else {
                    game.statusEl.textContent = "Opponent's turn";
                    game.statusEl.style.color = '#8b949e';
                }
            }
            game.ui.render();
            console.log('Opponent accepted checkers game');
        } else {
            // Game doesn't exist (page was refreshed) — recreate from payload
            const engine = CheckersEngine.fromJSON({
                board: payload.board || 'bbbbbbbbbbbb........rrrrrrrrrrrr',
                turn: payload.turn || 'black'
            });
            this.ourColor = 'black'; // We sent the invite, we're black
            const tabId = 'game-' + addr.replace(/[^a-z0-9]/g, '');
            this._createGameTab(addr, addr, engine, tabId);
        }
    },

    // Handle opponent requesting a new game
    _handleNewGame(addr, payload) {
        // Opponent's senderColor tells us what they chose — we get the opposite
        this.ourColor = (payload.senderColor === 'black') ? 'red' : 'black';

        this.cleanup(addr);

        const engine = CheckersEngine.fromJSON({
            board: payload.board,
            turn: payload.turn
        });

        const tabId = 'game-' + addr.replace(/[^a-z0-9]/g, '');
        this._createGameTab(addr, addr, engine, tabId);
        this._showInRightPanel(addr);

        if (typeof ChatPanel !== 'undefined') {
            ChatPanel.switchTab(addr);
        }
    },

    // Handle opponent move
    _handleMove(addr, payload) {
        _glog('[Checkers] _handleMove from', addr, 'move:', payload.move);
        let game = this.games[addr];
        if (!game) {
            // Game not in memory — try to reconstruct from payload + localStorage
            _glog('[Checkers] Game not found for', addr, '— attempting recovery');
            const saved = localStorage.getItem('checkers-game-' + addr);
            if (saved) {
                const state = JSON.parse(saved);
                _glog('[Checkers] Recovered from localStorage:', state.board, state.turn);
                const engine = CheckersEngine.fromJSON({ board: state.board, turn: state.turn });
                this.ourColor = state.ourColor || 'black';
                const tabId = 'game-' + addr.replace(/[^a-z0-9]/g, '');
                this._createGameTab(addr, addr, engine, tabId);
                game = this.games[addr];
            }
            if (!game) {
                _glog('[Checkers] Cannot recover game for', addr);
                return;
            }
        }

        const { ui, statusEl } = game;

        // Apply the move (ui.applyOpponentMove calls engine.applyMove internally)
        const moveStr = payload.move;
        _glog('[Checkers] Applying move:', moveStr, 'board before:', game.engine.board, 'turn:', game.engine.turn);
        try {
            const result = ui.applyOpponentMove(moveStr);
            _glog('[Checkers] Move result:', result);

            // Update status
            if (statusEl) {
                if (result.winner) {
                    const weWon = result.winner === this.ourColor;
                    statusEl.textContent = weWon ? 'You Win!' : 'You Lose.';
                    statusEl.style.color = weWon ? '#4caf50' : '#f85149';
                    game.gameOver = true;
                } else if (game.engine.turn === this.ourColor) {
                    statusEl.textContent = 'Your turn!';
                    statusEl.style.color = '#4caf50';
                } else {
                    statusEl.textContent = "Opponent's turn";
                    statusEl.style.color = '#8b949e';
                }
            }

            // Save game state
            this._saveGame(addr);
        } catch (e) {
            console.error('Invalid move received:', moveStr, e);
        }
    },

    // Handle resignation
    _handleResign(addr, payload) {
        const game = this.games[addr];
        if (!game) return;

        if (game.statusEl) {
            game.statusEl.textContent = 'Opponent resigned - You Win!';
            game.statusEl.style.color = '#4caf50';
        }
        game.gameOver = true;
    },

    // Create game tab in chat panel
    _createGameTab(addr, name, engine, tabId) {
        // Remove existing tab if any
        const existingTab = document.getElementById('chat-tab-' + addr);
        if (existingTab) existingTab.remove();

        // Create tab in chat panel
        if (typeof ChatPanel !== 'undefined') {
            ChatPanel.addTab(addr, name + ' (Checkers)');
        }

        // Create board container
        const boardEl = document.createElement('div');
        boardEl.id = 'checkers-board-' + addr;
        boardEl.className = 'checkers-game-container';

        // Status display
        const statusEl = document.createElement('div');
        statusEl.className = 'checkers-status';
        statusEl.textContent = engine.turn === this.ourColor ? 'Your turn!' : "Opponent's turn";
        statusEl.style.color = engine.turn === this.ourColor ? '#4caf50' : '#8b949e';

        // Create UI
        const onMove = (moveStr) => this._onPlayerMove(addr, moveStr);
        const ui = new CheckersUI(boardEl, engine, this.ourColor, onMove);

        // Store game
        this.games[addr] = {
            engine,
            ui,
            tabId,
            boardEl,
            statusEl,
            gameOver: false
        };
        this.activeAddress = addr;

        // Mark conversation as a game so ChatPanel renders the board on tab switch
        if (typeof ChatPanel !== 'undefined' && ChatPanel.conversations[addr]) {
            ChatPanel.conversations[addr].isGame = true;
        }

        // Render board into the right panel (page-content) for full-size play
        ui.render();
        this._showInRightPanel(addr);

        // Load saved game if exists
        this._loadGame(addr);
    },

    // Render game board in the right panel (#page-content)
    _showInRightPanel(addr) {
        const game = this.games[addr];
        if (!game) return;

        const pageContent = document.getElementById('page-content');
        if (!pageContent) return;

        // Save original content so we can restore it later
        if (!this._savedPageContent) {
            this._savedPageContent = pageContent.innerHTML;
        }

        // Build game view
        pageContent.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'checkers-right-panel';

        const title = document.createElement('h2');
        title.textContent = 'Checkers';
        title.style.cssText = 'text-align:center; color:#e6a817; margin:16px 0 8px; font-family:monospace;';
        wrapper.appendChild(title);

        wrapper.appendChild(game.statusEl);
        wrapper.appendChild(game.boardEl);

        // Button row
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:12px; justify-content:center; margin-top:12px;';

        const resignBtn = document.createElement('button');
        resignBtn.textContent = 'Resign';
        resignBtn.style.cssText = 'padding:8px 24px; background:#f85149; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px;';
        resignBtn.addEventListener('click', () => this.resign(addr));
        btnRow.appendChild(resignBtn);

        const newGameBtn = document.createElement('button');
        newGameBtn.textContent = 'New Game';
        newGameBtn.style.cssText = 'padding:8px 24px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px;';
        newGameBtn.addEventListener('click', () => this.resetGame(addr));
        btnRow.appendChild(newGameBtn);

        wrapper.appendChild(btnRow);

        pageContent.appendChild(wrapper);
    },

    // Restore the right panel to its original content
    _restoreRightPanel() {
        const pageContent = document.getElementById('page-content');
        if (pageContent && this._savedPageContent) {
            pageContent.innerHTML = this._savedPageContent;
            this._savedPageContent = null;
        }
    },

    // Player made a move
    _onPlayerMove(addr, moveStr) {
        const game = this.games[addr];
        if (!game || game.gameOver) return;

        const { engine } = game;

        // Send move via LXMF
        this._sendGameMessage(addr, {
            action: 'move',
            move: moveStr,
            board: engine.board,
            turn: engine.turn
        });

        // Update status
        const winner = engine.checkWinner();
        if (game.statusEl) {
            if (winner) {
                const weWon = winner === this.ourColor;
                game.statusEl.textContent = weWon ? 'You Win!' : 'You Lose.';
                game.statusEl.style.color = weWon ? '#4caf50' : '#f85149';
                game.gameOver = true;
            } else {
                game.statusEl.textContent = "Opponent's turn...";
                game.statusEl.style.color = '#8b949e';
            }
        }

        // Save game
        this._saveGame(addr);
    },

    // Send game message
    async _sendGameMessage(addr, payload) {
        const content = JSON.stringify({
            type: 'game',
            game: 'checkers',
            ...payload
        });

        try {
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: addr, content })
            });
        } catch (e) {
            console.error('Failed to send game message:', e);
        }
    },

    // Save game to localStorage
    _saveGame(addr) {
        const game = this.games[addr];
        if (!game) return;

        const state = {
            board: game.engine.board,
            turn: game.engine.turn,
            ourColor: this.ourColor,
            gameOver: game.gameOver
        };

        try {
            localStorage.setItem('checkers-game-' + addr, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save game:', e);
        }
    },

    // Load game from localStorage
    _loadGame(addr) {
        try {
            const saved = localStorage.getItem('checkers-game-' + addr);
            if (!saved) return;

            const state = JSON.parse(saved);
            const game = this.games[addr];
            
            if (game && state.board) {
                game.engine.board = state.board;
                game.engine.turn = state.turn;
                game.gameOver = state.gameOver || false;
                game.ui.render();

                if (game.statusEl) {
                    if (game.gameOver) {
                        game.statusEl.textContent = 'Game Over';
                    } else if (state.turn === this.ourColor) {
                        game.statusEl.textContent = 'Your turn!';
                        game.statusEl.style.color = '#4caf50';
                    } else {
                        game.statusEl.textContent = "Opponent's turn";
                        game.statusEl.style.color = '#8b949e';
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load game:', e);
        }
    },

    // Resign from game
    async resign(addr) {
        const game = this.games[addr];
        if (!game || game.gameOver) return;

        // No confirmation — resign immediately

        game.gameOver = true;
        if (game.statusEl) {
            game.statusEl.textContent = 'You resigned';
            game.statusEl.style.color = '#f85149';
        }

        await this._sendGameMessage(addr, { action: 'resign' });
        this._saveGame(addr);
    },

    // Reset game — start fresh with same opponent
    async resetGame(addr) {
        // No confirmation — start immediately

        const game = this.games[addr];
        const name = game ? game.tabId : addr;

        // Clear old state
        this.cleanup(addr);

        // Swap colors — whoever was black is now red
        const newColor = (this.ourColor === 'black') ? 'red' : 'black';
        this.ourColor = newColor;
        const firstTurn = 'black'; // Black always goes first

        const engine = new CheckersEngine(null, firstTurn);
        const tabId = 'game-' + addr.replace(/[^a-z0-9]/g, '');

        // Send new game message
        await this._sendGameMessage(addr, {
            action: 'newgame',
            board: engine.board,
            turn: engine.turn,
            senderColor: newColor
        });

        // Create new game tab
        this._createGameTab(addr, addr, engine, tabId);
        this._showInRightPanel(addr);

        if (typeof ChatPanel !== 'undefined') {
            ChatPanel.switchTab(addr);
        }
    },

    // Clean up game when tab closes
    cleanup(addr) {
        delete this.games[addr];
        try {
            localStorage.removeItem('checkers-game-' + addr);
        } catch (e) {}
    }
};
