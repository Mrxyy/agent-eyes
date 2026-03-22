#!/usr/bin/env node
import { startAgentEyesMcpServer } from './index';

startAgentEyesMcpServer().catch((error) => {
  console.error('[agent-eyes-mcp] failed to start:', error);
  process.exit(1);
});

// Keep the stdio transport process alive for MCP clients that expect
// the server to hold stdin open for the duration of the session.
process.stdin.resume();
