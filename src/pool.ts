import * as THREE from 'three'
import { bySlot } from './activities'
import { freeAt } from './nav'
import { POOL_POS, SPOTS, type V2 } from './layout'

/** Pool: física de las bolas + el desarrollo de la partida (saque, turnos, tiros). Todo es visual. */
export const BALL_R = 0.05
export const FELT_Y = 0.92

// el centro de una bola no puede pasar de estos límites (media mesa de juego menos la banda y el radio)
const HX = 1.2
const HZ = 0.6
const E_BALL = 0.95 // rebote entre bolas
const E_WALL = 0.72 // rebote contra la banda
const FRIC = 1.0 // frenado constante (u/s²)
const DAMP = 0.18 // frenado proporcional a la velocidad
const POCKETS: [number, number, number][] = [
  [-1.3, -0.64, 0.15], [1.3, -0.64, 0.15], [-1.3, 0.64, 0.15], [1.3, 0.64, 0.15],
  [0, -0.66, 0.12], [0, 0.66, 0.12],
]

// geometría del brazo para que la punta del taco llegue justo a la bola
const SHOULDER_DROP = 1.22 - (FELT_Y + BALL_R)
const TIP_BASE = 2.3
const SIDE = 0.37
const PULL_MAX = 0.34
/** Tiros por mini-partida (saque incluido): 4 por jugador, y después se arma otro triángulo. */
const SHOTS_PER_GAME = 8

export interface PoolBall {
  id: number
  x: number
  z: number
  vx: number
  vz: number
  active: boolean
  sunkAt: number
  q: THREE.Quaternion
}

export const balls: PoolBall[] = Array.from({ length: 16 }, (_, id) => ({
  id, x: 0, z: 0, vx: 0, vz: 0, active: true, sunkAt: -1, q: new THREE.Quaternion(),
}))

const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Arma el triángulo con las 15 bolas y deja la blanca en el punto de saque. */
export function rack() {
  const order = shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15])
  order.splice(4, 0, 8) // la 8 va en el centro de la tercera fila
  const dx = BALL_R * 2 * 0.866 + 0.002
  const dz = BALL_R * 2 + 0.003
  let n = 0
  for (let row = 0; row < 5; row++)
    for (let j = 0; j <= row; j++) {
      const b = balls[order[n++]]
      b.x = 0.62 + row * dx
      b.z = (j - row / 2) * dz
    }
  for (const b of balls) {
    b.vx = b.vz = 0
    b.active = true
    b.sunkAt = -1
    b.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6))
  }
  balls[0].x = -0.62
  balls[0].z = 0
}
rack()

const tmpQ = new THREE.Quaternion()
const tmpAxis = new THREE.Vector3()
let simNow = 0

function sub(h: number) {
  for (const b of balls) {
    if (!b.active) continue
    const sp = Math.hypot(b.vx, b.vz)
    if (sp > 0) {
      const ns = Math.max(0, sp - (FRIC + DAMP * sp) * h)
      const k = ns / sp
      b.vx *= k
      b.vz *= k
      if (ns < 0.02) b.vx = b.vz = 0
    }
    const v = Math.hypot(b.vx, b.vz)
    if (v > 0) {
      b.x += b.vx * h
      b.z += b.vz * h
      // la bola rueda: gira alrededor del eje horizontal perpendicular al avance
      tmpAxis.set(b.vz, 0, -b.vx).normalize()
      tmpQ.setFromAxisAngle(tmpAxis, (v * h) / BALL_R)
      b.q.premultiply(tmpQ)
    }
    if (b.x > HX) { b.x = HX; b.vx = -b.vx * E_WALL }
    if (b.x < -HX) { b.x = -HX; b.vx = -b.vx * E_WALL }
    if (b.z > HZ) { b.z = HZ; b.vz = -b.vz * E_WALL }
    if (b.z < -HZ) { b.z = -HZ; b.vz = -b.vz * E_WALL }
    for (const [px, pz, pr] of POCKETS) {
      if (Math.hypot(b.x - px, b.z - pz) < pr) {
        b.active = false
        b.sunkAt = simNow
        b.vx = b.vz = 0
        break
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = balls[i]
    if (!a.active) continue
    for (let j = i + 1; j < 16; j++) {
      const b = balls[j]
      if (!b.active) continue
      const dx = b.x - a.x, dz = b.z - a.z
      const d2 = dx * dx + dz * dz
      const min = BALL_R * 2
      if (d2 >= min * min || d2 === 0) continue
      const d = Math.sqrt(d2)
      const nx = dx / d, nz = dz / d
      const push = (min - d) / 2
      a.x -= nx * push; a.z -= nz * push
      b.x += nx * push; b.z += nz * push
      const rvn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
      if (rvn > 0) {
        const j2 = ((1 + E_BALL) / 2) * rvn
        a.vx -= j2 * nx; a.vz -= j2 * nz
        b.vx += j2 * nx; b.vz += j2 * nz
      }
    }
  }
}

function step(dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 240)))
  for (let i = 0; i < n; i++) sub(dt / n)
}

