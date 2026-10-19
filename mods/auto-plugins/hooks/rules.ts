// The one rule table: which plugins to switch on, from the project's files (at session start) or the prompt.
// Add a rule here; nothing else needs to change.

/** The project's files the rules read, relative to the session folder. A missing file is left out. */
export type Files = Record<string, string>

type Rule = { plugins: string[]; files?: (f: Files) => boolean; prompt: RegExp }

const GAME = ['router@awesome-gamedev-agent-skills', 'disciplines@awesome-gamedev-agent-skills']
const EXPO_KEY = /"expo"\s*:/
const GRADLE = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts']

export const RULES: Rule[] = [
  {
    plugins: GAME,
    prompt: /\b(game ?dev|game design|gameplay|game ui|sprites?|tilemaps?|hud|pixel art|level design|procedural gen\w*|game feel|shaders?)\b/i,
  },
  {
    plugins: ['godot@awesome-gamedev-agent-skills', ...GAME],
    files: f => 'project.godot' in f,
    prompt: /\b(godot|gdscript)\b|\.(tscn|gd)\b/i,
  },
  {
    plugins: ['unity@awesome-gamedev-agent-skills', ...GAME],
    files: f => 'ProjectSettings/ProjectVersion.txt' in f || 'sdk/ProjectSettings/ProjectVersion.txt' in f,
    prompt: /\b(unity|scriptableobject|monobehaviou?r)\b|\.(unity|prefab)\b/i,
  },
  {
    plugins: ['expo@expo-plugins'],
    files: f => EXPO_KEY.test(f['package.json'] ?? '') || EXPO_KEY.test(f['app.json'] ?? ''),
    prompt: /\b(expo|react[- ]native|eas (build|update|submit)|expo[- ]router)\b/i,
  },
  {
    plugins: ['minecraft-modding@dooles-skills', 'minecraft-multiloader@dooles-skills', 'minecraft-mod-dev@dooles-skills'],
    files: f => /fabric|neoforge|minecraftforge|net\.minecraft/i.test(GRADLE.map(n => f[n] ?? '').join('\n')),
    prompt: /\b(minecraft|fabric|neoforge|forge mod|mixin)\b/i,
  },
  {
    plugins: ['media-and-docs@dooles-skills'],
    prompt: /\.(docx|xlsx|pdf|pptx)\b|\b(word doc|spreadsheet|excel|powerpoint)\b/i,
  },
]

/** Every file a rule may read, for the hook to load. */
export const PROJECT_FILES = ['project.godot', 'ProjectSettings/ProjectVersion.txt', 'sdk/ProjectSettings/ProjectVersion.txt', 'package.json', 'app.json', ...GRADLE]

/**
 * The plugins to switch on: from `files` (session start) or `prompt` (a prompt), keeping only installed
 * plugins not already on in the project's settings.local.json `enabledPlugins`. Each plugin once, in table order.
 */
export function pluginsToEnable(input: { files?: Files; prompt?: string }, enabled: Record<string, unknown>, installed: ReadonlySet<string>): string[] {
  const out = new Set<string>()
  for (const r of RULES) {
    const wanted = input.prompt !== undefined ? r.prompt.test(input.prompt) : input.files !== undefined && r.files?.(input.files) === true
    if (!wanted) continue
    for (const p of r.plugins) if (installed.has(p) && !enabled[p]) out.add(p)
  }
  return [...out]
}

/** `enabledPlugins` from a settings.local.json text; {} when absent or unreadable. */
export function enabledIn(text: string | null): Record<string, unknown> {
  try {
    const v = JSON.parse(text ?? '').enabledPlugins
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** The plugin ids (`name@marketplace`) in installed_plugins.json; empty when absent or unreadable. */
export function installedIn(text: string | null): Set<string> {
  try {
    return new Set(Object.keys(JSON.parse(text ?? '').plugins ?? {}))
  } catch {
    return new Set()
  }
}

const names = (on: string[]) => on.map(p => p.split('@')[0]).join(', ')

/** The toast the person sees. */
export const toastText = (on: string[]) => `Auto Plugins turned on ${names(on)} for this project. Run /reload-plugins or restart Claude Code to load them.`

/** The note handed to Claude with the event, so it tells the person too. */
export const contextText = (on: string[]) =>
  `Auto-enabled for this project: ${names(on)}. Their skills load only after /reload-plugins (or a restart); tell the user to run it.`
