import { AGENTS, agentById, type Mode } from './agents'
import { SPOTS, type ActKind, type Spot } from './layout'

/** Solo para pruebas: ?sim=8 acelera la animación. */
export const SIM = Number(new URLSearchParams(location.search).get('sim')) || 1

export interface Assignment {
  id: string
  kind: ActKind
  spot: [number, number]
  face: number
  sitY: number
  until: number
  slot: string
  partner?: string
  /** momento (reloj de simulación) en que el empleado llegó a su lugar */
  readyAt?: number
}

/** Quién está haciendo qué en el área de entretenimiento. Todo es visual: no consume el plan. */
const assignments = new Map<string, Assignment>()
const taken = new Set<string>()
let modes: Record<string, Mode> = {}

export function releaseAgent(id: string) {
  const a = assignments.get(id)
  if (!a) return
  assignments.delete(id)
  taken.delete(a.slot)
  if (a.partner) {
    const b = assignments.get(a.partner)
    if (b) {
      assignments.delete(a.partner)
      taken.delete(b.slot)
    }
  }
}

let demoDone = false

export function setModes(m: Record<string, Mode>) {
  modes = m
  for (const id of [...assignments.keys()]) if (m[id] !== 'idle') releaseAgent(id)
  // solo para pruebas: ?demo=pp / ?demo=pool pone a dos compañeros a jugar de entrada
  const demo = /demo=(pp|pool)/.exec(location.search)?.[1]
  if (demo && !demoDone && m.rrpp === 'idle' && m.redes === 'idle') {
    demoDone = true
    const [sa, sb] = SPOTS.filter((x) => x.kind === (demo === 'pp' ? 'pingpong' : 'pool'))
    taken.add(sa.key)
    taken.add(sb.key)
    const until = 1e9
    assignments.set('rrpp', make('rrpp', sa, until, 'redes'))
    assignments.set('redes', make('redes', sb, until, 'rrpp'))
  }
}

export const getAssignment = (id: string) => assignments.get(id)
export const bySlot = (slot: string) => [...assignments.values()].find((a) => a.slot === slot)

/** Duración de cada tiro de la pelota (de una paleta a la otra). */
export const RALLY_D = 0.7

/** Estado del peloteo de ping pong para un jugador (null si todavía no empezó). */
export function rallyOf(id: string, now: number) {
  const a = assignments.get(id)
  if (!a || a.kind !== 'pingpong' || !a.partner || a.readyAt == null) return null
  const b = assignments.get(a.partner)
  if (!b || b.readyAt == null) return null
  const start = Math.max(a.readyAt, b.readyAt) + 0.6
  if (now < start) return null
  const e = now - start
  return { role: a.slot === 'ppA' ? 0 : 1, k: Math.floor(e / RALLY_D), u: (e / RALLY_D) % 1, elapsed: e }
}

export function tick(now: number) {
  for (const a of [...assignments.values()]) if (now > a.until) releaseAgent(a.id)
}

const free = (id: string) => modes[id] === 'idle' && !assignments.has(id)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const make = (id: string, s: Spot, until: number, partner?: string): Assignment => ({
  id, kind: s.kind, spot: s.pos, face: s.face, sitY: s.sitY, until, slot: s.key, partner,
})

function solo(id: string, kind: ActKind, now: number): Assignment | null {
  const spots = SPOTS.filter((s) => s.kind === kind && !taken.has(s.key))
  if (!spots.length) return null
  const s = pick(spots)
  taken.add(s.key)
  const a = make(id, s, now + (kind === 'coffee' ? 6 : 12) + Math.random() * 14)
  assignments.set(id, a)
  return a
}

/** Pool y ping pong: solo juegan dos que trabajan juntos (misma zona) y están libres. */
function pair(id: string, kind: 'pool' | 'pingpong', now: number): Assignment | null {
  const spots = SPOTS.filter((s) => s.kind === kind)
  if (spots.some((s) => taken.has(s.key))) return null
  const zone = agentById(id).zone
  const mates = AGENTS.filter((a) => a.id !== id && a.zone === zone && free(a.id))
  if (!mates.length) return null
  const mate = pick(mates)
  // el pool no termina solo: juegan hasta que se les asigne una tarea (o se apaguen); el ping pong dura más que antes
  const until = kind === 'pool' ? Infinity : now + 45 + Math.random() * 45
  const [sa, sb] = spots
  taken.add(sa.key)
  taken.add(sb.key)
  const a = make(id, sa, until, mate.id)
  assignments.set(id, a)
  assignments.set(mate.id, make(mate.id, sb, until, id))
  return a
}

/** El agente libre decide qué hacer. Devuelve null si le toca pasear. */
export function requestActivity(id: string, now: number): Assignment | null {
  const r = Math.random()
  if (r < 0.45) return null // casi la mitad de las veces pasean por el pasillo y el lobby
  if (r < 0.6) return solo(id, 'sit', now)
  if (r < 0.7) return solo(id, 'arcade', now)
  if (r < 0.77) return solo(id, 'coffee', now)
  if (r < 0.88) return pair(id, 'pool', now) ?? solo(id, 'sit', now)
  return pair(id, 'pingpong', now) ?? solo(id, 'arcade', now)
}
