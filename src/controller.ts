export type ControllerAction = 'up' | 'down' | 'left' | 'right' | 'activate' | 'back' | 'mark' | 'undo' | 'previous' | 'next' | 'music' | 'skip' | 'new' | 'menu';

const buttons: Record<number, ControllerAction> = {
  0: 'activate', 1: 'back', 2: 'mark', 3: 'undo',
  4: 'previous', 5: 'next', 6: 'music', 7: 'skip',
  8: 'new', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};
const repeatable = new Set<ControllerAction>(['up', 'down', 'left', 'right']);

export function controllerActions(pad: Pick<Gamepad, 'buttons' | 'axes'>) {
  const actions = new Set<ControllerAction>();
  for (const [index, action] of Object.entries(buttons)) {
    const button = pad.buttons[Number(index)];
    if (button?.pressed || (button?.value ?? 0) > .5) actions.add(action);
  }
  if (pad.axes[0] < -.6) actions.add('left');
  if (pad.axes[0] > .6) actions.add('right');
  if (pad.axes[1] < -.6) actions.add('up');
  if (pad.axes[1] > .6) actions.add('down');
  return actions;
}

export function setupController(actions: {
  cancelTile: () => void;
  markTile: () => void;
  startMusic: () => void;
  toggleMusic: () => void;
  skipMusic: () => void;
}) {
  const status = document.querySelector<HTMLElement>('#controller-status')!;
  const held = new Map<string, Map<ControllerAction, number>>();
  let frame = 0;
  let focused = document.hasFocus();
  let lastFrame = 0;

  function activeDialog() {
    return Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
  }

  function controls() {
    const scope = activeDialog() ?? document.body;
    return Array.from(scope.querySelectorAll<HTMLElement>('button, select, input, summary, a[href]')).filter(element => {
      if (element.matches(':disabled') || element.closest('[hidden], [inert]') || element.tabIndex < 0) return false;
      const collapsed = element.closest('details:not([open])');
      if (collapsed && element !== collapsed.querySelector('summary')) return false;
      return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    });
  }

  function focus(element: HTMLElement | undefined) {
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function moveControl(step: number) {
    const items = controls();
    const active = document.activeElement as HTMLElement | null;
    let index = items.indexOf(active!);
    if (index === -1 && active?.matches('.cell')) {
      index = items.findIndex(item => item.closest('.grid') === active.closest('.grid'));
    }
    const next = index < 0 ? step > 0 ? 0 : items.length - 1 : (index + step + items.length) % items.length;
    focus(items[next]);
  }

  function changeSelect(select: HTMLSelectElement, step: number) {
    const available = Array.from(select.options).filter(option => !option.disabled && !option.hidden);
    const index = available.findIndex(option => option.value === select.value);
    const option = available[(index + step + available.length) % available.length];
    if (!option || option.value === select.value) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function back() {
    const dialog = activeDialog();
    if (!dialog) {
      actions.cancelTile();
      return;
    }
    const expanded = document.activeElement?.closest<HTMLDetailsElement>('details[open]')
      ?? Array.from(dialog.querySelectorAll<HTMLDetailsElement>('details[open]')).at(-1);
    if (expanded) {
      expanded.open = false;
      focus(expanded.querySelector('summary')!);
      return;
    }
    const cancel = new Event('cancel', { cancelable: true });
    if (dialog.dispatchEvent(cancel)) dialog.close();
  }

  function act(action: ControllerAction) {
    document.body.classList.add('controller-active');
    if (!controls().includes(document.activeElement as HTMLElement) && !(document.activeElement as HTMLElement)?.matches('.cell')) {
      focus(activeDialog() ? controls()[0] : document.querySelector<HTMLElement>('#tray .cell[tabindex="0"]')!);
    }
    if (action !== 'music' && action !== 'skip') actions.startMusic();
    const active = document.activeElement as HTMLElement | null;
    const dialog = activeDialog();
    switch (action) {
      case 'previous': moveControl(-1); break;
      case 'next': moveControl(1); break;
      case 'left':
      case 'right':
      case 'up':
      case 'down': {
        const step = action === 'left' || action === 'up' ? -1 : 1;
        if (active instanceof HTMLSelectElement && (action === 'left' || action === 'right')) {
          changeSelect(active, step);
        } else if (!dialog && active?.matches('.cell')) {
          const key = `Arrow${action[0].toUpperCase()}${action.slice(1)}`;
          const before = document.activeElement;
          active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          if (document.activeElement === before && (action === 'up' || action === 'down')) moveControl(step);
        } else moveControl(step);
        break;
      }
      case 'activate':
        if (active instanceof HTMLSelectElement) changeSelect(active, 1);
        else if (active instanceof HTMLInputElement && active.readOnly) active.select();
        else active?.click();
        break;
      case 'back': back(); break;
      case 'mark': if (!dialog) actions.markTile(); break;
      case 'undo': if (!dialog) document.querySelector<HTMLButtonElement>('#undo')!.click(); break;
      case 'new': if (!dialog) document.querySelector<HTMLButtonElement>('#new')!.click(); break;
      case 'menu':
        if (dialog) back();
        else {
          document.querySelector<HTMLButtonElement>('#settings')!.click();
          focus(document.querySelector<HTMLSelectElement>('#matching-assistant')!);
        }
        break;
      case 'music': actions.toggleMusic(); break;
      case 'skip': actions.skipMusic(); break;
    }
  }

  function poll(time: number) {
    frame = 0;
    if (document.hidden || !focused) {
      held.clear();
      return;
    }
    let pads: (Gamepad | null)[];
    try { pads = Array.from(navigator.getGamepads()); }
    catch {
      status.textContent = 'Controller access is unavailable in this browser.';
      return;
    }
    const connected = pads.filter((pad): pad is Gamepad => pad !== null && pad.connected);
    const message = connected.length ? `Connected: ${connected.map(pad => pad.id).join(', ')}` : 'Connect a controller and press a button to begin.';
    if (status.textContent !== message) status.textContent = message;
    const elapsed = lastFrame ? Math.min(50, time - lastFrame) : 16;
    lastFrame = time;
    const keys = new Set<string>();
    for (const pad of connected) {
      const key = `${pad.index}:${pad.id}`;
      keys.add(key);
      const scroll = pad.axes[3] ?? 0;
      if (Math.abs(scroll) > .25) {
        const dialog = activeDialog();
        const target = dialog?.querySelector('.settings-content') ?? dialog ?? document.scrollingElement;
        target?.scrollBy({ top: scroll * elapsed * .6 });
      }
      const pressed = controllerActions(pad);
      let previous = held.get(key);
      if (!previous) {
        // Require release after connecting or returning to avoid accidental actions.
        previous = new Map(Array.from(pressed, action => [action, Number.POSITIVE_INFINITY]));
        held.set(key, previous);
        continue;
      }
      for (const action of Array.from(previous.keys())) if (!pressed.has(action)) previous.delete(action);
      for (const action of pressed) {
        const nextRepeat = previous.get(action);
        if (nextRepeat === undefined) {
          act(action);
          previous.set(action, time + 350);
        } else if (repeatable.has(action) && time >= nextRepeat) {
          act(action);
          previous.set(action, time + 120);
        }
      }
    }
    for (const key of held.keys()) if (!keys.has(key)) held.delete(key);
    frame = requestAnimationFrame(poll);
  }

  function start() {
    if (!frame && !document.hidden && focused) frame = requestAnimationFrame(poll);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      held.clear();
    } else start();
  });
  document.addEventListener('pointerdown', event => {
    if (event.isTrusted) document.body.classList.remove('controller-active');
  }, { capture: true });
  document.addEventListener('keydown', event => {
    if (event.isTrusted) document.body.classList.remove('controller-active');
  }, { capture: true });
  window.addEventListener('blur', () => {
    focused = false;
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    held.clear();
  });
  window.addEventListener('focus', () => {
    focused = true;
    start();
  });
  window.addEventListener('gamepadconnected', start);
  if (typeof navigator.getGamepads === 'function') start();
  else status.textContent = 'Controller support is unavailable in this browser.';
}
