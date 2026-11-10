interface MemoryCacheOptions {
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
  now?: () => number;
}

interface Entry<T> {
  value: T;
  bytes: number;
  expiresAt: number;
}

/** A process-local cache. Callers supply each value's estimated retained size. */
export class MemoryCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private retainedBytes = 0;
  private readonly now: () => number;

  constructor(private readonly options: MemoryCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1
      || !Number.isFinite(options.maxBytes) || options.maxBytes < 1
      || !Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new RangeError("Cache limits and TTL must be positive finite numbers.");
    }
    this.now = options.now || Date.now;
  }

  get size() { return this.entries.size; }
  get byteSize() { return this.retainedBytes; }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    // Map iteration order records least to most recently used entries.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, byteSize: number): boolean {
    if (!Number.isFinite(byteSize) || byteSize < 0) throw new RangeError("Invalid cache entry size.");
    const bytes = Math.ceil(byteSize);
    this.delete(key);
    if (bytes > this.options.maxBytes) return false;

    const now = this.now();
    for (const [expiredKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.delete(expiredKey);
    }
    while (this.entries.size >= this.options.maxEntries || this.retainedBytes + bytes > this.options.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    this.entries.set(key, { value, bytes, expiresAt: now + this.options.ttlMs });
    this.retainedBytes += bytes;
    return true;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.retainedBytes -= entry.bytes;
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.retainedBytes = 0;
  }
}
