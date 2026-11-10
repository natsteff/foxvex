import Phaser from 'phaser';
import { generate, isLocked, isSolved, mismatchedEdges, move, restore, sameSlot, sizes, solution, toggleMark, unmatchedSides, withoutLocks } from './puzzle';
import type { Area, Difficulty, Puzzle, Side, Size, Slot } from './puzzle';
import { TileRenderer } from './renderer';
import type { TilePosition } from './renderer';

const arena = document.querySelector<HTMLDivElement>('#arena')!;
const layer = document.querySelector<HTMLDivElement>('#render-layer')!;
const boardSize = document.querySelector<HTMLSelectElement>('#size')!;
const difficultySelect = document.querySelector<HTMLSelectElement>('#difficulty')!;
const newPuzzleDialog = document.querySelector<HTMLDialogElement>('#new-puzzle-dialog')!;
const newPuzzleForm = document.querySelector<HTMLFormElement>('#new-puzzle-form')!;
const newPuzzleWarning = document.querySelector<HTMLParagraphElement>('#new-puzzle-warning')!;
const doubleTapAction = document.querySelector<HTMLSelectElement>('#double-tap-action')!;
const puzzleDetails = document.querySelector<HTMLSpanElement>('#puzzle-details')!;
const assistantMode = document.querySelector<HTMLSpanElement>('#assistant-mode')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo')!;
const checkButton = document.querySelector<HTMLButtonElement>('#check')!;
const solveButton = document.querySelector<HTMLButtonElement>('#solve')!;
const victory = document.querySelector<HTMLElement>('#victory')!;
const victoryPerfect = document.querySelector<HTMLParagraphElement>('#victory-perfect')!;
const victoryMoves = document.querySelector<HTMLParagraphElement>('#victory-moves')!;
const confetti = document.querySelector<HTMLDivElement>('#confetti')!;
const nextPuzzle = document.querySelector<HTMLButtonElement>('#next-puzzle')!;
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
const playMarking = document.querySelector<HTMLParagraphElement>('#play-marking')!;
const playCheat = document.querySelector<HTMLParagraphElement>('#play-cheat')!;
const playAssistant = document.querySelector<HTMLParagraphElement>('#play-assistant')!;
const edgeTileLegend = document.querySelector<HTMLParagraphElement>('#edge-tile-legend')!;
const stackedLayout = matchMedia('(max-width: 699px) and (orientation: portrait)');
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
const doubleTapKey = 'foxvex.double-tap-action.v1';
const legacyMismatchKey = 'tetrahex.alpha.allow-mismatches.v1';
const assistantDescriptions = {
  prevent: 'Rejects moves that would create a mismatch.',
  highlight: 'Allows mismatches and outlines both tiles in red.',
  off: 'Allows mismatches and leaves tiles unmarked. Use Check to review the board.',
};
type AssistantMode = keyof typeof assistantDescriptions;
const assistantInstructions: Record<AssistantMode, string> = {
  prevent: 'Matching Assistant rejects moves that would create a mismatch.',
  highlight: 'Matching Assistant outlines both tiles in red when their touching numbers differ.',
  off: 'Use Check to see whether any touching numbers differ.',
};

function updateHowToPlay() {
  const action = doubleTapAction.value;
  const instruction = action === 'lock'
    ? 'lock it in place or unlock it'
    : 'mark it as tentative or remove the mark';
  playMarking.hidden = action === 'disabled';
  playMarking.textContent = `Double-tap or double-click a placed tile to ${instruction}. With a keyboard, focus the tile and press M.`;
  playCheat.hidden = !cheatMode.checked;
  playAssistant.textContent = assistantInstructions[matchingAssistant.value as AssistantMode];
}

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

type TilePress = {
  pointerId: number;
  pointerType: string;
  started: number;
  x: number;
  y: number;
  from: Slot;
  id: number;
};

