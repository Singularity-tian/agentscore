/**
 * Minimal type declarations for the OpenClaw plugin SDK.
 *
 * The full SDK is provided by the OpenClaw host at runtime.
 * These declarations let us compile without installing openclaw as a dependency.
 */
declare module "openclaw/plugin-sdk/plugin-entry" {
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
    registerHook(hook: {
      events: string[];
      handler(event: HookEvent): void | Promise<void>;
    }): void;
  }

  export interface OpenClawPluginDefinition {
    id: string;
    name?: string;
    description?: string;
    register(api: OpenClawPluginApi): void;
  }

  export function definePluginEntry(
    definition: OpenClawPluginDefinition,
  ): OpenClawPluginDefinition;
}
