import Phaser from 'phaser';
import './style.css';
import { generate, isSolved, mismatchedEdges, move, restore, sameSlot, sizes, solution, unmatchedSides } from './puzzle';
import type { Area, Difficulty, Puzzle, Side, Size, Slot } from './puzzle';
import { TileRenderer } from './renderer';
import type { TilePosition } from './renderer';

const arena = document.querySelector<HTMLDivElement>('#arena')!;
const layer = document.querySelector<HTMLDivElement>('#render-layer')!;
const boardSize = document.querySelector<HTMLSelectElement>('#size')!;
const difficultySelect = document.querySelector<HTMLSelectElement>('#difficulty')!;
const puzzleDetails = document.querySelector<HTMLSpanElement>('#puzzle-details')!;
const assistantMode = document.querySelector<HTMLSpanElement>('#assistant-mode')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo')!;
const checkButton = document.querySelector<HTMLButtonElement>('#check')!;
const solveButton = document.querySelector<HTMLButtonElement>('#solve')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const progress = document.querySelector<HTMLSpanElement>('#progress')!;
const remaining = document.querySelector<HTMLSpanElement>('#remaining')!;
const moveCount = document.querySelector<HTMLParagraphElement>('#moves')!;
const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
const confirmDialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
const confirmTitle = document.querySelector<HTMLHeadingElement>('#confirm-title')!;
const confirmMessage = document.querySelector<HTMLParagraphElement>('#confirm-message')!;
const confirmButton = document.querySelector<HTMLButtonElement>('#confirm-action')!;
const smallLayout = document.querySelector<HTMLSelectElement>('#small-layout')!;
const matchingAssistant = document.querySelector<HTMLSelectElement>('#matching-assistant')!;
const placementHelp = document.querySelector<HTMLParagraphElement>('#placement-help')!;
const cheatMode = document.querySelector<HTMLInputElement>('#cheat-mode')!;
const edgeTileLegend = document.querySelector<HTMLParagraphElement>('#edge-tile-legend')!;
const rotateNote = document.querySelector<HTMLDivElement>('#rotate-note')!;
const smallPortrait = matchMedia('(orientation: portrait) and ((max-width: 349px) or (max-height: 619px))');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const areas = ['board', 'tray'] as const;
const grids = {
  board: document.querySelector<HTMLDivElement>('#board')!,
  tray: document.querySelector<HTMLDivElement>('#tray')!,
};

const saveKey = 'tetrahex.alpha.puzzle.v1';
const layoutKey = 'tetrahex.alpha.small-layout.v1';
const assistantKey = 'tetrahex.alpha.matching-assistant.v1';
const cheatModeKey = 'tetrahex.alpha.cheat-mode.v1';
const legacyMismatchKey = 'tetrahex.alpha.allow-mismatches.v1';
const assistantDescriptions = {
  prevent: 'Rejects moves that would create a mismatch.',
  highlight: 'Allows mismatches and outlines both tiles in red.',
  off: 'Allows mismatches and leaves tiles unmarked. Use Check to review the board.',
};
type AssistantMode = keyof typeof assistantDescriptions;

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Play is available when browser storage is disabled. */ }
}

function newPuzzle(size: Size, difficulty: Difficulty) {
  return generate(size, crypto.getRandomValues(new Uint32Array(1))[0], difficulty);
}

function savedPuzzle() {
  try { return restore(JSON.parse(read(saveKey) ?? 'null')); } catch { return null; }
}

type Drag = {
  pointerId: number;
  touch: boolean;
  x: number;
  y: number;
  from: Slot;
  id: number;
  offsetX: number;
  offsetY: number;
  position: TilePosition;
  target: Slot | null;
};

type ReturnAnimation = {
  id: number;
  from: TilePosition;
  to: Slot;
  started: number;
};

