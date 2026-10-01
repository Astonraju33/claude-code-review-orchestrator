import { query } from '@anthropic-ai/claude-agent-sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReviewReportSchema } from './types/index.js';
import type { ReviewReport } from './types/index.js';
import { mcpServersConfig } from './config/mcp.config.js';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents/index.js';
import { ORCHESTRATOR_PROMPT } from './prompts/index.js';
import { logger } from './utils/logger.js';
import { ReviewError, ErrorCodes, withRetry, withTimeout } from './utils/error-handler.js';
import { globalRateLimiter } from './utils/rate-limiter.js';

export interface OrchestratorOptions {
  maxTurns?: number;
  timeoutMs?: number;
}

export class CodeReviewOrchestrator {
  private maxTurns: number;
  private timeoutMs: number;

  constructor(options: OrchestratorOptions = {}) {
    this.maxTurns = options.maxTurns ?? 60;
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  }

  async reviewPullRequest(owner: string, repo: string, prNumber: number): Promise<ReviewReport> {
    await globalRateLimiter.acquire(20000);
    try {
      return await withRetry(
        () =>
          withTimeout(
            () => this.runReview(owner, repo, prNumber),
            this.timeoutMs,
            `Review of ${owner}/${repo}#${prNumber} timed out`
          ),
        2,
        2000
      );
    } finally {
      globalRateLimiter.release();
    }
  }

  private async runReview(owner: string, repo: string, prNumber: number): Promise<ReviewReport> {
    const jsonSchema = zodToJsonSchema(ReviewReportSchema as any, { $refStrategy: 'root' });

    const prompt = `${ORCHESTRATOR_PROMPT}

Review pull request #${prNumber} in the GitHub repository ${owner}/${repo}.
Use owner="${owner}", repo="${repo}", pull number ${prNumber} for all GitHub tool calls.`;

    const stream = query({
      prompt,
      options: {
        model: process.env.ANTHROPIC_MODEL,
        cwd: process.env.PROJECT_ROOT,
        settingSources: ['project'],
        mcpServers: mcpServersConfig as any,
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        },
        allowedTools: ['Task', 'Skill', 'Read', 'Grep', 'Glob', 'mcp__github__*', 'mcp__eslint__*'],
        maxTurns: this.maxTurns,
        stderr: (data: string) => console.error('[claude stderr]', data),
        permissionMode: 'bypassPermissions',
        outputFormat: { type: 'json_schema', schema: jsonSchema as any }
      } as any
    });

    const subagentsUsed = new Set<string>();
    const skillsUsed = new Set<string>();

    for await (const message of stream as AsyncIterable<any>) {
      if (message.type === 'assistant' && message.parent_tool_use_id) {
        for (const block of message.message?.content ?? []) {
          if (block.type === 'tool_use' && block.name === 'Skill') {
            logger.info(`Skill invoked (inside subagent): ${block.input?.command ?? block.input?.skill ?? JSON.stringify(block.input)}`);
            skillsUsed.add(String(block.input?.command ?? block.input?.skill ?? 'unknown'));
          }
        }
      }

      if (message.type === 'assistant') {
        for (const block of message.message?.content ?? []) {
          if (block.type === 'tool_use' && block.name === 'Task') {
            const name = block.input?.subagent_type;
            if (name) {
              subagentsUsed.add(name);
              logger.info(`Subagent invoked: ${name}`);
            }
          } else if (block.type === 'tool_use' && block.name === 'Skill') {
            logger.info(`Skill invoked: ${block.input?.command ?? block.input?.skill ?? 'unknown'}`);
          }
        }
      }

      if (message.type === 'result') {
        logger.info(`Skills used: ${[...skillsUsed].join(', ') || 'none'}`);
        logger.info(`Subagents used: ${[...subagentsUsed].join(', ') || 'none'}`);

        if (subagentsUsed.size === 0) {
          throw new ReviewError(
            `No subagents ran for ${owner}/${repo}#${prNumber}. The repository or pull request may not exist or may be private. No report was produced.`,
            ErrorCodes.AGENT_FAILED
          );
        }

        const expectedSubagents = ['code-quality-analyzer', 'test-coverage-analyzer', 'refactoring-suggester'];
        const missingSubagents = expectedSubagents.filter((name) => !subagentsUsed.has(name));
        if (missingSubagents.length > 0) {
          logger.warn(`Partial review: subagents not invoked: ${missingSubagents.join(', ')}`);
        }

        if (message.structured_output) {
          const parsed = ReviewReportSchema.safeParse(message.structured_output);
          if (parsed.success) return parsed.data;
          throw new ReviewError(
            `Report failed validation: ${parsed.error.message}`,
            ErrorCodes.VALIDATION_FAILED
          );
        }
        throw new ReviewError(
          `Agent finished without structured output (${message.subtype})`,
          ErrorCodes.STRUCTURED_OUTPUT_FAILED
        );
      }
    }

    throw new ReviewError('No result message received', ErrorCodes.AGENT_FAILED);
  }
}
