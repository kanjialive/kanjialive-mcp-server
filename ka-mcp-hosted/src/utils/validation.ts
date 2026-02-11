/**
 * Shared validation utilities for MCP tool implementations.
 */

/**
 * Format Zod validation errors into a readable string.
 *
 * @param error - A Zod error object (or unknown)
 * @returns Human-readable error description
 */
export function formatZodError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: unknown[]; message: string }> };
    return zodError.issues
      .map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`)
      .join('; ');
  }
  return 'Validation error';
}
