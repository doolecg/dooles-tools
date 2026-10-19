// The worker-tier presets from rules.md: which model a task should run on. One table, read by register.tsx.
// Very small -> haiku, small and everything else -> sonnet (the default), hard and UI design -> opus.
// Very hard work (big refactor or migration, security) is never moved on its own: it comes back as 'ask'.

export type Tier = 'haiku' | 'sonnet' | 'opus' | 'ask'

export type ModelMode = 'off' | 'suggest' | 'auto'

const TIERS: { tier: Tier; match: RegExp }[] = [
  { tier: 'ask', match: /\b(big|large|major|full|whole|entire)\b.{0,20}\b(refactor|migration|rewrite)\b|\bmigrat(e|ion)\b|\bsecurity[- ](review|audit|sensitive|fix)|\b(auth|crypto|permissions?)\b.{0,15}\b(rewrite|redesign)/i },
  {
    tier: 'opus',
    match: /\b(architect\w*|ui (screen|design)s?|visual design|layouts?|mockups?|wireframes?|simulation (rules?|logic)|tricky|hard to (find|reproduce)|race condition|several files|multiple files|across (the )?(codebase|files|modules))\b|\b(design|build) (a|the) (screen|ui|hud|menu|dashboard)\b/i,
  },
  {
    tier: 'haiku',
    match: /\b(commit and push|push (it|this|that)|look (it|this|that)? ?up|list (the )?(files|folders)|read (the|this|that)|summari[sz]e|run (the )?(build|tests?)|rename|screenshots?|find where|what does .{0,40} do)\b/i,
  },
]

/** The tier a task text calls for; sonnet when nothing in the table matches. */
export function tierFor(text: string): Tier {
  for (const t of TIERS) if (t.match.test(text)) return t.tier
  return 'sonnet'
}

/** The model alias to pass for a tier; undefined where the default (sonnet) or Claude's own judgement stands. */
export const aliasFor = (tier: Tier): 'haiku' | 'opus' | undefined => (tier === 'haiku' || tier === 'opus' ? tier : undefined)

const LABEL: Record<Tier, string> = {
  haiku: 'Haiku 5.5 (very small task)',
  sonnet: 'Sonnet 5.5 (default)',
  opus: 'Opus 5.5 (hard task or UI design)',
  ask: 'a big, hard job: ask before using Opus',
}

/** The one-line suggestion shown and handed to Claude; null when the default model is right. */
export function suggestion(tier: Tier): string | null {
  if (tier === 'sonnet') return null
  const how = tier === 'ask' ? 'Check with the user first.' : `Pass model: "${tier}" to subagents; switch the main session with /model ${tier} if it is mostly this task.`
  return `Model preset: this looks like ${LABEL[tier]}. ${how}`
}
