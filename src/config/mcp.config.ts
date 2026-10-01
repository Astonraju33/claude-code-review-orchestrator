/**
 * Model Context Protocol (MCP) server configurations
 * 1. GitHub - PR/repo operations
 * 2. ESLint - linting and style analysis
 */

const githubEnv: Record<string, string> = {};
if (process.env.GITHUB_TOKEN) {
  githubEnv.GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_TOKEN;
}

export const mcpServersConfig = {
  github: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: githubEnv
  },

  eslint: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@eslint/mcp@latest'],
    env: {} as Record<string, string>
  }
};
