// mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from './db.js';
import { initStorage } from './storage.js';
import { createHttpApp } from './http.js';
import { handleListSessions } from './tools/list-sessions.js';
import { handleLoadSession } from './tools/load-session.js';
import { handleGetAnnotations } from './tools/get-annotations.js';
import { handleGetAnnotation } from './tools/get-annotation.js';
import { handleGetScreenshot } from './tools/get-screenshot.js';
import { handleGetConsoleLogs } from './tools/get-console-logs.js';
import { handleGetSessionStorage } from './tools/get-session-storage.js';
import { handleGetRecording } from './tools/get-recording.js';
import { handleDeleteAnnotation } from './tools/delete-annotation.js';

const STORAGE_ROOT = process.env.SEND2LLM_DIR ?? join(homedir(), '.send2llm');
const HTTP_PORT = parseInt(process.env.SEND2LLM_PORT ?? '3579', 10);

initStorage(STORAGE_ROOT);
const db = initDb(join(STORAGE_ROOT, 'sessions.db'));

const app = createHttpApp(db, STORAGE_ROOT);
app.listen(HTTP_PORT, () => {
  process.stderr.write(`Send2LLM HTTP server listening on port ${HTTP_PORT}\n`);
});

const mcpServer = new Server(
  { name: 'send2llm', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'list_sessions', description: 'List all captured sessions', inputSchema: { type: 'object' as const, properties: {} } },
    { name: 'load_session', description: 'Load a session by number or ID', inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'get_annotations', description: 'Get all annotations for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_annotation', description: 'Get a single annotation by number', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' }, number: { type: 'number' } }, required: ['session_id', 'number'] } },
    { name: 'get_screenshot', description: 'Get full-page screenshot path', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_console_logs', description: 'Get console logs for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_session_storage', description: 'Get sessionStorage for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_recording', description: 'Get recording file path', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'delete_annotation', description: 'Delete annotation by number (e.g. delete 2)', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' }, number: { type: 'number' } }, required: ['session_id', 'number'] } },
  ],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  let text: string;
  switch (name) {
    case 'list_sessions': text = handleListSessions(db); break;
    case 'load_session': text = handleLoadSession(db, args!.id as string); break;
    case 'get_annotations': text = handleGetAnnotations(db, args!.session_id as string); break;
    case 'get_annotation': text = handleGetAnnotation(db, args!.session_id as string, args!.number as number); break;
    case 'get_screenshot': text = handleGetScreenshot(db, args!.session_id as string); break;
    case 'get_console_logs': text = handleGetConsoleLogs(db, args!.session_id as string); break;
    case 'get_session_storage': text = handleGetSessionStorage(db, args!.session_id as string); break;
    case 'get_recording': text = handleGetRecording(db, args!.session_id as string); break;
    case 'delete_annotation': text = handleDeleteAnnotation(db, args!.session_id as string, args!.number as number); break;
    default: text = `Unknown tool: ${name}`;
  }
  return { content: [{ type: 'text' as const, text }] };
});

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
