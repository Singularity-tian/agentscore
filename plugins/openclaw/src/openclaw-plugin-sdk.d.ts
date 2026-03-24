/**
 * Minimal type declarations for the OpenClaw plugin SDK.
 *
 * The full SDK is provided by the OpenClaw host at runtime.
 * These declarations let us compile without installing openclaw as a dependency.
 */
declare module "openclaw/plugin-sdk" {
  export interface HookEvent {
    type: string;
    action: string;
    sessionKey: string;
    timestamp: Date;
    messages: string[];
    context: Record<string, unknown>;
  }

  export interface OpenClawPluginApi {
    pluginConfig: Record<string, unknown>;
    config: Record<string, unknown>;
    registerHook(
      events: string | string[],
      handler: (event: HookEvent) => void | Promise<void>,
      opts?: Record<string, unknown>,
    ): void;
  }

  export function emptyPluginConfigSchema(): Record<string, unknown>;
}