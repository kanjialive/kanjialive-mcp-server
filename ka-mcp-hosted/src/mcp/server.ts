/**
 * MCP Server initialization and configuration.
 *
 * Sets up the MCP server with tools and resources for Kanji Alive API access.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

// Load version from package.json to avoid duplication
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
const VERSION: string = packageJson.version;

/**
 * Create and configure the MCP server.
 *
 * @returns Configured McpServer instance
 */
export function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'Kanji Alive',
    version: VERSION,
  });

  // Register tools
  registerTools(server);

  // Register resources
  registerResources(server);

  logger.info('MCP server configured', {
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
  // Basic search tool
  server.tool(
    BASIC_SEARCH_TOOL_NAME,
    BASIC_SEARCH_TOOL_DESCRIPTION,
    basicSearchParamsShape,
    TOOL_ANNOTATIONS,
    async (args) => {
      const result = await executeBasicSearch(args);
      return result;
    }
  );

  // Advanced search tool
  server.tool(
    ADVANCED_SEARCH_TOOL_NAME,
    ADVANCED_SEARCH_TOOL_DESCRIPTION,
    advancedSearchParamsShape,
    TOOL_ANNOTATIONS,
    async (args) => {
      const result = await executeAdvancedSearch(args);
      return result;
    }
  );

  // Kanji details tool
  server.tool(
    KANJI_DETAIL_TOOL_NAME,
    KANJI_DETAIL_TOOL_DESCRIPTION,
    kanjiDetailParamsShape,
    TOOL_ANNOTATIONS,
    async (args) => {
      const result = await executeKanjiDetails(args);
      return result;
    }
  );

  logger.debug('Registered 3 MCP tools with annotations');
}

/**
 * Register all MCP resources.
 *
 * @param server - MCP server instance
 */
function registerResources(server: McpServer): void {
  // Radicals reference resource
  server.resource(
    radicalsResourceDefinition.name,
    radicalsResourceDefinition.uri,
    {
      description: radicalsResourceDefinition.description,
      mimeType: radicalsResourceDefinition.mimeType,
    },
    async () => {
      const result = await readRadicalsResource();
      return result;
    }
  );

  logger.debug('Registered 1 MCP resource');
}

export { McpServer };
