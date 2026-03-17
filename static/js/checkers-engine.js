/**
 * Checkers Engine — Pure game logic, no UI, no dependencies.
 *
 * Board: 8x8 grid, only dark squares are playable (32 squares).
 * Squares numbered 0-31, top-left to bottom-right (row by row, dark squares only).
 *
 * Pieces: 'b' = black, 'r' = red, 'B' = black king, 'R' = red king, '.' = empty
 * Board state: 32-char string mapping squares 0-31.
 *
 * Black starts at top (squares 0-11), moves down. Red starts at bottom (squares 20-31), moves up.
 * Black moves first.
 *
 * Standard American checkers rules:
 *   - Men move diagonally forward one square
 *   - Kings move diagonally forward or backward one square
 *   - Jumps are mandatory — if you can jump, you must
 *   - Multi-jumps: if after a jump you can jump again, you must continue
 *   - King promotion: reaching the opposite back row makes a king
 *   - Win: capture all opponent pieces or leave them with no legal moves
 */

class CheckersEngine {
  constructor(board, turn) {
    // Square-to-grid mapping: square index → [row, col]
    this._sqToGrid = [];
    this._gridToSq = {};
    let sq = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          this._sqToGrid[sq] = [r, c];
          this._gridToSq[r + ',' + c] = sq;
          sq++;
        }
      }
    }

    this.board = board || 'bbbbbbbbbbbb........rrrrrrrrrrrr';
    this.turn = turn || 'black'; // 'black' or 'red'
  }

  // --- State ---

  clone() {
    return new CheckersEngine(this.board, this.turn);
  }

  toJSON() {
    return { board: this.board, turn: this.turn };
  }

  static fromJSON(json) {
    return new CheckersEngine(json.board, json.turn);
  }

  getPiece(sq) {
    return this.board[sq];
  }

  setPiece(sq, piece) {
    this.board = this.board.substring(0, sq) + piece + this.board.substring(sq + 1);
  }

  sqToGrid(sq) {
    return this._sqToGrid[sq];
  }

  gridToSq(r, c) {
    const key = r + ',' + c;
    return this._gridToSq.hasOwnProperty(key) ? this._gridToSq[key] : -1;
  }

  isOwn(sq) {
    const p = this.board[sq];
    if (this.turn === 'black') return p === 'b' || p === 'B';
    return p === 'r' || p === 'R';
  }

  isEnemy(sq) {
    const p = this.board[sq];
    if (this.turn === 'black') return p === 'r' || p === 'R';
    return p === 'b' || p === 'B';
  }

  isKing(sq) {
    const p = this.board[sq];
    return p === 'B' || p === 'R';
  }

  // --- Move Generation ---

  /**
   * Get forward directions for current turn's men (non-kings).
   * Black moves down (+row), red moves up (-row).
   */
  _forwardDirs() {
    if (this.turn === 'black') return [[1, -1], [1, 1]];
    return [[-1, -1], [-1, 1]];
  }

  _allDirs() {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  }

  _dirsFor(sq) {
    return this.isKing(sq) ? this._allDirs() : this._forwardDirs();
  }

  /**
   * Find all simple (non-jump) moves for a piece.
   * Returns array of {from, to}.
   */
  _simpleMoves(sq) {
    const moves = [];
    const [r, c] = this.sqToGrid(sq);
    for (const [dr, dc] of this._dirsFor(sq)) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const dest = this.gridToSq(nr, nc);
      if (dest >= 0 && this.board[dest] === '.') {
        moves.push({ from: sq, to: dest });
      }
    }
    return moves;
  }

  /**
   * Find all jump chains starting from a square.
   * Returns array of {from, path: [sq, ...], captures: [sq, ...]}.
   * Uses DFS to find all possible multi-jump sequences.
   */
  _jumpChains(sq, visited) {
    visited = visited || new Set();
    const chains = [];
    const [r, c] = this.sqToGrid(sq);
    const dirs = this.isKing(sq) ? this._allDirs() : this._forwardDirs();

    for (const [dr, dc] of dirs) {
      const mr = r + dr, mc = c + dc;   // midpoint (captured piece)
      const lr = r + 2*dr, lc = c + 2*dc; // landing square
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;

      const mid = this.gridToSq(mr, mc);
      const land = this.gridToSq(lr, lc);
      if (mid < 0 || land < 0) continue;
      if (!this.isEnemy(mid) || visited.has(mid)) continue;
      if (this.board[land] !== '.' && land !== sq) continue;

      // Valid jump — explore continuations
      visited.add(mid);
      const oldLand = this.board[land];
      const oldMid = this.board[mid];
      const oldSq = this.board[sq];

      // Temporarily apply the jump to find continuations
      this.setPiece(land, this.board[sq]);
      this.setPiece(mid, '.');
      this.setPiece(sq, '.');

      // Check for king promotion mid-chain — kings earned mid-jump
      // In standard American checkers, promotion ends the turn
      const promoted = this._wouldPromote(land);
      let continuations = [];
      if (!promoted) {
        continuations = this._jumpChains(land, new Set(visited));
      }

      // Restore board
      this.setPiece(sq, oldSq);
      this.setPiece(mid, oldMid);
      this.setPiece(land, oldLand);
      visited.delete(mid);

      if (continuations.length > 0) {
        for (const chain of continuations) {
          chains.push({
            path: [land, ...chain.path],
            captures: [mid, ...chain.captures]
          });
        }
      } else {
        chains.push({ path: [land], captures: [mid] });
      }
    }
    return chains;
  }

  _wouldPromote(sq) {
    const p = this.board[sq];
    const [r] = this.sqToGrid(sq);
    if (p === 'b' && r === 7) return true;
    if (p === 'r' && r === 0) return true;
    return false;
  }

  /**
   * Get all legal moves for the current player.
   * Returns array of:
   *   { from, to, captures: [] }           — simple move
   *   { from, to, path: [...], captures: [...] } — jump chain
   *
   * If any jumps exist, ONLY jumps are returned (mandatory capture).
   */
  getLegalMoves() {
    const jumps = [];
    const simples = [];

    for (let sq = 0; sq < 32; sq++) {
      if (!this.isOwn(sq)) continue;

      const chains = this._jumpChains(sq);
      for (const chain of chains) {
        jumps.push({
          from: sq,
          to: chain.path[chain.path.length - 1],
          path: [sq, ...chain.path],
          captures: chain.captures
        });
      }

      if (jumps.length === 0) {
        for (const m of this._simpleMoves(sq)) {
          simples.push({ ...m, captures: [] });
        }
      }
    }

    // Mandatory capture: if jumps exist, only jumps are legal
    if (jumps.length > 0) {
      // In some rulesets, must take the longest jump. Standard American: any jump is fine.
      return jumps;
    }
    return simples;
  }

  /**
   * Get legal moves for a specific square.
   */
  getMovesFrom(sq) {
    return this.getLegalMoves().filter(m => m.from === sq);
  }

  /**
   * Get all squares that have legal moves.
   */
  getMovablePieces() {
    const moves = this.getLegalMoves();
    return [...new Set(moves.map(m => m.from))];
  }

  // --- Move Execution ---

  /**
   * Apply a move. Accepts move notation string "from-to" or "from-mid-...-to" for multi-jumps.
   * Returns { valid, board, turn, captures, promoted, winner, error }.
   */
  applyMove(moveStr) {
    const parts = moveStr.split('-').map(Number);
    if (parts.length < 2 || parts.some(isNaN)) {
      return { valid: false, error: 'Invalid move format. Use "from-to" (e.g. "8-12").' };
    }

    const from = parts[0];
    const to = parts[parts.length - 1];
    const legal = this.getLegalMoves();

    // Find matching legal move
    let match = null;
    for (const m of legal) {
      if (m.from !== from || m.to !== to) continue;

      // For multi-jumps, verify the full path matches
      if (m.path && parts.length > 2) {
        if (m.path.length === parts.length && m.path.every((s, i) => s === parts[i])) {
          match = m;
          break;
        }
      } else {
        match = m;
        break;
      }
    }

    if (!match) {
      return { valid: false, error: 'Illegal move.' };
    }

    // Execute the move
    const piece = this.board[from];
    this.setPiece(from, '.');
    for (const cap of match.captures) {
      this.setPiece(cap, '.');
    }
    this.setPiece(to, piece);

    // King promotion
    let promoted = false;
    const [destRow] = this.sqToGrid(to);
    if (piece === 'b' && destRow === 7) {
      this.setPiece(to, 'B');
      promoted = true;
    } else if (piece === 'r' && destRow === 0) {
      this.setPiece(to, 'R');
      promoted = true;
    }

    // Switch turn
    this.turn = this.turn === 'black' ? 'red' : 'black';

    // Check for winner
    const winner = this.checkWinner();

    return {
      valid: true,
      board: this.board,
      turn: this.turn,
      captures: match.captures,
      promoted,
      winner
    };
  }

  /**
   * Check if the game is over.
   * Returns 'black', 'red', 'draw', or null (game continues).
   */
  checkWinner() {
    let blackCount = 0, redCount = 0;
    for (let i = 0; i < 32; i++) {
      const p = this.board[i];
      if (p === 'b' || p === 'B') blackCount++;
      if (p === 'r' || p === 'R') redCount++;
    }

    if (redCount === 0) return 'black';
    if (blackCount === 0) return 'red';

    // Current player has no legal moves → loses
    if (this.getLegalMoves().length === 0) {
      return this.turn === 'black' ? 'red' : 'black';
    }

    return null;
  }

  // --- Display ---

  /**
   * Render the board as a text grid (for debugging / bot replies).
   */
  toText() {
    const symbols = { 'b': '●', 'r': '○', 'B': '◉', 'R': '◎', '.': ' ' };
    let out = '  0 1 2 3 4 5 6 7\n';
    for (let r = 0; r < 8; r++) {
      out += r + ' ';
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          const sq = this.gridToSq(r, c);
          out += symbols[this.board[sq]] || '?';
        } else {
          out += '·';
        }
        out += ' ';
      }
      out += '\n';
    }
    out += '● = black  ○ = red  ◉ = black king  ◎ = red king\n';
    out += `Turn: ${this.turn}\n`;
    return out;
  }

  /**
   * Render the board as an 8x8 array for the UI renderer.
   * Returns array of 8 rows, each row is array of 8 cells.
   * Each cell: { piece, sq, playable }
   *   piece: 'b','r','B','R', or null
   *   sq: square index (0-31) or -1 for light squares
   *   playable: boolean
   */
  toGrid() {
    const grid = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          const sq = this.gridToSq(r, c);
          const p = this.board[sq];
          row.push({ piece: p === '.' ? null : p, sq, playable: true });
        } else {
          row.push({ piece: null, sq: -1, playable: false });
        }
      }
      grid.push(row);
    }
    return grid;
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CheckersEngine };
}
