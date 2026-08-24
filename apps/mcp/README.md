# @mindspace/mcp

An MCP server that lets an agent turn a talk, a PDF, a plan or any pile of text
into a properly structured MindSpace board: spaces, parent notes, sub-notes,
labelled group frames and typed relationships — laid out so the canvas is
actually readable.

The agent does the thinking (it *is* the LLM); this server does the writing.
`ingest_notes` takes the whole tree in one call.

## How it talks to MindSpace

Over HTTP, to the app's own API — **not** to Supabase.

```
agent ──MCP/stdio──> @mindspace/mcp ──HTTPS + Bearer──> apps/web /api/* ──> Postgres (RLS)
```

This server holds nothing but a base URL and the user's app token. It has no
database driver, no PostgREST queries and no service-role key. Everything that
decides *what a board should look like* — topological sort, parent resolution,
colour per note type, canvas layout, group frames — runs server-side in
`apps/web/src/lib/api/structure.ts`, reached through
`POST /api/spaces/{id}/ingest`.

That is what keeps the two clients honest: the app and the agent take the same
authorization path and produce identically laid-out boards. It is also why the
planned FastAPI migration is a backend swap — the routes are written to
`docs/fastapi-migration/05-api-contract.md`, so when the backend changes
language, this package does not change at all.

## Setup

```bash
npm install --workspace=@mindspace/mcp
npm run build --workspace=@mindspace/mcp
```

## Connect it

```bash
claude mcp add mindspace \
  --env MINDSPACE_API_URL=https://your-mindspace-web-app \
  --env MINDSPACE_TOKEN=<user access token> \
  --env MINDSPACE_REFRESH_TOKEN=<user refresh token> \
  -- node /abs/path/to/mindspace/apps/mcp/dist/index.js
```

Or, in any `mcpServers` JSON config (Claude Desktop, Cursor, …):

```json
{
  "mcpServers": {
    "mindspace": {
      "command": "node",
      "args": ["/abs/path/to/mindspace/apps/mcp/dist/index.js"],
      "env": {
        "MINDSPACE_API_URL": "https://your-mindspace-web-app",
        "MINDSPACE_TOKEN": "<user access token>",
        "MINDSPACE_REFRESH_TOKEN": "<user refresh token>"
      }
    }
  }
}
```

| Env var | Required | What it is |
| --- | --- | --- |
| `MINDSPACE_API_URL` | yes | Origin of the web app, no trailing `/api` — e.g. `http://localhost:3000` in development |
| `MINDSPACE_TOKEN` | yes | The user's access token |
| `MINDSPACE_REFRESH_TOKEN` | no | Lets a long session renew itself; without it, hour two fails |

### Where the token comes from — an open question

**There is no "copy API token" screen in the app today.** That is the honest
gap in this setup, and the right fix: a Settings affordance that mints and
shows a token, so nobody has to go digging in devtools. Until then, take the
tokens from a signed-in browser session.

Sessions live in cookies (`apps/web/src/infrastructure/supabase/client.ts` uses
`@supabase/ssr`, not `localStorage`), and `@supabase/ssr` may split a large
cookie across `…-auth-token.0`, `.1`, … — so in the app's devtools console:

```js
const raw = document.cookie
  .split('; ')
  .filter((c) => /^sb-.*-auth-token(\.\d+)?=/.test(c))
  .sort()
  .map((c) => c.slice(c.indexOf('=') + 1))
  .join('');
const json = decodeURIComponent(raw).replace(/^base64-/, '');
const session = JSON.parse(json.startsWith('{') ? json : atob(json));
console.log(session.access_token, session.refresh_token);
```

Cookie encoding is a `@supabase/ssr` implementation detail and has changed
between versions; if the snippet throws, read the `sb-*` cookies by hand. A
token affordance in the UI would retire this section entirely.

An access token lasts about an hour. With `MINDSPACE_REFRESH_TOKEN` set, a 401
triggers one `POST /api/auth/refresh` and a retry, so a long agent session
keeps working. If the refresh token is revoked (sign-out everywhere, password
change), re-copy the pair.

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

Inputs are validated with zod here *and* again in the route — this server is
one client of a public API, not a privileged path into it.

## Auth: the user's token, never the service role

Every request carries the user's own access token as `Authorization: Bearer`.
The route builds a Supabase client from that token
(`apps/web/src/infrastructure/supabase/bearer.ts`), so **RLS still runs in
Postgres**: `auth.uid()` is the caller.

Every table is `user_id uuid not null default auth.uid()` with a policy of
`auth.uid() = user_id`, and inserts omit `user_id` entirely — so the column
default fills it from the JWT. There is no code path that can write a row owned
by anyone else. Safety is structural rather than defensive.

The tradeoff: tokens expire and must be refreshed or re-copied, and the server
acts for exactly one user. A service-role key would remove both annoyances and
remove the safety property with them — one prompt-injected `user_id` and the
server writes to someone else's board. Not worth it.

One gap RLS does not cover: `space_id` is not policed on insert, so a note
could be planted on another user's board while still being owned by the caller.
`requireSpace()` in `apps/web/src/lib/api/auth.ts` closes that with a SELECT
before every write.

## Check

```bash
npm test --workspace=@mindspace/web
```

The structuring test moved into the web app with the logic it covers
(`apps/web/src/lib/api/structure.test.ts`): out-of-order parents, grandchild
chains, cycle and duplicate-key rejection, relation mapping, non-overlapping
layout and group frames. No network, no Supabase.

This package itself is thin enough to have no tests of its own — it validates,
posts, and unwraps an error envelope.

## Known limits

- **No transaction.** PostgREST has none and an RPC would need a migration.
  Notes insert atomically; if relationships or groups then fail, the notes are
  rolled back by soft-delete and the response says so. The FastAPI port should
  wrap the whole ingest in one transaction and retire this.
- **No token UI** — see above.
- **No `create_group` tool.** Group frames are created by `ingest_notes`; a
  standalone one can be added if a use case turns up.
- `update_note` refuses to make a note its own parent, but does not walk the
  tree — re-parenting a note under one of its own descendants would orphan that
  subtree in the UI. `parent_id` has no cycle constraint; the app doesn't guard
  it either.
- Group frames are drawn from the bounding box of their notes, so a note
  grafted onto an *existing* note far away can stretch its group's frame.
- Layout reuses the app's own `features/ai/services/layout` — the same 4-column
  grid and radial child placement the voice pipeline uses, so agent-built
  boards look like every other board.
- Only the routes the agent needs exist so far: spaces, notes, groups,
  relationships, ingest, token refresh. Billing, credits, BYOK, recordings and
  transcription still go through Supabase from the apps.
