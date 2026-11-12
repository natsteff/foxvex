const tracks = [
  { id: 'dreamstate-tetravex', name: 'Dreamstate TetraVex' },
  { id: 'aurora-drift', name: 'Aurora Drift' },
  { id: 'endless-dreamscape', name: 'Endless Dreamscape' },
  { id: 'foxvex-edm-continuum', name: 'FoxVex EDM Continuum' },
  { id: 'neon-continuum', name: 'Neon Continuum' },
  { id: 'cloud-garden', name: 'Cloud Garden' },
  { id: 'pixelated-folk-bon-bons', name: 'Pixelated Folk Bon Bons (Lil G in EC)' },
];

export function setupSoundtrack(read: (key: string) => string | null, write: (key: string, value: string) => void) {
  const audio = document.querySelector<HTMLAudioElement>('#soundtrack-audio')!;
  const previewAudio = document.querySelector<HTMLAudioElement>('#soundtrack-preview-audio')!;
  const mode = document.querySelector<HTMLSelectElement>('#soundtrack-mode')!;
  const track = document.querySelector<HTMLSelectElement>('#soundtrack-track')!;
  const playlist = document.querySelector<HTMLDivElement>('#soundtrack-playlist')!;
  const quality = document.querySelector<HTMLInputElement>('#soundtrack-quality')!;
  const preview = document.querySelector<HTMLButtonElement>('#soundtrack-preview')!;
  const previewStatus = document.querySelector<HTMLParagraphElement>('#soundtrack-preview-status')!;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  const status = document.querySelector<HTMLParagraphElement>('#soundtrack-status')!;
  const toggle = document.querySelector<HTMLButtonElement>('#soundtrack-toggle')!;
  const wordmark = document.querySelector<HTMLImageElement>('.wordmark')!;
  const loading = document.querySelector<HTMLSpanElement>('#soundtrack-loading')!;
  const standardLogo = wordmark.src;
  const musicLogo = new URL('./assets/foxvex-wordmark-music.png', import.meta.url).href;
  const modeKey = 'foxvex.soundtrack-mode.v1';
  const lastModeKey = 'foxvex.soundtrack-last-mode.v1';
  const trackKey = 'foxvex.soundtrack-track.v1';
  const playlistKey = 'foxvex.soundtrack-playlist.v1';
  const qualityKey = 'foxvex.soundtrack-high-quality.v1';
  let selectedIds: string[] = [];
  try {
    const saved: unknown = JSON.parse(read(playlistKey) ?? 'null');
    if (Array.isArray(saved)) selectedIds = tracks.filter(item => saved.includes(item.id)).map(item => item.id);
  } catch { /* Use all tracks when a saved playlist cannot be read. */ }
  if (selectedIds.length === 0) selectedIds = tracks.map(item => item.id);
  quality.checked = read(qualityKey) === 'true';
  const savedMode = read(modeKey);
  mode.value = savedMode === 'off' || savedMode === 'sequential' ? savedMode : 'random';
  let lastRepeatMode = savedMode === 'off'
    ? read(lastModeKey) === 'sequential' ? 'sequential' : 'random'
    : mode.value;
  let pausedByPlayer = false;
  let previewSession = false;
  let previewLoading = false;
  let resumeAfterPreview = false;
  let backgrounded = document.hidden;
  let resumeMusicOnReturn = false;
  let resumePreviewOnReturn = false;
  let lastTap: number | undefined;
  const initialIndex = mode.value === 'random' ? Math.floor(Math.random() * selectedIds.length) : 0;
  const savedTrackId = read(trackKey);
  let currentId = savedTrackId && selectedIds.includes(savedTrackId) ? savedTrackId : selectedIds[initialIndex];
  track.replaceChildren(...tracks.map(({ id, name }, index) => new Option(`${index + 1}. ${name}`, id)));
  track.value = currentId;

  const checkboxes = tracks.map(({ id, name }, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.checked = selectedIds.includes(id);
    label.append(input, `${index + 1}. ${name}`);
    playlist.append(label);
    return input;
  });

  function setLoading(active: boolean) {
    loading.hidden = !active;
    toggle.toggleAttribute('data-loading', active);
  }

  function updateToggleLabel() {
    const action = mode.value === 'off' ? 'Enable' : audio.paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', `${action} FoxVex soundtrack`);
    toggle.toggleAttribute('data-paused', mode.value !== 'off' && audio.paused);
  }

  function updateControls() {
    wordmark.src = mode.value !== 'off' ? musicLogo : standardLogo;
    audio.loop = false;
    for (const input of checkboxes) input.disabled = input.checked && selectedIds.length === 1;
    updateToggleLabel();
  }

  function sourceFor(id: string) {
    const folder = quality.checked ? 'high' : 'default';
    return new URL(`./audio/music/${folder}/${id}.mp3`, document.baseURI).href;
  }

  function playTrack(startNew = false) {
    if (backgrounded || document.hidden || mode.value === 'off' || pausedByPlayer || previewSession) return;
    if (startNew || !audio.getAttribute('src')) audio.src = sourceFor(currentId);
    if (!audio.paused) return;
    const source = audio.src;
    if (audio.error) audio.load();
    setLoading(true);
    void audio.play().catch((error: DOMException) => {
      if (mode.value === 'off' || previewSession || audio.src !== source || error.name === 'AbortError') return;
      setLoading(false);
      status.textContent = error.name === 'NotAllowedError'
        ? 'Tap the game to start music.' : 'This track is unavailable. Tap to retry.';
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
      setLoading(false);
      resumeAfterPreview = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } else if (previewSession) {
      resumeAfterPreview = true;
    } else playTrack();
    updateControls();
  }

  for (const input of checkboxes) input.addEventListener('change', () => {
    selectedIds = checkboxes.filter(item => item.checked).map(item => item.value);
    write(playlistKey, JSON.stringify(selectedIds));
    updateControls();
  });
  quality.addEventListener('change', () => write(qualityKey, String(quality.checked)));
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

  preview.addEventListener('click', () => {
    if (!previewAudio.paused) {
      previewAudio.pause();
      return;
    }
    if (!previewSession) {
      resumeAfterPreview = !audio.paused && mode.value !== 'off' && !pausedByPlayer;
      previewSession = true;
      audio.pause();
    }
    playPreview();
  });

  function playPreview() {
    if (backgrounded || document.hidden) return;
    previewStatus.hidden = true;
    const source = sourceFor(track.value);
    if (previewAudio.src !== source || previewAudio.error) previewAudio.src = source;
    previewLoading = true;
    updatePreviewButton();
    void previewAudio.play().catch((error: DOMException) => {
      if (!previewSession || previewAudio.src !== source || error.name === 'AbortError') return;
      previewStatus.textContent = 'Preview unavailable. Press Preview to retry.';
      previewStatus.hidden = false;
      previewLoading = false;
      updatePreviewButton();
    });
  }
  function updatePreviewButton() {
    preview.textContent = previewLoading ? 'Loading…' : previewAudio.paused ? 'Preview' : 'Pause';
  }
  for (const event of ['playing', 'pause', 'ended']) {
    previewAudio.addEventListener(event, () => {
      if (event === 'pause' && !previewAudio.paused) return;
      previewLoading = false;
      updatePreviewButton();
    });
  }
  for (const event of ['waiting', 'stalled']) {
    previewAudio.addEventListener(event, () => {
      previewLoading = !previewAudio.paused;
      updatePreviewButton();
    });
  }
  previewAudio.addEventListener('error', () => {
    if (!previewSession) return;
    previewAudio.pause();
    previewStatus.textContent = 'Preview unavailable. Press Preview to retry.';
    previewStatus.hidden = false;
    previewLoading = false;
    updatePreviewButton();
  });
  track.addEventListener('change', () => {
    previewAudio.pause();
    previewAudio.removeAttribute('src');
    previewAudio.load();
    previewStatus.hidden = true;
    updatePreviewButton();
  });
  dialog.addEventListener('close', () => {
    previewAudio.pause();
    previewAudio.removeAttribute('src');
    previewAudio.load();
    previewSession = false;
    previewStatus.hidden = true;
    updatePreviewButton();
    if (resumeAfterPreview) playTrack();
    resumeAfterPreview = false;
  });

  audio.addEventListener('playing', () => {
    setLoading(false);
    status.hidden = true;
    updateToggleLabel();
  });
  audio.addEventListener('pause', () => {
    if (!audio.paused) return;
    setLoading(false);
    updateToggleLabel();
  });
  for (const event of ['waiting', 'stalled']) {
    audio.addEventListener(event, () => setLoading(!audio.paused && mode.value !== 'off' && !previewSession));
  }
  audio.addEventListener('error', () => {
    setLoading(false);
    if (mode.value === 'off') return;
    status.textContent = 'This track is unavailable. Tap to retry.';
    status.hidden = false;
  });
  audio.addEventListener('ended', () => {
    const candidates = selectedIds.filter(id => id !== currentId);
    if (mode.value === 'random' && candidates.length) {
      currentId = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const index = tracks.findIndex(item => item.id === currentId);
      const following = tracks.slice(index + 1).find(item => selectedIds.includes(item.id));
      currentId = following?.id ?? selectedIds[0];
    }
    write(trackKey, currentId);
    playTrack(true);
  });

  function pauseForBackground() {
    if (backgrounded) return;
    backgrounded = true;
    resumeMusicOnReturn = !audio.paused && mode.value !== 'off' && !pausedByPlayer;
    resumePreviewOnReturn = !previewAudio.paused;
    audio.pause();
    previewAudio.pause();
    setLoading(false);
  }

  function resumeFromBackground() {
    if (!backgrounded || document.hidden) return;
    backgrounded = false;
    const resumeMusic = resumeMusicOnReturn;
    const resumePreview = resumePreviewOnReturn;
    resumeMusicOnReturn = false;
    resumePreviewOnReturn = false;
    if (resumePreview && previewSession && dialog.open) playPreview();
    if (resumeMusic) playTrack();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForBackground();
    else resumeFromBackground();
  });
  window.addEventListener('pagehide', pauseForBackground);
  window.addEventListener('pageshow', resumeFromBackground);

  function startFromInteraction(event: Event) {
    if (!event.isTrusted || event.composedPath().includes(toggle)) return;
    lastTap = undefined;
    playTrack();
  }

  // Capture gestures before the game canvas can stop their propagation.
  for (const event of ['click', 'pointerup', 'touchend']) {
    document.addEventListener(event, startFromInteraction, { capture: true, passive: true });
  }
  document.addEventListener('keydown', event => {
    if (event.target !== toggle && (event.key === 'Enter' || event.key === ' ')) startFromInteraction(event);
  }, { capture: true });
  updateControls();
}
