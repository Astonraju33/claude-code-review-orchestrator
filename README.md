# Multi-Agent Code Review System

A pull request reviewer built with the Claude Agent SDK. An orchestrator
fetches PR data through the GitHub MCP server, dispatches three subagents
(code quality, test coverage, refactoring) and aggregates their findings into
a Zod-validated ReviewReport exported as JSON, Markdown and HTML.

## Architecture
- Orchestrator (src/orchestrator.ts): SDK query() with the Task tool,
  structured output via zod-to-json-schema, validation with Zod safeParse
- Subagents (src/agents/): code-quality-analyzer (uses the Skill tool),
  test-coverage-analyzer, refactoring-suggester
- Prompts (src/prompts/), MCP config (src/config/mcp.config.ts)
- Utilities (src/utils/): retry with exponential backoff and jitter,
  Promise.race timeout, sliding-window rate limiter, logger, report generator

## Setup
1. npm install (from repo root)
2. cp .env.example .env and set ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
   PROJECT_ROOT, and optionally GITHUB_TOKEN
3. Never commit .env

## Usage
    npm run dev -- <owner> <repo> <pr-number>

Reports are written to reports/ as .json, .md and .html.

## Scripts
- npm run build: compile TypeScript
- npm test: run tests

## Note on test repository
The assigned repository airaamane/simple-todo-app returned HTTP 404 (both
unauthenticated and while logged in), and the owner's profile lists only one
public repository. The system was therefore run against the public repository
octocat/Hello-World (PRs #1, #2535 and #7376). Failed runs against the assigned
repo are kept in extra/failed-runs/. Reports are in reports/ as
octocat_Hello-World_<PR>.json|md|html.
