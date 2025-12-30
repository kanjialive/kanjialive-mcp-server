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
 * @returns Configured McpServer instance
 */
export function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'Kanji Alive',
    version: '1.0.0',
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
    async (args) => {
      const result = await executeKanjiDetails(args);
      return result;
    }
  );

  logger.debug('Registered 3 MCP tools');
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
