import { AGENTS } from './agents'
import {
  ARCADE_POS, BAR_POS, COUNTER_POS, FOOS_POS, JUKE_POS, LAMP_POS, LPUFF_POS, LSOFA_POS, LTABLE_POS,
  PINGPONG_POS, POOL_POS, PUFF_POS, SOFA_POS, STOOL_POS, type V2,
} from './layout'

/** Mapa de obstáculos y búsqueda de caminos (A*): los empleados rodean muebles y paredes. */
export interface Rect { x0: number; x1: number; z0: number; z1: number }

const R = (cx: number, cz: number, w: number, d: number): Rect => ({
  x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2,
})

export const chairRect = (desk: V2) => R(desk[0], desk[1] + 0.95, 0.6, 0.6)

const PLANTS: V2[] = [
  [-9.8, -10.3], [-0.2, -10.3], [9.6, -10.3], [14.4, -10.3], [-14.4, 4.6],
  [-3.6, 10.3], [3.6, -3.6], [5.1, 10.4],
  [-14.4, 16.4], [14.4, 16.4], [0, 16.4], [-8, 16.4], [8, 16.4],
]

/** Todo lo que bloquea el paso (menos las sillas, que se tratan aparte). */
const HARD: Rect[] = [
  ...AGENTS.map((a) => R(a.desk[0], a.desk[1], 1.7, 0.9)),
  R(-12, -9.55, 2.6, 0.5), // escritorio del director (ala trasera)
  R(-14.5, -9, 0.5, 2.2), // biblioteca
  ...PLANTS.map(([x, z]) => R(x, z, 0.42, 0.42)),
  R(COUNTER_POS[0], COUNTER_POS[1], 1.0, 3.5),
  R(SOFA_POS[0], SOFA_POS[1], 2.2, 0.9),
  ...PUFF_POS.map(([x, z]) => R(x, z, 1.0, 1.0)),
  R(POOL_POS[0], POOL_POS[1], 3.0, 1.7),
  R(PINGPONG_POS[0], PINGPONG_POS[1], 1.5, 2.7),
  ...ARCADE_POS.map(([x, z]) => R(x, z + 0.05, 0.9, 1.0)),
  // paredes y tabiques
  R(-9, -8, 0.1, 6), R(-14.05, -5, 1.9, 0.1), R(-10, -5, 2, 0.1), // despacho del director
  R(0.5, -8, 0.2, 6), R(10, -8, 0.2, 6), // entre equipos
  R(-4.5, -2.7, 0.2, 3.6), R(-4.5, 3.4, 0.2, 3.2), // financiero (con puerta)
  R(4.5, 3.0, 0.2, 5.0), R(4.5, 12.5, 0.2, 9.0), // entretenimiento (con puerta)
  R(9.75, 0.5, 10.5, 0.26), // pared de la tele
  R(FOOS_POS[0], FOOS_POS[1], 1.6, 0.95), // metegol
  R(JUKE_POS[0], JUKE_POS[1], 0.7, 1.0), // máquina de música
  R(BAR_POS[0], BAR_POS[1], 0.95, 2.8), // barra
  ...STOOL_POS.map(([x, z]) => R(x, z, 0.45, 0.45)),
  R(LSOFA_POS[0], LSOFA_POS[1], 2.2, 0.9),
  R(LTABLE_POS[0], LTABLE_POS[1], 1.3, 0.6),
  ...LPUFF_POS.map(([x, z]) => R(x, z, 1.0, 1.0)),
  ...LAMP_POS.map(([x, z]) => R(x, z, 0.35, 0.35)),
  R(-9.75, 8.125, 10.5, 5.75), // sala de desarrollo web (cerrada)
  R(-9.75, 11.0, 10.5, 0.2), // frente de la sala de desarrollo web
]

const CELL = 0.4
const X0 = -15.2
const Z0 = -11.2
const NX = 76
const NZ = 72
const INFL = 0.32

const hard = new Uint8Array(NX * NZ)
const chairs = new Uint8Array(NX * NZ)
/** Celdas que están realmente dentro de un mueble (sin margen) y de cuál. */
const core = new Uint8Array(NX * NZ)
const coreOwner = new Int16Array(NX * NZ)
const cxOf = (i: number) => X0 + (i + 0.5) * CELL
const czOf = (j: number) => Z0 + (j + 0.5) * CELL
const ixOf = (x: number) => Math.min(NX - 1, Math.max(0, Math.floor((x - X0) / CELL)))
const jzOf = (z: number) => Math.min(NZ - 1, Math.max(0, Math.floor((z - Z0) / CELL)))

