#!/usr/bin/env node
import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { diffCommand } from './commands/diff.js';
import { driftCommand } from './commands/drift.js';
import { syncCommand } from './commands/sync.js';
import { watchCommand } from './commands/watch.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('agentscore')
  .description('Alignment monitoring for AI agents — verify your agent is doing what you told it to do')
  .version('0.1.0');

program
  .command('check')
  .description('Score agent session alignment')
  .option('-p, --path <path>', 'Path to session file or directory', '.')
  .option('-f, --format <format>', 'Output format: terminal, json, markdown', 'terminal')
  .option('-t, --threshold <score>', 'Minimum score threshold (exit 1 if below)', parseInt)
  .action(async (options) => {
    await checkCommand({
      path: options.path,
      format: options.format,
      threshold: options.threshold,
    });
  });

program
  .command('diff')
  .description('Side-by-side comparison of prompt instructions vs actual actions')
  .option('-p, --path <path>', 'Path to session file or directory', '.')
  .option('-s, --session <id>', 'Specific session ID')
  .action(async (options) => {
    await diffCommand({
      path: options.path,
      session: options.session,
    });
  });

program
  .command('drift')
  .description('Show behavioral drift over time')
  .option('-p, --path <path>', 'Path to sessions directory', '.')
  .option('-d, --days <days>', 'Number of days to analyze', parseInt)
  .action(async (options) => {
    await driftCommand({
      path: options.path,
      days: options.days,
    });
  });

program
  .command('sync')
  .description('Push scores to the AgentScore dashboard')
  .option('-p, --path <path>', 'Path to session file or directory', '.')
  .option('--auto', 'Auto-sync after every check')
  .action(async (options) => {
    await syncCommand({
      path: options.path,
      auto: options.auto,
    });
  });

program
  .command('config')
  .description('Read or write CLI configuration')
  .option('--api-key <key>', 'Set the API key for dashboard sync')
  .option('--dashboard-url <url>', 'Set the dashboard URL')
  .action(async (options) => {
    await configCommand({
      apiKey: options.apiKey,
      dashboardUrl: options.dashboardUrl,
    });
  });

program
  .command('watch')
  .description('Wrap and monitor an agent process')
  .option('-o, --output <dir>', 'Output directory for captured sessions')
  .argument('<command...>', 'Command to run')
  .action(async (command, options) => {
    await watchCommand({
      command,
      output: options.output,
    });
  });

program.parse();
