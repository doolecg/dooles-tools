// soul.md: one markdown file of facts about the user, one line per fact, in short sections.
// Kept in step with the Hindsight Soul Bank: new bank facts come in, new file lines go out, both deduplicated.

import { clean, hashText, hasSecret, similarity, stripLinks, textProblem } from './text'

export type SoulSection = 'respond' | 'work' | 'preferences' | 'about'

export const SECTION_TITLES: Record<SoulSection, string> = {
  respond: 'How to respond',
  work: 'How I work',
  preferences: 'Preferences',
  about: 'About me',
}

// Most important first: the order the session brief takes facts in.
export const SECTION_ORDER: SoulSection[] = ['respond', 'work', 'preferences', 'about']

export const SOUL_INTRO = [
  '# Soul',
  '',
  'Facts about me and how I want Claude to work with me. One fact per line, no secrets.',
  'The Self Improve mod keeps this file in step with the Hindsight Soul Bank. Edit it by hand or in /learn (Soul tab).',
]

export type SoulDoc = { intro: string[]; sections: { title: string; lines: string[] }[] }

export type SoulFact = { section: string; text: string }

const BULLET = /^\s*[-*]\s+(.*\S)\s*$/

export function parseSoul(text: string | null): SoulDoc {
  if (text === null || !text.trim()) return { intro: [...SOUL_INTRO], sections: [] }
  const intro: string[] = []
  const sections: SoulDoc['sections'] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) sections.push({ title: h[1]!, lines: [] })
    else if (sections.length) sections[sections.length - 1]!.lines.push(line)
    else intro.push(line)
  }
  while (intro.length && !intro[intro.length - 1]!.trim()) intro.pop()
  for (const s of sections) {
    while (s.lines.length && !s.lines[s.lines.length - 1]!.trim()) s.lines.pop()
    while (s.lines.length && !s.lines[0]!.trim()) s.lines.shift()
  }
  return { intro, sections }
}

export function renderSoul(doc: SoulDoc): string {
  const parts = [doc.intro.join('\n')]
  for (const s of doc.sections) parts.push(`## ${s.title}\n\n${s.lines.join('\n')}`.trimEnd())
  return `${parts.filter(p => p.trim()).join('\n\n')}\n`
}

export function soulFacts(doc: SoulDoc): SoulFact[] {
  const out: SoulFact[] = []
  for (const s of doc.sections) {
    for (const line of s.lines) {
      const m = BULLET.exec(line)
      if (m) out.push({ section: s.title, text: m[1]! })
    }
  }
  return out
}

// A fact as it may be kept: one line, scrubbed, no links, nothing dangerous. '' when it must not be kept.
export function cleanFact(text: string): string {
  let t = stripLinks(clean(text)).replace(/^[-*]\s+/, '')
  // A long fact is cut at its last sentence end within 300 characters, never mid-word.
  if (t.length > 300) {
    const head = t.slice(0, 300)
    const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '))
    t = end > 120 ? head.slice(0, end + 1) : `${head.slice(0, head.lastIndexOf(' '))}...`
  }
  if (!t || hasSecret(text) || textProblem(t) || /\[(secret|token)\]/.test(t)) return ''
  return t
}

export const SOUL_DUPLICATE_AT = 0.6

// Facts compare on their words alone: case, punctuation and slashes do not make a fact new.
const plain = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'when', 'user', 'they', 'them', 'their', 'not', 'are', 'was', 'has', 'have', 'said', 'asks', 'asked', 'should', 'must', 'instead', 'rather', 'than', 'then', 'into', 'any', 'all'])
const keyWords = (t: string): Set<string> => new Set(plain(t).split(' ').filter(w => w.length >= 3 && !STOP.has(w)))

// The same fact said twice: equal words, alike wording, or the shorter one's key words nearly all in the longer.
export function sameFact(a: string, b: string): boolean {
  if (plain(a) === plain(b) || similarity(plain(a), plain(b)) >= SOUL_DUPLICATE_AT) return true
  const x = keyWords(a)
  const y = keyWords(b)
  const small = x.size <= y.size ? x : y
  const big = x.size <= y.size ? y : x
  if (small.size < 4) return false
  let both = 0
  for (const w of small) if (big.has(w)) both++
  return both / small.size >= 0.75
}

export const isKnownFact = (known: readonly string[], text: string): boolean => known.some(k => sameFact(k, text))

// Adds facts under their sections (made when missing), skipping any already there. The document is not changed in place.
export function addFacts(doc: SoulDoc, facts: readonly { section: SoulSection | string; text: string }[]): { doc: SoulDoc; added: SoulFact[] } {
  const next: SoulDoc = { intro: [...doc.intro], sections: doc.sections.map(s => ({ title: s.title, lines: [...s.lines] })) }
  const known = soulFacts(next).map(f => f.text)
  const added: SoulFact[] = []
  for (const f of facts) {
    const text = cleanFact(f.text)
    if (!text || isKnownFact(known, text)) continue
    const title = (SECTION_TITLES as Record<string, string>)[f.section] ?? f.section
    let section = next.sections.find(s => s.title.toLowerCase() === title.toLowerCase())
    if (!section) {
      section = { title, lines: [] }
      // Keep the known sections in their order; others go last.
      const rank = (t: string) => {
        const i = SECTION_ORDER.findIndex(k => SECTION_TITLES[k].toLowerCase() === t.toLowerCase())
        return i < 0 ? 99 : i
      }
      const at = next.sections.findIndex(s => rank(s.title) > rank(title))
      if (at < 0) next.sections.push(section)
      else next.sections.splice(at, 0, section)
    }
    section.lines.push(`- ${text}`)
    known.push(text)
    added.push({ section: section.title, text })
  }
  return { doc: next, added }
}

