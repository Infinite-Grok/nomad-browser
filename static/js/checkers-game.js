/* ============================================================
   Nomad Browser — Checkers Game Integration
   LXMF-based checkers play via chat tabs
   ============================================================ */

const CheckersGame = {
    games: {},           // {address: {engine, ui, tabId, boardEl, statusEl}}
    activeAddress: null,
    ourColor: null,      // 'black' or 'red' — which side we're playing

    // Initialize a new game against an opponent
    async newGame(opponentAddress, opponentName) {
        // Confirm game start
        const confirmed = confirm(`Start a checkers game with ${opponentName}?
        
You will play as RED (move second).
They will play as BLACK (move first).

Game moves will be sent as LXMF messages.`);
        
        if (!confirmed) return;

        // Create game state
        const engine = new CheckersEngine(null, 'black'); // Black moves first
        this.ourColor = 'red';

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
            case 'move':
                this._handleMove(addr, payload);
                break;
            case 'resign':
                this._handleResign(addr, payload);
                break;
        }

        return true; // We handled this message
    },

    // Handle game invitation
    _handleInvite(addr, payload) {
        const confirmed = confirm(`Checkers invitation from ${addr}!

They challenge you to a game.
You will play as RED (move second).
They will play as BLACK (move first).

Accept?`);

        if (!confirmed) {
            // Send decline
            this._sendGameMessage(addr, { action: 'decline' });
            return;
        }

        // Accept - create game
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

        // Switch to game tab
        if (typeof ChatPanel !== 'undefined') {
            ChatPanel.switchTab(addr);
        }
    },

    // Handle opponent move
    _handleMove(addr, payload) {
        const game = this.games[addr];
        if (!game) return;

        const { engine, ui, statusEl } = game;

        // Apply the move
        const moveStr = payload.move;
        try {
            const result = engine.makeMove(moveStr);
            
            // Update UI
            ui.applyOpponentMove(moveStr);
            ui.render();

            // Update status
            if (statusEl) {
                if (result.win) {
                    statusEl.textContent = 'Game Over - You Win!';
                    statusEl.style.color = '#4caf50';
                    game.gameOver = true;
                } else if (result.turn === this.ourColor) {
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

        // Render board
        ui.render();

        // Inject into chat messages area (replacing normal chat view for this tab)
        const messagesEl = document.getElementById('chat-messages');
        if (messagesEl) {
            messagesEl.innerHTML = '';
            messagesEl.appendChild(statusEl);
            messagesEl.appendChild(boardEl);
        }

        // Load saved game if exists
        this._loadGame(addr);
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
        if (game.statusEl) {
            game.statusEl.textContent = "Opponent's turn...";
            game.statusEl.style.color = '#8b949e';
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

        if (!confirm('Resign this game?')) return;

        game.gameOver = true;
        if (game.statusEl) {
            game.statusEl.textContent = 'You resigned';
            game.statusEl.style.color = '#f85149';
        }

        await this._sendGameMessage(addr, { action: 'resign' });
        this._saveGame(addr);
    },

    // Clean up game when tab closes
    cleanup(addr) {
        delete this.games[addr];
        try {
            localStorage.removeItem('checkers-game-' + addr);
        } catch (e) {}
    }
};
