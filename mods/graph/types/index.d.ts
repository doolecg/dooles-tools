export type GraphView = {
  /** What the pane says: nothing yet, the graph, no viewer, no project for the folder, or a viewerUrl that is not loopback. */
  phase: 'loading' | 'ok' | 'down' | 'none' | 'badUrl'
  /** The project picked with the arrows (the viewer's id), or null for the session's own folder. */
  pick: string | null
  /** The viewer's project list and the one it answered for. */
  projects: { id: string; name: string }[]
  projectName: string
  /** True once the terminal showed it cannot draw the picture; the pane then draws the cards in text. */
  noImages: boolean
  /** Counts up whenever the pane must be drawn again. */
  rev: number
}

declare module 'claude-code' {
  interface PluginState {
    graph: {
      view: GraphView
      /** The status segment Bottom Bar reads (its `segments` contract); empty unless Show in the bar is on. */
      segments: Record<string, { label: string; detail?: string; command: string; state?: 'idle' | 'working' | 'done' | 'error' }>
      /** The Sidebar request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
    }
    sidebar: {
      strip: { isOn: boolean; active: string; tabs: { id: string; icon: string; name: string; badge: number }[]; theme: string; colour: string }
    }
  }
}
