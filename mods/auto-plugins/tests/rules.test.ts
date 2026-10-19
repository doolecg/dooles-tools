import { describe, expect, test } from 'claude-code/testing'

import { PROJECT_FILES, RULES, enabledIn, installedIn, pluginsToEnable } from '../hooks/rules'

const ALL = new Set(RULES.flatMap(r => r.plugins))
const GAME = ['router@awesome-gamedev-agent-skills', 'disciplines@awesome-gamedev-agent-skills']
const GODOT = ['godot@awesome-gamedev-agent-skills', ...GAME]
const UNITY = ['unity@awesome-gamedev-agent-skills', ...GAME]
const EXPO = ['expo@expo-plugins']
const MC = ['minecraft-modding@dooles-skills', 'minecraft-multiloader@dooles-skills', 'minecraft-mod-dev@dooles-skills']
const DOCS = ['media-and-docs@dooles-skills']

const fromPrompt = (prompt: string, enabled: Record<string, unknown> = {}, installed: ReadonlySet<string> = ALL) => pluginsToEnable({ prompt }, enabled, installed)
const fromFiles = (files: Record<string, string>, enabled: Record<string, unknown> = {}) => pluginsToEnable({ files }, enabled, ALL)

describe('nothing to do', () => {
  test('an unrelated prompt wants nothing', () => {
    expect(fromPrompt('fix the login bug in the api and add a test')).toEqual([])
    expect(fromPrompt('that was excellent, a community effort')).toEqual([])
  })

  test('an empty or ordinary project wants nothing', () => {
    expect(fromFiles({})).toEqual([])
    expect(fromFiles({ 'package.json': '{"name":"web","dependencies":{"react":"18"}}' })).toEqual([])
    expect(fromFiles({ 'build.gradle': 'plugins { id "java" }' })).toEqual([])
  })

  test('a prompt does not fire file rules and files do not fire prompt rules', () => {
    expect(pluginsToEnable({ prompt: 'hello' }, {}, ALL)).toEqual([])
    expect(fromFiles({ 'notes.txt': 'godot excel minecraft' })).toEqual([])
  })

  test('already enabled plugins are left alone', () => {
    const on = Object.fromEntries(GODOT.map(p => [p, true]))
    expect(fromPrompt('make a godot scene', on)).toEqual([])
    expect(fromFiles({ 'project.godot': '' }, on)).toEqual([])
  })

  test('only installed plugins are switched on', () => {
    expect(fromPrompt('make a godot scene', {}, new Set())).toEqual([])
    expect(fromPrompt('make a godot scene', {}, new Set(['godot@awesome-gamedev-agent-skills']))).toEqual(['godot@awesome-gamedev-agent-skills'])
  })

  test('a plugin set to false in settings.local.json is switched on', () => {
    expect(fromPrompt('convert this .docx', { 'media-and-docs@dooles-skills': false })).toEqual(DOCS)
  })
})

describe('project files', () => {
  test('project.godot means Godot', () => {
    expect(fromFiles({ 'project.godot': 'config_version=5' })).toEqual(GODOT)
  })

  test('a Unity ProjectVersion.txt means Unity, also under sdk/', () => {
    expect(fromFiles({ 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 6000.0' })).toEqual(UNITY)
    expect(fromFiles({ 'sdk/ProjectSettings/ProjectVersion.txt': '' })).toEqual(UNITY)
  })

  test('an "expo" key in package.json or app.json means Expo', () => {
    expect(fromFiles({ 'package.json': '{"dependencies": {"expo": "~52.0.0"}}' })).toEqual(EXPO)
    expect(fromFiles({ 'app.json': '{ "expo" : { "name": "app" } }' })).toEqual(EXPO)
  })

  test('a Fabric, NeoForge or Forge gradle build means Minecraft modding', () => {
    expect(fromFiles({ 'build.gradle': 'plugins { id "fabric-loom" }' })).toEqual(MC)
    expect(fromFiles({ 'build.gradle.kts': 'id("net.neoforged.moddev")\nneoforge {}' })).toEqual(MC)
    expect(fromFiles({ 'settings.gradle.kts': 'maven("https://maven.minecraftforge.net")' })).toEqual(MC)
    expect(fromFiles({ 'settings.gradle': 'implementation "net.minecraft:minecraft"' })).toEqual(MC)
  })

  test('every file a rule reads is in PROJECT_FILES', () => {
    for (const f of ['project.godot', 'ProjectSettings/ProjectVersion.txt', 'sdk/ProjectSettings/ProjectVersion.txt', 'package.json', 'app.json', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'])
      expect(PROJECT_FILES).toContain(f)
  })
})

describe('prompts', () => {
  test('Godot words', () => {
    for (const p of ['set up a Godot project', 'write some GDScript', 'open main.tscn', 'fix player.gd']) expect(fromPrompt(p)).toEqual(GODOT)
  })

  test('Unity words', () => {
    for (const p of ['a Unity build', 'make a ScriptableObject', 'this MonoBehaviour', 'MonoBehavior typo', 'edit Main.unity', 'the Enemy.prefab']) expect(fromPrompt(p)).toEqual(UNITY)
  })

  test('game dev words alone want the router and disciplines', () => {
    for (const p of ['some gamedev help', 'game design doc', 'tune the gameplay', 'game UI pass', 'draw sprites', 'a tilemap', 'the HUD', 'pixel art', 'level design', 'procedural generation', 'game feel', 'a water shader'])
      expect(fromPrompt(p)).toEqual(GAME)
  })

  test('Expo words', () => {
    for (const p of ['an expo app', 'React Native screen', 'react-native list', 'run eas build', 'eas update now', 'eas submit', 'expo router tabs']) expect(fromPrompt(p)).toEqual(EXPO)
  })

  test('Minecraft words', () => {
    for (const p of ['a minecraft mod', 'port to fabric', 'neoforge events', 'my forge mod', 'write a mixin']) expect(fromPrompt(p)).toEqual(MC)
  })

  test('media and docs words', () => {
    for (const p of ['read report.docx', 'data.xlsx', 'this .pdf', 'slides.pptx', 'a word doc', 'a spreadsheet', 'in Excel', 'a PowerPoint']) expect(fromPrompt(p)).toEqual(DOCS)
  })

  test('two rules together give each plugin once', () => {
    expect(fromPrompt('godot shader and a sprite sheet').sort()).toEqual([...GODOT].sort())
    expect(fromPrompt('a godot game, then export stats to excel')).toEqual([...GODOT, ...DOCS])
  })
})

describe('reading the json files', () => {
  test('enabledPlugins from settings.local.json', () => {
    expect(enabledIn('{"enabledPlugins":{"a@b":true}}')).toEqual({ 'a@b': true })
    expect(enabledIn('{"permissions":{}}')).toEqual({})
    expect(enabledIn('not json')).toEqual({})
    expect(enabledIn(null)).toEqual({})
  })

  test('installed plugin ids from installed_plugins.json', () => {
    expect([...installedIn('{"version":2,"plugins":{"a@b":[{"scope":"user"}],"c@d":[]}}')]).toEqual(['a@b', 'c@d'])
    expect(installedIn('{}').size).toBe(0)
    expect(installedIn(null).size).toBe(0)
  })
})