export function removeFact(doc: SoulDoc, text: string): SoulDoc {
  return {
    intro: [...doc.intro],
    sections: doc.sections.map(s => ({ title: s.title, lines: s.lines.filter(l => BULLET.exec(l)?.[1] !== text) })),
  }
}

export function replaceFact(doc: SoulDoc, before: string, after: string): SoulDoc {
  return {
    intro: [...doc.intro],
    sections: doc.sections.map(s => ({ title: s.title, lines: s.lines.map(l => (BULLET.exec(l)?.[1] === before ? `- ${after}` : l)) })),
  }
}

// The brief a session starts with: facts in priority order (How to respond first), cut at `cap` characters.
export function soulBrief(text: string | null, cap = 1500, head = 'About the user (from soul.md):'): string {
  const doc = parseSoul(text)
  const rank = (t: string) => {
    const i = SECTION_ORDER.findIndex(k => SECTION_TITLES[k].toLowerCase() === t.toLowerCase())
    return i < 0 ? 50 : i
  }
  const sections = [...doc.sections].sort((a, b) => rank(a.title) - rank(b.title))
  const lines: string[] = [head]
  let size = head.length
  for (const s of sections) {
    const facts = s.lines.map(l => BULLET.exec(l)?.[1]).filter((x): x is string => !!x)
    if (!facts.length) continue
    const title = `${s.title}:`
    if (size + title.length + 1 > cap) break
    lines.push(title)
    size += title.length + 1
    for (const f of facts) {
      const line = `- ${f}`
      if (size + line.length + 1 > cap) return lines.length > 2 ? lines.join('\n') : ''
      lines.push(line)
      size += line.length + 1
    }
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

// Which section a fact from elsewhere (the Soul Bank, a memory file) belongs in, from its words.
export function sectionFor(text: string, kind?: string): SoulSection {
  const t = text.toLowerCase()
  if (/\b(respond|response|reply|replies|answer|explain|explanation|summar|tone|format|plain words|plain language|verbose|short|length|report|wording|jargon|emoji)/.test(t)) return 'respond'
  if (/\b(prefer|prefers|likes?|dislikes?|wants?|favou?rite)\b/.test(t) && !/\b(build|test|commit|edit|run|plan|verify|install)\b/.test(t)) return 'preferences'
  if (/\b(build|test|tests|commit|edit|edits|plan|run|verify|install|deploy|workflow|review|stop|ask|branch|release)\b/.test(t)) return 'work'
  if (kind === 'correction') return 'respond'
  if (/\b(i am|i'm|my name|lives?|works? as|job|role|based in)\b/.test(t)) return 'about'
  return kind === 'procedure' || kind === 'convention' ? 'work' : 'preferences'
}

// Sync

export const SOUL_TAG = 'soul-md'

// The tags a pushed soul.md line carries in the bank; anything carrying SOUL_TAG is never pulled back in.
export const soulTags = (fact: SoulFact): string[] => [SOUL_TAG, 'self-improve', `soul-line:${hashText(fact.text)}`, `section:${fact.section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`]

// The file's lines the bank does not hold yet.
export function planPush(doc: SoulDoc, pushed: readonly string[]): SoulFact[] {
  const done = new Set(pushed)
  const seen = new Set<string>()
  return soulFacts(doc).filter(f => {
    const h = hashText(f.text)
    if (done.has(h) || seen.has(h)) return false
    seen.add(h)
    return true
  })
}

export type BankMemory = { id: string; text: string; type: string; tags: readonly string[] }

// A bank memory's text as a soul line: lesson markers and Hindsight's "| Involving ..." tails removed.
export function bankText(text: string): string {
  return text
    .split(' | ')[0]!
    .replace(/^\s*(?:operant\s+)?lesson\s*#?\d+\s*(?:\[[^\]]*\]|\([^)]*\))?\s*[:.-]?\s*/i, '')
    .replace(/^\s*(?:standing rule from the user|user correction|user corrected that|user instructed)\s*(?:\([^)]*\))?\s*[:,-]?\s*/i, '')
    .replace(/\s*\((?:recorded as )?(?:correction )?lesson\s*#?\d+[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NOT_PERSONAL = (tags: readonly string[]) => tags.some(t => t === 'kind:pitfall' || t === 'kind:procedure' || t.startsWith('file:'))

// Bank facts that belong in the file: about the user, never pushed from the file, not seen before, not already a line.
// `seen` gets every memory id looked at, so one removed from the file by hand is not pulled back next time.
export function planPull(memories: readonly BankMemory[], doc: SoulDoc, seen: readonly string[], max = 12): { add: { section: SoulSection; text: string; id: string }[]; seen: string[] } {
  const looked = new Set(seen)
  const known = soulFacts(doc).map(f => f.text)
  const add: { section: SoulSection; text: string; id: string }[] = []
  // Consolidated observations first: Hindsight's own deduplicated form of a fact.
  const ordered = [...memories].sort((a, b) => Number(b.type === 'observation') - Number(a.type === 'observation'))
  for (const m of ordered) {
    if (!m.id || looked.has(m.id)) continue
    if (add.length >= max) break
    looked.add(m.id)
    if (m.tags.includes(SOUL_TAG) || NOT_PERSONAL(m.tags)) continue
    const text = cleanFact(bankText(m.text))
    if (text.length < 12 || isKnownFact(known, text)) continue
    const kind = m.tags.find(t => t.startsWith('kind:'))?.slice(5)
    add.push({ section: sectionFor(text, kind), text, id: m.id })
    known.push(text)
  }
  return { add, seen: [...looked] }
}
