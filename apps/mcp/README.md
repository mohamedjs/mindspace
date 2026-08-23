# @mindspace/mcp

An MCP server that lets an agent turn a talk, a PDF, a plan or any pile of text
into a properly structured MindSpace board: spaces, parent notes, sub-notes,
labelled group frames and typed relationships — laid out so the canvas is
actually readable.

The agent does the thinking (it *is* the LLM); this server does the writing.
`ingest_notes` takes the whole tree in one call and handles ids, parent
resolution, colours, canvas layout and group frames.

## Setup

```bash
npm install --workspace=@mindspace/mcp
npm run build --workspace=@mindspace/mcp
```

## Connect it

```bash
claude mcp add mindspace \
  --env MINDSPACE_SUPABASE_URL=https://<ref>.supabase.co \
  --env MINDSPACE_SUPABASE_ANON_KEY=<anon key> \
  --env MINDSPACE_ACCESS_TOKEN=<user access token> \
  --env MINDSPACE_REFRESH_TOKEN=<user refresh token> \
  -- node /abs/path/to/mindspace/apps/mcp/dist/apps/mcp/src/index.js
```

Or, in any `mcpServers` JSON config (Claude Desktop, Cursor, …):

```json
{
  "mcpServers": {
    "mindspace": {
      "command": "node",
      "args": ["/abs/path/to/mindspace/apps/mcp/dist/apps/mcp/src/index.js"],
      "env": {
        "MINDSPACE_SUPABASE_URL": "https://<ref>.supabase.co",
        "MINDSPACE_SUPABASE_ANON_KEY": "<anon key>",
        "MINDSPACE_ACCESS_TOKEN": "<user access token>",
        "MINDSPACE_REFRESH_TOKEN": "<user refresh token>"
      }
    }
  }
}
```

URL and anon key are the same values the apps use (`NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`). The two tokens come
from a signed-in session — in the web app's devtools console:

```js
JSON.parse(localStorage.getItem(
  Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
));
// -> { access_token, refresh_token, ... }
```

The access token expires in about an hour; the server hands both tokens to
supabase-js with `autoRefreshToken`, so a long agent session keeps working. If
the refresh token is revoked (sign-out everywhere, password change), re-copy
the pair.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_spaces` | The user's boards, most recently active first. |
| `create_space` | A new empty board. |
| `get_space` | Everything on one board: notes, group frames, relationships. |
| `ingest_notes` | **The main one.** Writes a whole structured note tree (notes + nesting + relations + groups) into a space in one call, with layout. |
| `create_note` | One sticky note, positioned automatically. |
| `update_note` | Edit / move / recolour / re-parent / set a due date on one note. |
| `delete_note` | Soft-delete a note (children get promoted to top level). |
| `link_notes` | Typed connector between two notes (`depends_on`, `supports`, …). |
| `unlink_notes` | Remove connectors between two notes. |

## Auth: user token, not service role

The server runs as the user, using their access + refresh token against the
**anon** key. It never sees the service-role key.

Why: every table is `user_id uuid not null default auth.uid()` with an RLS
policy of `auth.uid() = user_id`. Because inserts here omit `user_id` entirely,
the column default fills it from the JWT — there is no code path that can write
a row owned by anyone else, and reads are filtered by the same policy. Safety is
structural rather than defensive.

The tradeoff: tokens expire and must be refreshed or re-copied, and the server
can only ever act for the one user whose tokens are in the config. A
service-role key would remove both annoyances and remove the entire safety
property with them — one prompt-injected `user_id` and the server writes to
someone else's board. Not worth it. (The edge functions do use service role,
but only *after* `getUserOrThrow` has verified the caller's JWT — a check this
server doesn't have a request to run.)

One gap RLS does not cover: `space_id` isn't policed on insert, so a note could
be planted on another user's board while still being owned by the caller.
`requireSpace()` closes that with a SELECT before every write.

## Check

```bash
npm test --workspace=@mindspace/mcp
```

Asserts the document → note-tree structuring: out-of-order parents, grandchild
chains, cycle and duplicate-key rejection, relation mapping, non-overlapping
layout and group frames. No network, no test framework.

## Known limits

- **No transaction.** PostgREST has none and an RPC would need a migration.
  Notes insert atomically; if relationships or groups then fail, the notes are
  rolled back by soft-delete and the tool reports it.
- **No `create_group` tool.** Group frames are created by `ingest_notes`; a
  standalone one can be added if a use case turns up.
- `update_note` refuses to make a note its own parent, but does not walk the
  tree — re-parenting a note under one of its own descendants would orphan that
  subtree in the UI. `parent_id` has no cycle constraint; the app doesn't guard
  it either.
- Group frames are drawn from the bounding box of their notes, so a note grafted
  onto an *existing* note far away can stretch its group's frame.
- Layout reuses `supabase/functions/_shared/layout.ts` verbatim — its 4-column
  grid and radial child placement, so boards look the same as ones the voice
  pipeline produces.