type Drag = {
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
const savedDoubleTapAction = read(doubleTapKey);
doubleTapAction.value = savedDoubleTapAction === 'disabled' || savedDoubleTapAction === 'pencil'
  ? savedDoubleTapAction : 'lock';
if (doubleTapAction.value !== 'lock') puzzle = withoutLocks(puzzle);
let conflictedSlots = new Set<number>();
const edgeHintsByTile = new Map<number, Side[]>();
const history: Puzzle[] = [];
let cells: Record<Area, HTMLButtonElement[]> = { board: [], tray: [] };
let selected: Slot | null = null;
let press: TilePress | null = null;
let lastTap: { slot: Slot; id: number; pointerType: string; time: number } | null = null;
let drag: Drag | null = null;
let returning: ReturnAnimation | null = null;
let animationFrame = 0;
let layoutFrame = 0;
let ready = false;

const scene = new TileRenderer(() => {
  ready = true;
  resize();
  window.dispatchEvent(new Event('foxvex-ready'));
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
  const { size, seed, difficulty, board, tray, moves, revealed, marks } = puzzle;
  write(saveKey, JSON.stringify({ size, seed, difficulty, board, tray, moves, revealed, marks }));
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
    edgeHints: edgeHintsByTile.get(id),
    mark: puzzle.marks[id],
  };
}

function draw(time: number) {
  animationFrame = 0;
  if (!ready) return;

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
  if (drag) scene.place(drag.id, drag.position, {
    raised: true, edgeHints: edgeHintsByTile.get(drag.id), mark: puzzle.marks[drag.id],
  });
  if (returning) {
    const end = positionOf(returning.to);
    const progress = Math.min(1, Math.max(0, (time - returning.started) / 155));
    const eased = 1 - (1 - progress) ** 3;
    const { x, y, size } = returning.from;
    scene.place(returning.id, {
      x: x + (end.x - x) * eased,
      y: y + (end.y - y) * eased,
      size: size + (end.size - size) * eased,
    }, progress === 1 ? tileDecoration(returning.to, returning.id) : {
      raised: true, edgeHints: edgeHintsByTile.get(returning.id), mark: puzzle.marks[returning.id],
    });
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
  const rect = arena.getBoundingClientRect();
  const boardHeight = grids.board.getBoundingClientRect().height;
  const trayHeight = grids.tray.getBoundingClientRect().height;
  const stacked = stackedLayout.matches;
  const gridHeight = stacked ? boardHeight + trayHeight : Math.max(boardHeight, trayHeight);
  const panelSpace = rect.height - gridHeight;
  const pageTop = rect.top + window.scrollY;
  const bottomPadding = parseFloat(getComputedStyle(arena.parentElement!).paddingBottom);
  const visual = window.visualViewport;
  const viewportHeight = visual?.scale === 1 ? Math.min(innerHeight, visual.height) : innerHeight;
  const available = Math.floor((viewportHeight - pageTop - panelSpace - bottomPadding) / (stacked ? 2 : 1));
  const minimumTile = smallLayout.value === 'fit' ? 26 : stacked ? 39 : 35;
  const minimumGrid = puzzle.size * minimumTile + (puzzle.size - 1) * 6;
  const gridSize = Math.min(430, Math.max(available, minimumGrid));
  arena.style.setProperty('--grid-max', `${gridSize}px`);
  if (ready) scene.resize(layer.clientWidth, layer.clientHeight);
  scheduleDraw();
}

function scheduleLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    resize();
  });
}

function render() {
  conflictedSlots = new Set(mismatchedEdges(puzzle).flat());
  edgeTileLegend.hidden = !cheatMode.checked;
  edgeHintsByTile.clear();
  if (cheatMode.checked) {
    puzzle.tiles.forEach((_, id) => {
      const sides = unmatchedSides(puzzle.tiles, id);
      if (sides.length) edgeHintsByTile.set(id, sides);
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
      const mark = id === null ? undefined : puzzle.marks[id];
      cell.classList.toggle('locked', mark === 'lock');
      cell.classList.toggle('selected', !!selected && sameSlot(selected, { area, index }));
      const where = `Row ${Math.floor(index / puzzle.size) + 1}, column ${index % puzzle.size + 1}`;
      if (id === null) cell.setAttribute('aria-label', `${where}, empty`);
      else {
        const { north, east, south, west } = puzzle.tiles[id];
        const sides = edgeHintsByTile.get(id);
        const hint = sides ? `, edge tile, unmatched ${sides.join(', ')}` : '';
        const conflict = showMismatch({ area, index }) ? ', mismatched edge' : '';
        const marking = mark === 'lock' ? ', locked' : mark === 'pencil' ? ', tentative' : '';
        cell.setAttribute('aria-label', `${where}, tile, top ${north}, right ${east}, bottom ${south}, left ${west}${hint}${conflict}${marking}`);
      }
    });
  }
  puzzleDetails.textContent = `· ${puzzleDescription(puzzle.size, puzzle.difficulty)}`;
  assistantMode.textContent = matchingAssistant.value;
  undoButton.disabled = history.length === 0;
  const solved = isSolved(puzzle);
  checkButton.hidden = matchingAssistant.value !== 'off';
  checkButton.disabled = solved;
  solveButton.disabled = solved;
  victory.hidden = !solved || puzzle.revealed;
  victoryPerfect.hidden = victory.hidden || puzzle.moves !== total;
  if (victoryPerfect.hidden && confetti.hasChildNodes()) confetti.replaceChildren();
  progress.textContent = `${placed} / ${total} placed`;
  remaining.textContent = `${total - placed} remaining`;
  moveCount.textContent = `${puzzle.moves} ${puzzle.moves === 1 ? 'move' : 'moves'}`;
  if (!victory.hidden) victoryMoves.textContent = moveCount.textContent;
  scheduleLayout();
}

