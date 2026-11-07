/** Posiciones compartidas entre la oficina (muebles) y los empleados (actividades). */
export type V2 = [number, number]

/** Área de entretenimiento: x[4.5,15] z[0.5,17] (llega hasta la pared del frente) */
export const ROOM = { x0: 4.5, x1: 15, z0: 0.5, z1: 17 }

export const TV_POS: V2 = [11.5, 0.6]
export const ARCADE_POS: V2[] = [[5.9, 0.95], [7.3, 0.95], [8.7, 0.95], [14.3, 0.95]]
export const SOFA_POS: V2 = [11.5, 4.3]
export const PUFF_POS: V2[] = [[8.6, 4.3], [14.0, 3.2], [14.0, 5.4]]
export const POOL_POS: V2 = [11.5, 8.0]
export const PINGPONG_POS: V2 = [7.0, 8.6]
/** Cafetera: contra la pared izquierda, en el rincón del lobby (mira hacia +x). */
export const COUNTER_POS: V2 = [-14.45, 13.4]
export const COUNTER_ROT = Math.PI / 2

// ---- ampliación de la sala de entretenimiento ----
export const FOOS_POS: V2 = [7.4, 13.2] // metegol
export const JUKE_POS: V2 = [5.25, 3.6] // máquina de música
export const BAR_POS: V2 = [14.4, 12.2] // barra
export const STOOL_POS: V2[] = [[13.45, 11.3], [13.45, 12.2], [13.45, 13.1]]
export const LSOFA_POS: V2 = [12.5, 16.2] // living del fondo
export const LTABLE_POS: V2 = [12.5, 14.7]
export const LPUFF_POS: V2[] = [[10.4, 14.9], [14.1, 14.9]]
export const LAMP_POS: V2[] = [[5.35, 12.0], [14.5, 16.4], [9.2, 16.4]]

export const faceTo = (from: V2, to: V2) => Math.atan2(to[0] - from[0], to[1] - from[1])

export type ActKind = 'sit' | 'arcade' | 'pool' | 'pingpong' | 'coffee'

export interface Spot {
  key: string
  kind: ActKind
  pos: V2
  face: number
  sitY: number
}

export const SPOTS: Spot[] = [
  { key: 'arcade1', kind: 'arcade', pos: [5.9, 1.95], face: Math.PI, sitY: 0 },
  { key: 'arcade2', kind: 'arcade', pos: [7.3, 1.95], face: Math.PI, sitY: 0 },
  { key: 'arcade3', kind: 'arcade', pos: [8.7, 1.95], face: Math.PI, sitY: 0 },
  { key: 'arcade4', kind: 'arcade', pos: [14.3, 1.95], face: Math.PI, sitY: 0 },
  { key: 'sofa1', kind: 'sit', pos: [10.75, 4.15], face: faceTo([10.75, 4.15], TV_POS), sitY: 0.06 },
  { key: 'sofa2', kind: 'sit', pos: [12.25, 4.15], face: faceTo([12.25, 4.15], TV_POS), sitY: 0.06 },
  ...PUFF_POS.map((p, i): Spot => ({ key: `puff${i + 1}`, kind: 'sit', pos: p, face: faceTo(p, TV_POS), sitY: -0.02 })),
  ...STOOL_POS.map((p, i): Spot => ({ key: `stool${i + 1}`, kind: 'sit', pos: p, face: Math.PI / 2, sitY: 0.11 })),
  { key: 'lsofa1', kind: 'sit', pos: [11.75, 16.05], face: Math.PI, sitY: 0.06 },
  { key: 'lsofa2', kind: 'sit', pos: [13.25, 16.05], face: Math.PI, sitY: 0.06 },
  ...LPUFF_POS.map((p, i): Spot => ({ key: `lpuff${i + 1}`, kind: 'sit', pos: p, face: faceTo(p, LTABLE_POS), sitY: -0.02 })),
  { key: 'poolA', kind: 'pool', pos: [10.7, 6.5], face: 0, sitY: 0 },
  { key: 'poolB', kind: 'pool', pos: [12.3, 9.5], face: Math.PI, sitY: 0 },
  { key: 'ppA', kind: 'pingpong', pos: [7.0, 6.6], face: 0, sitY: 0 },
  { key: 'ppB', kind: 'pingpong', pos: [7.0, 10.6], face: Math.PI, sitY: 0 },
  { key: 'coffee1', kind: 'coffee', pos: [COUNTER_POS[0] + 1.15, COUNTER_POS[1] + 1.0], face: -Math.PI / 2, sitY: 0 },
]

/** Puntos por donde pasean los libres (pasillo central y lobby del frente, fuera del área de entretenimiento). */
export const HALL_POINTS: V2[] = [
  // pasillo central
  [-2, -1], [3, 3.5], [0, 6.5], [2, 9.5], [-2, 9], [-2, 4], [1, 8], [3, 5.5],
  [8, -1.2], [13, -1.5], [14, -3],
  // lobby del frente (lado izquierdo; el derecho ahora es parte de la sala de entretenimiento)
  [-13, 13], [-9, 15.2], [-5, 12.8], [-1, 15], [3, 13], [-11, 12.4], [1, 12.2],
  [-6.5, 14], [-3, 16], [2, 15.5], [-8, 12.2], [-12.5, 15.5], [3.2, 16.2],
]

/** Ping pong: donde cada paleta golpea la pelota, altura de la mesa y de la red. */
export const PP_HIT_A: [number, number, number] = [PINGPONG_POS[0] + 0.37, 1.1, 7.36]
export const PP_HIT_B: [number, number, number] = [PINGPONG_POS[0] - 0.37, 1.1, 9.84]
export const PP_TABLE_Y = 0.83
