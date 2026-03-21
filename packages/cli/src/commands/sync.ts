import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

export interface SyncOptions {
  auto?: boolean;
  path?: string;
}

interface AgentScoreConfig {
  apiKey?: string;
  dashboardUrl?: string;
}

const CONFIG_PATH = join(homedir(), '.agentscore', 'config.json');
const DEFAULT_DASHBOARD_URL = 'https://getagentscore.com';

/**
 * The `agentscore sync` command.
 * Push scored sessions to the AgentScore dashboard.
 */
export async function syncCommand(options: SyncOptions): Promise<void> {
  try {
    const config = await loadConfig();

    if (!config.apiKey) {
      console.log(chalk.yellow('No API key configured.'));
      console.log('');
      console.log('To sync scores to the dashboard:');
      console.log(`  1. Sign up at ${chalk.cyan(DEFAULT_DASHBOARD_URL)}`);
      console.log(`  2. Copy your API key from Settings`);
      console.log(`  3. Run: ${chalk.cyan('agentscore config --api-key sk_xxx')}`);
      console.log('');
      process.exit(1);
    }

    const dashboardUrl = config.dashboardUrl || DEFAULT_DASHBOARD_URL;
    const targetPath = resolve(options.path || '.');

    // Load session files to sync
    const files = await findSessionFiles(targetPath);
    if (files.length === 0) {
      console.log(chalk.yellow('No session files found to sync.'));
      process.exit(1);
    }

    console.log(chalk.dim(`Syncing ${files.length} session(s) to ${dashboardUrl}...`));

    let synced = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const data = JSON.parse(content);

        const response = await fetch(`${dashboardUrl}/api/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          console.log(chalk.red(`  Failed: ${file} — ${error.error || response.statusText}`));
          failed++;
        } else {
          synced++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`  Failed: ${file} — ${msg}`));
        failed++;
      }
    }

    if (failed === 0) {
      console.log(chalk.green(`Sync complete. ${synced} session(s) synced.`));
    } else {
      console.log(chalk.yellow(`Sync finished: ${synced} synced, ${failed} failed.`));
    }

    if (options.auto) {
      console.log(chalk.dim('Auto-sync enabled: scores will be pushed after each check.'));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error:', message);
    process.exit(1);
  }
}

async function findSessionFiles(targetPath: string): Promise<string[]> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(targetPath);
    if (stats.isFile() && targetPath.endsWith('.json')) {
      return [targetPath];
    }
    if (stats.isDirectory()) {
      const entries = await readdir(targetPath);
      return entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(targetPath, f));
    }
  } catch {
    // Path doesn't exist
  }
  return [];
}

async function loadConfig(): Promise<AgentScoreConfig> {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}
