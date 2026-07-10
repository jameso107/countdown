// Pure Connect Four rules — no imports, identical results on both clients.
// Board is 7 columns × 6 rows; board[col][row], row 0 = bottom.
// Cells hold null | 'james' | 'hannah'.

export const COLS = 7;
export const ROWS = 6;

export function emptyBoard() {
  return Array.from({ length: COLS }, () => Array(ROWS).fill(null));
}

// Drop into a column: returns the landing row, or -1 if the column is full.
// Mutates the board.
export function applyDrop(board, col, who) {
  if (col < 0 || col >= COLS) return -1;
  const row = board[col].indexOf(null);
  if (row === -1) return -1;
  board[col][row] = who;
  return row;
}

// Four in a row anywhere → [[col,row] × 4] of the winning cells, else null.
export function winningLine(board) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const who = board[c][r];
      if (!who) continue;
      for (const [dc, dr] of dirs) {
        const line = [[c, r]];
        for (let k = 1; k < 4; k++) {
          const nc = c + dc * k, nr = r + dr * k;
          if (nc >= COLS || nr < 0 || nr >= ROWS || board[nc][nr] !== who) break;
          line.push([nc, nr]);
        }
        if (line.length === 4) return line;
      }
    }
  }
  return null;
}

export function isFull(board) {
  return board.every((col) => col[ROWS - 1] !== null);
}
