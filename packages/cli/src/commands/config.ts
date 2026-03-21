import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

export interface ConfigOptions {
  apiKey?: string;
  dashboardUrl?: string;
  show?: boolean;
}

interface AgentScoreConfig {
  apiKey?: string;
  dashboardUrl?: string;
}

const CONFIG_DIR = join(homedir(), '.agentscore');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * The `agentscore config` command.
 * Read or write CLI configuration.
 */
export async function configCommand(options: ConfigOptions): Promise<void> {
  const config = await loadConfig();

  if (!options.apiKey && !options.dashboardUrl) {
    // Show current config
    if (!config.apiKey && !config.dashboardUrl) {
      console.log(chalk.dim('No configuration set.'));
      console.log('');
      console.log(`Set your API key: ${chalk.cyan('agentscore config --api-key sk_xxx')}`);
      return;
    }

    console.log(chalk.bold('Current configuration:'));
    if (config.apiKey) {
      const masked = config.apiKey.slice(0, 6) + '...' + config.apiKey.slice(-4);
      console.log(`  API Key: ${chalk.cyan(masked)}`);
    }
    if (config.dashboardUrl) {
      console.log(`  Dashboard URL: ${chalk.cyan(config.dashboardUrl)}`);
    }
    return;
  }

  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }
  if (options.dashboardUrl) {
    config.dashboardUrl = options.dashboardUrl;
  }

  await saveConfig(config);
  console.log(chalk.green('Configuration saved.'));
}

async function loadConfig(): Promise<AgentScoreConfig> {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveConfig(config: AgentScoreConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
