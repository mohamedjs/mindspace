import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { GroupRepositoryPort, CreateGroupData } from '../domain/ports.js';
import type { GroupOut } from '../domain/entities.js';
import type { GroupRow } from '../domain/structure.js';

export class KyselyGroupRepository implements GroupRepositoryPort {
  constructor(private db: Database) {}

  private mapRow(row: any): GroupOut {
    return {
      id: row.id,
      title: row.title ?? null,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      color: row.color ?? null,
    };
  }

  async listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<GroupOut[]> {
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('note_groups')
      .selectAll()
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async findById(userId: string, groupId: string, trx?: unknown): Promise<GroupOut | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('note_groups')
      .selectAll()
      .where('id', '=', groupId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async create(userId: string, data: CreateGroupData, trx?: unknown): Promise<GroupOut> {
    const client = (trx as Database) || this.db;
    const inserted = await client
      .insertInto('note_groups')
      .values({
        user_id: userId,
        space_id: data.spaceId,
        title: data.title ?? null,
        x: data.x,
        y: data.y,
        width: data.width ?? 460,
        height: data.height ?? 360,
        color: data.color ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(inserted);
  }

  async bulkInsertStructuredGroups(
    userId: string,
    groups: GroupRow[],
    trx?: unknown
  ): Promise<GroupOut[]> {
    if (groups.length === 0) return [];
    const client = (trx as Database) || this.db;

    const values = groups.map((g) => ({
      user_id: userId,
      space_id: g.space_id,
      title: g.title,
      color: g.color ?? null,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
    }));

    const inserted = await client
      .insertInto('note_groups')
      .values(values)
      .returningAll()
      .execute();

    return inserted.map((r: any) => this.mapRow(r));
  }

  async update(
    userId: string,
    groupId: string,
    data: Partial<CreateGroupData>,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    const setPayload: any = {};
    if (data.title !== undefined) setPayload.title = data.title;
    if (data.x !== undefined) setPayload.x = data.x;
    if (data.y !== undefined) setPayload.y = data.y;
    if (data.width !== undefined) setPayload.width = data.width;
    if (data.height !== undefined) setPayload.height = data.height;
    if (data.color !== undefined) setPayload.color = data.color;

    await client
      .updateTable('note_groups')
      .set(setPayload)
      .where('id', '=', groupId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async softDelete(userId: string, groupId: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('note_groups')
      .set({
        deleted_at: sql`now()`,
      })
      .where('id', '=', groupId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }
}
