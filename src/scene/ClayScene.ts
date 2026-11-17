import * as THREE from 'three'
import gsap from 'gsap'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Danny's room, built from clay primitives.
 *   mac      → programming / tech (and the Projects section)
 *   stylus   → design
 *   ball     → football, kept quiet in the corner
 *   heart, lamp, envelope → Mishka: a heart floating in the room, a lamp that lights in her section, a letter
 */
export type ItemId = 'mac' | 'ball' | 'lamp' | 'dchair' | 'envelope' | 'stylus' | 'plant' | 'shelf' | 'door' | 'clock' | 'breeze' | 'desklamp' | 'heart'
export type HoverKind = ItemId | null

export interface SceneOptions {
  container: HTMLElement
  reduced: boolean
  onHover?: (kind: HoverKind) => void
  onMadrid?: () => void
  onGreet?: () => void
  onLetter?: () => void
  onLamp?: (on: boolean) => void
  onNote?: (text: string) => void
}

type V3 = [number, number, number]
interface Station {
  pos: V3
  look: V3
}

/* hero, about, projects, interests, mishka, contact. Look targets sit left of the subjects so they land right of the text. */
const STATIONS: Station[] = [
  { pos: [3.4, 4.8, 17.5], look: [0.2, 1.9, -1.5] },
  { pos: [-7.5, 4.2, 8.5], look: [-1.8, 2.3, -2] },
  { pos: [4.2, 4.1, 3.6], look: [1.0, 2.9, -3] },
  { pos: [5.5, 5.2, 11], look: [0.2, 2.0, -1] },
  { pos: [-1.6, 3.7, 6.2], look: [-2.6, 2.5, -2.4] },
  { pos: [0, 4.9, 17], look: [-2, 2, -1] },
]
const MISHKA_STATION = 4

const C = { wall: 0xe0d1b4, white: 0xf1ede4, cream: 0xf1ead9, black: 0x17181a, charcoal: 0x383b40, alu: 0xc9ccd0, walnut: 0x74482a, oakLight: 0xb58a5e, mustard: 0xdca43a, red: 0xa8352c, navy: 0x253f73, green: 0x3f7d46, leaf: 0x5a9a4a, terracotta: 0xb8603a, madrid: 0xf4f2ee }
const KEY = 0.15
const HEMI = 0.07
const RIM = 0.2
const WINDOW = 4

function seeded(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

const TERMS: string[][] = [
  ['$ npm run dev', 'ready in 69 ms', '> hi, I am Danny'],
  ['$ git commit -m "fixed it"', '$ git commit -m "fixed it,', '  properly this time"'],
  ['$ npm test', 'no tests found', 'looks fine to me'],
  ['$ whoami', 'danny', '$ git push'],
]

class Terminal {
  readonly canvas = document.createElement('canvas')
  readonly tex: THREE.CanvasTexture
  private idx = 0
  private lines = TERMS[0]
  private total = 0
  private shown = 0
  private lastType = 0
  private caret = true
  constructor(private instant: boolean) {
    this.canvas.width = 512
    this.canvas.height = 320
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 4
    this.set(0)
  }
  set(i: number) {
    this.idx = i % TERMS.length
    this.lines = TERMS[this.idx]
    this.total = this.lines.join('').length
    this.shown = this.instant ? this.total : 0
    this.draw()
  }
  next() {
    this.set(this.idx + 1)
  }
  /** returns true when the texture changed */
  update(now: number) {
    let dirty = false
    if (this.shown < this.total && now - this.lastType > 42) {
      this.shown += 1
      this.lastType = now
      dirty = true
    }
    const caret = this.instant ? true : Math.floor(now / 520) % 2 === 0
    if (caret !== this.caret) {
      this.caret = caret
      dirty = true
    }
    if (dirty) this.draw()
    return dirty
  }
  private draw() {
    const g = this.canvas.getContext('2d')!
    g.fillStyle = '#0d0f12'
    g.fillRect(0, 0, 512, 320)
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      g.fillStyle = c
      g.beginPath()
      g.arc(28 + i * 24, 28, 6.5, 0, Math.PI * 2)
      g.fill()
    })
    g.font = '600 22px ui-monospace, Menlo, "JetBrains Mono", monospace'
    let left = this.shown
    let cx = 28
    let cy = 88
    this.lines.forEach((line, i) => {
      const part = line.slice(0, Math.max(0, left))
      left -= line.length
      g.fillStyle = line.startsWith('$') ? '#7ee787' : line.startsWith('>') ? '#ffffff' : '#8b949e'
      g.fillText(part, 28, 88 + i * 42)
      if (part.length > 0 || i === 0) {
        cx = 28 + g.measureText(part).width
        cy = 88 + i * 42
      }
    })
    if (this.caret) {
      g.fillStyle = '#7ee787'
      g.fillRect(cx + 3, cy - 20, 12, 25)
    }
    this.tex.needsUpdate = true
  }
  dispose() {
    this.tex.dispose()
  }
}

interface Item {
  id: ItemId
  obj: THREE.Group
  base: THREE.Vector3
  hop: { v: number }
  hover: number
  focus: number
  popAt: number
}

const IGNORE = 'a,button,input,textarea,p,h2,h3,li,aside,nav,header,dialog,[data-nopick]'

export class ClayScene {
  readonly renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
  private opts: SceneOptions
  private ro: ResizeObserver
  private items: Item[] = []
  private byId = new Map<ItemId, Item>()
  private mats = new Map<number, THREE.MeshPhysicalMaterial>()
  private key!: THREE.DirectionalLight
  private rim!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private windowLight!: THREE.PointLight
  private lampLight!: THREE.PointLight
  private lampShade!: THREE.MeshPhysicalMaterial
  private lampBulb!: THREE.MeshBasicMaterial
  private warm: { l: THREE.PointLight; base: number }[] = []
  private deskShade!: THREE.MeshPhysicalMaterial
  private deskLight!: THREE.PointLight
  private deskOn = true
  private deskLevel = 1
  private candle!: THREE.PointLight
  private heartMesh!: THREE.Mesh
  private heartMat!: THREE.MeshPhysicalMaterial
  private heartLight!: THREE.PointLight
  private heartBeat = { v: 0 }
  private candlePulse = { v: 0 }
  private dog!: THREE.Group
  private lid!: THREE.Group
  private plant!: THREE.Group
  private pr = 1
  private ema = 0.0167
  private wasMoving = false
  private lastAdapt = 0
  private leaner?: THREE.Mesh
  private hHour!: THREE.Group
  private hMin!: THREE.Group
  private hSec!: THREE.Group
  private clockSpin = { v: 0 }
  private doorOpen = false
  private term: Terminal
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2(2, 2)
  private pointer = new THREE.Vector2()
  private pointerSmooth = new THREE.Vector2()
  private pointerMoved = false
  private allow = true
  private hovered: Item | null = null
  private focusId: ItemId | null = null
  private stationTarget = 0
  private stationNow = 0
  private portrait = false
  private ballClicks = 0
  private lampOn = true
  private lampLevel = 1
  private pulse = { v: 0 }
  private flash = { v: 0 }
  private nextIdle = 10
  private last = performance.now()
  private lastRender = 0
  private start = performance.now()
  private activeUntil = 0
  private disposed = false
  private camOverride?: { pos: V3; look: V3 }
  private pmrem?: THREE.PMREMGenerator
  private envBase = 0.02
  private a = new THREE.Vector3()
  private b = new THREE.Vector3()
  private look = new THREE.Vector3()

