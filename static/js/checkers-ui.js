/**
 * Checkers UI — Interactive board renderer for the Nomad Browser.
 *
 * Renders a CheckersEngine state as a clickable HTML board.
 * Click a piece to select it, click a valid destination to move.
 * Calls onMove(moveStr) when the player makes a move.
 *
 * Usage:
 *   const ui = new CheckersUI(containerEl, engine, 'red', onMove);
 *   ui.render();
 *   // When opponent moves arrive via LXMF:
 *   ui.applyOpponentMove("8-12");
 */

class CheckersUI {
  /**
   * @param {HTMLElement} container - DOM element to render the board into
   * @param {CheckersEngine} engine - Game engine instance
   * @param {string} myColor - 'black' or 'red' (which side this player controls)
   * @param {function} onMove - Callback: onMove(moveStr) when player makes a move
   */
  constructor(container, engine, myColor, onMove) {
    this.container = container;
    this.engine = engine;
    this.myColor = myColor;
    this.onMove = onMove;
    this.selectedSq = null;
    this.validMoves = [];
    this.gameOver = false;
    this.lastMove = null; // {from, to} for highlighting

    this._injectStyles();
  }

  _injectStyles() {
    if (document.getElementById('checkers-styles')) return;
    const style = document.createElement('style');
    style.id = 'checkers-styles';
    style.textContent = `
      .checkers-board {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 1px;
        max-width: 480px;
        aspect-ratio: 1;
        margin: 12px auto;
        border: 2px solid #555;
        border-radius: 4px;
        overflow: hidden;
        user-select: none;
      }
      .checkers-cell {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2em;
        cursor: default;
        position: relative;
        transition: background-color 0.15s;
      }
      .checkers-cell.light { background: #b58863; }
      .checkers-cell.dark { background: #6d4c2a; }
      .checkers-cell.selected { background: #4a7c4e !important; }
      .checkers-cell.valid-dest { background: #3a6a5e !important; cursor: pointer; }
      .checkers-cell.valid-dest::after {
        content: '';
        position: absolute;
        width: 30%;
        height: 30%;
        border-radius: 50%;
        background: rgba(100, 255, 150, 0.4);
      }
      .checkers-cell.last-from { box-shadow: inset 0 0 0 3px rgba(255,255,100,0.4); }
      .checkers-cell.last-to { box-shadow: inset 0 0 0 3px rgba(255,255,100,0.6); }
      .checkers-cell.movable { cursor: pointer; }
      .checkers-piece {
        width: 70%;
        height: 70%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.6em;
        font-weight: bold;
        transition: transform 0.1s;
      }
      .checkers-piece.black-piece {
        background: radial-gradient(circle at 35% 35%, #555, #1a1a1a);
        border: 2px solid #333;
        color: #ccc;
      }
      .checkers-piece.red-piece {
        background: radial-gradient(circle at 35% 35%, #d44, #8b1a1a);
        border: 2px solid #922;
        color: #fcc;
      }
      .checkers-piece.king::after {
        content: '♛';
        font-size: 1.4em;
      }
      .checkers-status {
        text-align: center;
        padding: 8px;
        font-size: 0.95em;
        color: #ccc;
        font-family: monospace;
      }
      .checkers-status.your-turn { color: #7f7; }
      .checkers-status.waiting { color: #fa5; }
      .checkers-status.game-over { color: #f55; font-weight: bold; }
      .checkers-captures {
        display: flex;
        justify-content: space-between;
        max-width: 480px;
        margin: 4px auto;
        padding: 0 4px;
        font-size: 0.85em;
        color: #999;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Full render of the board + status.
   */
  render() {
    const flipped = this.myColor === 'black'; // black at bottom = flip board
    const grid = this.engine.toGrid();
    const movable = this._isMyTurn() && !this.gameOver ? this.engine.getMovablePieces() : [];

    let html = '<div class="checkers-captures" id="checkers-captures"></div>';
    html += '<div class="checkers-board">';

    for (let displayR = 0; displayR < 8; displayR++) {
      const r = flipped ? (7 - displayR) : displayR;
      for (let displayC = 0; displayC < 8; displayC++) {
        const c = flipped ? (7 - displayC) : displayC;
        const cell = grid[r][c];
        const isDark = cell.playable;
        const classes = ['checkers-cell', isDark ? 'dark' : 'light'];

        if (cell.sq >= 0 && this.selectedSq === cell.sq) {
          classes.push('selected');
        }
        if (cell.sq >= 0 && this.validMoves.some(m => m.to === cell.sq)) {
          classes.push('valid-dest');
        }
        if (cell.sq >= 0 && movable.includes(cell.sq) && this.selectedSq === null) {
          classes.push('movable');
        }
        if (this.lastMove) {
          if (cell.sq === this.lastMove.from) classes.push('last-from');
          if (cell.sq === this.lastMove.to) classes.push('last-to');
        }

        const clickAttr = isDark ? `onclick="checkersClick(${cell.sq})"` : '';
        html += `<div class="${classes.join(' ')}" ${clickAttr}>`;

        if (cell.piece) {
          const pieceColor = (cell.piece === 'b' || cell.piece === 'B') ? 'black-piece' : 'red-piece';
          const kingClass = (cell.piece === 'B' || cell.piece === 'R') ? ' king' : '';
          html += `<div class="checkers-piece ${pieceColor}${kingClass}"></div>`;
        }

        html += '</div>';
      }
    }

    html += '</div>';
    html += `<div class="checkers-status ${this._statusClass()}">${this._statusText()}</div>`;

    this.container.innerHTML = html;
    this._renderCaptures();
  }

  _renderCaptures() {
    // Count pieces to show capture score
    let b = 0, r = 0;
    for (let i = 0; i < 32; i++) {
      const p = this.engine.board[i];
      if (p === 'b' || p === 'B') b++;
      if (p === 'r' || p === 'R') r++;
    }
    const el = this.container.querySelector('#checkers-captures');
    if (el) {
      el.innerHTML = `<span>● Black: ${b} pieces</span><span>○ Red: ${r} pieces</span>`;
    }
  }

  _isMyTurn() {
    return this.engine.turn === this.myColor;
  }

  _statusClass() {
    if (this.gameOver) return 'game-over';
    return this._isMyTurn() ? 'your-turn' : 'waiting';
  }

  _statusText() {
    const winner = this.engine.checkWinner();
    if (winner) {
      this.gameOver = true;
      if (winner === this.myColor) return 'You win!';
      if (winner === 'draw') return 'Draw!';
      return 'You lose.';
    }
    if (this._isMyTurn()) return 'Your turn — click a piece to move';
    return 'Waiting for opponent...';
  }

  /**
   * Handle a click on a board square.
   */
  handleClick(sq) {
    if (this.gameOver || !this._isMyTurn()) return;

    const movable = this.engine.getMovablePieces();

    // If nothing selected and this is our piece with moves, select it
    if (this.selectedSq === null) {
      if (this.engine.isOwn(sq) && movable.includes(sq)) {
        this.selectedSq = sq;
        this.validMoves = this.engine.getMovesFrom(sq);
        this.render();
      }
      return;
    }

    // Clicking the same piece deselects
    if (sq === this.selectedSq) {
      this.selectedSq = null;
      this.validMoves = [];
      this.render();
      return;
    }

    // Clicking a different own piece switches selection
    if (this.engine.isOwn(sq) && movable.includes(sq)) {
      this.selectedSq = sq;
      this.validMoves = this.engine.getMovesFrom(sq);
      this.render();
      return;
    }

    // Clicking a valid destination — make the move
    const move = this.validMoves.find(m => m.to === sq);
    if (move) {
      const moveStr = move.path ? move.path.join('-') : `${move.from}-${move.to}`;
      this.lastMove = { from: move.from, to: move.to };
      const result = this.engine.applyMove(moveStr);

      if (result.valid) {
        this.selectedSq = null;
        this.validMoves = [];
        this.render();
        if (this.onMove) this.onMove(moveStr);
      }
    }
  }

  /**
   * Apply an opponent's move (received via LXMF).
   * Returns the result from engine.applyMove().
   */
  applyOpponentMove(moveStr) {
    const parts = moveStr.split('-').map(Number);
    this.lastMove = { from: parts[0], to: parts[parts.length - 1] };
    const result = this.engine.applyMove(moveStr);
    this.selectedSq = null;
    this.validMoves = [];
    this.render();
    return result;
  }

  /**
   * Reset for a new game.
   */
  reset(engine, myColor) {
    this.engine = engine;
    this.myColor = myColor || this.myColor;
    this.selectedSq = null;
    this.validMoves = [];
    this.gameOver = false;
    this.lastMove = null;
    this.render();
  }
}

// Global click handler (wired up by render's onclick attributes)
function checkersClick(sq) {
  if (window._checkersUI) {
    window._checkersUI.handleClick(sq);
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CheckersUI };
}