function rainConfetti() {
  if (reducedMotion.matches) return;

  const colors = ['#ffd480', '#69eaf0', '#a6e9c7', '#ff9dc1', '#bcabff'];
  const pieces = Array.from({ length: 48 }, (_, index) => {
    const piece = document.createElement('span');
    piece.style.left = `${(index + Math.random()) / 48 * 100}%`;
    piece.style.backgroundColor = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    piece.style.animationDuration = `${1.6 + Math.random()}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
    return piece;
  });
  confetti.replaceChildren(...pieces);
}

function commit(next: Puzzle, message: string) {
  const marking = next.board === puzzle.board;
  const wasShowingVictory = !victory.hidden;
  history.push(puzzle);
  puzzle = next;
  lastTap = null;
  selected = null;
  returning = null;
  save();
  render();
  if (!wasShowingVictory && !victory.hidden) {
    nextPuzzle.focus({ preventScroll: true });
    if (!victoryPerfect.hidden) rainConfetti();
  }
  if (marking) announce(message);
  else if (!victory.hidden) {
    announce(victoryPerfect.hidden ? 'Puzzle solved!' : 'Puzzle solved! Perfect game!', 'success');
  }
  else if (matchingAssistant.value === 'highlight' && conflictedSlots.size) {
    announce(`${message} Check the red outlines.`, 'error');
  }
  else announce(message);
}

function clearTarget() {
  if (drag?.target) cellAt(drag.target).classList.remove('target', 'invalid');
}

function scrollWithDrag() {
  if (!drag?.touch || document.documentElement.scrollHeight <= innerHeight) return;
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
  const previous = drag;
  const pointerId = press?.pointerId;
  clearTarget();
  drag = null;
  press = null;
  if (pointerId !== undefined && arena.hasPointerCapture(pointerId)) arena.releasePointerCapture(pointerId);
  if (!previous) return;
  document.body.classList.remove('dragging');
  if (animate && !reducedMotion.matches) {
    returning = { id: previous.id, from: previous.position, to: previous.from, started: performance.now() };
  }
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
  lastTap = null;
  returning = null;
  selected = null;
  history.length = 0;
  puzzle = newPuzzle(size, difficulty);
  save();
  render();
  announce('New puzzle ready.');
}

function openNewPuzzleDialog() {
  boardSize.value = String(puzzle.size);
  difficultySelect.value = puzzle.difficulty ?? 'normal';
  newPuzzleWarning.hidden = isSolved(puzzle) || puzzle.moves === 0;
  newPuzzleDialog.showModal();
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

function markTile(slot: Slot) {
  const action = doubleTapAction.value;
  if (action !== 'lock' && action !== 'pencil') return;
  const next = toggleMark(puzzle, slot, action);
  if (!next) return;
  const id = next.board[slot.index]!;
  const message = action === 'lock'
    ? next.marks[id] ? 'Tile locked.' : 'Tile unlocked.'
    : next.marks[id] ? 'Tile penciled in.' : 'Pencil mark removed.';
  commit(next, message);
}

const unlockMessage = 'Tile locked. Double-tap to unlock, or press M.';
const dragThreshold = 7;
const doubleTapDelay = 360;

arena.addEventListener('pointerdown', event => {
  if (press || !event.isPrimary || event.button !== 0) return;
  const from = slotFor(event.target);
  if (!from || from.area !== 'board') lastTap = null;
  if (!from) return;
  const id = puzzle[from.area][from.index];
  if (id === null) {
    lastTap = null;
    return;
  }

  event.preventDefault();
  markFocus(from);
  selected = null;
  press = {
    pointerId: event.pointerId, pointerType: event.pointerType, started: performance.now(),
    from, id, x: event.clientX, y: event.clientY,
  };
  arena.setPointerCapture(event.pointerId);
  render();
});

function beginDrag(start: TilePress) {
  returning = null;
  const position = positionOf(start.from);
  const touch = start.pointerType === 'touch';
  drag = {
    touch, from: start.from, id: start.id, x: start.x, y: start.y,
    offsetX: start.x - position.x,
    offsetY: start.y - position.y + (touch ? position.size * .42 : 0),
    position,
    target: null,
  };
  document.body.classList.add('dragging');
}

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
    const valid = move(puzzle, drag.from, target, matchingAssistant.value === 'off') !== null;
    cellAt(target).classList.add(valid ? 'target' : 'invalid');
  }
}

arena.addEventListener('pointermove', event => {
  if (press?.pointerId !== event.pointerId) return;
  if (!drag) {
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < dragThreshold) return;
    lastTap = null;
    if (isLocked(puzzle, press.from)) {
      endDrag();
      announce(unlockMessage, 'error');
      return;
    }
    beginDrag(press);
  }
  if (!drag) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.position.x = drag.x - drag.offsetX;
  drag.position.y = drag.y - drag.offsetY;
  highlightTarget();
  scheduleDraw();
});

arena.addEventListener('pointerup', event => {
  if (press?.pointerId !== event.pointerId) return;
  if (!drag) {
    const { from, id, started, pointerType, x, y } = press;
    endDrag();
    const now = performance.now();
    const release = slotFor(document.elementFromPoint(event.clientX, event.clientY));
    if (from.area !== 'board' || doubleTapAction.value === 'disabled' ||
        !release || !sameSlot(from, release) || now - started > doubleTapDelay ||
        Math.hypot(event.clientX - x, event.clientY - y) >= dragThreshold) {
      lastTap = null;
      return;
    }
    if (lastTap?.id === id && lastTap.pointerType === pointerType &&
        sameSlot(lastTap.slot, from) && now - lastTap.time <= doubleTapDelay) {
      lastTap = null;
      markTile(from);
    } else {
      lastTap = { slot: from, id, pointerType, time: now };
    }
    return;
  }
  const to = targetAt(event.clientX, event.clientY);
  const locked = to && isLocked(puzzle, to);
  const next = to && move(puzzle, drag.from, to, matchingAssistant.value !== 'prevent');
  const swapped = to && puzzle[to.area][to.index] !== null;
  endDrag(!next);
  if (next) commit(next, swapped ? 'Tiles swapped.' : 'Tile moved.');
  else if (locked) announce(unlockMessage, 'error');
  else if (to) announce('Those edges don’t match. Tile returned.', 'error');
});

function cancelPointer(event: PointerEvent) {
  if (press?.pointerId !== event.pointerId) return;
  lastTap = null;
  endDrag(true);
}
arena.addEventListener('pointercancel', cancelPointer);
arena.addEventListener('lostpointercapture', cancelPointer);
window.addEventListener('blur', () => {
  lastTap = null;
  endDrag();
});
window.addEventListener('resize', scheduleLayout);
window.visualViewport?.addEventListener('resize', scheduleLayout);
window.addEventListener('scroll', () => {
  highlightTarget();
  scheduleDraw();
}, { passive: true });
const layoutObserver = new ResizeObserver(scheduleLayout);
layoutObserver.observe(arena);
layoutObserver.observe(document.querySelector('.toolbar')!);

arena.addEventListener('click', event => {
  if (event.detail !== 0 || press) return;
  const to = slotFor(event.target);
  if (!to) return;
  const occupant = puzzle[to.area][to.index];
  if (isLocked(puzzle, to)) {
    announce(unlockMessage, 'error');
    return;
  }
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
  if (!slot || press) return;
  if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (!event.repeat) markTile(slot);
    return;
  }
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

document.querySelector('#new')!.addEventListener('click', openNewPuzzleDialog);
nextPuzzle.addEventListener('click', openNewPuzzleDialog);
newPuzzleForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!(event.submitter instanceof HTMLButtonElement) || event.submitter.value !== 'start') {
    newPuzzleDialog.close();
    return;
  }
  const size = Number(boardSize.value) as Size;
  if (!sizes.includes(size)) return;
  newPuzzleDialog.close();
  replacePuzzle(size, difficultySelect.value as Difficulty);
  cellAt({ area: 'tray', index: 0 }).focus({ preventScroll: true });
});

undoButton.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  endDrag();
  puzzle = previous;
  lastTap = null;
  selected = null;
  returning = null;
  save();
  render();
  announce('Move undone.');
});

checkButton.addEventListener('click', () => {
  const left = puzzle.tray.filter(id => id !== null).length;
  if (conflictedSlots.size) announce('Some touching numbers differ.', 'error');
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
  updateHowToPlay();
  render();
  announce(placementHelp.textContent);
});
doubleTapAction.addEventListener('change', () => {
  lastTap = null;
  write(doubleTapKey, doubleTapAction.value);
  updateHowToPlay();
  if (doubleTapAction.value !== 'lock') {
    puzzle = withoutLocks(puzzle);
    for (let index = 0; index < history.length; index++) history[index] = withoutLocks(history[index]);
    save();
    render();
  }
});
cheatMode.checked = read(cheatModeKey) === 'true';
cheatMode.addEventListener('change', () => {
  write(cheatModeKey, String(cheatMode.checked));
  updateHowToPlay();
  render();
});
smallLayout.value = read(layoutKey) === 'fit' ? 'fit' : 'scroll';
smallLayout.addEventListener('change', () => {
  write(layoutKey, smallLayout.value);
  scheduleLayout();
});
updateHowToPlay();
render();
if (puzzle !== restored) save();
announce(restored ? (isSolved(puzzle) ? 'Completed puzzle restored.' : 'Puzzle resumed.') : 'Pick any tile to begin.');
