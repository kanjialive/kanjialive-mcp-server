/**
 * Error handling utilities for the MCP server.
 *
 * Provides custom error types, error mapping functions, and shared result types
 * that translate HTTP errors into user-friendly messages suitable for LLM consumption.
 */

import { AxiosError } from 'axios';
import { logger } from './logger.js';

/**
 * Standard result shape returned by all MCP tool implementations.
 */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Custom error class for tool execution failures.
 *
 * Per MCP spec, tool errors should signal to the LLM that something went wrong
 * so it can attempt self-correction. This error type is used to wrap API and
 * validation errors with user-friendly messages.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ToolError.prototype);
  }
}

/**
 * Custom error class for validation failures.
 */
export class ValidationError extends Error {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Handle API errors by mapping them to user-friendly ToolError messages.
 *
 * This function never returns - it always throws a ToolError with an
 * appropriate message based on the error type.
 *
 * @param error - The error that occurred
 * @throws ToolError - Always throws with formatted error message
 */
export function handleApiError(error: unknown): never {
  // Handle Axios HTTP errors
  if (error instanceof AxiosError) {
    const status = error.response?.status;

    if (status === 404) {
      throw new ToolError(
        'Resource not found. The kanji may not be in the database, ' +
          'or the search parameters did not match any results. ' +
          'Kanji Alive supports 1,235 kanji comprising those taught in Japanese elementary schools ' +
          'up to Grade 6 and those taught up to the level of N2 of the Japanese Language Proficiency Test.'
      );
    }

    if (status === 400) {
      throw new ToolError(
        'Invalid request. Please check that your search parameters are correct. ' +
          'For readings, use romaji or appropriate Japanese characters.'
      );
    }

    if (status === 429) {
      throw new ToolError(
        'Rate limit exceeded. Please wait a moment before making more requests.'
      );
    }

    if (status && status >= 500) {
      throw new ToolError('Kanji Alive server error. Please try again later.');
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new ToolError(
        'Request timed out. The Kanji Alive API may be experiencing issues. Please try again.'
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new ToolError('Network error. Please check your internet connection.');
    }

    // Generic HTTP error
    throw new ToolError(
      `API request failed with status ${status}: ${error.response?.statusText || 'Unknown error'}`
    );
  }

  // Handle validation errors
  if (error instanceof ValidationError) {
    throw new ToolError(`Validation error: ${error.message}`);
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Log full details for debugging
    logger.error('Unexpected error in API request', {
      errorType: error.name,
      errorMessage: error.message,
      stack: error.stack,
    });

    // Return sanitized message to user
    throw new ToolError(
      'An unexpected error occurred while processing your request. ' +
        'Please try again. If the problem persists, check the server logs for details.'
    );
  }

  // Unknown error type
  logger.error('Unknown error type', { error });
  throw new ToolError('An unexpected error occurred. Please try again.');
}

/**
 * Validate that an API response contains data.
 *
 * @param data - The API response data
 * @param queryInfo - Description of the query for error messages
 * @throws ToolError - If data is empty or null
 */
export function validateApiResponse(data: unknown, queryInfo: string): void {
  if (Array.isArray(data) && data.length === 0) {
    throw new ToolError(
      `API returned empty response for ${queryInfo}. ` +
        'The kanji may not exist in the database.'
    );
  }

  if (data === null || data === undefined) {
    throw new ToolError(
      `API returned null response for ${queryInfo}. ` + 'This may indicate a server error.'
    );
  }
}

/**
 * Convert any caught error into a ToolResult with isError set.
 *
 * Handles the common pattern shared by all tool implementations:
 * 1. If already a ToolError, use its message directly.
 * 2. Otherwise, log the unexpected error and delegate to handleApiError.
 *
 * @param error - The caught error
 * @param toolName - Name of the tool for logging context
 * @returns A ToolResult indicating the error
 */
export function toErrorResult(error: unknown, toolName: string): ToolResult {
  if (error instanceof ToolError) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }

  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  try {
    handleApiError(error);
  } catch (toolError) {
    const message =
      toolError instanceof ToolError ? toolError.message : 'An unexpected error occurred';
    return { content: [{ type: 'text', text: message }], isError: true };
  }

  // handleApiError always throws, so this is unreachable but satisfies TypeScript
  return { content: [{ type: 'text', text: 'An unexpected error occurred' }], isError: true };
}
