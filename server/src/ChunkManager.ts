import { CHUNK_SIZE, CHUNK_LOAD_RADIUS } from '@projectrs/shared';

/**
 * Server-side spatial index for entities within a map.
 * Tracks which chunk each entity is in for efficient proximity queries.
 * Uses numeric keys for performance (no string allocation on hot paths).
 */
export class ServerChunkManager {
  private entityChunks: Map<number, number> = new Map(); // entityId -> chunkKey
  private chunkEntities: Map<number, Set<number>> = new Map(); // chunkKey -> set of entityIds

  /** Subset of entity IDs that are players (for broadcastNearby) */
  private playerIds: Set<number> = new Set();

  readonly chunksX: number;
  readonly chunksZ: number;

  constructor(mapWidth: number, mapHeight: number) {
    this.chunksX = Math.ceil(mapWidth / CHUNK_SIZE);
    this.chunksZ = Math.ceil(mapHeight / CHUNK_SIZE);
  }

  /** Encode chunk coords into a single number. Supports coords -1000..65535 via offset. */
  private chunkKey(cx: number, cz: number): number {
    return ((cx + 1000) * 100000) + (cz + 1000);
  }

  private worldToChunk(x: number, z: number): [number, number] {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  registerPlayer(entityId: number): void {
    this.playerIds.add(entityId);
  }

  unregisterPlayer(entityId: number): void {
    this.playerIds.delete(entityId);
  }

  addEntity(entityId: number, worldX: number, worldZ: number): void {
    const [cx, cz] = this.worldToChunk(worldX, worldZ);
    const key = this.chunkKey(cx, cz);
    this.entityChunks.set(entityId, key);
    let set = this.chunkEntities.get(key);
    if (!set) {
      set = new Set();
      this.chunkEntities.set(key, set);
    }
    set.add(entityId);
  }

  removeEntity(entityId: number): void {
    const key = this.entityChunks.get(entityId);
    if (key !== undefined) {
      const set = this.chunkEntities.get(key);
      if (set) {
        set.delete(entityId);
        if (set.size === 0) this.chunkEntities.delete(key);
      }
      this.entityChunks.delete(entityId);
    }
    this.playerIds.delete(entityId);
  }

  updateEntity(entityId: number, worldX: number, worldZ: number): void {
    const [cx, cz] = this.worldToChunk(worldX, worldZ);
    const newKey = this.chunkKey(cx, cz);
    const oldKey = this.entityChunks.get(entityId);
    if (oldKey === newKey) return;

    // Remove from old chunk
    if (oldKey !== undefined) {
      const set = this.chunkEntities.get(oldKey);
      if (set) {
        set.delete(entityId);
        if (set.size === 0) this.chunkEntities.delete(oldKey);
      }
    }

    // Add to new chunk
    this.entityChunks.set(entityId, newKey);
    let set = this.chunkEntities.get(newKey);
    if (!set) {
      set = new Set();
      this.chunkEntities.set(newKey, set);
    }
    set.add(entityId);
  }

  /** Get all entity IDs within CHUNK_LOAD_RADIUS of the given chunk coords */
  getEntitiesNearChunk(cx: number, cz: number): Set<number> {
    const result = new Set<number>();
    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
        const key = this.chunkKey(cx + dx, cz + dz);
        const set = this.chunkEntities.get(key);
        if (set) {
          for (const id of set) result.add(id);
        }
      }
    }
    return result;
  }

  /** Get all entity IDs within CHUNK_LOAD_RADIUS of the given world position */
  getEntitiesNear(worldX: number, worldZ: number): Set<number> {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    return this.getEntitiesNearChunk(cx, cz);
  }

  /** Get only player IDs within CHUNK_LOAD_RADIUS of the given world position */
  getPlayersNear(worldX: number, worldZ: number): number[] {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const result: number[] = [];
    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
        const key = this.chunkKey(cx + dx, cz + dz);
        const set = this.chunkEntities.get(key);
        if (set) {
          for (const id of set) {
            if (this.playerIds.has(id)) result.push(id);
          }
        }
      }
    }
    return result;
  }

  getEntityChunk(entityId: number): [number, number] | null {
    const key = this.entityChunks.get(entityId);
    if (key === undefined) return null;
    const cx = Math.floor(key / 100000) - 1000;
    const cz = (key % 100000) - 1000;
    return [cx, cz];
  }
}
