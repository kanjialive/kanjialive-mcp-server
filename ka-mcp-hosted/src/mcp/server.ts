/**
 * MCP Server initialization and configuration.
 *
 * Sets up the MCP server with tools and resources for Kanji Alive API access.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeBasicSearch } from './tools/basicSearch.js';
import { executeAdvancedSearch } from './tools/advancedSearch.js';
import { executeKanjiDetails } from './tools/kanjiDetails.js';
import {
  basicSearchParamsShape,
  BASIC_SEARCH_TOOL_NAME,
  BASIC_SEARCH_TOOL_DESCRIPTION,
} from '../validators/basicSearch.js';
import {
  advancedSearchParamsShape,
  ADVANCED_SEARCH_TOOL_NAME,
  ADVANCED_SEARCH_TOOL_DESCRIPTION,
} from '../validators/advancedSearch.js';
import {
  kanjiDetailParamsShape,
  KANJI_DETAIL_TOOL_NAME,
  KANJI_DETAIL_TOOL_DESCRIPTION,
} from '../validators/kanjiDetail.js';
import {
  readRadicalsResource,
  radicalsResourceDefinition,
  RADICALS_RESOURCE_URI,
} from './resources/radicals.js';
import { logger } from '../utils/logger.js';

/**
 * Create and configure the MCP server.
 *
 * @param version - Server version string from package.json
 * @returns Configured McpServer instance
 */
export function createMCPServer(version: string): McpServer {
  const server = new McpServer({
    name: 'Kanji Alive',
    version,
  });

  registerTools(server);
  registerResources(server);

  // Debug, not info: one server is built per session, so this fires per connection.
  logger.debug('MCP server configured', {
    tools: [BASIC_SEARCH_TOOL_NAME, ADVANCED_SEARCH_TOOL_NAME, KANJI_DETAIL_TOOL_NAME],
    resources: [RADICALS_RESOURCE_URI],
  });

  return server;
}

/**
 * Tool annotations indicating behavior hints for clients.
 * All Kanji Alive tools are read-only, non-destructive, and idempotent.
 */
const TOOL_ANNOTATIONS = {
  readOnlyHint: true,      // Tools only read data, never modify state
  destructiveHint: false,  // Tools never delete or destroy data
  idempotentHint: true,    // Same input always produces same output
} as const;

/**
 * Register all MCP tools.
 *
 * @param server - MCP server instance
 */
function registerTools(server: McpServer): void {
  server.registerTool(
    BASIC_SEARCH_TOOL_NAME,
    {
      description: BASIC_SEARCH_TOOL_DESCRIPTION,
      inputSchema: basicSearchParamsShape,
      annotations: TOOL_ANNOTATIONS,
    },
    (args) => executeBasicSearch(args)
  );

  server.registerTool(
    ADVANCED_SEARCH_TOOL_NAME,
    {
      description: ADVANCED_SEARCH_TOOL_DESCRIPTION,
      inputSchema: advancedSearchParamsShape,
      annotations: TOOL_ANNOTATIONS,
    },
    (args) => executeAdvancedSearch(args)
  );

  server.registerTool(
    KANJI_DETAIL_TOOL_NAME,
    {
      description: KANJI_DETAIL_TOOL_DESCRIPTION,
      inputSchema: kanjiDetailParamsShape,
      annotations: TOOL_ANNOTATIONS,
    },
    (args) => executeKanjiDetails(args)
  );

  logger.debug('Registered 3 MCP tools with annotations');
}

/**
 * Register all MCP resources.
 *
 * @param server - MCP server instance
 */
function registerResources(server: McpServer): void {
  server.registerResource(
    radicalsResourceDefinition.name,
    radicalsResourceDefinition.uri,
    {
      description: radicalsResourceDefinition.description,
      mimeType: radicalsResourceDefinition.mimeType,
    },
    () => readRadicalsResource()
  );

  logger.debug('Registered 1 MCP resource');
}