const restored = savedPuzzle();
let puzzle = restored ?? newPuzzle(4, 'normal');
let conflictedSlots = new Set<number>();
const trayEdgeHints = new Map<number, Side[]>();
const history: Puzzle[] = [];
let cells: Record<Area, HTMLButtonElement[]> = { board: [], tray: [] };
let selected: Slot | null = null;
let drag: Drag | null = null;
let returning: ReturnAnimation | null = null;
let animationFrame = 0;
let ready = false;

const scene = new TileRenderer(() => {
  ready = true;
  resize();
});
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: layer,
  transparent: true,
  width: layer.clientWidth,
  height: layer.clientHeight,
  scene,
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
});

function announce(message: string, tone = '') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function save() {
  const { size, seed, difficulty, board, tray, moves, revealed } = puzzle;
  write(saveKey, JSON.stringify({ size, seed, difficulty, board, tray, moves, revealed }));
}

function cellAt(slot: Slot) {
  return cells[slot.area][slot.index];
}

function positionOf(slot: Slot): TilePosition {
  const rect = cellAt(slot).getBoundingClientRect();
  return { x: rect.left + 1, y: rect.top + 1, size: Math.max(0, rect.width - 2) };
}

function showMismatch({ area, index }: Slot) {
  return matchingAssistant.value === 'highlight' && area === 'board' && conflictedSlots.has(index);
}

function tileDecoration(slot: Slot, id: number) {
  return {
    outlineColor: showMismatch(slot) ? 0xf13447 : undefined,
    edgeHints: slot.area === 'tray' ? trayEdgeHints.get(id) : undefined,
  };
}

function draw(time: number) {
  animationFrame = 0;
  if (!ready) return;
  if (arena.hidden) {
    scene.hideAll();
    return;
  }

  scrollWithDrag();
  scene.showTiles(puzzle.tiles);
  for (const area of areas) {
    puzzle[area].forEach((id, index) => {
      if (id !== null && id !== drag?.id && id !== returning?.id) {
        const slot = { area, index };
        scene.place(id, positionOf(slot), tileDecoration(slot, id));
      }
    });
  }
  if (drag) scene.place(drag.id, drag.position, { raised: true });
  if (returning) {
    const end = positionOf(returning.to);
    const progress = Math.min(1, Math.max(0, (time - returning.started) / 155));
    const eased = 1 - (1 - progress) ** 3;
    const { x, y, size } = returning.from;
    scene.place(returning.id, {
      x: x + (end.x - x) * eased,
      y: y + (end.y - y) * eased,
      size: size + (end.size - size) * eased,
    }, progress === 1 ? tileDecoration(returning.to, returning.id) : { raised: true });
    if (progress === 1) returning = null;
    else scheduleDraw();
  }
}

function scheduleDraw() {
  if (!animationFrame) animationFrame = requestAnimationFrame(draw);
}

function puzzleDescription(size: Size, difficulty?: Difficulty) {
  const name = difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) : 'Classic';
  return `${size} × ${size} · ${name}`;
}

function resize() {
  if (ready) scene.resize(layer.clientWidth, layer.clientHeight);
  scheduleDraw();
}

