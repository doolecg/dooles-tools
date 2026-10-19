// The one rule table: which plugins to switch on, from the project's files (at session start) or the prompt.
// Add a rule here; nothing else needs to change.

/** The project's files the rules read, relative to the session folder. A missing file is left out. */
export type Files = Record<string, string>

type Rule = { plugins: string[]; files?: (f: Files) => boolean; prompt: RegExp }

const GAME = ['router@awesome-gamedev-agent-skills', 'disciplines@awesome-gamedev-agent-skills', 'games@dooles-skills']
const JSON_KEY = (key: string) => new RegExp(`"${key}"\\s*:`)
const WEB_KEYS = [JSON_KEY('react-native'), JSON_KEY('vite'), JSON_KEY('expo')]
const EXPO_KEY = /"expo"\s*:/
const PACKAGE_JSONS = ['package.json', 'web/package.json']
const PIXI = /"(pixi\.js|@pixi\/[\w-]+|pixi-filters)"\s*:/
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'Dockerfile']
/** A solution or project file at the session folder's top level; the hook adds these names (empty text) to the files. */
const DOTNET_FILE = /\.(slnx|sln|csproj)$/i
export const isDotnetFile = (name: string) => DOTNET_FILE.test(name)
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
    plugins: ['minecraft-modding@dooles-skills', 'minecraft-multiloader@dooles-skills', 'games@dooles-skills'],
    files: f => /fabric|neoforge|minecraftforge|net\.minecraft/i.test(GRADLE.map(n => f[n] ?? '').join('\n')),
    prompt: /\b(minecraft|fabric|neoforge|forge mod|mixin)\b/i,
  },
  {
    plugins: ['web-mobile@dooles-skills'],
    files: f => WEB_KEYS.some(k => k.test(PACKAGE_JSONS.map(n => f[n] ?? '').join('\n'))),
    prompt: /\b(react[- ]native|tsx|vite|expo|rn web)\b/i,
  },
  {
    plugins: ['game-rendering@dooles-skills'],
    files: f => PIXI.test(PACKAGE_JSONS.map(n => f[n] ?? '').join('\n')),
    prompt: /\b(pixi(js)?|isometric|tilemaps?|sprite ?sheets?|texture atlas)\b/i,
  },
  {
    plugins: ['backend@dooles-skills'],
    files: f => Object.keys(f).some(k => DOTNET_FILE.test(k) || COMPOSE_FILES.includes(k)),
    prompt: /asp\.?net|dotnet|\.net\b|\b(ef core|entity framework|npgsql|postgres(ql)?|csproj|dockerfile|docker[- ]compose|minimal apis?)\b|\bdocker\b/i,
  },
  {
    plugins: ['ui-design@dooles-skills'],
    prompt: /\b(ui|ux) (design|review|critique|heuristics?)\b|\b(accessibility|a11y|design review)\b/i,
  },
]

/** Every file a rule may read, for the hook to load. */
export const PROJECT_FILES = ['project.godot', 'ProjectSettings/ProjectVersion.txt', 'sdk/ProjectSettings/ProjectVersion.txt', 'package.json', 'web/package.json', 'app.json', ...COMPOSE_FILES, ...GRADLE]

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
