#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.ts';
import { registerIngest } from './ingest.ts';

const server = new McpServer(
  { name: 'mindspace', version: '0.1.0' },
  {
    instructions:
      'MindSpace turns thinking into sticky notes on a canvas. Spaces are boards; notes nest under a parent note, sit inside labelled group frames, and link to each other with typed relationships. To capture a document, transcript, plan or conversation: pick or create a space, then call ingest_notes once with the whole structured tree — do not create notes one at a time.',
  }
);

registerTools(server);
registerIngest(server);

await server.connect(new StdioServerTransport());
