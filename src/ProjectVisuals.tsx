import type { Project } from './data/content'

/** Hive and Relay are kept plain on purpose. Valence has no repository to link, so it gets its two numbers. */

function Valence({ accent }: { accent: string }) {
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
      {[
        ['20+', 'games covered'],
        ['5,000+', 'members'],
      ].map(([n, l]) => (
        <div key={l}>
          <p className="display text-[clamp(3rem,8vw,5rem)]" style={{ color: accent }}>{n}</p>
          <p className="font-mono text-[0.72rem] uppercase tracking-widest text-mute">{l}</p>
        </div>
      ))}
      <p className="mb-2 rounded-full border border-edge px-3 py-1 font-mono text-[0.72rem] uppercase tracking-widest text-mute">Discontinued</p>
    </div>
  )
}

export function ProjectVisual({ p }: { p: Project }) {
  if (p.mark === 'valence') return <Valence accent={p.accent} />
  return null
}
