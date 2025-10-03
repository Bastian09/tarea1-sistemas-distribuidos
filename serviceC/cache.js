import 'dotenv/config';

const DEFAULT_TTL_SEC = Number(process.env.CACHE_TTL) || 3600; // segundos
const MAX_ITEMS = Number(process.env.CACHE_MAX_ITEMS) || 1000;

class SimpleCache {
  constructor(limit = MAX_ITEMS, defaultTtlSec = DEFAULT_TTL_SEC) {
    this.limit = limit;
    this.defaultTtlMs = defaultTtlSec * 1000;
    // Map mantiene orden de inserción; re-inserción al acceder -> simple LRU
    this._map = new Map();
    this._stats = { hits: 0, misses: 0, puts: 0, deletes: 0, evictions: 0 };
  }

  _now() { return Date.now(); }

  _isExpired(record) {
    if (!record) return true;
    if (record.expiresAt == null) return false;
    return this._now() > record.expiresAt;
  }

  _ensureCapacity() {
    while (this._map.size >= this.limit) {
      // borrar el elemento menos recientemente usado: primer key del Map
      const oldestKey = this._map.keys().next().value;
      if (!oldestKey) break;
      this._map.delete(oldestKey);
      this._stats.evictions++;
    }
  }

  put(key, value, { ttlSec = null } = {}) {
    const ttl = (ttlSec == null) ? this.defaultTtlMs : (ttlSec * 1000);
    const record = {
      value,
      createdAt: this._now(),
      expiresAt: ttl ? this._now() + ttl : null
    };
    // si existe, eliminar para moverlo al final (más reciente)
    if (this._map.has(key)) this._map.delete(key);
    this._ensureCapacity();
    this._map.set(key, record);
    this._stats.puts++;
    return true;
  }

  get(key) {
    const rec = this._map.get(key);
    if (!rec || this._isExpired(rec)) {
      if (rec && this._isExpired(rec)) this._map.delete(key);
      this._stats.misses++;
      return null;
    }
    // LRU behavior: move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, rec);
    this._stats.hits++;
    return rec.value;
  }

  has(key) {
    const rec = this._map.get(key);
    if (!rec) return false;
    if (this._isExpired(rec)) { this._map.delete(key); return false; }
    return true;
  }

  del(key) {
    const removed = this._map.delete(key);
    if (removed) this._stats.deletes++;
    return removed;
  }

  clear() {
    const count = this._map.size;
    this._map.clear();
    this._stats = { hits: 0, misses: 0, puts: 0, deletes: 0, evictions: 0 };
    return { cleared: count };
  }

  stats() {
    return {
      ...this._stats,
      items: this._map.size,
      limit: this.limit,
      defaultTtlSec: Math.floor(this.defaultTtlMs / 1000)
    };
  }

  resetStats() {
    this._stats.hits = 0;
    this._stats.misses = 0;
    this._stats.puts = 0;
    this._stats.deletes = 0;
    this._stats.evictions = 0;
  }

  entries() {
    // Devuelve una copia de las entradas útiles (sin exponer internals)
    const out = [];
    for (const [k,v] of this._map) {
      if (!this._isExpired(v)) {
        out.push({
          key: k,
          value: v.value,
          createdAt: v.createdAt,
          expiresAt: v.expiresAt
        });
      }
    }
    return out;
  }
}

export default new SimpleCache();
