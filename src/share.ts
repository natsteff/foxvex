const links = {
  game: { title: 'FoxVex', url: 'https://natsteff.github.io/foxvex/', label: 'Game' },
  soundtrack: {
    title: 'FoxVex soundtrack',
    url: 'https://suno.com/playlist/7bfd503f-821d-4b35-8c35-1e106e22502a',
    label: 'Soundtrack',
  },
};

type SharePlatform = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

export async function shareLink(data: { title: string; url: string }, platform: SharePlatform = navigator) {
  if (typeof platform.share === 'function') {
    try {
      await platform.share({ title: data.title, url: data.url });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!platform.clipboard) return 'manual';
    await platform.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

export function setupShareMenu() {
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  const menu = document.querySelector<HTMLDetailsElement>('#share-menu')!;
  const summary = menu.querySelector('summary')!;
  const status = document.querySelector<HTMLParagraphElement>('#share-status')!;
  const manual = document.querySelector<HTMLInputElement>('#share-link')!;
  const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-share]'));
  let busy = false;
  let clearStatus: ReturnType<typeof setTimeout> | undefined;
  let menuSession = 0;

  function close() {
    menu.open = false;
  }

  document.addEventListener('click', event => {
    if (!event.composedPath().includes(menu)) close();
  });
  dialog.addEventListener('close', () => {
    close();
    menuSession++;
    clearTimeout(clearStatus);
    status.textContent = '';
    manual.hidden = true;
  });
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    summary.focus();
  });
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (busy) return;
      const data = links[button.dataset.share as keyof typeof links];
      busy = true;
      for (const choice of buttons) choice.disabled = true;
      const session = menuSession;
      clearTimeout(clearStatus);
      status.textContent = '';
      manual.hidden = true;
      close();
      // Preserve user activation by requesting native sharing in this click handler.
      const result = await shareLink(data);
      busy = false;
      for (const choice of buttons) choice.disabled = false;
      if (session !== menuSession || !dialog.open || result === 'cancelled') return;
      status.textContent = result === 'copied' ? `${data.label} link copied!`
        : result === 'shared' ? 'Share request sent.' : 'Copy this link to share:';
      if (result === 'manual') {
        manual.value = data.url;
        manual.hidden = false;
        manual.focus();
        manual.select();
      } else {
        summary.focus();
        clearStatus = setTimeout(() => { status.textContent = ''; }, 4000);
      }
    });
  }
}
