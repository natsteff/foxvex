type UpdateResult =
  | { status: 'current' | 'stale' | 'unavailable' }
  | { status: 'updating'; url: URL };

export async function checkForUpdate(
  current: string,
  page: URL,
  { manual = false, fetcher = fetch, attempts }: {
    manual?: boolean;
    fetcher?: typeof fetch;
    attempts?: Storage;
  } = {},
): Promise<UpdateResult> {
  const endpoint = new URL('version.json', page);
  endpoint.searchParams.set('_check', String(Date.now()));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetcher(endpoint, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { status: 'unavailable' };
    const { version } = await response.json();
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
      return { status: 'unavailable' };
    }

    const next = version.split('.').map(Number);
    const previous = current.split('.').map(Number);
    const difference = next.findIndex((part, index) => part !== previous[index]);
    if (difference === -1 || next[difference] < previous[difference]) return { status: 'current' };

    const target = new URL(page);
    const key = `foxvex-update:${current}:${version}`;
    if (!manual && target.searchParams.get('_gameVersion') === version) return { status: 'stale' };
    try {
      if (!manual && attempts?.getItem(key)) return { status: 'stale' };
      attempts?.setItem(key, 'attempted');
    } catch {
      // The target URL also prevents an automatic reload loop without storage.
    }
    target.searchParams.set('_gameVersion', version);
    target.searchParams.set('_refresh', String(Date.now()));
    return { status: 'updating', url: target };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