function mark(arr: Uint8Array, r: Rect) {
  for (let j = jzOf(r.z0 - INFL); j <= jzOf(r.z1 + INFL); j++)
    for (let i = ixOf(r.x0 - INFL); i <= ixOf(r.x1 + INFL); i++) {
      const x = cxOf(i), z = czOf(j)
      if (x >= r.x0 - INFL && x <= r.x1 + INFL && z >= r.z0 - INFL && z <= r.z1 + INFL) arr[j * NX + i] = 1
    }
}
HARD.forEach((r, n) => {
  mark(hard, r)
  for (let j = jzOf(r.z0); j <= jzOf(r.z1); j++)
    for (let i = ixOf(r.x0); i <= ixOf(r.x1); i++) {
      const x = cxOf(i), z = czOf(j)
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        core[j * NX + i] = 1
        coreOwner[j * NX + i] = n
      }
    }
})
AGENTS.forEach((a) => mark(chairs, chairRect(a.desk)))
for (let j = 0; j < NZ; j++)
  for (let i = 0; i < NX; i++) {
    const x = cxOf(i), z = czOf(j)
    if (x < -14.65 || x > 14.65 || z < -10.65 || z > 16.65) hard[j * NX + i] = 1
  }

const inRect = (x: number, z: number, r: Rect, pad: number) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad

interface Ctx { from: V2; to: V2; exempt?: Rect; own: Set<number> }

/** Muebles que contienen a este punto (el sillón donde uno se sienta no lo bloquea). */
const ownersAt = (p: V2) => {
  const out: number[] = []
  HARD.forEach((r, n) => {
    if (inRect(p[0], p[1], r, 0)) out.push(n)
  })
  return out
}

function free(i: number, j: number, c?: Ctx) {
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return false
  const x = cxOf(i), z = czOf(j)
  const k = j * NX + i
  if (c && (Math.hypot(x - c.from[0], z - c.from[1]) < 1.0 || Math.hypot(x - c.to[0], z - c.to[1]) < 1.0)) {
    // cerca de la salida o la llegada: solo cuenta el interior real de los muebles ajenos
    return !(core[k] && !c.own.has(coreOwner[k]))
  }
  if (hard[k]) return false
  if (chairs[k] && !(c?.exempt && inRect(x, z, c.exempt, INFL))) return false
  return true
}

/** ¿Se puede estar parado en este punto (sin quedar dentro de un mueble)? */
export const freeAt = (x: number, z: number) => free(ixOf(x), jzOf(z))
/** ¿Este punto está dentro de un mueble de verdad (sin contar el margen)? */
export const insideFurniture = (x: number, z: number) => core[jzOf(z) * NX + ixOf(x)] === 1

function lineFree(a: V2, b: V2, c: Ctx) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12))
  for (let s = 0; s <= n; s++) {
    const x = a[0] + ((b[0] - a[0]) * s) / n
    const z = a[1] + ((b[1] - a[1]) * s) / n
    if (!free(ixOf(x), jzOf(z), c)) return false
  }
  return true
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
]

/** Camino desde `from` hasta `to` esquivando obstáculos. `exempt` = la silla propia, que sí se puede pisar. */
export function findPath(from: V2, to: V2, exempt?: Rect): V2[] {
  const c: Ctx = { from, to, exempt, own: new Set([...ownersAt(from), ...ownersAt(to)]) }
  const si = ixOf(from[0]), sj = jzOf(from[1])
  const gi = ixOf(to[0]), gj = jzOf(to[1])
  if (lineFree(from, to, c)) return [to]

  const g = new Float32Array(NX * NZ).fill(Infinity)
  const prev = new Int32Array(NX * NZ).fill(-1)
  const closed = new Uint8Array(NX * NZ)
  const heap: [number, number][] = []
  const push = (f: number, k: number) => {
    heap.push([f, k])
    let n = heap.length - 1
    while (n > 0) {
      const p = (n - 1) >> 1
      if (heap[p][0] <= heap[n][0]) break
      ;[heap[p], heap[n]] = [heap[n], heap[p]]
      n = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let n = 0
      for (;;) {
        const l = 2 * n + 1, r = l + 1
        let m = n
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === n) break
        ;[heap[m], heap[n]] = [heap[n], heap[m]]
        n = m
      }
    }
    return top
  }
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - gi), dz = Math.abs(j - gj)
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz)
  }

  const start = sj * NX + si
  g[start] = 0
  push(h(si, sj), start)
  const goal = gj * NX + gi
  let found = false
  while (heap.length) {
    const [, k] = pop()
    if (closed[k]) continue
    closed[k] = 1
    if (k === goal) {
      found = true
      break
    }
    const i = k % NX, j = (k / NX) | 0
    for (const [di, dj, cost] of DIRS) {
      const ni = i + di, nj = j + dj
      if (!free(ni, nj, c)) continue
      if (di && dj && (!free(i + di, j, c) || !free(i, j + dj, c))) continue
      const nk = nj * NX + ni
      const ng = g[k] + cost
      if (ng < g[nk]) {
        g[nk] = ng
        prev[nk] = k
        push(ng + h(ni, nj), nk)
      }
    }
  }
  if (!found) return [to]

  const cells: V2[] = []
  for (let k = goal; k !== -1; k = prev[k]) cells.push([cxOf(k % NX), czOf((k / NX) | 0)])
  cells.reverse()
  cells[0] = from
  cells[cells.length - 1] = to

  // acortar esquinas: quedarse con los puntos imprescindibles
  const out: V2[] = []
  let a = 0
  while (a < cells.length - 1) {
    let b = cells.length - 1
    while (b > a + 1 && !lineFree(cells[a], cells[b], c)) b--
    out.push(cells[b])
    a = b
  }
  return out
}