const anyMoving = () => balls.some((b) => b.active && (b.vx !== 0 || b.vz !== 0))

/* ---------------- la partida ---------------- */

export interface PoolTarget {
  shot: number
  pos: V2
  face: number
  shooter: boolean
  cue: boolean
  arm: number
  slide: number
}

interface Plan {
  shot: number
  shooter: string
  pos: V2
  face: number
  arm: number
  s0: number
  dir: V2
  power: number
}

type Phase = 'idle' | 'ready' | 'walk' | 'aim' | 'strike' | 'follow' | 'roll' | 'pause'

let phase: Phase = 'idle'
let tPhase = 0
let plan: Plan | null = null
let shotId = 0
let shotCount = 0
let turn = ''
let pull = 0
let players: { A: string; B: string } | null = null
const arrived: Record<string, number> = {}

const spotOf = (key: string) => SPOTS.find((s) => s.key === key)!
const baseOf = (id: string) => (players && id === players.A ? spotOf('poolA') : spotOf('poolB'))

/** Dónde se para el jugador para que la punta del taco quede justo contra la bola blanca. */
function stand(cue: V2, dir: V2, D: number) {
  const phi = Math.atan2(dir[0], dir[1])
  const right: V2 = [Math.cos(phi), -Math.sin(phi)]
  const pos: V2 = [
    POOL_POS[0] + cue[0] - dir[0] * D - SIDE * right[0],
    POOL_POS[1] + cue[1] - dir[1] * D - SIDE * right[1],
  ]
  const dr = D - BALL_R - 0.005
  return { pos, face: phi, arm: -Math.atan2(dr, SHOULDER_DROP), s0: TIP_BASE - Math.hypot(dr, SHOULDER_DROP) }
}

const norm = (x: number, z: number): V2 => {
  const l = Math.hypot(x, z) || 1
  return [x / l, z / l]
}

function lineClear(from: V2, to: V2, skip: number[]) {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]]
  const len2 = dx * dx + dz * dz
  for (const b of balls) {
    if (!b.active || skip.includes(b.id)) continue
    const t = Math.max(0, Math.min(1, ((b.x - from[0]) * dx + (b.z - from[1]) * dz) / len2))
    if (Math.hypot(from[0] + dx * t - b.x, from[1] + dz * t - b.z) < BALL_R * 2 + 0.01) return false
  }
  return true
}

function planShot(shooter: string) {
  shotId++
  const cue: V2 = [balls[0].x, balls[0].z]
  let dir: V2
  let power: number
  let D = 1.4
  if (shotCount === 0) {
    // saque: se tira desde el extremo de la mesa contra el triángulo
    const ang = (Math.random() - 0.5) * 0.04
    dir = [Math.cos(ang), Math.sin(ang)]
    power = 3.5 + Math.random() * 0.4
  } else {
    const targets = balls.filter((b) => b.id !== 0 && b.active)
    const options: { dir: V2; power: number; D: number }[] = []
    for (const strict of [true, false]) {
      for (const t of targets) {
        const d0 = norm(t.x - cue[0], t.z - cue[1])
        const off = (Math.random() - 0.5) * BALL_R * 1.8 // toma la bola un poco de costado
        const aim: V2 = [t.x - d0[1] * off, t.z + d0[0] * off]
        const dd = norm(aim[0] - cue[0], aim[1] - cue[1])
        if (strict && !lineClear(cue, [t.x, t.z], [0, t.id])) continue
        const dist = Math.hypot(t.x - cue[0], t.z - cue[1])
        for (const cand of [1.35, 1.55, 1.75, 1.95, 2.2]) {
          const s = stand(cue, dd, cand)
          if (freeAt(s.pos[0], s.pos[1])) {
            options.push({ dir: dd, power: 1.7 + Math.min(dist, 1.6) * 0.6 + Math.random() * 0.8, D: cand })
            break
          }
        }
      }
      if (options.length) break
    }
    const pick = options.length
      ? options[Math.floor(Math.random() * options.length)]
      : { dir: norm(1, (Math.random() - 0.5) * 0.4), power: 2.2, D: 1.4 }
    dir = pick.dir
    power = pick.power
    D = pick.D
  }
  const s = stand(cue, dir, D)
  plan = { shot: shotId, shooter, pos: s.pos, face: s.face, arm: s.arm, s0: s.s0, dir, power }
}

