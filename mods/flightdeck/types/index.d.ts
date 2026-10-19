export type FdStatus = 'running' | 'waiting' | 'done' | 'failed' | 'stopped'

/** One subagent of this session, as the sidebar keeps it. */
export type FdAgent = {
  id: string
  description: string
  type: string
  status: FdStatus
  startedAt: number
  /** 0 while it runs. */
  endedAt: number
  model: string
  /** Tokens in its context after its latest response. */
  ctxTokens: number
  /** Requests it has made. */
  steps: number
  /** Summed over its responses at list prices; 0 with isCostKnown false when its model has no price here. */
  costUsd: number
  isCostKnown: boolean
  /** Its latest tool call in plain words (`running git status`); empty until it makes one. */
  now?: string
}

/** One tool call of the main session, kept for the Right now card. */
export type FdCall = {
  id: string
  tool: string
  at: number
  /** The file the call works on, absolute. */
  path?: string
  /** The command, pattern, query or agent description the call names. */
  text?: string
  /** What a command is for, in the call's own words (a shell call's `description`). */
  about?: string
  isDone: boolean
}

/** A file Claude read or edited, newest first. */
export type FdFile = { path: string; kind: 'read' | 'edit'; at: number }

/** A skill, plugin or MCP server this session has used. */
export type FdUse = { kind: 'skill' | 'plugin' | 'mcp'; name: string }

/** The last edit's size, from the tool's own record. */
export type FdEdit = { path: string; added: number; removed: number }

/** What a permission prompt or a question is waiting on. */
export type FdPending = { text: string; tool: string }

/** The repository: its branch, the changed files as absolute paths, and the commits ahead of main (-1 when not known). */
export type FdGit = { branch: string; changed: string[]; ahead: number }

/** The main loop. */
export type FdMain = {
  model: string
  effort: string
  steps: number
  isRunning: boolean
  turnStartedAt: number
  turnEndedAt: number
}

export type FdLimit = { kind: string; pct: number }

export type FdUsage = {
  ctxPct: number | null
  ctxTokens: number | null
  window: number
  costUsd: number | null
  limits: FdLimit[]
}

/** An on/off mode as the bottom bar reads it, keyed by the command that flips it. */
export type FdMode = { label: string; isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'flightdeck': {
      isOpen: boolean
      main: FdMain
      usage: FdUsage
      agents: FdAgent[]
      tick: number
      theme: string
      modes: Record<string, FdMode>
      /** The Sidebar request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
      /** The first running card and the first finished row the pane's two lists show. */
      runOffset: number
      doneOffset: number
      /** Agents the person cleared off the list this session. */
      cleared: string[]
      calls: FdCall[]
      files: FdFile[]
      uses: FdUse[]
      lastEdit: FdEdit | null
      pending: FdPending | null
      git: FdGit | null
    }
    /** Read only: Task View's job, and Self Improve's one-line summary. */
    'clean-view': { checklist: unknown }
    'self-improve': { band: { line: string; isRunning: boolean } }
    /** The Sidebar mod's strip, as it publishes it (the same shape as its SbStrip). */
    'sidebar': {
      strip: {
        isOn: boolean
        active: string
        tabs: { id: string; icon: string; name: string; label?: string; badge: number }[]
        theme: string
        colour: string
      }
    }
  }
}
