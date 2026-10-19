// The mod's settings (plugin.json userConfig), with their defaults, and the per-run budgets.

import type { Io, ModelAsk, ModelReply } from './io'
import type { State } from './state'
import { estimateTokens } from './text'

export type Mode = 'off' | 'suggest' | 'controlled' | 'advanced'
export const MODES: Mode[] = ['off', 'suggest', 'controlled', 'advanced']

export type Settings = {
  enabled: boolean
  mode: Mode
  learnModel: string
  rewriteModel: string
  maxCalls: number
  maxTokens: number
  maxChanges: number
  dailyUsd: number
  soulBank: string
  hindsightUrl: string
  extraSkillDirs: string
  soulCap: number
  minUserTurns: number
  minTokens: number
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'controlled',
  learnModel: 'haiku',
  rewriteModel: 'sonnet',
  maxCalls: 4,
  maxTokens: 60_000,
  maxChanges: 5,
  dailyUsd: 0.5,
  soulBank: 'soul',
  hindsightUrl: '',
  extraSkillDirs: '',
  soulCap: 1500,
  // Operant's gate defaults (shared/learn.ts): 3 user turns and 500 tokens. The spec says 2 and 2000.
  minUserTurns: 3,
  minTokens: 500,
}

const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}
const text = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v.trim() : d)

// The options the engine hands register(), checked and defaulted.
export function settingsFrom(options: Record<string, unknown> | undefined): Settings {
  const o = options ?? {}
  const d = DEFAULT_SETTINGS
  return {
    enabled: o.enabled !== false,
    mode: MODES.includes(o.mode as Mode) ? (o.mode as Mode) : d.mode,
    learnModel: text(o.learnModel, d.learnModel),
    rewriteModel: text(o.rewriteModel, d.rewriteModel),
    maxCalls: num(o.maxCalls, d.maxCalls, 0, 50),
    maxTokens: num(o.maxTokens, d.maxTokens, 0, 2_000_000),
    maxChanges: num(o.maxChanges, d.maxChanges, 0, 100),
    dailyUsd: num(o.dailyUsd, d.dailyUsd, 0, 1000),
    soulBank: text(o.soulBank, d.soulBank),
    hindsightUrl: text(o.hindsightUrl, d.hindsightUrl),
    extraSkillDirs: typeof o.extraSkillDirs === 'string' ? o.extraSkillDirs : d.extraSkillDirs,
    soulCap: num(o.soulCap, d.soulCap, 200, 6000),
    minUserTurns: num(o.minUserTurns, d.minUserTurns, 1, 50),
    minTokens: num(o.minTokens, d.minTokens, 0, 100_000),
  }
}

// Rough price per million tokens (input, output), for the daily cap. An estimate: the engine does not report a
// plugin call's cost.
export function priceOf(model: string): { input: number; output: number } {
  const m = model.toLowerCase()
  if (m.includes('opus')) return { input: 5, output: 25 }
  if (m.includes('sonnet')) return { input: 3, output: 15 }
  return { input: 1, output: 5 }
}

export const usdOf = (model: string, inputTokens: number, outputTokens: number): number => {
  const p = priceOf(model)
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export class BudgetStop extends Error {}

// One run's budget: model calls, tokens and changes, and the day's spend across runs. Hitting one throws BudgetStop
// naming it; the run stops there and says which.
export class Budget {
  calls = 0
  tokens = 0
  usd = 0
  changes = 0
  constructor(
    private readonly s: Settings,
    private readonly state: State,
    private readonly io: Pick<Io, 'model' | 'now'>,
  ) {}

  private async spentToday(): Promise<number> {
    const today = dayOf(await this.io.now())
    if (this.state.spend.day !== today) this.state.spend = { day: today, usd: 0 }
    return this.state.spend.usd
  }

  async ask(a: Omit<ModelAsk, 'timeoutMs'> & { timeoutMs?: number }): Promise<ModelReply> {
    const est = estimateTokens(a.prompt) + a.maxTokens
    if (this.s.maxCalls > 0 && this.calls >= this.s.maxCalls) throw new BudgetStop(`max model calls per run (${this.s.maxCalls}) reached`)
    if (this.s.maxTokens > 0 && this.tokens + est > this.s.maxTokens) throw new BudgetStop(`max tokens per run (${this.s.maxTokens}) would be passed`)
    if (this.s.dailyUsd > 0 && (await this.spentToday()) >= this.s.dailyUsd) throw new BudgetStop(`daily spend cap ($${this.s.dailyUsd.toFixed(2)}) reached`)
    this.calls++
    const r = await this.io.model({ timeoutMs: 60_000, ...a })
    const used = r.inputTokens + r.outputTokens || estimateTokens(a.prompt) + (r.ok ? estimateTokens(r.text) : 0)
    this.tokens += used
    const usd = usdOf(a.model, r.inputTokens || estimateTokens(a.prompt), r.outputTokens || (r.ok ? estimateTokens(r.text) : 0))
    this.usd += usd
    await this.spentToday()
    this.state.spend.usd += usd
    return r
  }

  // True while the run may still apply a change on its own.
  canChange(): boolean {
    return this.s.maxChanges <= 0 || this.changes < this.s.maxChanges
  }
}
