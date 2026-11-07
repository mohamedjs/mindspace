import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { composeApp, type AppComposition } from '../../composition.js';

describe('Core Canvas Module (Spaces, Notes, Groups, Relations, Timeline)', () => {
  let app: AppComposition;

  beforeAll(async () => {
    app = await composeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = () => `core-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  async function registerTestUser(name: string) {
    const email = testEmail();
    const res = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: name,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return {
      userId: body.user.id,
      email,
      token: body.access_token as string,
    };
  }

  describe('Spaces CRUD (Section 3)', () => {
    it('creates, lists, renames, and soft deletes spaces', async () => {
      const user = await registerTestUser('Space Owner');

      // 1. Initial list has default space
      const initialSpaces = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(initialSpaces.statusCode).toBe(200);
      const list1 = initialSpaces.json();
      expect(list1.length).toBe(1);
      expect(list1[0].name).toBe('My MindSpace');

      // 2. Create custom space
      const createRes = await app.server.inject({
        method: 'POST',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          name: 'Research Space',
          emoji: '🔬',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const createdSpace = createRes.json();
      expect(createdSpace.name).toBe('Research Space');
      expect(createdSpace.emoji).toBe('🔬');
      expect(createdSpace.note_count).toBe(0);

      // 3. Rename space
      const renameRes = await app.server.inject({
        method: 'PATCH',
        url: `/spaces/${createdSpace.id}`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          name: 'AI Research Lab',
        },
      });
      expect(renameRes.statusCode).toBe(204);

      // Verify rename
      const listAfterRename = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const list2 = listAfterRename.json();
      expect(list2.find((s: any) => s.id === createdSpace.id).name).toBe('AI Research Lab');

      // 4. Soft delete space
      const deleteRes = await app.server.inject({
        method: 'DELETE',
        url: `/spaces/${createdSpace.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(deleteRes.statusCode).toBe(204);

      // Verify soft delete hides space from list
      const listAfterDelete = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const list3 = listAfterDelete.json();
      expect(list3.find((s: any) => s.id === createdSpace.id)).toBeUndefined();
    });
  });

  describe('Notes CRUD and Triggers (Section 4 & 13)', () => {
    it('creates notes, bumps note count, and writes timeline events', async () => {
      const user = await registerTestUser('Note Master');

      // Get user's default space
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // 1. Create a note
      const createRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          content: 'First big idea on canvas',
          title: 'Big Idea',
          type: 'idea',
          x: 100,
          y: 200,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const note = createRes.json();
      expect(note.id).toBeDefined();
      expect(note.content).toBe('First big idea on canvas');
      expect(note.color).toBe('#FFF8BC'); // Default idea color
      expect(note.x).toBe(100);
      expect(note.y).toBe(200);

      // Verify space note count incremented
      const spacesAfterCreate = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(spacesAfterCreate.json()[0].note_count).toBe(1);

      // Verify timeline event emitted: note_created
      const timeline1 = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(timeline1.statusCode).toBe(200);
      const events1 = timeline1.json();
      expect(events1.length).toBe(1);
      expect(events1[0].type).toBe('note_created');
      expect(events1[0].ref_id).toBe(note.id);
      expect(events1[0].summary).toBe('Big Idea');

      // 2. PATCH content -> updates title/content, emits note_updated timeline event
      const patchContentRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${note.id}/content`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          content: 'Updated big idea with detailed insights',
          title: 'Revised Idea',
        },
      });
      expect(patchContentRes.statusCode).toBe(204);

      // Verify timeline has note_updated
      const timeline2 = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const events2 = timeline2.json();
      expect(events2.length).toBe(2);
      expect(events2[0].type).toBe('note_updated');
      expect(events2[0].summary).toBe('Revised Idea');

      // 3. PATCH color -> 204, does NOT emit timeline event
      const patchColorRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${note.id}/color`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { color: '#ABCDEF' },
      });
      expect(patchColorRes.statusCode).toBe(204);

      const timeline3 = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(timeline3.json().length).toBe(2); // Still 2, no event

      // 4. PATCH type -> 204, emits note_updated
      const patchTypeRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${note.id}/type`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { type: 'task' },
      });
      expect(patchTypeRes.statusCode).toBe(204);

      const timeline4 = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(timeline4.json().length).toBe(3);
      expect(timeline4.json()[0].type).toBe('note_updated');

      // 5. PATCH position -> 204, MUST NOT emit timeline event
      const patchPosRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${note.id}/position`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { x: 500, y: 600 },
      });
      expect(patchPosRes.statusCode).toBe(204);

      const timeline5 = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(timeline5.json().length).toBe(3); // Still 3, position changes do not write timeline events
    });
  });

  describe('Cycle Guard and Parent Updates', () => {
    it('prevents self-referencing and hierarchical cycles', async () => {
      const user = await registerTestUser('Cycle Guard Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create note A, B, C
      const createA = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Note A', x: 0, y: 0 },
      });
      const noteA = createA.json();

      const createB = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Note B', x: 10, y: 10, parent_id: noteA.id },
      });
      const noteB = createB.json();

      const createC = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Note C', x: 20, y: 20, parent_id: noteB.id },
      });
      const noteC = createC.json();

      // Attempt 1: Setting parent to self -> 422 invalid_structure
      const selfLinkRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${noteA.id}/parent`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { parent_id: noteA.id },
      });
      expect(selfLinkRes.statusCode).toBe(422);
      expect(selfLinkRes.json().error).toBe('invalid_structure');

      // Attempt 2: Setting A's parent to C (creating cycle A -> B -> C -> A) -> 422 invalid_structure
      const cycleRes = await app.server.inject({
        method: 'PATCH',
        url: `/notes/${noteA.id}/parent`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { parent_id: noteC.id },
      });
      expect(cycleRes.statusCode).toBe(422);
      expect(cycleRes.json().error).toBe('invalid_structure');
    });
  });

  describe('Child Promotion on Soft Delete', () => {
    it('promotes children to parent_id = null when their parent note is deleted', async () => {
      const user = await registerTestUser('Promotion Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create Parent Note P
      const createP = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Parent Note', title: 'Parent', x: 0, y: 0 },
      });
      const parentNote = createP.json();

      // Create Child C1 and Child C2
      const createC1 = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Child 1', x: 10, y: 10, parent_id: parentNote.id },
      });
      const child1 = createC1.json();

      const createC2 = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Child 2', x: 20, y: 20, parent_id: parentNote.id },
      });
      const child2 = createC2.json();

      expect(child1.parent_id).toBe(parentNote.id);
      expect(child2.parent_id).toBe(parentNote.id);

      // Verify space has 3 notes
      const spaceBefore = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(spaceBefore.json()[0].note_count).toBe(3);

      // Delete parent note P
      const deleteRes = await app.server.inject({
        method: 'DELETE',
        url: `/notes/${parentNote.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(deleteRes.statusCode).toBe(204);

      // Verify space note count is now 2
      const spaceAfter = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(spaceAfter.json()[0].note_count).toBe(2);

      // Verify parent note is no longer returned in GET /spaces/:id/notes
      const liveNotesRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const liveNotes = liveNotesRes.json();
      expect(liveNotes.find((n: any) => n.id === parentNote.id)).toBeUndefined();

      // Crucial: Children C1 and C2 must now have parent_id = null (promoted!)
      const c1Updated = liveNotes.find((n: any) => n.id === child1.id);
      const c2Updated = liveNotes.find((n: any) => n.id === child2.id);
      expect(c1Updated).toBeDefined();
      expect(c1Updated.parent_id).toBeNull();
      expect(c2Updated).toBeDefined();
      expect(c2Updated.parent_id).toBeNull();

      // Verify timeline recorded note_deleted for parent
      const timelineRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const deletedEvent = timelineRes.json().find((e: any) => e.type === 'note_deleted');
      expect(deletedEvent).toBeDefined();
      expect(deletedEvent.ref_id).toBe(parentNote.id);
    });
  });

  describe('Bulk Move and Toolbar Bulk Operations (TOOLBAR.md)', () => {
    it('executes POST /notes/move with a single statement and enforces 500 limit', async () => {
      const user = await registerTestUser('Bulk Move Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create two notes
      const n1 = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'N1', x: 0, y: 0 },
        })
      ).json();

      const n2 = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'N2', x: 10, y: 10 },
        })
      ).json();

      // 1. Move notes together
      const moveRes = await app.server.inject({
        method: 'POST',
        url: '/notes/move',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          moves: [
            { id: n1.id, x: 250, y: 350 },
            { id: n2.id, x: 450, y: 550 },
          ],
        },
      });
      expect(moveRes.statusCode).toBe(204);

      // Verify updated positions
      const note1 = (
        await app.server.inject({
          method: 'GET',
          url: `/notes/${n1.id}`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(note1.x).toBe(250);
      expect(note1.y).toBe(350);

      // Verify move did NOT add timeline events
      const timelineRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      // Exactly 2 events for the initial creates
      expect(timelineRes.json().length).toBe(2);

      // 2. Limit test: 501 moves must be rejected
      const tooManyMoves = Array.from({ length: 501 }, () => ({
        id: n1.id,
        x: 1,
        y: 1,
      }));
      const limitRes = await app.server.inject({
        method: 'POST',
        url: '/notes/move',
        headers: { authorization: `Bearer ${user.token}` },
        payload: { moves: tooManyMoves },
      });
      expect(limitRes.statusCode).toBe(422); // Yup max validation rejected
    });

    it('handles bulk-update, bulk-delete with promotion, bulk-restore, and bulk-create', async () => {
      const user = await registerTestUser('Bulk Ops Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // 1. Bulk Create (duplicate simulation)
      const bulkCreateRes = await app.server.inject({
        method: 'POST',
        url: '/notes/bulk-create',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          notes: [
            { space_id: spaceId, content: 'Bulk Note 1', x: 0, y: 0, type: 'idea' },
            { space_id: spaceId, content: 'Bulk Note 2', x: 100, y: 100, type: 'task' },
          ],
        },
      });
      expect(bulkCreateRes.statusCode).toBe(201);
      const created = bulkCreateRes.json();
      expect(created.notes.length).toBe(2);
      const id1 = created.notes[0].id;
      const id2 = created.notes[1].id;

      // Link id2 to id1 as parent
      await app.server.inject({
        method: 'PATCH',
        url: `/notes/${id2}/parent`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { parent_id: id1 },
      });

      // 2. Bulk Update (color and type)
      const bulkUpdateRes = await app.server.inject({
        method: 'POST',
        url: '/notes/bulk-update',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          ids: [id1, id2],
          color: '#112233',
          type: 'decision',
        },
      });
      expect(bulkUpdateRes.statusCode).toBe(204);

      const n1AfterUpdate = (
        await app.server.inject({
          method: 'GET',
          url: `/notes/${id1}`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(n1AfterUpdate.color).toBe('#112233');
      expect(n1AfterUpdate.type).toBe('decision');

      // 3. Bulk Delete
      const bulkDeleteRes = await app.server.inject({
        method: 'POST',
        url: '/notes/bulk-delete',
        headers: { authorization: `Bearer ${user.token}` },
        payload: { ids: [id1] },
      });
      expect(bulkDeleteRes.statusCode).toBe(204);

      // Child id2 must have been promoted to parent_id = null
      const n2AfterDelete = (
        await app.server.inject({
          method: 'GET',
          url: `/notes/${id2}`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(n2AfterDelete.parent_id).toBeNull();

      // 4. Bulk Restore (Undo)
      const bulkRestoreRes = await app.server.inject({
        method: 'POST',
        url: '/notes/bulk-restore',
        headers: { authorization: `Bearer ${user.token}` },
        payload: { ids: [id1] },
      });
      expect(bulkRestoreRes.statusCode).toBe(204);

      // Verify id1 is back
      const n1Restored = await app.server.inject({
        method: 'GET',
        url: `/notes/${id1}`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(n1Restored.statusCode).toBe(200);
    });
  });

  describe('Groups and Relationships', () => {
    it('manages groups, creates relationships, and rejects self-links', async () => {
      const user = await registerTestUser('Graph Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // 1. Group CRUD
      const createGroupRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/groups`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          title: 'Sprint 1',
          x: 50,
          y: 50,
          width: 500,
          height: 400,
          color: '#FFEEDD',
        },
      });
      expect(createGroupRes.statusCode).toBe(201);
      const group = createGroupRes.json();
      expect(group.title).toBe('Sprint 1');

      // Patch group
      const patchGroupRes = await app.server.inject({
        method: 'PATCH',
        url: `/groups/${group.id}`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { title: 'Sprint 1 - Final' },
      });
      expect(patchGroupRes.statusCode).toBe(204);

      // List groups
      const listGroupsRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/groups`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(listGroupsRes.json().length).toBe(1);
      expect(listGroupsRes.json()[0].title).toBe('Sprint 1 - Final');

      // Delete group
      const delGroupRes = await app.server.inject({
        method: 'DELETE',
        url: `/groups/${group.id}`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(delGroupRes.statusCode).toBe(204);

      // 2. Relationships
      const n1 = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'Rel Note 1', x: 0, y: 0 },
        })
      ).json();

      const n2 = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'Rel Note 2', x: 200, y: 200 },
        })
      ).json();

      // Self link must fail -> 422 invalid_structure
      const selfRel = await app.server.inject({
        method: 'POST',
        url: '/relationships',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          space_id: spaceId,
          from_note_id: n1.id,
          to_note_id: n1.id,
        },
      });
      expect(selfRel.statusCode).toBe(422);

      // Valid relationship
      const createRelRes = await app.server.inject({
        method: 'POST',
        url: '/relationships',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          space_id: spaceId,
          from_note_id: n1.id,
          to_note_id: n2.id,
          type: 'supports',
        },
      });
      expect(createRelRes.statusCode).toBe(201);
      const rel = createRelRes.json();
      expect(rel.from_note_id).toBe(n1.id);
      expect(rel.to_note_id).toBe(n2.id);
      expect(rel.type).toBe('supports');

      // List relationships
      const listRels = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/relationships`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(listRels.json().length).toBe(1);

      // Delete relationship
      const deleteRelRes = await app.server.inject({
        method: 'DELETE',
        url: '/relationships',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          space_id: spaceId,
          from_note_id: n1.id,
          to_note_id: n2.id,
        },
      });
      expect(deleteRelRes.statusCode).toBe(204);

      // List relationships is now empty
      const listRelsEmpty = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/relationships`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(listRelsEmpty.json().length).toBe(0);
    });
  });

  describe('Mind Map and Agent Ingest', () => {
    it('returns nodes and edges in GET /spaces/:id/mind-map', async () => {
      const user = await registerTestUser('Mind Map Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create note A and child note B
      const nA = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'Root Node', x: 0, y: 0 },
        })
      ).json();

      const nB = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: 'Child Node', x: 100, y: 100, parent_id: nA.id },
        })
      ).json();

      const mindMapRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/mind-map`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(mindMapRes.statusCode).toBe(200);
      const mindMap = mindMapRes.json();
      expect(mindMap.nodes.length).toBe(2);
      expect(mindMap.edges.length).toBe(1);
      expect(mindMap.edges[0].from).toBe(nA.id);
      expect(mindMap.edges[0].to).toBe(nB.id);
      expect(mindMap.edges[0].type).toBe('parent');
    });

    it('ingests structured trees via POST /spaces/:id/ingest', async () => {
      const user = await registerTestUser('Agent Ingest Tester');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      const ingestPayload = {
        notes: [
          { client_key: 'n1', content: 'Architecture overview', type: 'idea' },
          { client_key: 'n2', content: 'Database choice', type: 'decision', parent_key: 'n1' },
          { client_key: 'n3', content: 'Task breakdown', type: 'task' },
        ],
        relations: [{ from: 'n1', to: 'n3', type: 'related' }],
        groups: [{ title: 'Backend Design', member_keys: ['n1', 'n2'] }],
      };

      const res = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/ingest`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: ingestPayload,
      });

      expect(res.statusCode).toBe(200);
      const result = res.json();
      expect(result.notes.length).toBe(3);
      expect(result.relations).toBe(1);
      expect(result.groups.length).toBe(1);
      expect(result.groups[0].title).toBe('Backend Design');

      // Verify notes appear in GET /spaces/:id/notes
      const liveNotes = (
        await app.server.inject({
          method: 'GET',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(liveNotes.length).toBe(3);

      // Verify space note count bumped
      const spacesAfter = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spacesAfter[0].note_count).toBe(3);

      // Ingest error tests: duplicate client_key
      const dupRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/ingest`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          notes: [
            { client_key: 'same', content: 'Note 1' },
            { client_key: 'same', content: 'Note 2' },
          ],
        },
      });
      expect(dupRes.statusCode).toBe(422);
      expect(dupRes.json().error).toBe('invalid_structure');
    });
  });

  describe('Authorization Matrix (Foreign User Isolation)', () => {
    it('ensures foreign user cannot observe or mutate any resource (returns 404)', async () => {
      // Alice owns resources
      const alice = await registerTestUser('Alice (Owner)');
      const aliceSpaces = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${alice.token}` },
        })
      ).json();
      const aliceSpaceId = aliceSpaces[0].id;

      // Alice creates a note
      const aliceNote = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${aliceSpaceId}/notes`,
          headers: { authorization: `Bearer ${alice.token}` },
          payload: { content: "Alice's Secret Note", x: 10, y: 10 },
        })
      ).json();

      // Alice creates a group
      const aliceGroup = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${aliceSpaceId}/groups`,
          headers: { authorization: `Bearer ${alice.token}` },
          payload: { title: "Alice's Group", x: 0, y: 0 },
        })
      ).json();

      // Alice creates a second note & relationship
      const aliceNote2 = (
        await app.server.inject({
          method: 'POST',
          url: `/spaces/${aliceSpaceId}/notes`,
          headers: { authorization: `Bearer ${alice.token}` },
          payload: { content: "Alice's Second Note", x: 20, y: 20 },
        })
      ).json();

      const aliceRel = (
        await app.server.inject({
          method: 'POST',
          url: '/relationships',
          headers: { authorization: `Bearer ${alice.token}` },
          payload: {
            space_id: aliceSpaceId,
            from_note_id: aliceNote.id,
            to_note_id: aliceNote2.id,
          },
        })
      ).json();

      // Bob: Foreign user
      const bob = await registerTestUser('Bob (Foreign Attacker)');

      // Bob's space list does not include Alice's space
      const bobSpaces = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${bob.token}` },
        })
      ).json();
      expect(bobSpaces.find((s: any) => s.id === aliceSpaceId)).toBeUndefined();

      // Matrix: Bob attempts every endpoint against Alice's resources
      const matrix = [
        // Spaces
        { method: 'PATCH', url: `/spaces/${aliceSpaceId}`, payload: { name: 'Hacked' } },
        { method: 'DELETE', url: `/spaces/${aliceSpaceId}` },
        { method: 'GET', url: `/spaces/${aliceSpaceId}/notes` },
        { method: 'POST', url: `/spaces/${aliceSpaceId}/notes`, payload: { content: 'Intrusion', x: 0, y: 0 } },
        { method: 'GET', url: `/spaces/${aliceSpaceId}/mind-map` },
        { method: 'GET', url: `/spaces/${aliceSpaceId}/timeline` },
        {
          method: 'POST',
          url: `/spaces/${aliceSpaceId}/ingest`,
          payload: { notes: [{ client_key: 'x', content: 'Intrusion' }] },
        },
        // Notes
        { method: 'GET', url: `/notes/${aliceNote.id}` },
        { method: 'PATCH', url: `/notes/${aliceNote.id}/content`, payload: { content: 'Overwritten' } },
        { method: 'PATCH', url: `/notes/${aliceNote.id}/color`, payload: { color: '#000000' } },
        { method: 'PATCH', url: `/notes/${aliceNote.id}/type`, payload: { type: 'task' } },
        { method: 'PATCH', url: `/notes/${aliceNote.id}/position`, payload: { x: 999, y: 999 } },
        { method: 'PATCH', url: `/notes/${aliceNote.id}/parent`, payload: { parent_id: null } },
        { method: 'DELETE', url: `/notes/${aliceNote.id}` },
        // Bulk note routes targeting Alice's note
        { method: 'POST', url: '/notes/move', payload: { moves: [{ id: aliceNote.id, x: 1, y: 1 }] } },
        { method: 'POST', url: '/notes/bulk-update', payload: { ids: [aliceNote.id], color: '#123456' } },
        { method: 'POST', url: '/notes/bulk-delete', payload: { ids: [aliceNote.id] } },
        { method: 'POST', url: '/notes/bulk-restore', payload: { ids: [aliceNote.id] } },
        {
          method: 'POST',
          url: '/notes/bulk-create',
          payload: { notes: [{ space_id: aliceSpaceId, content: 'Sneak', x: 0, y: 0 }] },
        },
        // Groups
        { method: 'GET', url: `/spaces/${aliceSpaceId}/groups` },
        { method: 'POST', url: `/spaces/${aliceSpaceId}/groups`, payload: { title: 'Hack', x: 0, y: 0 } },
        { method: 'PATCH', url: `/groups/${aliceGroup.id}`, payload: { title: 'Hacked Group' } },
        { method: 'DELETE', url: `/groups/${aliceGroup.id}` },
        // Relationships
        { method: 'GET', url: `/spaces/${aliceSpaceId}/relationships` },
        {
          method: 'POST',
          url: '/relationships',
          payload: {
            space_id: aliceSpaceId,
            from_note_id: aliceNote.id,
            to_note_id: aliceNote2.id,
          },
        },
        {
          method: 'DELETE',
          url: '/relationships',
          payload: {
            space_id: aliceSpaceId,
            from_note_id: aliceNote.id,
            to_note_id: aliceNote2.id,
          },
        },
      ];

      for (const req of matrix) {
        const res = await app.server.inject({
          method: req.method as any,
          url: req.url,
          headers: { authorization: `Bearer ${bob.token}` },
          payload: req.payload,
        });

        expect(res.statusCode, `Failed on ${req.method} ${req.url}: expected 404, got ${res.statusCode}`).toBe(404);
      }
    });
  });

  describe('Concurrency and Race Condition Guards', () => {
    it('5 parallel deletes of one note leave note_count correct and one timeline event', async () => {
      const user = await registerTestUser('Parallel Single Delete User');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create a note
      const noteRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/notes`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: { content: 'Concurrent Target Note', x: 0, y: 0 },
      });
      expect(noteRes.statusCode).toBe(201);
      const note = noteRes.json();

      // Verify space note count is 1
      const spaceBefore = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spaceBefore[0].note_count).toBe(1);

      // Execute 5 parallel deletes of the same note
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          app.server.inject({
            method: 'DELETE',
            url: `/notes/${note.id}`,
            headers: { authorization: `Bearer ${user.token}` },
          })
        )
      );

      for (const res of responses) {
        expect(res.statusCode).toBe(204);
      }

      // Verify space note count is accurately 0 (not decremented multiple times)
      const spaceAfter = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spaceAfter[0].note_count).toBe(0);

      // Verify timeline has exactly 1 note_created and 1 note_deleted event
      const timelineRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const events = timelineRes.json();
      const deleteEvents = events.filter((e: any) => e.type === 'note_deleted');
      expect(deleteEvents.length).toBe(1);
      expect(deleteEvents[0].ref_id).toBe(note.id);
      expect(events.length).toBe(2);
    });

    it('5 parallel bulk deletes of overlapping ids stay correct', async () => {
      const user = await registerTestUser('Parallel Bulk Delete User');
      const spacesRes = await app.server.inject({
        method: 'GET',
        url: '/spaces',
        headers: { authorization: `Bearer ${user.token}` },
      });
      const spaceId = spacesRes.json()[0].id;

      // Create 5 notes
      const notes: any[] = [];
      for (let i = 0; i < 5; i++) {
        const createRes = await app.server.inject({
          method: 'POST',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
          payload: { content: `Bulk note ${i}`, x: i * 20, y: i * 20 },
        });
        expect(createRes.statusCode).toBe(201);
        notes.push(createRes.json());
      }

      // Verify space note count is 5
      const spaceBefore = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spaceBefore[0].note_count).toBe(5);

      // 5 overlapping batches:
      // B0: [0, 1, 2]
      // B1: [1, 2, 3]
      // B2: [2, 3, 4]
      // B3: [0, 3, 4]
      // B4: [0, 1, 4]
      const ids = notes.map((n) => n.id);
      const batches = [
        [ids[0], ids[1], ids[2]],
        [ids[1], ids[2], ids[3]],
        [ids[2], ids[3], ids[4]],
        [ids[0], ids[3], ids[4]],
        [ids[0], ids[1], ids[4]],
      ];

      // Execute 5 parallel bulk deletes with overlapping IDs
      const responses = await Promise.all(
        batches.map((batchIds) =>
          app.server.inject({
            method: 'POST',
            url: '/notes/bulk-delete',
            headers: { authorization: `Bearer ${user.token}` },
            payload: { ids: batchIds },
          })
        )
      );

      for (const res of responses) {
        expect(res.statusCode).toBe(204);
      }

      // Verify space note count is 0
      const spaceAfter = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spaceAfter[0].note_count).toBe(0);

      // Verify all notes are deleted
      const liveNotes = (
        await app.server.inject({
          method: 'GET',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(liveNotes.length).toBe(0);

      // Verify timeline: exactly 5 note_deleted events (one per unique note)
      const timelineRes = await app.server.inject({
        method: 'GET',
        url: `/spaces/${spaceId}/timeline`,
        headers: { authorization: `Bearer ${user.token}` },
      });
      const events = timelineRes.json();
      const deleteEvents = events.filter((e: any) => e.type === 'note_deleted');
      expect(deleteEvents.length).toBe(5);

      const deletedRefIds = new Set(deleteEvents.map((e: any) => e.ref_id));
      for (const id of ids) {
        expect(deletedRefIds.has(id)).toBe(true);
      }

      // 5 parallel bulk restores of overlapping ids also stay correct
      const restoreResponses = await Promise.all(
        batches.map((batchIds) =>
          app.server.inject({
            method: 'POST',
            url: '/notes/bulk-restore',
            headers: { authorization: `Bearer ${user.token}` },
            payload: { ids: batchIds },
          })
        )
      );

      for (const res of restoreResponses) {
        expect(res.statusCode).toBe(204);
      }

      // Verify note count is restored to 5
      const spaceAfterRestore = (
        await app.server.inject({
          method: 'GET',
          url: '/spaces',
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(spaceAfterRestore[0].note_count).toBe(5);

      // Verify live notes count is 5
      const restoredNotes = (
        await app.server.inject({
          method: 'GET',
          url: `/spaces/${spaceId}/notes`,
          headers: { authorization: `Bearer ${user.token}` },
        })
      ).json();
      expect(restoredNotes.length).toBe(5);
    });
  });
});
