/**
 * ALL EDITABLE COPY LIVES HERE.
 * Facts I was given: Danny; interests in technology, programming, design and football;
 * Real Madrid supporter; Mishka is his girlfriend and #1 supporter.
 * Everything else is draft wording in Danny's voice: change anything that doesn't sound like him.
 * Contact: Discord @bigboy.danny and GitHub. Projects: Hive, Relay (from their READMEs) and Valence (Danny's own words).
 */
import type { ItemId } from '../scene/ClayScene'

export const profile = {
  name: 'Danny',
  line: '#1 Vibecoder',
  discord: '@bigboy.danny',
  links: [{ label: 'GitHub', href: 'https://github.com/verybigboydanny' }],
}

export const about = {
  lead: 'Most of what I make starts as a small question, usually “how does that work?” or “why does that feel wrong?”, and gets out of hand from there.',
  body: [
    'I like the whole depth of a problem: the logic underneath, the interface on top, and the awkward bit in the middle that nobody wants to own.',
    'I’m ambitious in a quiet way. I’d rather finish something properly than announce it early.',
  ],
  habits: [
    ['Ship it small', 'then fix what embarrasses me.'],
    ['Details', 'are most of the product.'],
    ['Ask why', 'twice, politely.'],
  ],
}

export const supporter = {
  label: 'My #1 supporter',
  name: 'Mishka',
  note: 'I love you.',
  hint: 'Her letter is hidden somewhere in this room.',
  lampOn: 'Light her lamp',
  lampOff: 'Lamp off',
  greet: 'HIII PRINCESSS',
  // TODO(Danny): this is a draft with no made-up stories in it. Rewrite it in your own words.
  letter: {
    to: 'Mishka,',
    body: ['I LOVE YOU SOOSOSOSOS MUCH MY DARLINGGG BABYY YOURE MY ENTIRE WORLD I CANT LIVE WITHOUT YOU MWAHH.'],
    sign: '— Danny',
  },
}

export type Project = {
  id: string
  title: string
  kicker: string
  summary: string
  does: string[]
  spec: [string, string][]
  href?: string
  mark: 'hive' | 'relay' | 'valence'
  accent: string
  placeholder?: boolean
}

export const projects: Project[] = [
  {
    id: 'hive',
    title: 'Hive',
    kicker: 'macOS app · AI agent workspace',
    summary:
      'A native macOS workspace for coordinating several AI agents on one shared project. Tasks, files and handoffs live in one place, so agents running in different apps can work on the same thing without treading on each other. Hive does not run or proxy any model. This portfolio was built inside it.',
    does: [
      'Gives each agent an identity, a task list, an inbox and handoffs, through a local MCP server.',
      'Sets itself up in your AI apps in one click, then generates the onboarding instruction for each agent.',
      'Keeps each project’s data in a .hive folder inside it, and leaves that out of git status.',
      'Only coordinates. It never runs or proxies a model.',
    ],
    spec: [
      ['App', 'SwiftUI, Swift 6, macOS 15 or later'],
      ['Backend', 'Python 3.11+, standard library only'],
      ['Protocol', 'MCP server over stdio (mcp ≥ 1.2, < 2)'],
      ['Storage', 'Per-project .hive/ folder; ids and folder paths in ~/.hive/projects.json'],
      ['Also', 'A static product site, in the same repository'],
    ],
    href: 'https://github.com/verybigboydanny/Hive',
    mark: 'hive',
    accent: '#f2b84b',
  },
  {
    id: 'relay',
    title: 'Relay',
    kicker: 'Discord bot · desktop app',
    summary:
      'A Discord bot that manages a server from plain-English requests. You say what you want, like “make a private channel for moderators”, and a model plans the steps. Ordinary Python code then decides what is actually allowed.',
    does: [
      'Turns a request into steps chosen from a fixed list of tools. Groq does the planning.',
      'Validates every argument, matches it against the real server and authorises it in code before anything runs.',
      'Asks you to confirm anything risky, runs the steps in order and writes each one to an audit log.',
      'Runs as a small desktop control panel with chat, logs and settings, or headless with python main.py.',
    ],
    spec: [
      ['Language', 'Python 3.11+'],
      ['Discord', 'discord.py 2.7'],
      ['Model', 'Groq plans; it never talks to Discord directly'],
      ['Validation', 'Pydantic'],
      ['Storage', 'libSQL client'],
      ['Desktop', 'pywebview control panel, with launchers for macOS and Windows'],
      ['Tests', 'Included in the repository'],
    ],
    href: 'https://github.com/verybigboydanny/Relay',
    mark: 'relay',
    accent: '#7c8cff',
  },
  {
    id: 'valence',
    title: 'Valence',
    kicker: 'Roblox script hub · discontinued',
    summary: 'A script hub for Roblox that covered more than 20 games and passed 5,000 members before it was discontinued.',
    does: ['Brought scripts for more than 20 different Roblox games into one hub.', 'Built a community of more than 5,000 members.'],
    spec: [
      ['Platform', 'Roblox'],
      ['Games', '20+'],
      ['Members', '5,000+'],
      ['Status', 'Discontinued'],
    ],
    mark: 'valence',
    accent: '#8a8f9c',
  },
]

export const interests: { id: string; name: string; line: string; focus: ItemId }[] = [
  { id: 'tech', name: 'Technology', line: 'Anything with a changelog.', focus: 'mac' },
  { id: 'code', name: 'Programming', line: 'The part where a vague idea has to run for real.', focus: 'mac' },
  { id: 'design', name: 'Design', line: 'Type, spacing, and deciding what to leave out.', focus: 'stylus' },
  { id: 'football', name: 'Football', line: 'Real Madrid supporter.', focus: 'ball' },
]

export const contact = {
  heading: 'Say hello.',
}