function render() {
  conflictedSlots = new Set(mismatchedEdges(puzzle).flat());
  edgeTileLegend.hidden = !cheatMode.checked;
  trayEdgeHints.clear();
  if (cheatMode.checked) {
    puzzle.tiles.forEach((_, id) => {
      const sides = unmatchedSides(puzzle.tiles, id);
      if (sides.length) trayEdgeHints.set(id, sides);
    });
  }
  const total = puzzle.tiles.length;
  const placed = puzzle.board.filter(id => id !== null).length;
  if (cells.board.length !== total) {
    arena.style.setProperty('--size', String(puzzle.size));
    for (const area of areas) {
      cells[area] = Array.from({ length: total }, (_, index) => {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.type = 'button';
        cell.dataset.area = area;
        cell.dataset.index = String(index);
        cell.tabIndex = index === 0 ? 0 : -1;
        return cell;
      });
      grids[area].replaceChildren(...cells[area]);
    }
  }

  for (const area of areas) {
    puzzle[area].forEach((id, index) => {
      const cell = cellAt({ area, index });
      cell.classList.toggle('occupied', id !== null);
      cell.classList.toggle('selected', !!selected && sameSlot(selected, { area, index }));
      const where = `Row ${Math.floor(index / puzzle.size) + 1}, column ${index % puzzle.size + 1}`;
      if (id === null) cell.setAttribute('aria-label', `${where}, empty`);
      else {
        const { north, east, south, west } = puzzle.tiles[id];
        const sides = area === 'tray' ? trayEdgeHints.get(id) : undefined;
        const hint = sides ? `, edge tile, unmatched ${sides.join(', ')}` : '';
        const conflict = showMismatch({ area, index }) ? ', mismatched edge' : '';
        cell.setAttribute('aria-label', `${where}, tile, top ${north}, right ${east}, bottom ${south}, left ${west}${hint}${conflict}`);
      }
    });
  }
  puzzleDetails.textContent = `· ${puzzleDescription(puzzle.size, puzzle.difficulty)}`;
  assistantMode.textContent = matchingAssistant.value;
  undoButton.disabled = history.length === 0;
  const solved = isSolved(puzzle);
  checkButton.disabled = solved;
  solveButton.disabled = solved;
  progress.textContent = `${placed} / ${total} placed`;
  remaining.textContent = `${total - placed} remaining`;
  moveCount.textContent = `${puzzle.moves} ${puzzle.moves === 1 ? 'move' : 'moves'}`;
  scheduleDraw();
}

function commit(next: Puzzle, message: string) {
  history.push(puzzle);
  puzzle = next;
  selected = null;
  returning = null;
  save();
  render();
  if (isSolved(puzzle) && !puzzle.revealed) announce('Puzzle solved!', 'success');
  else if (matchingAssistant.value === 'highlight' && conflictedSlots.size) {
    announce(`${message} Check the red outlines.`, 'error');
  }
  else announce(message);
}

function clearTarget() {
  if (drag?.target) cellAt(drag.target).classList.remove('target', 'invalid');
}

function scrollWithDrag() {
  if (!drag?.touch || !smallPortrait.matches) return;
  const edge = 55;
  const height = window.innerHeight;
  const step = drag.y < edge ? -6 : drag.y > height - edge ? 6 : 0;
  if (!step) return;
  const previousScroll = window.scrollY;
  window.scrollBy(0, step);
  if (window.scrollY === previousScroll) return;
  highlightTarget();
  scheduleDraw();
}

function endDrag(animate = false) {
  if (!drag) return;
  const previous = drag;
  clearTarget();
  drag = null;
  if (arena.hasPointerCapture(previous.pointerId)) arena.releasePointerCapture(previous.pointerId);
  document.body.classList.remove('dragging');
  if (animate && !reducedMotion.matches) {
    returning = { id: previous.id, from: previous.position, to: previous.from, started: performance.now() };
  }
  scheduleDraw();
}

function updateSmallLayout() {
  const landscapeRequested = smallPortrait.matches && smallLayout.value === 'landscape';
  if (landscapeRequested) endDrag();
  arena.hidden = landscapeRequested;
  rotateNote.hidden = !landscapeRequested;
  scheduleDraw();
}

function confirmAction(title: string, message: string, label: string, action: () => void) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmButton.textContent = label;
  confirmDialog.returnValue = '';
  confirmDialog.addEventListener('close', () => {
    if (confirmDialog.returnValue === 'confirm') action();
  }, { once: true });
  confirmDialog.showModal();
}

function replacePuzzle(size: Size, difficulty: Difficulty) {
  endDrag();
  returning = null;
  selected = null;
  history.length = 0;
  puzzle = newPuzzle(size, difficulty);
  save();
  render();
  announce('New puzzle ready.');
}

