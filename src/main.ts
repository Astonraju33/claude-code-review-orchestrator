import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { formatError } from './utils/error-handler.js';

function fail(message: string, hints: string[] = []): never {
  console.error(`\n❌ ${message}`);
  for (const hint of hints) console.error(`   ${hint}`);
  console.error('');
  process.exit(1);
}

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  // 1. Validate command-line arguments
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    fail('Missing arguments.', [
      'Usage: npm run dev -- <owner> <repo> <pr-number>',
      'Example: npm run dev -- airaamane simple-todo-app 1'
    ]);
  }

  if (!/^\d+$/.test(prStr)) {
    fail(`PR number must be a positive integer, got "${prStr}".`);
  }
  const prNumber = parseInt(prStr, 10);
  if (prNumber <= 0) {
    fail('PR number must be greater than 0.');
  }

  // 2. Validate authentication
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasAwsKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else if (hasAwsKeys) {
    if (!process.env.AWS_REGION) {
      fail('AWS credentials found but AWS_REGION is not set.', ['Add AWS_REGION=us-east-1 (or your region) to .env']);
    }
    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    fail('No authentication configured. Set ONE of:', [
      '- ANTHROPIC_API_KEY, or',
      '- AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION (Bedrock)'
    ]);
  }

  // 3. Validate model
  if (!process.env.ANTHROPIC_MODEL) {
    fail('ANTHROPIC_MODEL is not set.', [
      'Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929',
      'AWS Bedrock:   ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    ]);
  }

  if (!process.env.PROJECT_ROOT) {
    fail('PROJECT_ROOT is not set.', ['Add the absolute path of project/starter to .env']);
  }

  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN not set. Public repos work, but you may hit rate limits.');
  }

  // 4. Run the review
  console.log(`\n🔍 Reviewing ${owner}/${repo} PR #${prNumber} using ${process.env.ANTHROPIC_MODEL}`);
  console.log('   This can take several minutes (three subagents run in parallel)...\n');

  try {
    const started = Date.now();
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    // Program sets the real duration and PR identity
    report.metadata.duration = Date.now() - started;
    report.pullRequest = { owner, repo, number: prNumber };

    // 5. Generate reports
    const generator = new ReportGenerator();
    const reportsDir = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    const base = `${owner}_${repo}_${prNumber}`;
    const files = {
      json: path.join(reportsDir, `${base}.json`),
      md: path.join(reportsDir, `${base}.md`),
      html: path.join(reportsDir, `${base}.html`)
    };

    fs.writeFileSync(files.json, generator.generateJSONReport(report), 'utf-8');
    fs.writeFileSync(files.md, generator.generateMarkdownReport(report), 'utf-8');
    fs.writeFileSync(files.html, generator.generateHTMLReport(report), 'utf-8');

    console.log('✅ Review complete!');
    console.log(`   Overall score: ${report.summary.overallScore}/100`);
    console.log(`   JSON:     ${files.json}`);
    console.log(`   Markdown: ${files.md}`);
    console.log(`   HTML:     ${files.html}`);
  } catch (error) {
    console.error(`\n❌ Review failed: ${formatError(error)}`);
    console.error('   Check your credentials, the PR number, and your network, then try again.');
    process.exit(1);
  }
}

main();
