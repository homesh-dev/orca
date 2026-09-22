import { existsSync, readFileSync } from 'node:fs'
import { applyEdits, modify, parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { isPlainObject } from '../agent-hooks/installer-utils'

// Why: tolerate JSONC on read (comments) while preserving the user's key order
// and formatting on write — a parse/stringify round trip would drop comments.
// muse hard-fails without `"schema_version": 1`, but install only sets
// `managed_hooks_path` and never touches the version key.
export type MuseSettingsSource = {
  text: string | null
  config: Record<string, unknown>
}

export const MUSE_MANAGED_HOOK_ENV_VARS = [
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
  'ORCA_AGENT_HOOK_TRANSPORT',
  'ORCA_AGENT_HOOK_ENDPOINT',
  'ORCA_PANE_KEY',
  'ORCA_TAB_ID',
  'ORCA_WORKTREE_ID',
  'ORCA_AGENT_LAUNCH_TOKEN'
] as const

export function parseMuseSettingsText(
  text: string,
  diagnosticName: string
): Record<string, unknown> | null {
  const errors: ParseError[] = []
  const parsed = parseJsonc(text, errors)
  if (errors.length > 0) {
    console.warn(
      `Could not parse ${diagnosticName}: ${errors.map((e) => `offset ${e.offset} length ${e.length}`).join(', ')}`
    )
    return null
  }
  if (parsed === undefined) {
    return {}
  }
  return isPlainObject(parsed) ? (parsed as Record<string, unknown>) : null
}

export function readMuseSettingsSource(configPath: string): MuseSettingsSource | null {
  if (!existsSync(configPath)) {
    return { text: null, config: {} }
  }
  let text: string
  try {
    text = readFileSync(configPath, 'utf-8')
  } catch {
    return null
  }
  const config = parseMuseSettingsText(text, 'Muse settings.json')
  return config === null ? null : { text, config }
}

export function serializeMuseSettings(
  originalText: string | null,
  managedHooksPath: string | undefined
): string {
  if (originalText === null) {
    // Why: a fresh settings.json needs `"schema_version": 1` or every muse
    // command fails with `malformed settings file`.
    const config: Record<string, unknown> = { schema_version: 1 }
    if (managedHooksPath !== undefined) {
      config.managed_hooks_path = managedHooksPath
      config.managed_hooks_env_vars = MUSE_MANAGED_HOOK_ENV_VARS
    }
    return `${JSON.stringify(config, null, 2)}\n`
  }
  let text = originalText
  const parsed = parseJsonc(originalText) as Record<string, unknown> | undefined
  if (parsed?.schema_version === undefined) {
    text = applyEdits(
      text,
      modify(text, ['schema_version'], 1, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
    )
  }
  const current = parseJsonc(text) as Record<string, unknown> | undefined
  if (current?.managed_hooks_path !== managedHooksPath) {
    text = applyEdits(
      text,
      // Why: `undefined` removes the key, which is how remove() drops the pointer.
      modify(text, ['managed_hooks_path'], managedHooksPath, {
        formattingOptions: { insertSpaces: true, tabSize: 2 }
      })
    )
  }
  if (managedHooksPath !== undefined) {
    const withPointer = parseJsonc(text) as Record<string, unknown> | undefined
    const currentEnvVars = Array.isArray(withPointer?.managed_hooks_env_vars)
      ? withPointer.managed_hooks_env_vars.filter(
          (value): value is string => typeof value === 'string'
        )
      : []
    const managedEnvVars = [...new Set([...currentEnvVars, ...MUSE_MANAGED_HOOK_ENV_VARS])]
    if (
      !Array.isArray(withPointer?.managed_hooks_env_vars) ||
      managedEnvVars.length !== currentEnvVars.length
    ) {
      text = applyEdits(
        text,
        modify(text, ['managed_hooks_env_vars'], managedEnvVars, {
          formattingOptions: { insertSpaces: true, tabSize: 2 }
        })
      )
    }
  }
  return text
}
