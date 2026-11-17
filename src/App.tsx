import { useEffect, useRef, useState } from 'react'
import type { ClayScene, ItemId } from './scene/ClayScene'
import { profile, about, supporter, projects, interests, contact } from './data/content'
import { ProjectVisual } from './ProjectVisuals'

const SECTIONS = ['home', 'about', 'projects', 'interests', 'mishka', 'contact'] as const
/* Mishka's section stays on the page (and the scroll story) but is not in the header */
const NAV = SECTIONS.slice(1).filter((s) => s !== 'mishka')
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const panel = 'max-md:bg-ink/70 max-md:p-5'

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-8 sm:mb-12" data-reveal>
      <div className="rule mb-4" />
      <p className="label flex gap-4"><span className="text-mute">{n}</span>{title}</p>
    </div>
  )
}

/** a short letter that types itself out; the full text is always available to screen readers */
function Letter({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { to, body, sign } = supporter.letter
  const full = [to, ...body, sign].join('\n\n')
  const [n, setN] = useState(reducedMotion() ? full.length : 0)

  useEffect(() => {
    ref.current?.showModal()
  }, [])
  useEffect(() => {
    if (n >= full.length) return
    const id = window.setTimeout(() => setN((v) => v + 1), 34)
    return () => window.clearTimeout(id)
  }, [n, full.length])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-label={`A letter for ${supporter.name}`}
      className="m-auto w-[min(92vw,30rem)] rounded-[1.75rem] bg-[#f4eedf] p-0 text-[#2a2620]"
    >
      <div className="p-8 sm:p-10">
        <span className="sr-only">{full}</span>
        <p aria-hidden="true" className="min-h-[13rem] whitespace-pre-wrap font-serif text-xl leading-relaxed">
          {full.slice(0, n)}
          <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-[#b8603a]" />
        </p>
        <button type="button" onClick={() => ref.current?.close()} className="mt-8 rounded-full border border-[#2a2620]/30 px-5 py-2 text-sm transition-colors hover:bg-[#2a2620] hover:text-[#f4eedf]">
          Close
        </button>
      </div>
    </dialog>
  )
}

export default function App() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const scene = useRef<ClayScene | null>(null)
  const station = useRef(0)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const [sceneOk, setSceneOk] = useState(true)
  const [note, setNote] = useState('')
  const [lamp, setLamp] = useState(false)
  const [letter, setLetter] = useState(false)
  const [active, setActive] = useState(0)

  const flashNote = (text: string) => {
    setNote(text)
    const el = noteRef.current
    if (!el) return
    el.getAnimations().forEach((a) => a.cancel())
    el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none', offset: 0.14 },
        { opacity: 1, transform: 'none', offset: 0.76 },
        { opacity: 0, transform: 'none' },
      ],
      { duration: 3600, easing: 'ease-out', fill: 'forwards' },
    )
  }

  /* 3D room: loaded after first paint, so the page is readable before Three.js arrives */
  useEffect(() => {
    const host = sceneRef.current
    if (!host) return
    let cancelled = false
    let s: ClayScene | null = null
    const start = async () => {
      try {
        const { ClayScene } = await import('./scene/ClayScene')
        if (cancelled) return
        s = new ClayScene({
          container: host,
          reduced: reducedMotion(),
          onHover: (id) => {
            document.documentElement.style.cursor = id && id !== 'plant' ? 'pointer' : ''
          },
          onMadrid: () => flashNote('Hala Madrid'),
          onGreet: () => flashNote(supporter.greet),
          onLetter: () => setLetter(true),
          onLamp: setLamp,
          onNote: flashNote,
        })
        scene.current = s
        s.setStation(station.current)
      } catch {
        setSceneOk(false)
      }
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const handle = idle ? idle(start, { timeout: 700 }) : window.setTimeout(start, 60)
    return () => {
      cancelled = true
      if (!idle) window.clearTimeout(handle)
      s?.dispose()
      scene.current = null
      document.documentElement.style.cursor = ''
    }
  }, [])

  /* scroll → camera station + nav state */
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const els = SECTIONS.map((id) => document.getElementById(id)!)
      const mid = window.scrollY + window.innerHeight * 0.5
      let i = 0
      els.forEach((el, n) => {
        if (el.offsetTop <= mid) i = n
      })
      const el = els[i]
      const t = Math.min(1, Math.max(0, (mid - el.offsetTop) / el.offsetHeight))
      const f = i + (i < SECTIONS.length - 1 ? Math.max(0, (t - 0.5) / 0.5) : 0)
      station.current = f
      scene.current?.setStation(f)
      setActive((a) => (a === i ? a : i))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  /* reveals (CSS transitions; content is visible if JS or motion is off) */
  useEffect(() => {
    document.documentElement.classList.add('js')
    const items = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  /* hidden things: type "madrid" or "mishka"; or the old arrow-key code */
  useEffect(() => {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
    let k = 0
    let typed = ''
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,dialog')) return
      k = e.key === konami[k] ? k + 1 : e.key === konami[0] ? 1 : 0
      if (k === konami.length) {
        scene.current?.shake()
        k = 0
      }
      if (e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-6)
        if (typed === 'madrid') scene.current?.madrid()
        if (typed === 'mishka') scene.current?.greet()
        if (typed === 'letter') setLetter(true)
        if (typed === 'madrid' || typed === 'mishka' || typed === 'letter') typed = ''
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const focus = (id: ItemId | null) => scene.current?.focus(id)

  return (
    <>
      <a className="skip-link" href="#about">Skip to content</a>
      <div className="scene-layer" ref={sceneRef} />
      <div className="scrim" aria-hidden="true" />
      <p ref={noteRef} className="pointer-events-none fixed inset-x-0 bottom-8 z-[80] text-center font-mono text-xs uppercase tracking-[0.35em] text-text opacity-0" aria-live="polite">
        {note}
      </p>
      {letter && <Letter onClose={() => setLetter(false)} />}

      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[var(--pad)] py-5 text-sm">
        <a href="#home" aria-label="Danny, back to top" className="font-display text-xl font-bold tracking-tight">Danny</a>
        <nav aria-label="Sections" className="flex gap-3 text-xs text-text/75 sm:gap-7 sm:text-sm">
          {NAV.map((s) => (
            <a key={s} href={`#${s}`} aria-current={active === SECTIONS.indexOf(s) ? 'true' : undefined} className="capitalize transition-colors hover:text-lavender aria-[current=true]:text-lavender">{s}</a>
          ))}
        </nav>
      </header>

      <main>
        {/* HOME: the wordmark sits in front of the room, so it is always readable */}
        <section id="home" className="relative flex min-h-[100svh] flex-col justify-between px-[var(--pad)] pb-[8vh] pt-24">
          <h1 className="layer hero-name pointer-events-none -ml-[0.04em] text-[clamp(6rem,17vw,15rem)]" aria-label={profile.name}>
            <span className="block overflow-hidden px-[0.12em] pb-[0.22em] pt-[0.08em]"><span className="hero-word inline-block">{profile.name}</span></span>
          </h1>
          <div className={`layer mt-4 flex max-w-xl flex-col gap-5 ${panel}`}>
            <p className="text-xl text-text/90 sm:text-2xl">{profile.line}</p>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-mute">16 y/o</p>
          </div>
          {!sceneOk && <p className="layer mt-4 text-mute">3D is off here (WebGL unavailable). Everything else still works.</p>}
        </section>

        {/* ABOUT */}
        <section id="about" className="layer flex min-h-[88svh] items-center px-[var(--pad)] py-[12vh]">
          <div className={`w-full max-w-2xl ${panel}`}>
            <SectionHead n="01" title="About" />
            <p className="font-display mb-8 text-[clamp(1.7rem,3.6vw,2.8rem)] font-semibold leading-[1.08] tracking-tight" data-reveal>{about.lead}</p>
            <div className="mb-10 space-y-4 text-lg text-text/80" data-reveal>
              {about.body.map((p) => <p key={p}>{p}</p>)}
            </div>
            <dl className="grid gap-px sm:grid-cols-3" data-reveal>
              {about.habits.map(([a, b]) => (
                <div key={a} className="border-t border-edge pt-3 pr-4">
                  <dt className="font-mono text-xs uppercase tracking-widest text-lavender">{a}</dt>
                  <dd className="text-text/80">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* PROJECTS */}
        <section id="projects" className="layer px-[var(--pad)] py-[12vh]">
          <SectionHead n="02" title="Projects" />
          <div className="space-y-24">
            {projects.filter((p) => !p.placeholder || import.meta.env.DEV).map((p, i) => (
              <article key={p.id} className={`max-w-2xl space-y-8 border-t-2 pt-6 ${p.placeholder ? 'opacity-50' : ''} ${panel}`} style={{ borderColor: p.accent }} data-reveal>
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-mute">
                    <span style={{ color: p.accent }}>0{i + 1}</span> · {p.kicker}
                  </p>
                  <h3 className="display my-3 text-[clamp(3rem,8vw,6.5rem)]" style={{ color: p.accent }}>{p.title}</h3>
                  <p className="mb-8 max-w-xl text-lg text-text/85">{p.summary}</p>
                  <ProjectVisual p={p} />
                </div>
                <div>
                  <h4 className="label mb-3 !text-mute">What it does</h4>
                  <ul className="mb-6 max-w-xl space-y-2 text-text/85">
                    {p.does.map((d) => (
                      <li key={d} className="flex gap-3"><span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.accent }} />{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="label mb-3 !text-mute">Spec sheet</h4>
                  <dl className="divide-y divide-edge border-y border-edge font-mono text-[0.8rem]">
                    {p.spec.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-4 py-3">
                        <dt className="uppercase tracking-wider text-mute">{k}</dt>
                        <dd className="text-text/90">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.href && <a href={p.href} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm underline decoration-edge underline-offset-4 transition-colors hover:decoration-current" style={{ color: p.accent }}>View on GitHub ↗</a>}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* INTERESTS: hover one and its object steps forward in the room */}
        <section id="interests" className="layer flex min-h-[80svh] items-center px-[var(--pad)] py-[12vh]">
          <div className="w-full max-w-3xl">
            <SectionHead n="03" title="Interests" />
            <ul onMouseLeave={() => focus(null)}>
              {interests.map((it) => (
                <li
                  key={it.id}
                  tabIndex={0}
                  onMouseEnter={() => focus(it.focus)}
                  onFocus={() => focus(it.focus)}
                  onBlur={() => focus(null)}
                  data-reveal
                  className={`group grid grid-cols-1 items-baseline gap-x-8 border-t border-edge py-4 outline-offset-[-2px] sm:grid-cols-[1fr_auto] ${panel}`}
                >
                  <h3 className="font-display text-[clamp(2.4rem,7vw,5rem)] font-bold leading-none tracking-tight transition-all duration-500 group-hover:translate-x-3 group-hover:text-lavender group-focus:translate-x-3 group-focus:text-lavender">{it.name}</h3>
                  <p className="max-w-[16rem] text-mute">{it.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* MISHKA: the room dims, her lamp comes on, her heart glows */}
        <section id="mishka" className="layer flex min-h-[100svh] items-center px-[var(--pad)] py-[12vh] max-md:items-end">
          <div className={`w-full max-w-3xl ${panel}`}>
            <p className="label mb-4 flex gap-4" data-reveal><span className="text-mute">04</span>{supporter.label}</p>
            <h2 className="display mb-8 text-[clamp(4.5rem,15vw,13rem)]" data-reveal>{supporter.name}</h2>
            <p className="mb-3 max-w-md text-xl text-text/90" data-reveal>{supporter.note}</p>
            <p className="mb-8 max-w-md text-text/85" data-reveal>{supporter.hint}</p>
            <div className="flex flex-wrap items-center gap-3" data-reveal>
              <button
                type="button"
                aria-pressed={lamp}
                onClick={() => scene.current?.toggleLamp()}
                className="rounded-full border border-edge px-6 py-3 text-sm text-text/85 transition-colors hover:border-lavender hover:text-lavender aria-pressed:border-lavender aria-pressed:text-lavender"
              >
                {lamp ? supporter.lampOff : supporter.lampOn}
              </button>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="layer flex min-h-[80svh] flex-col justify-end px-[var(--pad)] pb-14 pt-[12vh]">
          <div className={`max-w-2xl ${panel}`}>
            <SectionHead n="05" title="Contact" />
            <p className="display mb-8 text-[clamp(3.2rem,10vw,8rem)]" data-reveal>{contact.heading}</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(profile.discord).then(() => flashNote('Copied.'), () => flashNote(profile.discord))
              }}
              aria-label={`Discord ${profile.discord}. Copy to clipboard`}
              className="group mb-8 block text-left text-2xl text-lavender underline decoration-edge underline-offset-8 transition-colors hover:decoration-lavender sm:text-3xl"
              data-reveal
            >
              <span className="mb-1 block font-mono text-[0.7rem] uppercase tracking-[0.25em] text-mute no-underline">Discord · tap to copy</span>
              {profile.discord}
            </button>
            <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm" data-reveal>
              {profile.links.map((l) => (
                <li key={l.label}><a href={l.href} target="_blank" rel="noreferrer" className="text-text/85 transition-colors hover:text-lavender">{l.label} ↗</a></li>
              ))}
            </ul>
          </div>
          <p className="mt-12 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-mute">Built by Danny. Supported by {supporter.name}.</p>
        </section>
      </main>
    </>
  )
}
