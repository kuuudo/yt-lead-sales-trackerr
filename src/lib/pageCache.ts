/**
 * Generic in-memory cache for a single page's fetched data.
 *
 * NOT a global store. NOT reactive. Each page gets its own instance via
 * createPageCache<T>(), and only that page's own module reads/writes it.
 *
 * Survives component unmount/remount (navigating away and back) because the
 * module itself stays loaded — it's cleared only when the browser tab/app
 * reloads, or when the `key` (e.g. organizationId) changes.
 *
 * `cachedAt` is stored now but not enforced yet — reserved for a future
 * TTL check (e.g. "refetch if cachedAt is older than 10 minutes").
 */
export type PageCacheEntry<T> = {
  key: string;
  cachedAt: number;
  data: T;
};

export function createPageCache<T>() {
  let entry: PageCacheEntry<T> | null = null;

  return {
    /** Returns the cached entry only if it matches the given key, else null. */
    get(key: string): PageCacheEntry<T> | null {
      return entry && entry.key === key ? entry : null;
    },
    /** Overwrites the cache with fresh data for the given key. */
    set(key: string, data: T): void {
      entry = { key, cachedAt: Date.now(), data };
    },
    /** Manually clears the cache (not required for normal use). */
    clear(): void {
      entry = null;
    },
  };
}
