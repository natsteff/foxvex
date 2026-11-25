import type { Area, Puzzle, Slot } from './puzzle';

// Prefer nearby useful slots without revealing which placement solves the puzzle.
export function preferredControllerSlot(puzzle: Pick<Puzzle, 'size' | 'board' | 'tray'>, area: Area, preferred: number): Slot {
  const slots = puzzle[area];
  const origin = Math.max(0, Math.min(preferred, slots.length - 1));
  const distance = (index: number) => Math.abs(Math.floor(index / puzzle.size) - Math.floor(origin / puzzle.size))
    + Math.abs(index % puzzle.size - origin % puzzle.size);
  let best = origin;
  let nearest = Infinity;
  slots.forEach((tile, index) => {
    if (area === 'tray' ? tile === null : tile !== null) return;
    const candidate = distance(index);
    if (candidate < nearest) {
      best = index;
      nearest = candidate;
    }
  });
  return { area, index: best };
}
