export const sizes = [2, 3, 4, 5] as const;
export type Size = (typeof sizes)[number];
export const difficulties = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof difficulties)[number];
export type Area = 'board' | 'tray';
export type Slot = { area: Area; index: number };
export type Tile = { north: number; east: number; south: number; west: number };
type Slots = Record<Area, (number | null)[]>;

export type Puzzle = Slots & {
  size: Size;
  seed: number;
  difficulty?: Difficulty;
  tiles: Tile[];
  moves: number;
  revealed: boolean;
};

export type Side = keyof Tile;
const opposite: Record<Side, Side> = { north: 'south', east: 'west', south: 'north', west: 'east' };
const sides = ['north', 'east', 'south', 'west'] as const;

function isBorder(index: number, side: Side, size: Size) {
  switch (side) {
    case 'north': return index < size;
    case 'east': return index % size === size - 1;
    case 'south': return index >= size * (size - 1);
    case 'west': return index % size === 0;
  }
}

export function unmatchedSides(tiles: Tile[], id: number) {
  const tile = tiles[id];
  return sides.filter(side =>
    !tiles.some((other, otherId) => otherId !== id && other[opposite[side]] === tile[side]),
  );
}

function shuffle<T>(items: T[], random: () => number) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function setBorderClues(tiles: Tile[], size: Size, difficulty: Difficulty, random: () => number) {
  const borders = tiles.flatMap((_, index) => {
    const edges = sides.filter(side => isBorder(index, side, size));
    return edges.length ? [{ index, edges }] : [];
  });

  // Every ordinary border edge matches an opposite interior edge on a different tile.
  for (const { index, edges } of borders) {
    for (const side of edges) {
      const otherSide = opposite[side];
      const candidates = tiles.filter((_, other) => other !== index && !isBorder(other, otherSide, size));
      tiles[index][side] = candidates[Math.floor(random() * candidates.length)][otherSide];
    }
  }

  if (difficulty === 'hard') return;
  const corners = difficulty === 'easy'
    ? shuffle(borders.filter(({ edges }) => edges.length === 2), random).slice(0, 2)
    : [];
  // Values 7–10 are reserved, one per direction, so no clue has an opposite match.
  for (const { index, edges } of corners) {
    for (const side of edges) tiles[index][side] = 7 + sides.indexOf(side);
  }
  const singles = shuffle(borders.filter(border => !corners.includes(border)), random).slice(0, 2);
  for (const { index, edges } of singles) {
    const side = edges[Math.floor(random() * edges.length)];
    tiles[index][side] = 7 + sides.indexOf(side);
  }
}

export function generate(size: Size, seed: number, difficulty?: Difficulty): Puzzle {
  let randomState = seed;
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  const edge = () => 1 + Math.floor(random() * (difficulty ? 6 : 10));
  const horizontal = Array.from({ length: (size + 1) * size }, edge);
  const vertical = Array.from({ length: size * (size + 1) }, edge);
  const tiles = Array.from({ length: size * size }, (_, index) => {
    const verticalIndex = index + Math.floor(index / size);
    return {
      north: horizontal[index],
      east: vertical[verticalIndex + 1],
      south: horizontal[index + size],
      west: vertical[verticalIndex],
    };
  });
  const tray = shuffle(tiles.map((_, id) => id), random);
  if (difficulty) setBorderClues(tiles, size, difficulty, random);

  return { size, seed, difficulty, tiles, board: tiles.map(() => null), tray, moves: 0, revealed: false };
}

export function mismatchedEdges(puzzle: Puzzle): [number, number][] {
  const { size, board, tiles } = puzzle;
  const edges: [number, number][] = [];
  board.forEach((id, index) => {
    if (id === null) return;
    const right = index % size < size - 1 ? board[index + 1] : null;
    const below = index + size < board.length ? board[index + size] : null;
    if (right !== null && tiles[id].east !== tiles[right].west) edges.push([index, index + 1]);
    if (below !== null && tiles[id].south !== tiles[below].north) edges.push([index, index + size]);
  });
  return edges;
}

export function isSolved(puzzle: Puzzle): boolean {
  return puzzle.board.every(id => id !== null) && mismatchedEdges(puzzle).length === 0;
}

export function sameSlot(first: Slot, second: Slot): boolean {
  return first.area === second.area && first.index === second.index;
}

export function move(puzzle: Puzzle, from: Slot, to: Slot, allowMismatches: boolean): Puzzle | null {
  const tile = puzzle[from.area][from.index];
  const target = puzzle[to.area][to.index];
  if (tile == null || target === undefined || sameSlot(from, to)) return null;

  const next = { ...puzzle, board: [...puzzle.board], tray: [...puzzle.tray], moves: puzzle.moves + 1 };
  next[from.area][from.index] = target;
  next[to.area][to.index] = tile;
  if (allowMismatches) return next;

  // Existing mismatches may still be on the board after switching to strict play.
  const introducesMismatch = mismatchedEdges(next).some(([first, second]) =>
    next.board[first] !== puzzle.board[first] || next.board[second] !== puzzle.board[second],
  );
  return introducesMismatch ? null : next;
}

export function solution(puzzle: Puzzle): Puzzle {
  return {
    ...puzzle,
    board: puzzle.tiles.map((_, id) => id),
    tray: puzzle.tiles.map(() => null),
    revealed: true,
  };
}

export function restore(value: unknown): Puzzle | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<Puzzle>;
  const { size, seed, difficulty, board, tray, moves, revealed } = data;
  if (!size || !sizes.includes(size) || seed === undefined || !Number.isInteger(seed) ||
      seed < 0 || seed > 0xffffffff || moves === undefined ||
      !Number.isSafeInteger(moves) || moves < 0 || typeof revealed !== 'boolean' ||
      (difficulty !== undefined && !difficulties.includes(difficulty))) return null;

  const count = size * size;
  if (!Array.isArray(board) || !Array.isArray(tray) || board.length !== count || tray.length !== count) return null;
  const ids = [...board, ...tray].filter(id => id !== null);
  if (ids.length !== count || new Set(ids).size !== count ||
      ids.some(id => !Number.isInteger(id) || id < 0 || id >= count)) return null;

  return { ...generate(size, seed, difficulty), board, tray, moves, revealed };
}
