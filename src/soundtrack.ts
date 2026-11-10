const tracks = [
  { id: 'pixelated-folk-bon-bons', name: 'Pixelated Folk Bon Bons' },
];

export function setupSoundtrack(read: (key: string) => string | null, write: (key: string, value: string) => void) {
  const audio = document.querySelector<HTMLAudioElement>('#soundtrack-audio')!;
  const mode = document.querySelector<HTMLSelectElement>('#soundtrack-mode')!;
  const track = document.querySelector<HTMLSelectElement>('#soundtrack-track')!;
  const status = document.querySelector<HTMLParagraphElement>('#soundtrack-status')!;
  const toggle = document.querySelector<HTMLButtonElement>('#soundtrack-toggle')!;
  const wordmark = document.querySelector<HTMLImageElement>('.wordmark')!;
  const standardLogo = wordmark.src;
  const musicLogo = new URL('./assets/foxvex-wordmark-music.png', import.meta.url).href;
  const modeKey = 'foxvex.soundtrack-mode.v1';
  const lastModeKey = 'foxvex.soundtrack-last-mode.v1';
  const trackKey = 'foxvex.soundtrack-track.v1';

  const savedMode = read(modeKey);
  mode.value = savedMode === 'off' || savedMode === 'sequential' ? savedMode : 'random';
  let lastRepeatMode = savedMode === 'off'
    ? read(lastModeKey) === 'sequential' ? 'sequential' : 'random'
    : mode.value;
  let pausedByPlayer = false;
  let lastTap: number | undefined;
  track.replaceChildren(...tracks.map(({ id, name }) => new Option(name, id)));
  const savedTrackId = read(trackKey);
  const savedTrack = tracks.find(({ id }) => id === savedTrackId);
  const initialIndex = mode.value === 'random' ? Math.floor(Math.random() * tracks.length) : 0;
  track.value = (savedTrack ?? tracks[initialIndex]).id;
  audio.loop = tracks.length === 1;

  function updateToggleLabel() {
    const action = mode.value === 'off' ? 'Enable' : audio.paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', `${action} FoxVex soundtrack`);
  }

  function updateControls() {
    const enabled = mode.value !== 'off';
    track.disabled = !enabled;
    wordmark.src = enabled ? musicLogo : standardLogo;
    updateToggleLabel();
  }

  function playTrack() {
    if (mode.value === 'off' || pausedByPlayer) return;
    const source = new URL(`./audio/music/${track.value}.mp3`, document.baseURI).href;
    if (audio.src !== source) audio.src = source;
    if (!audio.paused || audio.error) return;
    void audio.play().catch((error: DOMException) => {
      if (mode.value === 'off' || audio.src !== source || error.name === 'AbortError') return;
      status.textContent = error.name === 'NotAllowedError'
        ? 'Tap the game to start music.'
        : 'This track is unavailable.';
      status.hidden = false;
    });
  }

  function applyMode() {
    if (mode.value !== 'off') lastRepeatMode = mode.value;
    write(lastModeKey, lastRepeatMode);
    write(modeKey, mode.value);
    pausedByPlayer = false;
    status.hidden = true;
    if (mode.value === 'off') {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } else {
      playTrack();
    }
    updateControls();
  }

  mode.addEventListener('change', applyMode);
  toggle.addEventListener('click', event => {
    const now = performance.now();
    const keyboardActivation = event.detail === 0;
    const doubleTap = !keyboardActivation && lastTap !== undefined && now - lastTap <= 360;
    lastTap = doubleTap || keyboardActivation ? undefined : now;
    if (doubleTap || (keyboardActivation && mode.value === 'off')) {
      mode.value = mode.value === 'off' ? lastRepeatMode : 'off';
      applyMode();
      return;
    }
    if (mode.value === 'off') return;

    pausedByPlayer = !audio.paused;
    if (pausedByPlayer) audio.pause();
    else playTrack();
    updateToggleLabel();
  });

  track.addEventListener('change', () => {
    write(trackKey, track.value);
    pausedByPlayer = false;
    status.hidden = true;
    playTrack();
  });

  audio.addEventListener('playing', () => {
    status.hidden = true;
    updateToggleLabel();
  });
  audio.addEventListener('pause', updateToggleLabel);
  audio.addEventListener('error', () => {
    if (mode.value === 'off') return;
    status.textContent = 'This track is unavailable.';
    status.hidden = false;
  });
  audio.addEventListener('ended', () => {
    if (mode.value === 'off' || tracks.length < 2) return;
    const step = mode.value === 'random' ? 1 + Math.floor(Math.random() * (tracks.length - 1)) : 1;
    track.selectedIndex = (track.selectedIndex + step) % tracks.length;
    write(trackKey, track.value);
    playTrack();
  });

  document.addEventListener('click', event => {
    if (!event.isTrusted || event.composedPath().includes(toggle)) return;
    lastTap = undefined;
    playTrack();
  });
  document.querySelector('#arena')!.addEventListener('pointerup', event => {
    if (event.isTrusted) playTrack();
  });
  document.addEventListener('keydown', event => {
    if (event.isTrusted && event.target !== toggle && (event.key === 'Enter' || event.key === ' ')) playTrack();
  });
  updateControls();
}
