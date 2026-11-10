import './style.css';
import { checkForUpdate } from './updates';

const startup = document.querySelector<HTMLElement>('#startup-screen')!;
const startupStatus = document.querySelector<HTMLParagraphElement>('#startup-status')!;
const retry = document.querySelector<HTMLAnchorElement>('#startup-retry')!;
const version = document.querySelector('#game-version')!.textContent!;
const autoUpdate = document.querySelector<HTMLInputElement>('#auto-update')!;
const checkButton = document.querySelector<HTMLButtonElement>('#check-updates')!;
const updateStatus = document.querySelector<HTMLParagraphElement>('#update-status')!;
const settings = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
const gameUI = document.querySelectorAll<HTMLElement>('.topbar, main');
const autoUpdateKey = 'foxvex.auto-update.v1';
let slowTimer: ReturnType<typeof setTimeout>;
let lastCheck = 0;

try { autoUpdate.checked = localStorage.getItem(autoUpdateKey) !== 'false'; } catch {}

function showStartup(message: string) {
  startup.hidden = false;
  startupStatus.textContent = message;
  retry.hidden = true;
  gameUI.forEach(element => { element.inert = true; });
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    startupStatus.textContent = 'Taking longer than expected. Check your connection or try again.';
    retry.hidden = false;
  }, 12000);
}

retry.addEventListener('click', event => {
  event.preventDefault();
  const target = new URL(location.href);
  target.searchParams.set('_refresh', String(Date.now()));
  location.replace(target.href);
});

async function checkUpdates(manual = false) {
  if (checkButton.disabled || (!manual && (!autoUpdate.checked || Date.now() - lastCheck < 10000))) {
    return;
  }

  lastCheck = Date.now();
  checkButton.disabled = true;
  updateStatus.textContent = 'Checking for updates…';
  let attempts: Storage | undefined;
  try { attempts = sessionStorage; } catch {}
  const result = await checkForUpdate(version, new URL(location.href), { manual, attempts });

  if (!manual && !autoUpdate.checked) {
    updateStatus.textContent = 'Automatic checks are off.';
    checkButton.disabled = false;
    return;
  }

  if (result.status === 'updating') {
    settings.close();
    showStartup('Update found. Loading the new version…');
    location.replace(result.url.href);
    return true;
  }

  const messages = {
    current: 'You’re up to date.',
    stale: 'A newer version is available. Try checking again.',
    unavailable: 'Could not check for updates. Try again online.',
  };
  updateStatus.textContent = messages[result.status];
  checkButton.disabled = false;
}

autoUpdate.addEventListener('change', () => {
  try { localStorage.setItem(autoUpdateKey, String(autoUpdate.checked)); } catch {}
  if (autoUpdate.checked) void checkUpdates(true);
  else if (!checkButton.disabled) updateStatus.textContent = 'Automatic checks are off.';
});
checkButton.addEventListener('click', () => void checkUpdates(true));

async function startGame() {
  if (autoUpdate.checked) {
    showStartup('Checking for updates…');
    if (await checkUpdates()) return;
  } else {
    updateStatus.textContent = 'Automatic checks are off.';
  }

  showStartup('Loading game…');
  window.addEventListener('foxvex-ready', () => {
    clearTimeout(slowTimer);
    startup.hidden = true;
    gameUI.forEach(element => { element.inert = false; });
    window.addEventListener('pageshow', () => void checkUpdates());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void checkUpdates();
    });
  }, { once: true });

  try {
    await import('./main');
  } catch {
    clearTimeout(slowTimer);
    startupStatus.textContent = 'FoxVex could not load. Check your connection and try again.';
    retry.hidden = false;
  }
}

void startGame();