  constructor(opts: SceneOptions) {
    this.opts = opts
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: true, powerPreference: 'high-performance' })
    this.pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5)
    this.renderer.setPixelRatio(this.pr)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    opts.container.appendChild(this.renderer.domElement)

    this.term = new Terminal(opts.reduced)
    this.buildLight()
    this.buildRoom()
    this.buildFurniture()
    this.buildProps()
    this.items.forEach((it) => it.obj.traverse((o) => (o.userData.item = it)))

    this.optimise()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(opts.container)
    this.resize()

    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('click', this.onClick)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.opts.onLamp?.(this.lampOn)
    this.wake(3500)
    this.renderer.setAnimationLoop(this.tick)
    if (import.meta.env.DEV) (window as unknown as { __room?: ClayScene }).__room = this
  }

  /* ───────── public ───────── */

  setStation(f: number) {
    this.stationTarget = Math.max(0, Math.min(STATIONS.length - 1, f))
  }

  focus(id: ItemId | null) {
    this.focusId = id
    this.wake(900)
  }

  toggleLamp() {
    this.lampOn = !this.lampOn
    this.opts.onLamp?.(this.lampOn)
    this.wake(1500)
  }

  setWireframe(on: boolean) {
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!mat || o.userData.room) return
      ;(Array.isArray(mat) ? mat : [mat]).forEach((m) => {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = on
      })
    })
    this.wake(300)
  }

  /** one thing goes Madrid-white */
  madrid() {
    this.opts.onMadrid?.()
    if (this.opts.reduced) return
    this.wake(5000)
    const white = new THREE.Color(C.madrid)
    const warm = new THREE.Color(0xffb877)
    gsap
      .timeline()
      .to(this.key.color, { r: white.r, g: white.g, b: white.b, duration: 0.4 })
      .to(this.flash, { v: 1, duration: 0.4 }, 0)
      .to(this.key.color, { r: warm.r, g: warm.g, b: warm.b, duration: 2.2, ease: 'power2.inOut' }, 1.6)
      .to(this.flash, { v: 0, duration: 2.2, ease: 'power2.inOut' }, 1.6)
  }

  /** the lamp flares, her heart beats and the letter hops for whoever typed her name */
  greet() {
    this.opts.onGreet?.()
    if (this.opts.reduced) return
    this.wake(3500)
    gsap.fromTo(this.pulse, { v: 0 }, { v: 1, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: 1 })
    this.beat()
    const e = this.byId.get('envelope')
    if (e) this.nudge(e)
  }

  private beat() {
    gsap.fromTo(this.heartBeat, { v: 0 }, { v: 1, duration: 0.32, ease: 'sine.inOut', yoyo: true, repeat: 3, overwrite: true })
  }

  /** shake the room: everything small jumps */
  shake() {
    this.items.forEach((it) => it.id !== 'lamp' && this.nudge(it))
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('click', this.onClick)
    document.removeEventListener('visibilitychange', this.onVisibility)
    gsap.killTweensOf([this.flash, this.pulse, this.key.color, this.candlePulse])
    this.items.forEach((it) => gsap.killTweensOf([it.hop, it.obj.rotation, it.obj.scale]))
    gsap.killTweensOf(this.lid.rotation)
    gsap.killTweensOf(this.plant.rotation)
    gsap.killTweensOf(this.clockSpin)
    this.term.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      ;(Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        ;(x as THREE.MeshStandardMaterial).map?.dispose()
        x.dispose()
      })
    })
    this.scene.environment?.dispose()
    this.pmrem?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /** after the room is built: stop re-computing matrices for things that never move, and stop tiny pieces casting shadows */
  private optimise() {
    const moving: THREE.Object3D[] = [this.dog, this.heartMesh, this.lid, this.plant, this.hHour, this.hMin, this.hSec, ...this.items.map((i) => i.obj)]
    if (this.leaner) moving.push(this.leaner)
    const box = new THREE.Box3()
    const sphere = new THREE.Sphere()
    this.scene.updateMatrixWorld(true)
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.castShadow && m.geometry) {
        box.setFromObject(m)
        box.getBoundingSphere(sphere)
        if (sphere.radius < 0.12) m.castShadow = false
      }
    })
    const still: THREE.Object3D[] = []
    this.scene.children.forEach((c) => {
      if ((c as THREE.Light).isLight) return
      if (moving.some((t) => t && (t === c || c.getObjectById(t.id)))) return
      c.traverse((o) => {
        o.matrixAutoUpdate = false
      })
      still.push(c)
    })
    this.mergeStatic(still)
  }

  /** everything that never moves and shares a material becomes one mesh: far fewer draw calls, in the shadow pass too */
  private mergeStatic(roots: THREE.Object3D[]) {
    const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>()
    roots.forEach((root) =>
      root.traverseVisible((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || !m.geometry) return
        const g = m.geometry
        if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return
        if (m.matrixWorld.determinant() <= 0) return
        let hidden = false
        for (let p: THREE.Object3D | null = m.parent; p; p = p.parent) if (!p.visible) hidden = true
        if (hidden) return
        const mat = m.material as THREE.Material
        const key = [mat.uuid, g.index ? 'i' : 'n', m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0, m.userData.room ? 1 : 0].join('|')
        const e = groups.get(key)
        if (e) e.meshes.push(m)
        else groups.set(key, { mat, meshes: [m] })
      }),
    )
    groups.forEach(({ mat, meshes }) => {
      if (meshes.length < 2) return
      const parts = meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld))
      const merged = mergeGeometries(parts, false)
      parts.forEach((g) => g.dispose())
      if (!merged) return
      const first = meshes[0]
      const out = new THREE.Mesh(merged, mat)
      out.castShadow = first.castShadow
      out.receiveShadow = first.receiveShadow
      out.userData.room = first.userData.room
      out.matrixAutoUpdate = false
      this.scene.add(out)
      meshes.forEach((m) => {
        m.parent?.remove(m)
        m.geometry.dispose()
      })
    })
  }

  private applyPixelRatio(pr: number) {
    this.pr = pr
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(this.opts.container.clientWidth || window.innerWidth, this.opts.container.clientHeight || window.innerHeight, false)
  }

  /** dev only: where an item sits on screen, so tests can aim at it */
  debugScreen(id: ItemId): [number, number] | null {
    const it = this.byId.get(id)
    if (!it) return null
    const c = new THREE.Box3().setFromObject(it.obj).getCenter(new THREE.Vector3())
    c.project(this.camera)
    return [Math.round((c.x * 0.5 + 0.5) * window.innerWidth), Math.round((-c.y * 0.5 + 0.5) * window.innerHeight)]
  }

  /** dev only: park the camera somewhere, so a screenshot can inspect one object */
  debugView(pos: V3 | null, look?: V3) {
    this.camOverride = pos && look ? { pos, look } : undefined
    this.wake(800)
  }

  /* ───────── helpers ───────── */

  private wake(ms: number) {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms)
  }

  private clay(color: number, rough = 0.6) {
    const key = color * 10 + Math.round(rough * 10)
    let m = this.mats.get(key)
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen: 0.3, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) })
      this.mats.set(key, m)
    }
    return m
  }

  private add<T extends THREE.Mesh>(m: T, parent: THREE.Object3D, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], shadow = true) {
    m.position.set(...pos)
    m.rotation.set(...rot)
    m.castShadow = shadow
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  private box(w: number, h: number, d: number, r: number, mat: THREE.Material, parent: THREE.Object3D, pos?: V3, rot?: V3) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
    return this.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, rr), mat), parent, pos, rot)
  }

  private cyl(rt: number, rb: number, h: number, mat: THREE.Material, parent: THREE.Object3D, pos?: V3, rot?: V3, seg = 20) {
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), parent, pos, rot)
  }

  private tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    const paint = () => {
      draw(c.getContext('2d')!)
      t.needsUpdate = true
    }
    paint()
    document.fonts?.ready.then(() => !this.disposed && paint())
    return t
  }

  private register(id: ItemId, obj: THREE.Group, pos: V3) {
    obj.position.set(...pos)
    this.scene.add(obj)
    const it: Item = { id, obj, base: new THREE.Vector3(...pos), hop: { v: 0 }, hover: 0, focus: 0, popAt: 0.15 + this.items.length * 0.09 }
    this.items.push(it)
    this.byId.set(id, it)
    return it
  }

  /* ───────── build ───────── */

  private buildLight() {
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.setEnv(this.envBase)

    this.hemi = new THREE.HemisphereLight(0xffe2bf, 0x6b4a30, HEMI)
    this.scene.add(this.hemi)

    this.key = new THREE.DirectionalLight(0xffb877, KEY)
    this.key.position.set(-6, 12, 8)
    this.key.castShadow = true
    const lowPower = window.matchMedia('(pointer: coarse)').matches
    this.key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024)
    this.key.shadow.radius = 4
    this.key.shadow.bias = -0.0005
    const s = this.key.shadow.camera
    s.left = -15
    s.right = 15
    s.top = 11
    s.bottom = -11
    s.far = 40
    this.scene.add(this.key)

    /* cool moonlight from behind */
    this.rim = new THREE.DirectionalLight(0xc3ccff, RIM)
    this.rim.position.set(8, 6, -9)
    this.scene.add(this.rim)

    this.windowLight = new THREE.PointLight(0x8fa8ff, WINDOW, 16, 1.5)
    this.windowLight.position.set(-3.8, 4.8, -3.4)
    this.scene.add(this.windowLight)
  }

  private setEnv(v: number) {
    ;(this.scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = v
  }

  private buildRoom() {
    const wall = new THREE.MeshStandardMaterial({ color: C.wall, roughness: 1 })
    const plank = this.tex(1024, 1024, (g) => {
      const r = seeded(7)
      const tones = ['#a67852', '#9a6d47', '#b0825a', '#a37549', '#ab7d55']
      for (let i = 0; i < 8; i++) {
        let y = 0
        while (y < 1024) {
          const len = 220 + r() * 420
          g.fillStyle = tones[Math.floor(r() * tones.length)]
          g.fillRect(i * 128, y, 128, Math.min(len, 1024 - y))
          g.fillStyle = 'rgba(60,35,15,0.55)'
          g.fillRect(i * 128, y, 128, 3)
          y += len
        }
        g.fillStyle = 'rgba(60,35,15,0.5)'
        g.fillRect(i * 128, 0, 3, 1024)
        for (let k = 0; k < 7; k++) {
          g.fillStyle = `rgba(70,40,18,${0.05 + r() * 0.07})`
          g.fillRect(i * 128 + 10 + r() * 100, 0, 1 + r() * 2, 1024)
        }
      }
    })
    plank.wrapS = plank.wrapT = THREE.RepeatWrapping
    plank.repeat.set(8, 7)
    const floorMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.78 })
    const plane = (w: number, h: number, mat: THREE.Material, pos: V3, rot: V3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      m.position.set(...pos)
      m.rotation.set(...rot)
      m.receiveShadow = true
      m.userData.room = true
      this.scene.add(m)
      return m
    }
    plane(44, 36, floorMat, [0, 0, 8], [-Math.PI / 2, 0, 0])
    const backTex = this.tex(2048, 512, (g) => {
      g.fillStyle = '#e8dac0'
      g.fillRect(0, 0, 2048, 512)
      g.fillStyle = '#b87850'
      g.fillRect(0, 326, 2048, 186)
      g.fillStyle = '#6e4a31'
      g.fillRect(0, 320, 2048, 9)
      g.fillStyle = 'rgba(255,235,200,0.35)'
      g.fillRect(0, 316, 2048, 4)
      g.fillStyle = 'rgba(70,35,18,0.28)'
      for (let x = 70; x < 2048; x += 140) g.fillRect(x, 336, 3, 160)
    })
    plane(44, 11, new THREE.MeshStandardMaterial({ map: backTex, roughness: 1 }), [0, 5.5, -5.2], [0, 0, 0])
    plane(36, 11, wall, [-15, 5.5, 8], [0, Math.PI / 2, 0])
    plane(36, 11, wall, [15, 5.5, 8], [0, -Math.PI / 2, 0])
    const base = this.box(44, 0.5, 0.14, 0.04, this.clay(C.white, 0.7), this.scene, [0, 0.25, -5.13])
    base.userData.room = true

    /* the window: it is night, there is a moon and a few stars */
    const frameMat = this.clay(C.white, 0.7)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.2), new THREE.MeshBasicMaterial({ color: 0x0d1830, toneMapped: false }))
    glass.position.set(-3.8, 4.8, -5.15)
    glass.userData.room = true
    this.scene.add(glass)
    const star = new THREE.MeshBasicMaterial({ color: 0xf4f1e6, toneMapped: false })
    const rs = seeded(21)
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(new THREE.CircleGeometry(0.025 + rs() * 0.03, 8), star)
      st.position.set(-3.8 + (rs() - 0.5) * 3.2, 4.8 + (rs() - 0.5) * 2.8, -5.14)
      st.userData.room = true
      this.scene.add(st)
    }
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ color: 0xf6f1df, toneMapped: false }))
    moon.position.set(-3.0, 5.5, -5.14)
    moon.userData.room = true
    this.scene.add(moon)
    const win = new THREE.Group()
    this.box(3.9, 0.16, 0.24, 0.05, frameMat, win, [0, 1.68, 0])
    this.box(3.9, 0.16, 0.24, 0.05, frameMat, win, [0, -1.68, 0])
    this.box(0.16, 3.5, 0.24, 0.05, frameMat, win, [-1.88, 0, 0])
    this.box(0.16, 3.5, 0.24, 0.05, frameMat, win, [1.88, 0, 0])
    this.box(0.1, 3.4, 0.14, 0.04, frameMat, win, [0, 0, 0])
    this.box(3.7, 0.1, 0.14, 0.04, frameMat, win, [0, 0.1, 0])
    this.box(4.4, 0.18, 0.5, 0.06, frameMat, win, [0, -1.85, 0.2])
    win.position.set(-3.8, 4.8, -5.05)
    win.traverse((o) => (o.userData.room = true))
    this.scene.add(win)

    /* a framed print */
    const poster = new THREE.Group()
    this.box(2.4, 3.2, 0.1, 0.03, this.clay(C.black, 0.6), poster)
    const flat = (color: number, geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
      m.position.set(x, y, z)
      poster.add(m)
    }
    flat(C.cream, new THREE.PlaneGeometry(2.0, 2.8), 0, 0, 0.056)
    flat(0x2e5e6b, new THREE.CircleGeometry(1.1, 40, 0, Math.PI), 0, -1.4, 0.06)
    flat(0xc9a24a, new THREE.CircleGeometry(0.8, 40, 0, Math.PI), 0.55, -1.4, 0.062)
    flat(0xd9602f, new THREE.CircleGeometry(0.55, 40), -0.15, 0.4, 0.064)
    poster.position.set(4.6, 5.5, -5.12)
    poster.traverse((o) => (o.userData.room = true))
    this.scene.add(poster)

    /* rug */
    const rug = this.tex(1024, 640, (g) => {
      g.fillStyle = '#e6dac1'
      g.fillRect(0, 0, 1024, 640)
      g.fillStyle = '#2b3f66'
      g.fillRect(28, 28, 968, 584)
      g.fillStyle = '#e6dac1'
      g.fillRect(64, 64, 896, 512)
      g.strokeStyle = '#b8603a'
      g.lineWidth = 6
      g.strokeRect(84, 84, 856, 472)
      g.fillStyle = '#d6c7a8'
      for (let x = 0; x < 6; x++) {
        for (let y = 0; y < 4; y++) {
          const cx = 190 + x * 128
          const cy = 170 + y * 100
          g.beginPath()
          g.moveTo(cx, cy - 28)
          g.lineTo(cx + 28, cy)
          g.lineTo(cx, cy + 28)
          g.lineTo(cx - 28, cy)
          g.closePath()
          g.fill()
        }
      }
    })
    plane(10, 6.25, new THREE.MeshStandardMaterial({ map: rug, roughness: 1 }), [1.2, 0.02, -0.6], [-Math.PI / 2, 0, 0])

    /* door frame and the dark hallway behind the door */
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.2), new THREE.MeshBasicMaterial({ color: 0x07080b }))
    dark.position.set(-8.6, 3.6, -5.16)
    dark.userData.room = true
    this.scene.add(dark)
    const fm = this.clay(C.white, 0.7)
    const frames: [number, number, number, number][] = [[-8.6, 7.35, 3.9, 0.3], [-10.4, 3.6, 0.3, 7.5], [-6.8, 3.6, 0.3, 7.5]]
    frames.forEach(([x, y, w, h]) => {
      this.box(w, h, 0.34, 0.04, fm, this.scene, [x, y, -5.04]).userData.room = true
    })
  }

  /** a proper ergonomic office chair: five-star base, casters, gas lift, arms, headrest */
  private makeOfficeChair() {
    const g = new THREE.Group()
    const fabric = this.clay(C.charcoal, 0.8)
    const black = this.clay(C.black, 0.5)
    const metal = this.clay(C.alu, 0.35)
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Group()
      arm.rotation.y = (i * Math.PI * 2) / 5
      this.box(1.3, 0.12, 0.2, 0.05, black, arm, [0.65, 0.24, 0])
      this.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), black), arm, [1.28, 0.12, 0])
      g.add(arm)
    }
    this.cyl(0.11, 0.14, 1.2, metal, g, [0, 0.85, 0], [0, 0, 0], 20)
    this.box(1.9, 0.32, 1.8, 0.14, fabric, g, [0, 1.55, 0])
    this.box(1.7, 2.2, 0.28, 0.14, fabric, g, [0, 2.85, -0.85], [-0.1, 0, 0])
    this.box(1.0, 0.5, 0.22, 0.1, fabric, g, [0, 4.25, -0.96], [-0.1, 0, 0])
    this.box(0.18, 0.5, 0.18, 0.05, black, g, [0, 3.95, -0.93], [-0.1, 0, 0])
    ;[-1, 1].forEach((s) => {
      this.box(0.12, 0.62, 0.12, 0.04, black, g, [s * 1.0, 1.95, 0.0])
      this.box(0.28, 0.1, 1.1, 0.05, black, g, [s * 1.0, 2.3, 0.1])
    })
    return g
  }

  private buildFurniture() {
    /* desk (static): walnut top, dark steel legs, a drawer pedestal */
    const top = this.clay(C.walnut, 0.55)
    const steel = this.clay(0x2a2b2f, 0.45)
    const desk = new THREE.Group()
    this.box(6.6, 0.28, 2.6, 0.1, top, desk, [0, 2.5, 0])
    ;[[-3.0, -1.1], [3.0, -1.1], [-3.0, 1.1], [3.0, 1.1]].forEach(([x, z]) => this.box(0.22, 2.4, 0.22, 0.06, steel, desk, [x, 1.2, z]))
    this.box(1.7, 2.1, 2.2, 0.08, top, desk, [2.0, 1.2, -0.1])
    ;[0.55, 1.45].forEach((y) => this.box(1.5, 0.8, 0.06, 0.03, this.clay(0x8a5a36, 0.55), desk, [2.0, y + 0.3, 1.0]))
    desk.position.set(2.4, 0, -3.3)
    this.scene.add(desk)

    /* Danny's chair: a proper office chair, pulled out, nobody in it */
    const oc = this.makeOfficeChair()
    oc.rotation.y = Math.PI - 0.3
    this.register('dchair', oc, [2.9, 0, -0.6])

  }

  private buildShelf() {
    const g = new THREE.Group()
    const wood = this.clay(C.oakLight, 0.6)
    this.box(0.2, 6.4, 1.1, 0.04, wood, g, [-2.1, 3.2, 0])
    this.box(0.2, 6.4, 1.1, 0.04, wood, g, [2.1, 3.2, 0])
    this.box(4.4, 0.2, 1.1, 0.04, wood, g, [0, 6.4, 0])
    this.box(4.0, 6.3, 0.08, 0.02, this.clay(0x8f6a45, 0.7), g, [0, 3.2, -0.5])
    const tops = [0.2, 1.75, 3.3, 4.85]
    tops.forEach((y) => this.box(4.0, 0.16, 1.0, 0.03, wood, g, [0, y - 0.08, 0]))
    const spines = [C.red, C.navy, C.mustard, C.green, C.cream, C.charcoal, C.terracotta, C.white]
    const r = seeded(33)
    tops.forEach((y, row) => {
      let x = -1.9
      while (x < 1.85) {
        const w = 0.17 + r() * 0.17
        const h = 0.8 + r() * 0.55
        /* row 3 keeps a gap, and something is in it */
        if (row === 2 && x > 0.7 && x < 1.65) {
          x += 0.1
          continue
        }
        if (x + w > 1.9) break
        const tilt = row === 1 && x > 1.2 && !this.leaner
        const mat = this.clay(spines[Math.floor(r() * spines.length)], 0.65)
        const bk = this.box(w, h, 0.7, 0.03, mat, g, [x + w / 2 + (tilt ? 0.3 : 0), y + h / 2 - (tilt ? 0.02 : 0), 0.02], [0, 0, tilt ? -0.28 : 0])
        if (tilt) this.leaner = bk
        x += w + 0.015
      }
    })
    this.register('shelf', g, [10.2, 0, -4.4])
  }

  private buildClockAndDoor() {
    /* wall clock that keeps real time */
    const clock = new THREE.Group()
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.6, emissive: 0x3a3226, emissiveIntensity: 0.6 }))
    this.add(face, clock, [0, 0, 0], [Math.PI / 2, 0, 0])
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 10, 44), this.clay(C.black, 0.5))
    this.add(ring, clock, [0, 0, 0.02])
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6
      this.box(0.04, i % 3 === 0 ? 0.13 : 0.07, 0.02, 0.01, this.clay(C.black, 0.6), clock, [Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.05], [0, 0, -a])
    }
    const hand = (len: number, w: number, color: number) => {
      const p = new THREE.Group()
      p.position.z = 0.06
      this.box(w, len, 0.02, 0.008, this.clay(color, 0.5), p, [0, len / 2 - 0.04, 0])
      clock.add(p)
      return p
    }
    this.hHour = hand(0.3, 0.06, C.black)
    this.hMin = hand(0.46, 0.04, C.black)
    this.hSec = hand(0.5, 0.015, 0xc23b2c)
    this.register('clock', clock, [0.7, 6.7, -5.05])

    /* a door: it opens, onto a hallway */
    const door = new THREE.Group()
    const dm = this.clay(0x8a5c3a, 0.6)
    this.box(3.2, 7.2, 0.2, 0.05, dm, door, [1.6, 3.6, 0.1])
    ;[2.0, 5.3].forEach((y) => this.box(2.4, y === 2.0 ? 2.4 : 2.6, 0.05, 0.03, this.clay(0x7a4f31, 0.65), door, [1.6, y, 0.22]))
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.clay(0xc9a24a, 0.3)), door, [2.8, 3.5, 0.34])
    this.register('door', door, [-10.2, 0, -5.12])
  }

  private buildProps() {
    const deskTop = 2.64

    /* the MacBook */
    const mac = new THREE.Group()
    const alu = this.clay(C.alu, 0.35)
    this.box(2.7, 0.12, 1.85, 0.05, alu, mac, [0, 0.06, 0])
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x25262a, roughness: 0.9 }))
    deck.rotation.x = -Math.PI / 2
    deck.position.set(0, 0.123, -0.28)
    mac.add(deck)
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.58), new THREE.MeshStandardMaterial({ color: 0xb4b7bc, roughness: 0.6 }))
    pad.rotation.x = -Math.PI / 2
    pad.position.set(0, 0.123, 0.5)
    mac.add(pad)
    const lid = new THREE.Group()
    lid.position.set(0, 0.12, -0.9)
    lid.rotation.x = -0.2
    this.box(2.7, 1.8, 0.09, 0.04, alu, lid, [0, 0.9, 0])
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.56), new THREE.MeshBasicMaterial({ map: this.term.tex, toneMapped: false }))
    screen.position.set(0, 0.9, 0.051)
    lid.add(screen)
    mac.add(lid)
    this.lid = lid
    mac.rotation.y = -0.16
    mac.scale.setScalar(0.52)
    const macOuter = new THREE.Group()
    macOuter.add(mac)
    this.register('mac', macOuter, [2.7, deskTop, -2.75])
    this.warmLight([2.7, 3.5, -2.1], 3.5, 5, 0xbcd4ff)

    /* the lamp: off until you reach her section (or switch it on yourself) */
    const lamp = new THREE.Group()
    this.cyl(0.45, 0.5, 0.12, this.clay(C.black, 0.5), lamp, [0, 0.06, 0])
    this.cyl(0.05, 0.05, 4.3, this.clay(C.black, 0.5), lamp, [0, 2.2, 0], [0, 0, 0], 12)
    this.lampShade = new THREE.MeshPhysicalMaterial({ color: 0xf2ead8, emissive: 0xffd8b0, emissiveIntensity: 0, roughness: 0.7 })
    this.cyl(0.3, 0.72, 0.85, this.lampShade, lamp, [0, 4.6, 0])
    this.lampBulb = new THREE.MeshBasicMaterial({ color: 0x3a3a3a, toneMapped: false })
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), this.lampBulb)
    bulb.position.y = 4.35
    lamp.add(bulb)
    this.lampLight = new THREE.PointLight(0xffc890, 0, 12, 1.6)
    this.lampLight.position.set(0, 4.3, 0.1)
    lamp.add(this.lampLight)
    this.register('lamp', lamp, [8.5, 0, -3.1])

    /* the letter: tucked into the bookshelf, in the gap on the third shelf. Nobody points at it. */
    const env = new THREE.Group()
    const pivot = new THREE.Group()
    pivot.rotation.x = -0.1
    pivot.scale.setScalar(0.78)
    this.box(0.96, 0.66, 0.05, 0.02, this.clay(C.cream, 0.7), pivot, [0, 0.33, 0])
    const envTex = this.tex(400, 272, (g) => {
      g.fillStyle = '#f3ecdc'
      g.fillRect(0, 0, 400, 272)
      g.strokeStyle = '#c9bd9f'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(200, 150)
      g.lineTo(400, 0)
      g.stroke()
      g.textAlign = 'center'
      g.fillStyle = '#2b3f66'
      g.font = 'italic 600 58px Georgia, "Times New Roman", serif'
      g.fillText('Mishka', 200, 226)
    })
    const eface = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ map: envTex, color: 0xb8b0a4 }))
    eface.position.set(0, 0.33, 0.027)
    pivot.add(eface)
    env.add(pivot)
    env.rotation.y = 0.08
    this.register('envelope', env, [11.45, 3.32, -4.15])

    /* stylus */
    const pen = new THREE.Group()
    this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.0, 6, 14), this.clay(C.white, 0.4)), pen, [0, 0, 0], [0, 0, Math.PI / 2])
    this.add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 14), this.clay(0x2a2a2c, 0.6)), pen, [0.66, 0, 0], [0, 0, -Math.PI / 2])
    pen.rotation.y = 0.6
    this.register('stylus', pen, [4.2, deskTop + 0.07, -1.95])

    /* the ball, in the corner of the room. It is not the point. */
    const ball = new THREE.Group()
    /* a proper football: truncated-icosahedron panels (12 black pentagons, 20 white hexagons) painted per pixel */
    const bt = this.tex(1024, 512, (g) => {
      const W = 1024, H = 512
      const phi = (1 + Math.sqrt(5)) / 2
      const n = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
      const pent: number[][] = []
      ;[[0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi]].forEach((v) => pent.push(n(v), n([v[1], v[2], v[0]]), n([v[2], v[0], v[1]])))
      const hex: number[][] = []
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) hex.push(n([sx, sy, sz]))
      ;[[0, phi, 1 / phi], [0, -phi, 1 / phi], [0, phi, -1 / phi], [0, -phi, -1 / phi]].forEach((v) => hex.push(n(v), n([v[1], v[2], v[0]]), n([v[2], v[0], v[1]])))
      const dedupe = (a: number[][]) => a.filter((v, i) => a.findIndex((w) => Math.hypot(w[0] - v[0], w[1] - v[1], w[2] - v[2]) < 1e-4) === i)
      const P = dedupe(pent)
      const Hx = dedupe(hex)
      const RP = 1.268
      const img = g.createImageData(W, H)
      for (let py = 0; py < H; py++) {
        const th = (Math.PI * (py + 0.5)) / H
        for (let px = 0; px < W; px++) {
          const ph = (2 * Math.PI * (px + 0.5)) / W
          const x = -Math.cos(ph) * Math.sin(th), y = Math.cos(th), z = Math.sin(ph) * Math.sin(th)
          let b1 = 9, b2 = 9, isP = false
          for (const q of P) {
            const a = Math.acos(Math.min(1, q[0] * x + q[1] * y + q[2] * z)) / RP
            if (a < b1) { b2 = b1; b1 = a; isP = true } else if (a < b2) b2 = a
          }
          for (const q of Hx) {
            const a = Math.acos(Math.min(1, q[0] * x + q[1] * y + q[2] * z))
            if (a < b1) { b2 = b1; b1 = a; isP = false } else if (a < b2) b2 = a
          }
          const seam = b2 - b1 < 0.022
          const o = (py * W + px) * 4
          const c = isP ? 26 : seam ? 150 : 244
          img.data[o] = c
          img.data[o + 1] = c
          img.data[o + 2] = isP ? 30 : c
          img.data[o + 3] = 255
        }
      }
      g.putImageData(img, 0, 0)
    })
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 64, 48), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.55, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.12 })), ball)
    this.register('ball', ball, [-0.9, 0.52, 3.7])

    /* plant: real leaves, terracotta pot */
    const plant = new THREE.Group()
    this.cyl(0.55, 0.42, 0.8, this.clay(C.terracotta, 0.7), plant, [0, 0.4, 0])
    for (let i = 0; i < 7; i++) {
      const arm = new THREE.Group()
      arm.rotation.y = (i * Math.PI * 2) / 7
      const tilt = new THREE.Group()
      tilt.position.set(0.1, 0.8, 0)
      tilt.rotation.z = -(0.35 + (i % 3) * 0.14)
      this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.95 + (i % 2) * 0.35, 6, 12), this.clay(i % 2 ? C.leaf : C.green, 0.6)), tilt, [0, 0.62, 0])
      arm.add(tilt)
      plant.add(arm)
    }
    this.plant = plant
    this.register('plant', plant, [6.9, 0, -3.7])

    this.buildShelf()
    this.buildClockAndDoor()
    this.buildCozy()
    this.buildBreeze()
    this.buildHeart()
    this.buildDetails()
    this.buildDoorside()
  }

  private warmLight(pos: V3, intensity: number, dist = 10, color = 0xffa550) {
    const l = new THREE.PointLight(color, intensity, dist, 1.5)
    l.position.set(...pos)
    this.scene.add(l)
    this.warm.push({ l, base: intensity })
    return l
  }

  /** indirect, warm light and the things that make the room feel lived in */
  private buildCozy() {
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false })
    const bulb = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })

    /* string lights along the back wall */
    const pts: THREE.Vector3[] = []
    const swags = 6
    for (let sw = 0; sw < swags; sw++) {
      for (let k = 0; k <= 12; k++) {
        const f = k / 12
        pts.push(new THREE.Vector3(-12 + ((sw + f) / swags) * 25, 7.9 - Math.sin(Math.PI * f) * 0.55, -5.0))
      }
    }
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a1c }))
    wire.userData.room = true
    this.scene.add(wire)
    const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8)
    for (let sw = 0; sw < swags; sw++) {
      for (let k = 2; k < 12; k += 3) {
        const m = new THREE.Mesh(bulbGeo, bulb)
        m.position.copy(pts[sw * 13 + k])
        m.position.y -= 0.08
        m.userData.room = true
        this.scene.add(m)
      }
    }
    this.warmLight([-6, 6.6, -2.8], 6, 8)
    this.warmLight([6, 6.6, -2.8], 6, 8)
    this.warmLight([5.2, 4.2, 2.2], 8, 7, 0xffb070)

    /* a glowing strip under the top of the shelf, and a glow under the desk */
    const strip = this.box(4.0, 0.05, 0.05, 0.02, glow, this.scene, [10.2, 6.22, -3.84])
    strip.castShadow = false
    strip.userData.room = true
    this.warmLight([10.2, 5.6, -2.9], 10, 9)
    this.warmLight([2.4, 0.9, -2.4], 8, 7, 0xff9a4a)

    /* curtains and a rod at the window */
    const linen = this.clay(0xc98f5e, 0.95)
    const rod = this.cyl(0.06, 0.06, 5.8, this.clay(0x3a2a1c, 0.4), this.scene, [-3.8, 7.05, -4.8], [0, 0, Math.PI / 2], 10)
    rod.userData.room = true
    ;[-6.15, -1.45].forEach((x) => {
      const c = this.box(0.85, 4.6, 0.26, 0.12, linen, this.scene, [x, 4.7, -4.82])
      c.userData.room = true
    })

    /* framed prints */
    const frame = (w: number, h: number, x: number, y: number, art: (g: CanvasRenderingContext2D, W: number, H: number) => void) => {
      const f = new THREE.Group()
      this.box(w, h, 0.1, 0.03, this.clay(0x5a3a24, 0.6), f)
      const W = 256
      const H = Math.round((256 * h) / w)
      const t = this.tex(W, H, (g) => {
        g.fillStyle = '#efe4cd'
        g.fillRect(0, 0, W, H)
        art(g, W, H)
      })
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.22, h - 0.22), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }))
      face.position.z = 0.056
      f.add(face)
      f.position.set(x, y, -5.1)
      f.traverse((o) => (o.userData.room = true))
      this.scene.add(f)
    }
    frame(1.1, 1.5, -0.2, 4.6, (g, W, H) => {
      g.fillStyle = '#2f5560'
      g.fillRect(0, H * 0.66, W, H * 0.34)
      g.fillStyle = '#c0643a'
      g.beginPath()
      g.arc(W / 2, H * 0.42, W * 0.27, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#e0b255'
      g.beginPath()
      g.arc(W * 0.7, H * 0.2, W * 0.07, 0, Math.PI * 2)
      g.fill()
    })
    frame(1.3, 1.7, 6.9, 5.9, (g, W, H) => {
      g.fillStyle = '#d9a55a'
      g.beginPath()
      g.moveTo(W * 0.15, H * 0.9)
      g.lineTo(W * 0.15, H * 0.4)
      g.arc(W / 2, H * 0.4, W * 0.35, Math.PI, 0)
      g.lineTo(W * 0.85, H * 0.9)
      g.closePath()
      g.fill()
      g.fillStyle = '#a8502f'
      g.beginPath()
      g.moveTo(W * 0.3, H * 0.9)
      g.lineTo(W * 0.3, H * 0.42)
      g.arc(W / 2, H * 0.42, W * 0.2, Math.PI, 0)
      g.lineTo(W * 0.7, H * 0.9)
      g.closePath()
      g.fill()
    })

    /* a small round rug on the left of the room */
    const rugCols = [0xb8733f, 0xe2cfa4, 0xb8733f]
    ;[2.9, 2.45, 1.9].forEach((rad, i) => {
      const r = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshStandardMaterial({ color: rugCols[i], roughness: 1 }))
      r.rotation.x = -Math.PI / 2
      r.position.set(-5.6, 0.03 + i * 0.004, 3.7)
      r.receiveShadow = true
      r.userData.room = true
      this.scene.add(r)
    })

    /* a desk lamp on the left end of the desk, which you can switch off */
    const fl = new THREE.Group()
    const dark = this.clay(0x2a2420, 0.4)
    this.cyl(0.42, 0.46, 0.1, dark, fl, [0, 0.05, 0])
    this.cyl(0.04, 0.04, 1.5, dark, fl, [0, 0.8, 0], [0, 0, 0], 10)
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), dark), fl, [0, 1.55, 0])
    this.cyl(0.035, 0.035, 0.85, dark, fl, [0.4, 1.55, 0], [0, 0, Math.PI / 2], 10)
    this.deskShade = new THREE.MeshPhysicalMaterial({ color: 0xf3e2c4, emissive: 0xffb066, emissiveIntensity: 1.6, roughness: 0.8, side: THREE.DoubleSide })
    const shade = this.cyl(0.2, 0.5, 0.55, this.deskShade, fl, [0.85, 1.35, 0])
    shade.castShadow = false
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false })), fl, [0.85, 1.12, 0], [0, 0, 0], false)
    this.deskLight = new THREE.PointLight(0xffb066, 22, 9, 1.5)
    this.deskLight.position.set(0.85, 1.0, 0)
    fl.add(this.deskLight)
    this.register('desklamp', fl, [-0.2, 2.64, -3.9])
  }

  /** Mishka: a soft clay heart that floats where a chair used to be */
  private buildHeart() {
    const g = new THREE.Group()
    const h = new THREE.Shape()
    h.moveTo(0, -0.95)
    h.bezierCurveTo(-0.25, -0.7, -1.0, -0.2, -1.0, 0.3)
    h.bezierCurveTo(-1.0, 0.75, -0.65, 1.0, -0.35, 1.0)
    h.bezierCurveTo(-0.15, 1.0, 0, 0.88, 0, 0.7)
    h.bezierCurveTo(0, 0.88, 0.15, 1.0, 0.35, 1.0)
    h.bezierCurveTo(0.65, 1.0, 1.0, 0.75, 1.0, 0.3)
    h.bezierCurveTo(1.0, -0.2, 0.25, -0.7, 0, -0.95)
    const geo = new THREE.ExtrudeGeometry(h, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.18, bevelSegments: 10, curveSegments: 32 })
    geo.center()
    this.heartMat = new THREE.MeshPhysicalMaterial({ color: 0xc98780, roughness: 0.6, clearcoat: 0, emissive: 0x4a1a18, emissiveIntensity: 0.1 })
    this.heartMesh = new THREE.Mesh(geo, this.heartMat)
    this.heartMesh.scale.setScalar(0.5)
    g.add(this.heartMesh)
    this.heartLight = new THREE.PointLight(0xff8a78, 3, 8, 1.6)
    this.heartLight.position.set(0.4, 1.7, 2.3)
    g.add(this.heartLight)
    this.register('heart', g, [-2.6, 3.5, -1.2])
  }

  /** the door side: somewhere to drop a jacket, somewhere to sit, something green, something soft to land on */
  private buildDoorside() {
    const room = <T extends THREE.Object3D>(o: T) => {
      o.traverse((c) => (c.userData.room = true))
      this.scene.add(o)
      return o
    }
    const wood = this.clay(C.walnut, 0.55)
    const oak = this.clay(C.oakLight, 0.65)
    const dark = this.clay(0x2a2420, 0.45)
    const cream = this.clay(C.cream, 0.85)
    const sphere = (r: number, mat: THREE.Material, parent: THREE.Object3D, pos: V3, scale: V3 = [1, 1, 1]) => {
      const m = this.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), mat), parent, pos)
      m.scale.set(...scale)
      return m
    }

    /* coat hooks to the left of the door: a jacket, a tote and a cap */
    const rail = new THREE.Group()
    this.box(2.0, 0.26, 0.14, 0.05, wood, rail)
    ;[-0.7, 0, 0.7].forEach((x) => {
      this.cyl(0.04, 0.04, 0.3, dark, rail, [x, -0.02, 0.2], [Math.PI / 2, 0, 0], 10)
      sphere(0.075, dark, rail, [x, -0.02, 0.36])
    })
    const jacket = new THREE.Group()
    jacket.position.set(-0.7, -0.05, 0.42)
    const navy = this.clay(C.navy, 0.85)
    this.box(0.95, 1.5, 0.24, 0.12, navy, jacket, [0, -0.8, 0])
    ;[-1, 1].forEach((s) => this.box(0.26, 1.15, 0.22, 0.1, navy, jacket, [s * 0.58, -0.78, 0], [0, 0, s * 0.07]))
    this.box(0.5, 0.14, 0.26, 0.05, this.clay(0x1c2e56, 0.85), jacket, [0, -0.06, 0.01])
    rail.add(jacket)
    const tote = new THREE.Group()
    tote.position.set(0, -0.05, 0.42)
    this.box(0.85, 0.95, 0.2, 0.06, cream, tote, [0, -0.95, 0])
    this.box(0.5, 0.2, 0.22, 0.04, this.clay(C.terracotta, 0.8), tote, [0, -0.7, 0])
    this.add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 18, Math.PI), this.clay(C.oakLight, 0.7)), tote, [0, -0.45, 0])
    rail.add(tote)
    const cap = new THREE.Group()
    cap.position.set(0.7, -0.12, 0.42)
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.clay(C.charcoal, 0.8)), cap, [0, -0.3, 0], [-0.2, 0, 0])
    this.box(0.4, 0.04, 0.3, 0.02, this.clay(C.charcoal, 0.8), cap, [0, -0.3, 0.3], [0.1, 0, 0])
    rail.add(cap)
    rail.position.set(-12.6, 5.5, -5.08)
    room(rail)

    /* a shoe bench under the hooks, with a basket and a folded blanket on it */
    const bench = new THREE.Group()
    this.box(2.6, 0.2, 0.95, 0.06, wood, bench, [0, 1.5, 0])
    ;[-1.15, 1.15].forEach((x) => [-0.35, 0.35].forEach((z) => this.box(0.14, 1.4, 0.14, 0.04, dark, bench, [x, 0.7, z])))
    this.box(2.4, 0.08, 0.8, 0.03, oak, bench, [0, 0.45, 0])
    ;([[-0.7, 0.2], [0.5, -0.15]] as [number, number][]).forEach(([x, r]) => {
      const sh = new THREE.Group()
      this.box(0.95, 0.12, 0.4, 0.05, this.clay(C.cream, 0.7), sh, [0, 0.06, 0])
      this.box(0.8, 0.22, 0.36, 0.1, this.clay(C.red, 0.7), sh, [-0.04, 0.22, 0])
      sh.position.set(x, 0.49, 0)
      sh.rotation.y = r
      bench.add(sh)
    })
    this.cyl(0.42, 0.34, 0.5, oak, bench, [-0.75, 1.85, 0], [0, 0, 0], 20)
    this.box(0.7, 0.12, 0.45, 0.05, this.clay(C.mustard, 0.9), bench, [0.55, 1.66, 0], [0, 0.15, 0])
    this.box(0.7, 0.1, 0.45, 0.05, this.clay(C.cream, 0.9), bench, [0.55, 1.76, 0], [0, -0.1, 0])
    bench.position.set(-12.7, 0, -4.6)
    room(bench)

    /* an umbrella stand by the door frame */
    const um = new THREE.Group()
    this.cyl(0.3, 0.27, 1.2, dark, um, [0, 0.6, 0])
    ;([[-0.08, 0.1, 0.12, C.navy], [0.1, -0.05, -0.14, C.mustard]] as [number, number, number, number][]).forEach(([x, z, tilt, col]) => {
      const u = new THREE.Group()
      this.cyl(0.035, 0.035, 2.0, this.clay(col, 0.7), u, [0, 1.0, 0], [0, 0, 0], 8)
      this.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 14, Math.PI * 1.2), dark), u, [0.1, 2.0, 0], [0, 0, -0.2])
      u.position.set(x, 1.0, z)
      u.rotation.z = tilt
      um.add(u)
    })
    um.position.set(-10.9, 0, -4.5)
    room(um)

    /* a tall plant in the gap by the window curtain */
    const tp = new THREE.Group()
    this.cyl(0.52, 0.4, 0.9, this.clay(C.terracotta, 0.7), tp, [0, 0.45, 0])
    this.cyl(0.05, 0.09, 2.2, this.clay(0x6b4a2e, 0.7), tp, [0, 1.9, 0], [0.04, 0, 0.03], 8)
    for (let i = 0; i < 10; i++) {
      const leaf = new THREE.Group()
      leaf.rotation.y = i * 2.4
      const m = sphere(1, this.clay(i % 2 ? C.leaf : C.green, 0.6), leaf, [0.5, 1.55 + i * 0.2, 0], [0.5, 0.06, 0.3])
      m.rotation.z = -0.45
      tp.add(leaf)
    }
    tp.position.set(-6.3, 0, -3.75)
    room(tp)

    /* a corner to land in: low table with books and a mug, two poufs, a basket with a blanket */
    const tb = new THREE.Group()
    this.cyl(0.85, 0.85, 0.1, wood, tb, [0, 1.1, 0], [0, 0, 0], 32)
    this.cyl(0.08, 0.08, 1.0, dark, tb, [0, 0.55, 0], [0, 0, 0], 10)
    this.cyl(0.5, 0.55, 0.07, dark, tb, [0, 0.035, 0], [0, 0, 0], 24)
    ;([[0.9, 0.14, 0.62, C.navy, 0.1], [0.82, 0.12, 0.58, C.red, -0.12], [0.74, 0.1, 0.52, C.cream, 0.2]] as [number, number, number, number, number][]).forEach(([w, h, d, col, r], i) =>
      this.box(w, h, d, 0.04, this.clay(col, 0.8), tb, [-0.2, 1.22 + i * 0.12, 0.05], [0, r, 0]),
    )
    this.cyl(0.14, 0.12, 0.24, this.clay(C.cream, 0.6), tb, [0.4, 1.27, 0.2])
    tb.position.set(-5.6, 0, 3.1)
    room(tb)
    ;([[-7.6, 2.4, C.terracotta, 0.7], [-4.0, 4.9, C.mustard, 0.62]] as [number, number, number, number][]).forEach(([x, z, col, r]) => {
      const p = new THREE.Group()
      this.cyl(r, r, 0.7, this.clay(col, 0.9), p, [0, 0.35, 0], [0, 0, 0], 28)
      sphere(r, this.clay(col, 0.9), p, [0, 0.7, 0], [1, 0.3, 1])
      p.position.set(x, 0, z)
      room(p)
    })
    const bk = new THREE.Group()
    this.cyl(0.78, 0.64, 0.95, oak, bk, [0, 0.475, 0], [0, 0, 0], 24)
    ;[0.25, 0.65].forEach((y) => this.add(new THREE.Mesh(new THREE.TorusGeometry(0.72 - y * 0.12, 0.02, 6, 28), this.clay(0x8a6740, 0.7)), bk, [0, y, 0], [Math.PI / 2, 0, 0]))
    this.box(1.2, 0.34, 0.9, 0.14, this.clay(C.cream, 0.9), bk, [0, 1.0, 0], [0, 0.4, 0.1])
    this.box(1.2, 0.08, 0.92, 0.03, this.clay(C.terracotta, 0.9), bk, [0, 1.12, 0], [0, 0.4, 0.1])
    bk.position.set(-8.4, 0, 1.0)
    room(bk)

    /* the door side was sitting in the dark: two soft warm lights, one by the door and one over the corner */
    this.warmLight([-10.5, 5.8, -2.2], 16, 15, 0xffc48a)
    this.warmLight([-6.5, 4.5, 4.5], 9, 12, 0xffb877)
  }

  /** dev only: where a world point lands on screen */
  debugPoint(x: number, y: number, z: number): [number, number] {
    const c = new THREE.Vector3(x, y, z).project(this.camera)
    return [Math.round((c.x * 0.5 + 0.5) * window.innerWidth), Math.round((-c.y * 0.5 + 0.5) * window.innerHeight)]
  }

  /** small things that make it a lived-in room */
  private buildDetails() {
    const room = <T extends THREE.Object3D>(o: T) => {
      o.traverse((c) => (c.userData.room = true))
      this.scene.add(o)
      return o
    }
    const white = this.clay(C.white, 0.7)

    /* skirting board, either side of the door */
    ;([[-22, -10.7], [-6.5, 22]] as [number, number][]).forEach(([a, b]) => {
      room(this.box(b - a, 0.5, 0.1, 0.02, white, new THREE.Group(), [(a + b) / 2, 0.25, -5.12]))
    })

    /* a radiator under the window */
    const rad = new THREE.Group()
    const rm = this.clay(0xe9e4d8, 0.55)
    for (let i = 0; i < 12; i++) this.box(0.2, 1.6, 0.34, 0.06, rm, rad, [-1.9 + i * 0.345, 0, 0])
    this.box(4.2, 0.12, 0.4, 0.04, rm, rad, [0, 0.85, 0])
    this.box(4.2, 0.12, 0.4, 0.04, rm, rad, [0, -0.85, 0])
    rad.position.set(-3.8, 1.5, -4.88)
    room(rad)

    /* a doormat and a pair of trainers in front of the door */
    const mat = new THREE.Group()
    this.box(2.4, 0.06, 1.4, 0.03, this.clay(0x4a4238, 0.95), mat, [0, 0.03, 0])
    this.box(2.1, 0.065, 0.12, 0.02, this.clay(0xd8c9a8, 0.95), mat, [0, 0.032, -0.3])
    this.box(2.1, 0.065, 0.12, 0.02, this.clay(0xd8c9a8, 0.95), mat, [0, 0.032, 0.3])
    mat.position.set(-8.6, 0, -3.6)
    room(mat)
    ;([[-9.1, -3.6, 0.35], [-8.35, -3.9, -0.2]] as [number, number, number][]).forEach(([x, z, r]) => {
      const sh = new THREE.Group()
      this.box(0.95, 0.12, 0.4, 0.05, this.clay(C.cream, 0.7), sh, [0, 0.06, 0])
      this.box(0.8, 0.22, 0.36, 0.1, this.clay(C.navy, 0.7), sh, [-0.04, 0.22, 0])
      this.box(0.3, 0.1, 0.3, 0.04, this.clay(C.red, 0.7), sh, [0.28, 0.2, 0])
      sh.position.set(x, 0.06, z)
      sh.rotation.y = r
      room(sh)
    })

    /* a light switch by the door */
    const sw = new THREE.Group()
    this.box(0.2, 0.32, 0.03, 0.01, white, sw)
    this.box(0.06, 0.12, 0.04, 0.01, this.clay(C.cream, 0.5), sw, [0, 0.02, 0.02])
    sw.position.set(-6.32, 3.5, -5.16)
    room(sw)

    /* a rug under the desk and the office chair */
    const rug = new THREE.Group()
    this.box(5.7, 0.04, 3.5, 0.02, this.clay(0x2f3b52, 0.95), rug, [0, 0.02, 0])
    this.box(5.3, 0.045, 3.1, 0.02, this.clay(0xe2cfa4, 0.95), rug, [0, 0.024, 0])
    this.box(5.1, 0.05, 2.9, 0.02, this.clay(0x2f3b52, 0.95), rug, [0, 0.028, 0])
    rug.position.set(2.5, 0, -1.3)
    room(rug)

    /* a small succulent at the front of the desk */
    const suc = new THREE.Group()
    this.cyl(0.28, 0.22, 0.36, this.clay(C.terracotta, 0.7), suc, [0, 0.18, 0])
    for (let i = 0; i < 8; i++) {
      const arm = new THREE.Group()
      arm.rotation.y = (i * Math.PI * 2) / 8
      const tilt = new THREE.Group()
      tilt.position.set(0.04, 0.34, 0)
      tilt.rotation.z = -(0.5 + (i % 2) * 0.35)
      this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3 + (i % 3) * 0.08, 4, 8), this.clay(i % 2 ? C.leaf : C.green, 0.6)), tilt, [0, 0.18, 0])
      arm.add(tilt)
      suc.add(arm)
    }
    suc.position.set(5.15, 2.64, -2.95)
    room(suc)
  }

  /** Breeze, asleep on a bed by the shelf, with a small candle and a plaque */
  private buildBreeze() {
    const g = new THREE.Group()
    const bedMat = this.clay(0x5d6f86, 0.85)
    const pad = this.clay(0xe6d9c0, 0.9)
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.34, 14, 36), bedMat)
    this.add(torus, g, [0, 0.34, 0], [Math.PI / 2, 0, 0])
    this.cyl(2.03, 2.03, 0.3, pad, g, [0, 0.16, 0], [0, 0, 0], 36)

    const dog = new THREE.Group()
    dog.position.set(-0.3, 0.3, 0)
    dog.rotation.y = Math.PI + 0.55
    dog.scale.setScalar(1.4)
    const fur = this.clay(0xd6aa60, 0.85)
    const furL = this.clay(0xe3c283, 0.85)
    const ear = this.clay(0xb88747, 0.85)
    const ink = this.clay(0x1c1a19, 0.5)
    const ell = (rx: number, ry: number, rz: number, mat: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]) => {
      const m = this.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat), dog, pos, rot)
      m.scale.set(rx, ry, rz)
      return m
    }
    /* haunches and hind legs */
    ell(0.8, 0.55, 0.62, fur, [-0.55, 0.5, 0])
    ell(0.55, 0.42, 0.26, fur, [-0.5, 0.42, 0.5])
    ell(0.55, 0.42, 0.26, fur, [-0.5, 0.42, -0.5])
    ell(0.34, 0.1, 0.16, fur, [0.1, 0.1, 0.55])
    ell(0.34, 0.1, 0.16, fur, [0.1, 0.1, -0.55])
    /* body and a lighter chest */
    ell(0.95, 0.55, 0.55, fur, [0.15, 0.62, 0])
    ell(0.55, 0.65, 0.5, furL, [0.8, 0.8, 0])
    /* front legs stretched out in front, like a sphinx */
    ;[-1, 1].forEach((sd) => {
      ell(0.2, 0.5, 0.17, fur, [0.9, 0.45, sd * 0.3])
      this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 6, 12), fur), dog, [1.35, 0.13, sd * 0.26], [0, 0, Math.PI / 2])
      ell(0.22, 0.1, 0.15, furL, [1.85, 0.1, sd * 0.26])
    })
    /* neck, red collar, head with a square muzzle, soft ears, calm eyes */
    ell(0.32, 0.5, 0.34, fur, [1.0, 1.2, 0], [0, 0, -0.35])
    this.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), this.clay(0xa8352c, 0.6)), dog, [1.02, 1.0, 0], [Math.PI / 2, 0, 0])
    ell(0.42, 0.34, 0.34, fur, [1.22, 1.58, 0])
    ell(0.32, 0.19, 0.22, furL, [1.64, 1.46, 0])
    ell(0.09, 0.07, 0.1, ink, [1.94, 1.5, 0])
    ell(0.14, 0.32, 0.07, ear, [1.12, 1.55, 0.34], [0, 0, 0.15])
    ell(0.14, 0.32, 0.07, ear, [1.12, 1.55, -0.34], [0, 0, 0.15])
    ell(0.045, 0.045, 0.045, ink, [1.52, 1.66, 0.2])
    ell(0.045, 0.045, 0.045, ink, [1.52, 1.66, -0.2])
    /* the thick otter tail, resting on the bed */
    this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.9, 6, 10), fur), dog, [-1.45, 0.2, 0.5], [0, 0.5, Math.PI / 2])
    g.add(dog)
    this.dog = dog

    /* plaque */
    const plate = this.tex(512, 340, (c) => {
      c.fillStyle = '#f1e8d4'
      c.fillRect(0, 0, 512, 340)
      c.textAlign = 'center'
      c.fillStyle = '#2a2018'
      c.font = '700 112px "Bricolage Grotesque", Georgia, serif'
      c.fillText('Breeze', 256, 164)
      c.fillStyle = '#b8603a'
      c.font = '600 36px "Instrument Sans", system-ui, sans-serif'
      c.fillText('13/11/2013 \u2192 20/3/24', 256, 252)
    })
    const stand = new THREE.Group()
    this.box(1.5, 1.0, 0.1, 0.03, this.clay(C.oakLight, 0.6), stand)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.88), new THREE.MeshBasicMaterial({ map: plate, color: 0xc2b8aa }))
    face.position.z = 0.056
    stand.add(face)
    stand.position.set(0.4, 0.55, 2.9)
    stand.rotation.x = -0.18
    g.add(stand)

    /* a small candle on the floor beside the bed */
    this.cyl(0.16, 0.16, 0.5, this.clay(C.cream, 0.8), g, [-2.3, 0.25, 1.7], [0, 0, 0], 16)
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }))
    flame.position.set(-2.3, 0.58, 1.7)
    g.add(flame)
    this.candle = new THREE.PointLight(0xff9a50, 8, 6.5, 1.5)
    this.candle.position.set(-2.3, 0.8, 1.7)
    g.add(this.candle)

    /* everything inside one scaled group: item groups are re-scaled every frame by the hover/pop animation */
    const inner = new THREE.Group()
    ;[...g.children].forEach((c) => inner.add(c))
    inner.scale.setScalar(0.7)
    g.add(inner)
    this.register('breeze', g, [7.3, 0, 1.1])
  }

  /* ───────── events ───────── */

  private onMove = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    this.ndc.copy(this.pointer)
    this.allow = !(e.target as HTMLElement).closest?.(IGNORE)
    this.pointerMoved = true
  }

  private pick(): Item | null {
    if (!this.allow) return null
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.items.map((i) => i.obj), true)
    for (const h of hits) {
      const it = h.object.userData.item as Item | undefined
      if (it) return it
    }
    return null
  }

  private toggleDoor(it: Item) {
    this.doorOpen = !this.doorOpen
    const y = this.doorOpen ? -1.25 : 0
    if (this.opts.reduced) it.obj.rotation.y = y
    else gsap.to(it.obj.rotation, { y, duration: 0.9, ease: 'power3.inOut' })
  }

  private nudge(it: Item) {
    this.wake(3200)
    if (it.id === 'door') return this.toggleDoor(it)
    if (this.opts.reduced) return
    const spin = (o: THREE.Object3D) => gsap.to(o.rotation, { y: o.rotation.y + Math.PI * 2, duration: 1.3, ease: 'power3.inOut' })
    switch (it.id) {
      case 'mac':
        gsap.fromTo(this.lid.rotation, { x: this.lid.rotation.x }, { x: this.lid.rotation.x - 0.14, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' })
        break
      case 'dchair':
      case 'stylus':
        spin(it.obj)
        break
      case 'ball':
        gsap.to(it.obj.rotation, { y: it.obj.rotation.y + Math.PI * 4, duration: 1.6, ease: 'power3.out' })
        gsap.fromTo(it.hop, { v: 0 }, { v: 0.9, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 1 })
        break
      case 'clock':
        gsap.fromTo(this.clockSpin, { v: 0 }, { v: Math.PI * 24, duration: 1.8, ease: 'power3.inOut' })
        break
      case 'shelf':
        if (this.leaner) gsap.fromTo(this.leaner.rotation, { z: this.leaner.rotation.z }, { z: this.leaner.rotation.z + 0.12, duration: 0.2, yoyo: true, repeat: 3, ease: 'sine.inOut' })
        break
      case 'plant':
        gsap.fromTo(this.plant.rotation, { z: 0 }, { z: 0.05, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' })
        break
      case 'breeze':
        gsap.fromTo(this.candlePulse, { v: 0 }, { v: 1, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: 1 })
        break
      case 'desklamp':
        break
      case 'heart':
        this.beat()
        break
      default:
        gsap.fromTo(it.hop, { v: 0 }, { v: 0.22, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1 })
    }
  }

  private onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest?.(IGNORE)) return
    const it = this.pick()
    if (!it) return
    this.nudge(it)
    if (it.id === 'mac') this.term.next()
    if (it.id === 'lamp') this.toggleLamp()
    if (it.id === 'desklamp') {
      this.deskOn = !this.deskOn
      this.wake(1500)
    }
    if (it.id === 'heart') this.greet()
    if (it.id === 'breeze') this.opts.onNote?.('Breeze. Good dog.')
    if (it.id === 'envelope') this.opts.onLetter?.()
    if (it.id === 'door') this.opts.onNote?.(this.doorOpen ? 'Just a hallway.' : 'Closed again.')
    if (it.id === 'clock') this.opts.onNote?.(`It’s ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`)
    if (it.id === 'ball') {
      this.ballClicks += 1
      if (this.ballClicks % 7 === 0) this.madrid()
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.renderer.setAnimationLoop(null)
    else if (!this.disposed) {
      this.last = performance.now()
      this.wake(500)
      this.renderer.setAnimationLoop(this.tick)
    }
  }

  private resize() {
    const w = this.opts.container.clientWidth || window.innerWidth
    const h = this.opts.container.clientHeight || window.innerHeight
    this.portrait = w / h < 0.85
    this.camera.aspect = w / h
    this.camera.fov = this.portrait ? 62 : 42
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.wake(500)
  }

  /* ───────── frame ───────── */

  private tick = () => {
    const now = performance.now()
    const reduced = this.opts.reduced
    const moving = Math.abs(this.stationTarget - this.stationNow) > 0.002 || this.pointerSmooth.distanceToSquared(this.pointer) > 1e-5 || now < this.activeUntil
    /* idle: the room is still, so render at a relaxed rate (only the caret blinks) */
    if (!moving && now - this.lastRender < 66) return
    this.lastRender = now
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    if (moving && this.wasMoving) {
      this.ema = this.ema * 0.92 + dt * 0.08
      if (this.ema > 0.027 && this.pr > 1 && now - this.lastAdapt > 1500) {
        this.lastAdapt = now
        this.applyPixelRatio(Math.max(1, this.pr - 0.25))
        this.ema = 0.0167
      }
    }
    this.wasMoving = moving
    const t = (now - this.start) / 1000

    /* camera between stations */
    this.stationNow += (this.stationTarget - this.stationNow) * (reduced ? 1 : 1 - Math.pow(0.002, dt))
    const i = Math.min(STATIONS.length - 2, Math.floor(this.stationNow))
    const e0 = this.stationNow - i
    const e = e0 * e0 * (3 - 2 * e0)
    const s0 = STATIONS[i]
    const s1 = STATIONS[i + 1]
    const far = this.portrait ? 1.45 : 1
    this.a.set(...s0.pos).lerp(this.b.set(...s1.pos), e)
    this.look.set(...s0.look).lerp(this.b.set(...s1.look), e)
    if (this.portrait) {
      this.look.x = 0
      this.look.y -= 1.2
    }
    this.pointerSmooth.lerp(this.pointer, reduced ? 0 : 1 - Math.pow(0.02, dt))
    this.camera.position.set(this.a.x * far + this.pointerSmooth.x * 0.6, this.a.y * (this.portrait ? 1.15 : 1) + this.pointerSmooth.y * 0.35, this.a.z * far)
    this.camera.lookAt(this.look)
    if (this.camOverride) {
      this.camera.position.set(...this.camOverride.pos)
      this.camera.lookAt(...this.camOverride.look)
    }

    /* her section: the room dims, her lamp takes over */
    const m0 = Math.max(0, 1 - Math.abs(this.stationNow - MISHKA_STATION) * 1.25)
    const m = m0 * m0 * (3 - 2 * m0)
    this.key.intensity = KEY * (1 - 0.8 * m) + this.flash.v * 2
    this.rim.intensity = RIM * (1 - 0.7 * m)
    this.hemi.intensity = HEMI * (1 - 0.7 * m)
    this.windowLight.intensity = WINDOW * (1 - 0.5 * m)
    this.setEnv(this.envBase * (1 - 0.75 * m))

    const want = Math.max(this.lampOn ? 1 : 0, m)
    this.lampLevel += (want - this.lampLevel) * (1 - Math.pow(0.002, dt))
    const lv = this.lampLevel
    this.lampLight.intensity = lv * 13 + m * 8 + this.pulse.v * 12
    this.lampShade.emissiveIntensity = lv * 0.8 + this.pulse.v * 0.4
    this.lampBulb.color.setRGB(0.16 + lv * 0.84, 0.16 + lv * 0.78, 0.23 + lv * 0.57)
    this.warm.forEach((w) => (w.l.intensity = w.base * (1 - 0.35 * m)))
    this.deskLevel += ((this.deskOn ? 1 : 0) - this.deskLevel) * (1 - Math.pow(0.002, dt))
    this.deskLight.intensity = 22 * this.deskLevel * (1 - 0.3 * m)
    this.deskShade.emissiveIntensity = 1.6 * this.deskLevel
    const flick = reduced ? 0 : Math.sin(t * 7) * 0.35 + Math.sin(t * 3.3) * 0.25
    this.candle.intensity = (8 + flick) * (1 - 0.3 * m) + this.candlePulse.v * 9
    this.dog.scale.set(1.4, 1.4 * (1 + (reduced ? 0 : Math.sin(t * 1.5) * 0.012)), 1.4)

    /* hover: only worked out when the pointer has moved */
    if (this.pointerMoved) {
      this.pointerMoved = false
      const over = this.pick()
      if (over !== this.hovered) {
        this.hovered = over
        this.opts.onHover?.(over ? over.id : null)
      }
    }

    if (this.term.update(now)) this.wake(0)

    this.items.forEach((it) => {
      const p = reduced ? 1 : Math.min(1, Math.max(0, (t - it.popAt) / 1.0))
      const intro = p <= 0 ? 0.001 : 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2)
      it.focus += ((this.focusId === it.id ? 1 : 0) - it.focus) * (1 - Math.pow(0.002, dt))
      it.hover += ((it === this.hovered ? 1 : 0) - it.hover) * (1 - Math.pow(0.001, dt))
      it.obj.position.set(it.base.x, it.base.y + it.hop.v + it.hover * 0.05 + it.focus * 0.28, it.base.z)
      it.obj.scale.setScalar(intro * (1 + it.focus * 0.04))
    })
    /* her heart: floats, sways, glows brighter in her section, beats when poked */
    const hv = this.heartBeat.v
    const hi = this.byId.get('heart')
    if (hi) hi.obj.position.y += reduced ? 0 : Math.sin(t * 1.1) * 0.1
    this.heartMesh.rotation.y = reduced ? 0 : Math.sin(t * 0.5) * 0.4
    this.heartMesh.scale.setScalar(0.5 * (1 + hv * 0.14 + (reduced ? 0 : Math.pow(Math.max(0, Math.sin(t * 2.4)), 8) * 0.03)))
    this.heartLight.intensity = 3 + m * 7 + hv * 6
    this.heartMat.emissiveIntensity = 0.1 + m * 0.3 + hv * 0.3
    const d = new Date()
    const sec = d.getSeconds() + d.getMilliseconds() / 1000
    const min = d.getMinutes() + sec / 60
    const hr = (d.getHours() % 12) + min / 60
    const sp = this.clockSpin.v
    this.hSec.rotation.z = -((sec / 60) * Math.PI * 2 + sp)
    this.hMin.rotation.z = -((min / 60) * Math.PI * 2 + sp)
    this.hHour.rotation.z = -((hr / 12) * Math.PI * 2 + sp / 12)
    if (!reduced) this.plant.rotation.z = Math.sin(t * 0.5) * 0.015

    /* every so often, something does something nobody asked for */
    if (!reduced && t > this.nextIdle) {
      this.nextIdle = t + gsap.utils.random(14, 28)
      const pool = this.items.filter((x) => x.id !== 'lamp' && x.id !== 'heart' && x.id !== 'envelope' && x.id !== 'door' && x.id !== 'breeze' && x.id !== 'desklamp')
      this.nudge(pool[Math.floor(Math.random() * pool.length)])
    }

    /* shadows only need redrawing while something is moving */
    if (now < this.activeUntil) this.renderer.shadowMap.needsUpdate = true
    this.renderer.render(this.scene, this.camera)
  }
}