function startPuzzle() {
  const size = Number(boardSize.value) as Size;
  if (!sizes.includes(size)) return;
  const difficulty = difficultySelect.value as Difficulty;
  if (puzzle.board.some(id => id !== null) && !isSolved(puzzle)) {
    const description = puzzleDescription(size, difficulty);
    confirmAction('Start a new puzzle?', `Start ${description} and replace your current progress?`, 'New puzzle', () => replacePuzzle(size, difficulty));
  } else {
    replacePuzzle(size, difficulty);
  }
}

function slotFor(element: EventTarget | null): Slot | null {
  if (!(element instanceof HTMLButtonElement) || !arena.contains(element)) return null;
  const { area, index } = element.dataset;
  return (area === 'board' || area === 'tray') && index !== undefined ? { area, index: Number(index) } : null;
}

function markFocus(slot: Slot) {
  const previous = cells[slot.area].find(cell => cell.tabIndex === 0);
  if (previous) previous.tabIndex = -1;
  cellAt(slot).tabIndex = 0;
}

arena.addEventListener('pointerdown', event => {
  if (drag || !event.isPrimary || event.button !== 0) return;
  const from = slotFor(event.target);
  if (!from) return;
  const id = puzzle[from.area][from.index];
  if (id === null) return;

  event.preventDefault();
  markFocus(from);
  selected = null;
  returning = null;
  const position = positionOf(from);
  drag = {
    pointerId: event.pointerId,
    touch: event.pointerType === 'touch',
    x: event.clientX,
    y: event.clientY,
    from,
    id,
    offsetX: event.clientX - position.x,
    offsetY: event.clientY - position.y + (event.pointerType === 'touch' ? position.size * .42 : 0),
    position,
    target: null,
  };
  arena.setPointerCapture(event.pointerId);
  document.body.classList.add('dragging');
  render();
});

function targetAt(x: number, y: number) {
  const hit = slotFor(document.elementFromPoint(x, y));
  return hit && drag && !sameSlot(hit, drag.from) ? hit : null;
}

function highlightTarget() {
  if (!drag) return;
  const target = targetAt(drag.x, drag.y);
  if (target && drag.target && sameSlot(target, drag.target)) return;
  clearTarget();
  drag.target = target;
  if (target) {
    const valid = matchingAssistant.value === 'off' || move(puzzle, drag.from, target, false) !== null;
    cellAt(target).classList.add(valid ? 'target' : 'invalid');
  }
}

arena.addEventListener('pointermove', event => {
  if (drag?.pointerId !== event.pointerId) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.position.x = drag.x - drag.offsetX;
  drag.position.y = drag.y - drag.offsetY;
  highlightTarget();
  scheduleDraw();
});

arena.addEventListener('pointerup', event => {
  if (drag?.pointerId !== event.pointerId) return;
  const to = targetAt(event.clientX, event.clientY);
  const next = to && move(puzzle, drag.from, to, matchingAssistant.value !== 'prevent');
  const swapped = to && puzzle[to.area][to.index] !== null;
  endDrag(!next);
  if (next) commit(next, swapped ? 'Tiles swapped.' : 'Tile moved.');
  else if (to) announce('Those edges don’t match. Tile returned.', 'error');
});

function cancelPointer(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) endDrag(true);
}
arena.addEventListener('pointercancel', cancelPointer);
arena.addEventListener('lostpointercapture', cancelPointer);
window.addEventListener('blur', () => endDrag());
window.addEventListener('resize', resize);
window.addEventListener('scroll', () => {
  highlightTarget();
  scheduleDraw();
}, { passive: true });
new ResizeObserver(scheduleDraw).observe(arena);

