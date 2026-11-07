import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type {
  NoteRepositoryPort,
  CreateNoteData,
  BulkCreateNoteData,
} from '../domain/ports.js';
import type { NoteOut, NoteType, MindMapResult, MindMapEdge } from '../domain/entities.js';
import { colorForNote, type ExistingNote, type NoteRow } from '../domain/structure.js';

export class KyselyNoteRepository implements NoteRepositoryPort {
  constructor(private db: Database) {}

  private mapRow(row: any): NoteOut {
    return {
      id: row.id,
      title: row.title ?? null,
      content: row.content,
      type: row.type as NoteType,
      color: row.color ?? null,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      parent_id: row.parent_id ?? null,
      space_id: row.space_id,
      due_at: row.due_at ? (typeof row.due_at === 'string' ? row.due_at : new Date(row.due_at).toISOString()) : null,
      created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    };
  }

  async listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<NoteOut[]> {
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async findById(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async findAnyById(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async findAnyByIds(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]> {
    if (ids.length === 0) return [];
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async findLiveByIds(
    userId: string,
    ids: string[],
    trx?: unknown
  ): Promise<NoteOut[]> {
    if (ids.length === 0) return [];
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async findDeletedByIds(
    userId: string,
    ids: string[],
    trx?: unknown
  ): Promise<NoteOut[]> {
    if (ids.length === 0) return [];
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is not', null)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async create(userId: string, data: CreateNoteData, trx?: unknown): Promise<NoteOut> {
    const client = (trx as Database) || this.db;
    const noteType: NoteType = data.type || 'idea';
    const noteColor = colorForNote(noteType, data.color);

    const inserted = await client
      .insertInto('sticky_notes')
      .values({
        user_id: userId,
        space_id: data.spaceId,
        content: data.content,
        title: data.title ?? null,
        type: noteType,
        color: noteColor,
        x: data.x,
        y: data.y,
        width: data.width ?? 180,
        height: data.height ?? 120,
        parent_id: data.parentId ?? null,
        due_at: data.dueAt ? (new Date(data.dueAt) as any) : null,
        source_type: 'manual',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(inserted);
  }

  async updateContent(
    userId: string,
    noteId: string,
    title: string | null,
    content: string,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        title,
        content,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async updateColor(
    userId: string,
    noteId: string,
    color: string | null,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        color,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async updateType(
    userId: string,
    noteId: string,
    type: NoteType,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        type,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async updatePosition(
    userId: string,
    noteId: string,
    x: number,
    y: number,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        x,
        y,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async updateParent(
    userId: string,
    noteId: string,
    parentId: string | null,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        parent_id: parentId,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async softDelete(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .updateTable('sticky_notes')
      .set({
        deleted_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async promoteChildren(userId: string, parentNoteId: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        parent_id: null,
        updated_at: sql`now()`,
      })
      .where('parent_id', '=', parentNoteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async bulkPromoteChildren(
    userId: string,
    parentNoteIds: string[],
    trx?: unknown
  ): Promise<void> {
    if (parentNoteIds.length === 0) return;
    const client = (trx as Database) || this.db;
    await client
      .updateTable('sticky_notes')
      .set({
        parent_id: null,
        updated_at: sql`now()`,
      })
      .where('parent_id', 'in', parentNoteIds)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async bulkMove(
    userId: string,
    moves: Array<{ id: string; x: number; y: number }>,
    trx?: unknown
  ): Promise<void> {
    if (moves.length === 0) return;
    const client = (trx as Database) || this.db;

    // Single statement bulk update using FROM jsonb_array_elements
    await sql`
      UPDATE sticky_notes AS n
      SET x = v.x, y = v.y, updated_at = now()
      FROM (
        SELECT (elem->>'id')::uuid AS id,
               (elem->>'x')::real AS x,
               (elem->>'y')::real AS y
        FROM jsonb_array_elements(${JSON.stringify(moves)}::jsonb) AS elem
      ) AS v
      WHERE n.id = v.id AND n.user_id = ${userId}::uuid AND n.deleted_at IS NULL
    `.execute(client);
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    updates: { color?: string | null; type?: NoteType },
    trx?: unknown
  ): Promise<void> {
    if (ids.length === 0) return;
    const client = (trx as Database) || this.db;

    const setPayload: any = {
      updated_at: sql`now()`,
    };
    if (updates.color !== undefined) {
      setPayload.color = updates.color;
    }
    if (updates.type !== undefined) {
      setPayload.type = updates.type;
    }

    await client
      .updateTable('sticky_notes')
      .set(setPayload)
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async bulkSoftDelete(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]> {
    if (ids.length === 0) return [];
    const client = (trx as Database) || this.db;
    const rows = await client
      .updateTable('sticky_notes')
      .set({
        deleted_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async bulkRestore(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]> {
    if (ids.length === 0) return [];
    const client = (trx as Database) || this.db;
    const rows = await client
      .updateTable('sticky_notes')
      .set({
        deleted_at: null,
        updated_at: sql`now()`,
      })
      .where('id', 'in', ids)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is not', null)
      .returningAll()
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async bulkCreate(
    userId: string,
    notes: BulkCreateNoteData[],
    trx?: unknown
  ): Promise<NoteOut[]> {
    if (notes.length === 0) return [];
    const client = (trx as Database) || this.db;

    const values = notes.map((n) => {
      const type: NoteType = n.type || 'idea';
      return {
        ...(n.id ? { id: n.id } : {}),
        user_id: userId,
        space_id: n.spaceId,
        content: n.content,
        title: n.title ?? null,
        type,
        color: colorForNote(type, n.color),
        x: n.x,
        y: n.y,
        width: n.width ?? 180,
        height: n.height ?? 120,
        parent_id: n.parentId ?? null,
        due_at: n.dueAt ? (new Date(n.dueAt) as any) : null,
        source_type: 'manual',
      };
    });

    const inserted = await client
      .insertInto('sticky_notes')
      .values(values)
      .returningAll()
      .execute();

    return inserted.map((r: any) => this.mapRow(r));
  }

  async bulkInsertStructuredNotes(
    userId: string,
    notes: NoteRow[],
    trx?: unknown
  ): Promise<void> {
    if (notes.length === 0) return;
    const client = (trx as Database) || this.db;

    const values = notes.map((n) => ({
      id: n.id,
      user_id: userId,
      space_id: n.space_id,
      title: n.title,
      content: n.content,
      type: n.type,
      color: n.color,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      parent_id: n.parent_id,
      due_at: n.due_at ? (new Date(n.due_at) as any) : null,
      source_type: 'ai',
    }));

    await client.insertInto('sticky_notes').values(values).execute();
  }

  async hasCycle(
    proposedParentId: string,
    noteId: string,
    trx?: unknown
  ): Promise<boolean> {
    const client = (trx as Database) || this.db;
    const res = await sql<{ id: string }>`
      WITH RECURSIVE hierarchy AS (
        SELECT id, parent_id FROM sticky_notes
        WHERE id = ${proposedParentId}::uuid AND deleted_at IS NULL
        UNION ALL
        SELECT s.id, s.parent_id FROM sticky_notes s
        INNER JOIN hierarchy h ON s.id = h.parent_id
        WHERE s.deleted_at IS NULL
      )
      SELECT id FROM hierarchy WHERE id = ${noteId}::uuid LIMIT 1
    `.execute(client);

    return res.rows.length > 0;
  }

  async getExistingForLayout(
    userId: string,
    spaceId: string,
    trx?: unknown
  ): Promise<ExistingNote[]> {
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('sticky_notes')
      .select(['id', 'parent_id', 'x', 'y', 'width', 'height'])
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();

    return rows.map((r: any) => ({
      id: r.id,
      parent_id: r.parent_id ?? null,
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width),
      height: Number(r.height),
    }));
  }

  async getMindMap(
    userId: string,
    spaceId: string,
    trx?: unknown
  ): Promise<MindMapResult> {
    const client = (trx as Database) || this.db;

    // 1. Fetch live notes
    const noteRows = await client
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();

    const nodes = noteRows.map((r: any) => this.mapRow(r));
    const noteIdSet = new Set(nodes.map((n) => n.id));

    // 2. Fetch live relationships
    const relRows = await client
      .selectFrom('relationships')
      .selectAll()
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();

    const edges: MindMapEdge[] = [];

    // Hierarchical edges from parent_id
    for (const note of nodes) {
      if (note.parent_id && noteIdSet.has(note.parent_id)) {
        edges.push({
          id: `parent:${note.id}`,
          from: note.parent_id,
          to: note.id,
          from_note_id: note.parent_id,
          to_note_id: note.id,
          type: 'parent',
        });
      }
    }

    // Explicit relationships
    for (const rel of relRows) {
      if (noteIdSet.has(rel.from_note_id) && noteIdSet.has(rel.to_note_id)) {
        edges.push({
          id: rel.id,
          from: rel.from_note_id,
          to: rel.to_note_id,
          from_note_id: rel.from_note_id,
          to_note_id: rel.to_note_id,
          type: rel.type,
        });
      }
    }

    return { nodes, edges };
  }
}
