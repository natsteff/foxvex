export const sizes = [2, 3, 4, 5] as const;
export type Size = (typeof sizes)[number];
export const difficulties = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof difficulties)[number];
export type Area = 'board' | 'tray';
export type Slot = { area: Area; index: number };
export type Tile = { north: number; east: number; south: number; west: number };
type Slots = Record<Area, (number | null)[]>;
export type TileMark = 'pencil' | 'lock';

export type Puzzle = Slots & {
  size: Size;
  seed: number;
  difficulty: Difficulty;
  tiles: Tile[];
  moves: number;
  revealed: boolean;
  marks: Partial<Record<number, TileMark>>;
};

export type Side = keyof Tile;
const opposite: Record<Side, Side> = { north: 'south', east: 'west', south: 'north', west: 'east' };
const sides = ['north', 'east', 'south', 'west'] as const;
const edgeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

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

function chooseBorderClues(size: Size, difficulty: Difficulty, random: () => number) {
  const clues = new Map<number, Side[]>();
  if (difficulty === 'hard') return clues;

  const borders = Array.from({ length: size * size }, (_, index) => {
    const edges = sides.filter(side => isBorder(index, side, size));
    return { index, edges };
  }).filter(({ edges }) => edges.length > 0);
  const corners = difficulty === 'easy'
    ? shuffle(borders.filter(({ edges }) => edges.length === 2), random).slice(0, 2)
    : [];
  for (const { index, edges } of corners) clues.set(index, edges);
  const singles = shuffle(borders.filter(({ index }) => !clues.has(index)), random).slice(0, 2);
  for (const { index, edges } of singles) clues.set(index, [pick(edges, random)]);
  return clues;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function generateAxis(size: Size, clueSides: Side[], random: () => number) {
  const interior = Array.from({ length: size * (size - 1) }, () => pick(edgeNumbers, random));
  const clueValues: Partial<Record<Side, number>> = {};
  if (clueSides.length > 0) {
    const counts = Array<number>(edgeNumbers.length).fill(0);
    for (const value of interior) counts[value]++;
    // Prefer unused values. If the axis needs more, free the rarest values on that axis.
    const ranked = shuffle([...edgeNumbers], random).sort((a, b) => counts[a] - counts[b]);
    const reserved = ranked.slice(0, clueSides.length);
    const ordinary = ranked.slice(clueSides.length);
    clueSides.forEach((side, index) => { clueValues[side] = reserved[index]; });
    interior.forEach((value, index) => {
      if (reserved.includes(value)) interior[index] = pick(ordinary, random);
    });
  }

  // Outer slots are filled after the interior pairs are assigned to tiles.
  const border = Array<number>(size).fill(0);
  return { edges: [...border, ...interior, ...border], clueValues };
}

export function generate(size: Size, seed: number, difficulty: Difficulty): Puzzle {
  let randomState = seed;
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  const clues = chooseBorderClues(size, difficulty, random);
  const clueSides = new Set([...clues.values()].flat());
  const horizontalClues = (['north', 'south'] as const).filter(side => clueSides.has(side));
  const verticalClues = (['east', 'west'] as const).filter(side => clueSides.has(side));
  const horizontal = generateAxis(size, horizontalClues, random);
  const vertical = generateAxis(size, verticalClues, random);
  const clueValues = { ...horizontal.clueValues, ...vertical.clueValues };
  const tiles = Array.from({ length: size * size }, (_, index) => {
    const verticalIndex = (index % size) * size + Math.floor(index / size);
    return {
      north: horizontal.edges[index],
      east: vertical.edges[verticalIndex + size],
      south: horizontal.edges[index + size],
      west: vertical.edges[verticalIndex],
    };
  });
  tiles.forEach((tile, index) => {
    for (const side of sides) {
      if (!isBorder(index, side, size)) continue;
      const otherSide = opposite[side];
      // Non-clue border edges have an opposite match on a different tile.
      tile[side] = clues.get(index)?.includes(side)
        ? clueValues[side]!
        : pick(tiles.filter((_, other) => other !== index && !isBorder(other, otherSide, size)), random)[otherSide];
    }
  });
  const tray = shuffle(tiles.map((_, id) => id), random);

  return { size, seed, difficulty, tiles, board: tiles.map(() => null), tray, moves: 0, revealed: false, marks: {} };
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

export function isLocked(puzzle: Puzzle, slot: Slot) {
  const id = puzzle[slot.area][slot.index];
  return slot.area === 'board' && id != null && puzzle.marks[id] === 'lock';
}

export function withoutLocks(puzzle: Puzzle): Puzzle {
  if (!Object.values(puzzle.marks).includes('lock')) return puzzle;
  const marks = Object.fromEntries(Object.entries(puzzle.marks).filter(([, mark]) => mark === 'pencil'));
  return { ...puzzle, marks };
}

export function toggleMark(puzzle: Puzzle, slot: Slot, mark: TileMark): Puzzle | null {
  const id = puzzle.board[slot.index];
  if (slot.area !== 'board' || id == null) return null;
  const marks = { ...puzzle.marks };
  if (marks[id] === mark) delete marks[id];
  else marks[id] = mark;
  return { ...puzzle, marks };
}

export function move(puzzle: Puzzle, from: Slot, to: Slot, allowMismatches: boolean): Puzzle | null {
  const tile = puzzle[from.area][from.index];
  const target = puzzle[to.area][to.index];
  if (tile == null || target === undefined || sameSlot(from, to) ||
      isLocked(puzzle, from) || isLocked(puzzle, to)) return null;

  const next = { ...puzzle, board: [...puzzle.board], tray: [...puzzle.tray], moves: puzzle.moves + 1 };
  next[from.area][from.index] = target;
  next[to.area][to.index] = tile;
  const returned = to.area === 'tray' ? tile : from.area === 'tray' ? target : null;
  if (returned != null && next.marks[returned]) {
    next.marks = { ...next.marks };
    delete next.marks[returned];
  }
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
    marks: {},
  };
}

export function restore(value: unknown): Puzzle | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<Puzzle>;
  const { size, seed, difficulty, board, tray, moves, revealed } = data;
  if (!size || !sizes.includes(size) || seed === undefined || !Number.isInteger(seed) ||
      seed < 0 || seed > 0xffffffff || moves === undefined ||
      !Number.isSafeInteger(moves) || moves < 0 || typeof revealed !== 'boolean' ||
      difficulty === undefined || !difficulties.includes(difficulty)) return null;

  const count = size * size;
  if (!Array.isArray(board) || !Array.isArray(tray) || board.length !== count || tray.length !== count) return null;
  const ids = [...board, ...tray].filter(id => id !== null);
  if (ids.length !== count || new Set(ids).size !== count ||
      ids.some(id => !Number.isInteger(id) || id < 0 || id >= count)) return null;

  const marks: Puzzle['marks'] = {};
  if (data.marks && typeof data.marks === 'object' && !Array.isArray(data.marks)) {
    for (const id of board) {
      if (id === null) continue;
      const mark = data.marks[id];
      if (mark === 'pencil' || mark === 'lock') marks[id] = mark;
    }
  }
  return { ...generate(size, seed, difficulty), board, tray, moves, revealed, marks };
}