arena.addEventListener('click', event => {
  if (event.detail !== 0 || drag) return;
  const to = slotFor(event.target);
  if (!to) return;
  const occupant = puzzle[to.area][to.index];
  if (!selected) {
    if (occupant === null) return;
    selected = to;
    announce('Tile picked up. Choose a destination.');
  } else if (sameSlot(selected, to)) {
    selected = null;
    announce('Selection canceled.');
  } else {
    const next = move(puzzle, selected, to, matchingAssistant.value !== 'prevent');
    if (next) commit(next, occupant === null ? 'Tile moved.' : 'Tiles swapped.');
    else announce('Those edges don’t match. Choose another slot.', 'error');
  }
  render();
});

arena.addEventListener('keydown', event => {
  const slot = slotFor(event.target);
  if (!slot || drag) return;
  if (event.key === 'Escape' && selected) {
    selected = null;
    render();
    announce('Selection canceled.');
    return;
  }
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
  };
  if (!Object.hasOwn(offsets, event.key)) return;
  event.preventDefault();
  const [dy, dx] = offsets[event.key];
  const { size } = puzzle;
  const row = Math.floor(slot.index / size) + dy;
  const column = slot.index % size + dx;
  if (row < 0 || row >= size || column < 0 || column >= size) return;
  const next = { area: slot.area, index: row * size + column };
  markFocus(next);
  cellAt(next).focus();
});

document.querySelector('#new')!.addEventListener('click', startPuzzle);
function announceNextPuzzle() {
  const size = Number(boardSize.value) as Size;
  const difficulty = difficultySelect.value as Difficulty;
  announce(`Next puzzle: ${puzzleDescription(size, difficulty)}. Choose New puzzle to start.`);
}
boardSize.addEventListener('change', announceNextPuzzle);
difficultySelect.addEventListener('change', announceNextPuzzle);

undoButton.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  endDrag();
  puzzle = previous;
  selected = null;
  returning = null;
  save();
  render();
  announce('Move undone.');
});

checkButton.addEventListener('click', () => {
  const left = puzzle.tray.filter(id => id !== null).length;
  if (conflictedSlots.size) {
    const hint = matchingAssistant.value === 'highlight' ? ' Check the red outlines.' : '';
    announce(`Some touching numbers differ.${hint}`, 'error');
  }
  else announce(`Edges match so far. ${left} ${left === 1 ? 'tile' : 'tiles'} left to place.`);
});

solveButton.addEventListener('click', () => {
  confirmAction('Show the solution?', 'You can undo this to keep playing.', 'Show solution', () => {
    endDrag();
    commit(solution(puzzle), 'Solution shown. Undo to keep playing.');
  });
});

document.querySelector('#settings')!.addEventListener('click', () => dialog.showModal());
const savedAssistant = read(assistantKey);
matchingAssistant.value = savedAssistant && Object.hasOwn(assistantDescriptions, savedAssistant)
  ? savedAssistant
  : read(legacyMismatchKey) === 'false' ? 'prevent' : 'highlight';
placementHelp.textContent = assistantDescriptions[matchingAssistant.value as AssistantMode];
matchingAssistant.addEventListener('change', () => {
  const mode = matchingAssistant.value as AssistantMode;
  write(assistantKey, mode);
  placementHelp.textContent = assistantDescriptions[mode];
  render();
  announce(placementHelp.textContent);
});
boardSize.value = String(puzzle.size);
difficultySelect.value = puzzle.difficulty ?? 'normal';
cheatMode.checked = read(cheatModeKey) === 'true';
cheatMode.addEventListener('change', () => {
  write(cheatModeKey, String(cheatMode.checked));
  render();
});
smallLayout.value = read(layoutKey) === 'landscape' ? 'landscape' : 'scroll';
smallLayout.addEventListener('change', () => {
  write(layoutKey, smallLayout.value);
  updateSmallLayout();
});
smallPortrait.addEventListener('change', updateSmallLayout);
updateSmallLayout();
render();
if (!restored) save();
announce(restored ? (isSolved(puzzle) ? 'Completed puzzle restored.' : 'Puzzle resumed.') : 'Pick any tile to begin.');
