import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  getSharedManagedScriptPath,
  wrapPosixHookCommand,
  type HookDefinition,
  type HooksConfig
} from '../agent-hooks/installer-utils'

const MUSECODE_SCRIPT_BASE = 'musecode-hook'

// Why: mirror the Claude-compatible events Orca normalizes for status (see
// normalizeMusecodeEvent). MuseCode uses these exact event names (verified
// against muse 1.0.3 hook stdin), so each maps to a working/waiting/done
// transition. Omit matcher: an absent matcher already matches every tool.
export const MUSECODE_HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Stop',
  'StopFailure'
] as const

export const MUSECODE_MANAGED_HOOKS_FILE_NAME = 'musecode-hooks.json'

function getMusecodeConfigDir(home: string): string {
  // Why: honor XDG_CONFIG_HOME like the CLI does; default matches muse's own
  // `~/.config/muse` resolution.
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg ? join(xdg, 'muse') : join(home, '.config', 'muse')
}

export function getMusecodeConfigPath(): string {
  return join(getMusecodeConfigDir(homedir()), 'settings.json')
}

export function getMusecodeManagedScriptFileName(): string {
  return `${MUSECODE_SCRIPT_BASE}.sh`
}

export function getMusecodeManagedScriptPath(): string {
  return getSharedManagedScriptPath(getMusecodeManagedScriptFileName())
}

export function getMusecodeManagedHooksPath(): string {
  return getSharedManagedScriptPath(MUSECODE_MANAGED_HOOKS_FILE_NAME)
}

export function getMusecodeRemoteConfigPath(remoteHome: string): string {
  // Why: remote XDG_CONFIG_HOME is unknown over SFTP; default matches muse's own resolution.
  return `${remoteHome.replace(/\/$/, '')}/.config/muse/settings.json`
}

export function getMusecodeRemoteManagedHooksPath(remoteHome: string): string {
  return `${remoteHome.replace(/\/$/, '')}/.orca/agent-hooks/${MUSECODE_MANAGED_HOOKS_FILE_NAME}`
}

export function getMusecodeManagedCommand(scriptPath: string): string {
  return wrapPosixHookCommand(scriptPath)
}

export function getMusecodeRemoteManagedCommand(scriptPath: string): string {
  return wrapPosixHookCommand(scriptPath)
}

// Why: the managed file is fully Orca-owned (muse runs it without a trust
// step via `managed_hooks_path`), so generate it wholesale — no user content
// to preserve, unlike an inline `hooks` block in settings.json.
export function buildMusecodeManagedHooksFile(command: string): string {
  const hooks: Record<string, HookDefinition[]> = {}
  for (const event of MUSECODE_HOOK_EVENTS) {
    hooks[event] = [{ hooks: [buildManagedCommandHook(command)] }]
  }
  return `${JSON.stringify({ hooks }, null, 2)}\n`
}

export function readManagedMusecodeHookEvents(
  parsed: HooksConfig | null,
  isManagedCommand: (command: string | undefined) => boolean
): Set<string> {
  const present = new Set<string>()
  if (!parsed || typeof parsed.hooks !== 'object' || parsed.hooks === null) {
    return present
  }
  for (const event of MUSECODE_HOOK_EVENTS) {
    const definitions = parsed.hooks[event]
    if (!Array.isArray(definitions)) {
      continue
    }
    if (
      definitions.some((definition) =>
        (definition.hooks ?? []).some((hook) => isManagedCommand(hook.command))
      )
    ) {
      present.add(event)
    }
  }
  return present
}

export function getMusecodeManagedCommandMatcher(): (command: string | undefined) => boolean {
  return createManagedCommandMatcher(getMusecodeManagedScriptFileName())
}
