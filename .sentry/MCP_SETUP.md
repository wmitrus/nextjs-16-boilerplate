# Sentry MCP (Model Context Protocol) Setup

## Overview

The Sentry MCP integration allows AI assistants (like Claude) to interact with your Sentry project directly. This enables AI-assisted error debugging and issue management.

## Configuration

MCP configuration is stored in `.sentry/mcp.json` and includes:

- **Authentication**: Uses `SENTRY_AUTH_TOKEN` environment variable
- **Organization**: `ozi`
- **Project**: `nextjs-16-boilerplate`
- **Capabilities**:
  - Issue management (list, get, resolve, ignore, assign)
  - Event tracking and source maps
  - Release and deployment tracking
  - Performance metrics and tracing
  - Session analytics

## Setting Up Claude MCP Integration

### Option 1: VS Code with Claude Extension

If you're using Claude in VS Code:

1. Install the Claude extension
2. Open Claude settings
3. Add to your MCP servers configuration:

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["@sentry/mcp"],
      "env": {
        "SENTRY_AUTH_TOKEN": "your_token_here",
        "SENTRY_ORG": "ozi",
        "SENTRY_PROJECT": "nextjs-16-boilerplate"
      }
    }
  }
}
```

### Option 2: Claude Desktop

Add to `~/Library/Application\ Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["@sentry/mcp"],
      "env": {
        "SENTRY_AUTH_TOKEN": "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",
        "SENTRY_ORG": "ozi",
        "SENTRY_PROJECT": "nextjs-16-boilerplate"
      }
    }
  }
}
```

## Token Management

**IMPORTANT**: Never commit your `SENTRY_AUTH_TOKEN` to version control.

- **Local Development**: Store in environment variables
- **Production CI/CD**: Add to Vercel environment variables
- **Claude Integration**: Add to your local Claude configuration

## Available Commands in Claude

With MCP configured, you can ask Claude to:

- "What are the recent errors in my Sentry project?"
- "Show me the details of issue #12345"
- "What's causing the highest error rate?"
- "Help me debug this stack trace"
- "Create a release for version 1.0.0"

## Troubleshooting

### MCP Server Not Connecting

1. Verify `SENTRY_AUTH_TOKEN` is set correctly
2. Check that `@sentry/mcp` is installed: `npm install @sentry/mcp`
3. Verify organization and project names are correct
4. Restart Claude or your IDE

### Permission Issues

If you get permission errors, ensure your Sentry token has the necessary scopes:

- `event:read`
- `issue:read`
- `issue:write`
- `release:read`
- `release:write`

## Resources

- [Sentry MCP Documentation](https://docs.sentry.io/product/integrations/ai-tools/)
- [MCP Protocol Overview](https://modelcontextprotocol.io/)
- [Sentry API Reference](https://docs.sentry.io/api/)

---

**Version**: 1.0.0  
**Last Updated**: February 22, 2026