export function poolTarget(id: string): PoolTarget | null {
  if (!plan || phase === 'idle' || phase === 'ready') return null
  if (id === plan.shooter) {
    return {
      shot: plan.shot, pos: plan.pos, face: plan.face, shooter: true,
      cue: phase === 'aim' || phase === 'strike' || phase === 'follow',
      arm: plan.arm, slide: plan.s0 + pull,
    }
  }
  const b = baseOf(id)
  return { shot: plan.shot, pos: b.pos, face: b.face, shooter: false, cue: false, arm: -0.4, slide: 0 }
}

export function poolArrived(id: string, shot: number) {
  arrived[id] = shot
}

function reset() {
  phase = 'idle'
  plan = null
  players = null
  pull = 0
  shotCount = 0
  rack()
}

/** Avanza la partida y la física. Se llama una vez por cuadro. */
export function updatePool(now: number, dt: number) {
  simNow = now
  const A = bySlot('poolA')
  const B = bySlot('poolB')
  const playing = !!A && !!B && A.partner === B.id && A.readyAt != null && B.readyAt != null
  if (!playing) {
    if (phase !== 'idle') reset()
    return
  }
  if (phase === 'idle') {
    players = { A: A!.id, B: B!.id }
    turn = Math.random() < 0.5 ? A!.id : B!.id
    shotCount = 0
    phase = 'ready'
    tPhase = now
  }
  const other = () => (players!.A === turn ? players!.B : players!.A)
  const e = now - tPhase

  if (moving()) step(dt)

  switch (phase) {
    case 'ready':
      if (e > 0.8) {
        planShot(turn)
        phase = 'walk'
      }
      break
    case 'walk':
      if (plan && arrived[plan.shooter] === plan.shot) {
        phase = 'aim'
        tPhase = now
      }
      break
    case 'aim': {
      if (e < 1.3) pull = 0.02 + 0.15 * (1 - Math.cos((2 * Math.PI * e) / 0.65)) // tiros de práctica
      else {
        const u = Math.min(1, (e - 1.3) / 0.35)
        pull = 0.02 + (PULL_MAX - 0.02) * (u * u * (3 - 2 * u))
      }
      if (e >= 1.85) {
        phase = 'strike'
        tPhase = now
      }
      break
    }
    case 'strike': {
      const u = Math.min(1, e / 0.1)
      pull = PULL_MAX * (1 - u * u)
      if (e >= 0.1 && plan) {
        balls[0].vx = plan.dir[0] * plan.power
        balls[0].vz = plan.dir[1] * plan.power
        phase = 'follow'
        tPhase = now
      }
      break
    }
    case 'follow':
      pull = -0.05 * Math.min(1, e / 0.12)
      if (e > 0.35) {
        pull = 0
        phase = 'roll'
        tPhase = now
      }
      break
    case 'roll':
      if ((!anyMoving() && e > 0.5) || e > 9) {
        for (const b of balls) b.vx = b.vz = 0
        if (!balls[0].active) {
          // blanca embocada: vuelve al punto de saque
          balls[0].active = true
          balls[0].sunkAt = -1
          balls[0].x = -0.62
          balls[0].z = 0
        }
        shotCount++
        phase = 'pause'
        tPhase = now
      }
      break
    case 'pause':
      if (e > 0.9) {
        if (shotCount >= SHOTS_PER_GAME) {
          // fin de la mini-partida: se arma otro triángulo y se sigue jugando
          rack()
          shotCount = 0
          phase = 'ready'
          tPhase = now
          turn = other()
        } else {
          turn = other()
          planShot(turn)
          phase = 'walk'
        }
      }
      break
  }
}

const moving = anyMoving
