import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { B } from './parts'
import { getTex } from './textures'
import { AGENTS, ZONES, type Mode, type Zone } from './agents'
import {
  ARCADE_POS, BAR_POS, COUNTER_POS, COUNTER_ROT, FOOS_POS, JUKE_POS, LAMP_POS, LPUFF_POS, LSOFA_POS, LTABLE_POS, PINGPONG_POS,
  POOL_POS, PP_HIT_A, PP_HIT_B, PP_TABLE_Y, PUFF_POS, ROOM, SOFA_POS, STOOL_POS, TV_POS,
} from './layout'
import { SIM, bySlot, rallyOf } from './activities'
import { BALL_R, FELT_Y, balls, updatePool } from './pool'

type ScreenState = Mode | 'dead'

const SCREEN_COLOR: Record<ScreenState, string> = {
  working: '#5fe3c0',
  idle: '#2a5d86',
  off: '#08080a',
  dead: '#050506',
}

/* ---------- muebles ---------- */

function Desk({ x, z, screen }: { x: number; z: number; screen: ScreenState }) {
  const wood = screen === 'dead' ? '#3a2f26' : '#a8723f'
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.75, 0]} s={[1.7, 0.07, 0.9]} c={wood} tex="wood" />
      <B p={[-0.78, 0.37, 0]} s={[0.07, 0.74, 0.85]} c={wood} tex="wood" />
      <B p={[0.78, 0.37, 0]} s={[0.07, 0.74, 0.85]} c={wood} tex="wood" />
      <B p={[0, 0.84, -0.2]} s={[0.1, 0.1, 0.1]} c="#26262c" tex="metal" />
      <B p={[0, 1.12, -0.2]} s={[0.78, 0.5, 0.06]} c="#1c1c22" tex="metal" />
      <B
        p={[0, 1.12, -0.165]}
        s={[0.7, 0.42, 0.02]}
        c={SCREEN_COLOR[screen]}
        emissive={screen === 'working' || screen === 'idle' ? SCREEN_COLOR[screen] : undefined}
      />
      <B p={[0, 0.8, 0.12]} s={[0.55, 0.03, 0.18]} c="#2d2d33" tex="metal" />
      <B p={[0.62, 0.84, 0.15]} s={[0.12, 0.1, 0.12]} c="#eae6dc" />
    </group>
  )
}

function Chair({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.5, 0]} s={[0.6, 0.1, 0.6]} c="#4a5078" tex="fabric" />
      <B p={[0, 0.95, 0.28]} s={[0.6, 0.8, 0.08]} c="#4a5078" tex="fabric" />
      <B p={[0, 0.25, 0]} s={[0.08, 0.5, 0.08]} c="#2a2a2e" tex="metal" />
      <B p={[0, 0.05, 0]} s={[0.6, 0.06, 0.08]} c="#2a2a2e" tex="metal" />
      <B p={[0, 0.05, 0]} s={[0.08, 0.06, 0.6]} c="#2a2a2e" tex="metal" />
    </group>
  )
}

function Plant({ x, z, h = 0.9 }: { x: number; z: number; h?: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.25, 0]} s={[0.42, 0.5, 0.42]} c="#c98a64" tex="clay" />
      <B p={[0, 0.5 + h / 2, 0]} s={[0.12, h, 0.12]} c="#3f7a3a" />
      <B p={[0.12, 0.7 + h / 2, 0.05]} s={[0.3, 0.3, 0.3]} c="#4f9a48" tex="felt" />
      <B p={[-0.12, 0.55 + h / 2, -0.08]} s={[0.26, 0.26, 0.26]} c="#3c8a3c" tex="felt" />
    </group>
  )
}

function Sofa({ x, z, rot = 0, c = '#5a6694' }: { x: number; z: number; rot?: number; c?: string }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <B p={[0, 0.3, 0]} s={[2.2, 0.5, 0.9]} c={c} tex="fabric" />
      <B p={[-0.55, 0.58, 0.05]} s={[1.0, 0.1, 0.78]} c={c} tex="fabric" />
      <B p={[0.55, 0.58, 0.05]} s={[1.0, 0.1, 0.78]} c={c} tex="fabric" />
      <B p={[0, 0.75, -0.38]} s={[2.2, 0.6, 0.18]} c={c} tex="fabric" />
      <B p={[-1.05, 0.55, 0]} s={[0.15, 0.4, 0.9]} c={c} tex="fabric" />
      <B p={[1.05, 0.55, 0]} s={[0.15, 0.4, 0.9]} c={c} tex="fabric" />
    </group>
  )
}

function Puff({ x, z, c }: { x: number; z: number; c: string }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.17, 0]} s={[1.0, 0.34, 1.0]} c={c} tex="fabric" />
      <B p={[0, 0.4, 0.02]} s={[0.84, 0.15, 0.84]} c={c} tex="fabric" />
      <B p={[0.1, 0.49, -0.1]} s={[0.3, 0.04, 0.3]} c={c} tex="fabric" />
    </group>
  )
}

function PoolTable({ x, z }: { x: number; z: number }) {
  const cushion = '#1f7a55'
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.78, 0]} s={[3, 0.2, 1.7]} c="#6a4326" tex="wood" />
      <B p={[0, 0.9, 0]} s={[2.7, 0.04, 1.4]} c="#2a9a6c" tex="felt" />
      {/* rieles de madera */}
      <B p={[0, 0.925, -0.775]} s={[3, 0.09, 0.15]} c="#5a3820" tex="wood" />
      <B p={[0, 0.925, 0.775]} s={[3, 0.09, 0.15]} c="#5a3820" tex="wood" />
      <B p={[-1.425, 0.925, 0]} s={[0.15, 0.09, 1.4]} c="#5a3820" tex="wood" />
      <B p={[1.425, 0.925, 0]} s={[0.15, 0.09, 1.4]} c="#5a3820" tex="wood" />
      {/* bandas (con hueco en las troneras) */}
      {[-1, 1].map((sz) =>
        [-1, 1].map((sx) => (
          <B key={`${sz}${sx}`} p={[sx * 0.655, 0.945, sz * 0.675]} s={[1.05, 0.05, 0.05]} c={cushion} tex="felt" />
        )),
      )}
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * 1.275, 0.945, 0]} s={[0.05, 0.05, 1.06]} c={cushion} tex="felt" />
      ))}
      {/* troneras */}
      {[[-1.3, -0.64], [1.3, -0.64], [-1.3, 0.64], [1.3, 0.64]].map(([px, pz], i) => (
        <B key={i} p={[px, 0.93, pz]} s={[0.26, 0.012, 0.26]} c="#0a0a0c" />
      ))}
      {[-0.66, 0.66].map((pz) => (
        <B key={pz} p={[0, 0.93, pz]} s={[0.22, 0.012, 0.2]} c="#0a0a0c" />
      ))}
      {[[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]].map(([lx, lz], i) => (
        <B key={i} p={[lx, 0.35, lz]} s={[0.18, 0.7, 0.18]} c="#4a2c16" tex="wood" />
      ))}
    </group>
  )
}

const BALL_COLORS = ['#f5f5ee', '#f2c230', '#2a5fd6', '#d6392a', '#6a3aa8', '#f08a24', '#2f9a4a', '#8a2a2a', '#151515']

/** Las 16 bolas: se mueven con la física de pool.ts; rebotan, ruedan (se nota en las rayadas) y caen a las troneras. */
function PoolBalls() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame((s, delta) => {
    const now = s.clock.elapsedTime * SIM
    updatePool(now, Math.min(delta, 0.05) * SIM)
    balls.forEach((b, i) => {
      const g = refs.current[i]
      if (!g) return
      let scale = 1
      let y = FELT_Y + BALL_R
      if (!b.active) {
        const t = now - b.sunkAt
        if (b.sunkAt < 0 || t > 0.3) {
          g.visible = false
          return
        }
        scale = 1 - t / 0.3
        y -= t * 0.4
      }
      g.visible = true
      g.position.set(POOL_POS[0] + b.x, y, POOL_POS[1] + b.z)
      g.quaternion.copy(b.q)
      g.scale.setScalar(scale)
    })
  })
  return (
    <>
      {balls.map((b) => {
        const color = BALL_COLORS[b.id <= 8 ? b.id : b.id - 8]
        const stripe = b.id > 8
        return (
          <group key={b.id} ref={(el) => { refs.current[b.id] = el }}>
            <mesh castShadow>
              <sphereGeometry args={[BALL_R, 16, 12]} />
              <meshStandardMaterial color={stripe ? '#f5f5ee' : color} roughness={0.22} />
            </mesh>
            {stripe && (
              <mesh>
                <cylinderGeometry args={[BALL_R * 1.01, BALL_R * 1.01, BALL_R * 0.8, 16, 1, true]} />
                <meshStandardMaterial color={color} roughness={0.22} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

function PingPong({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.76, 0]} s={[1.5, 0.06, 2.7]} c="#2d6fc4" tex="felt" />
      <B p={[0, 0.795, 0]} s={[0.03, 0.01, 2.7]} c="#f2f2f2" />
      <B p={[0, 0.795, 0]} s={[1.5, 0.01, 0.03]} c="#f2f2f2" />
      <B p={[0, 0.9, 0]} s={[1.62, 0.16, 0.02]} c="#e8e8e8" opacity={0.85} />
      {[[-0.65, -1.2], [0.65, -1.2], [-0.65, 1.2], [0.65, 1.2]].map(([lx, lz], i) => (
        <B key={i} p={[lx, 0.37, lz]} s={[0.07, 0.74, 0.07]} c="#2a2a2e" tex="metal" />
      ))}
    </group>
  )
}

/** Metegol: mesa con barras y jugadores rojos y azules. */
function Foosball({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.76, 0]} s={[1.5, 0.3, 0.8]} c="#7a4a28" tex="wood" />
      <B p={[0, 0.915, 0]} s={[1.32, 0.02, 0.62]} c="#2f9a58" tex="felt" />
      {[[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].map(([lx, lz], i) => (
        <B key={i} p={[lx, 0.3, lz]} s={[0.1, 0.6, 0.1]} c="#4a2c16" tex="wood" />
      ))}
      {[-0.5, -0.17, 0.17, 0.5].map((rx, i) => (
        <group key={i}>
          <B p={[rx, 1.0, 0]} s={[0.04, 0.04, 1.1]} c="#c9c9d0" tex="metal" />
          <B p={[rx, 1.0, 0.58]} s={[0.07, 0.09, 0.12]} c="#1a1a1e" />
          {[-0.2, 0, 0.2].map((fz) => (
            <B key={fz} p={[rx, 0.95, fz]} s={[0.07, 0.14, 0.05]} c={i % 2 ? '#2a5fd6' : '#d6392a'} />
          ))}
        </group>
      ))}
    </group>
  )
}

/** Máquina de música con luces que cambian de color. Mira hacia +x. */
function Jukebox({ x, z }: { x: number; z: number }) {
  const glow = useRef<THREE.Mesh>(null!)
  useFrame((s) => {
    const m = glow.current.material as THREE.MeshStandardMaterial
    m.emissive.setHSL((s.clock.elapsedTime * 0.12) % 1, 0.9, 0.5)
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <B p={[0, 0.7, 0]} s={[0.9, 1.4, 0.6]} c="#a8325a" tex="metal" />
      <B p={[0, 1.5, 0]} s={[0.75, 0.3, 0.55]} c="#a8325a" tex="metal" />
      <B p={[0, 1.7, 0]} s={[0.55, 0.15, 0.5]} c="#a8325a" tex="metal" />
      <mesh ref={glow} position={[0, 1.15, 0.31]}>
        <boxGeometry args={[0.7, 0.6, 0.03]} />
        <meshStandardMaterial color="#222" emissive="#ff8ad0" emissiveIntensity={1.1} />
      </mesh>
      <B p={[0, 0.55, 0.31]} s={[0.6, 0.15, 0.03]} c="#16161a" />
      <B p={[0.2, 0.55, 0.33]} s={[0.1, 0.06, 0.02]} c="#f2c230" emissive="#f2c230" />
    </group>
  )
}

function Stool({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.63, 0]} s={[0.42, 0.07, 0.42]} c="#c2402e" tex="fabric" />
      <B p={[0, 0.32, 0]} s={[0.07, 0.6, 0.07]} c="#2a2a2e" tex="metal" />
      <B p={[0, 0.03, 0]} s={[0.34, 0.05, 0.34]} c="#2a2a2e" tex="metal" />
    </group>
  )
}

/** Barra de bar con estante de botellas contra la pared. */
function BarCounter({ x, z }: { x: number; z: number }) {
  const colors = ['#2f9a58', '#d6a02a', '#3a6fd0', '#c2402e', '#8a3ad0']
  return (
    <group position={[x, 0, z]}>
      <B p={[-0.05, 0.55, 0]} s={[0.8, 1.1, 2.7]} c="#7a4a28" tex="wood" />
      <B p={[-0.05, 1.13, 0]} s={[0.95, 0.07, 2.8]} c="#d9d2c4" tex="paint" />
      <B p={[0.55, 1.0, 0]} s={[0.12, 2.0, 2.5]} c="#5a3820" tex="wood" />
      {[0.45, 0.95].map((sy) => (
        <B key={sy} p={[0.46, 1.1 + sy * 0.9, 0]} s={[0.22, 0.04, 2.4]} c="#8a5a36" tex="wood" />
      ))}
      {[-0.9, -0.45, 0, 0.45, 0.9].map((bz, i) => (
        <group key={bz}>
          <B p={[0.46, 1.34, bz]} s={[0.08, 0.3, 0.08]} c={colors[i]} />
          <B p={[0.46, 1.84, bz + 0.2]} s={[0.08, 0.3, 0.08]} c={colors[(i + 2) % 5]} />
        </group>
      ))}
    </group>
  )
}

function CoffeeTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.4, 0]} s={[1.3, 0.05, 0.6]} c="#8a5a36" tex="wood" />
      {[[-0.55, -0.22], [0.55, -0.22], [-0.55, 0.22], [0.55, 0.22]].map(([lx, lz], i) => (
        <B key={i} p={[lx, 0.19, lz]} s={[0.06, 0.38, 0.06]} c="#4a2c16" tex="wood" />
      ))}
      <B p={[-0.3, 0.47, 0]} s={[0.14, 0.1, 0.14]} c="#f0efe8" />
      <B p={[0.25, 0.45, 0.05]} s={[0.3, 0.06, 0.2]} c="#d6573a" />
    </group>
  )
}

function FloorLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.03, 0]} s={[0.3, 0.05, 0.3]} c="#2a2a2e" tex="metal" />
      <B p={[0, 0.85, 0]} s={[0.04, 1.7, 0.04]} c="#2a2a2e" tex="metal" />
      <B p={[0, 1.8, 0]} s={[0.36, 0.3, 0.36]} c="#fff0c2" emissive="#ffd98a" opacity={0.92} />
    </group>
  )
}

function Rug({ x, z, w, d, c }: { x: number; z: number; w: number; d: number; c: string }) {
  return (
    <>
      <B p={[x, 0.06, z]} s={[w, 0.02, d]} c={c} tex="carpet" rep={[w, d]} />
      <B p={[x, 0.07, z]} s={[w - 0.3, 0.02, d - 0.3]} c="#ffffff" opacity={0.06} />
    </>
  )
}

/** Pelota de ping pong: sale de una paleta, rebota una vez en la mesa, pasa sobre la red y la devuelve el otro. */
function PingPongBall() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((s) => {
    const m = ref.current
    const a = bySlot('ppA')
    const r = a ? rallyOf(a.id, s.clock.elapsedTime * SIM) : null
    if (!r) {
      m.visible = false
      return
    }
    m.visible = true
    const from = r.k % 2 === 0 ? PP_HIT_A : PP_HIT_B
    const to = r.k % 2 === 0 ? PP_HIT_B : PP_HIT_A
    const u = r.u
    const UB = 0.65 // en qué momento del tiro pica en la mesa
    // cada tiro cae en un lugar distinto de la mesa
    const jit = Math.sin(r.k * 12.9898) * 0.22
    let y: number
    if (u < UB) {
      const q = u / UB
      y = PP_TABLE_Y + (from[1] - PP_TABLE_Y) * (1 - q) + 4 * 0.28 * q * (1 - q)
    } else {
      const q = (u - UB) / (1 - UB)
      y = PP_TABLE_Y + (to[1] - PP_TABLE_Y) * q + 4 * 0.2 * q * (1 - q)
    }
    m.position.set(from[0] + (to[0] - from[0]) * u + jit * Math.sin(Math.PI * u), y, from[2] + (to[2] - from[2]) * u)
  })
  return (
    <mesh ref={ref} castShadow visible={false}>
      <sphereGeometry args={[0.04, 14, 10]} />
      <meshStandardMaterial color="#fff6e0" roughness={0.35} emissive="#ffe9b0" emissiveIntensity={0.25} />
    </mesh>
  )
}

function Arcade({ x, z, c, glow }: { x: number; z: number; c: string; glow: number }) {
  const screen = useRef<THREE.Mesh>(null!)
  const marquee = useRef<THREE.Mesh>(null!)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const m = screen.current.material as THREE.MeshStandardMaterial
    m.emissive.setHSL((glow + t * 0.08) % 1, 0.85, 0.5)
    const q = marquee.current.material as THREE.MeshStandardMaterial
    q.emissiveIntensity = 0.6 + Math.sin(t * 3 + glow * 6) * 0.4
  })
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.95, 0]} s={[0.9, 1.9, 0.85]} c={c} tex="metal" />
      <B p={[0, 1.95, 0.05]} s={[0.92, 0.28, 0.5]} c={c} tex="metal" />
      <mesh ref={marquee} position={[0, 1.95, 0.31]}>
        <boxGeometry args={[0.8, 0.18, 0.02]} />
        <meshStandardMaterial color="#ffd23a" emissive="#ffd23a" />
      </mesh>
      <mesh ref={screen} position={[0, 1.4, 0.43]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.68, 0.52, 0.04]} />
        <meshStandardMaterial color="#111" emissive="#4f8cff" emissiveIntensity={1} />
      </mesh>
      <B p={[0, 0.98, 0.55]} s={[0.84, 0.08, 0.42]} c="#1b1b20" tex="metal" rot={[-0.15, 0, 0]} />
      <B p={[-0.2, 1.1, 0.55]} s={[0.04, 0.2, 0.04]} c="#e0e0e0" />
      <B p={[-0.2, 1.22, 0.55]} s={[0.1, 0.1, 0.1]} c="#e63946" />
      <B p={[0.08, 1.04, 0.58]} s={[0.1, 0.04, 0.1]} c="#ffd23a" />
      <B p={[0.26, 1.04, 0.58]} s={[0.1, 0.04, 0.1]} c="#3ad0ff" />
      <B p={[0.14, 1.04, 0.45]} s={[0.1, 0.04, 0.1]} c="#5fe36b" />
    </group>
  )
}

/** Plasma colgado en la pared, con imagen cambiante. */
function PlasmaTV({ x, z }: { x: number; z: number }) {
  const screen = useRef<THREE.Mesh>(null!)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const m = screen.current.material as THREE.MeshStandardMaterial
    m.emissive.setHSL((t * 0.04) % 1, 0.55, 0.32 + Math.sin(t * 0.8) * 0.06)
  })
  return (
    <group position={[x, 1.95, z]}>
      <B s={[3.1, 1.8, 0.07]} c="#0d0d10" tex="metal" />
      <mesh ref={screen} position={[0, 0, 0.04]}>
        <boxGeometry args={[2.95, 1.65, 0.02]} />
        <meshStandardMaterial color="#111" emissive="#3a6fd0" emissiveIntensity={1} />
      </mesh>
      <B p={[0, -1.05, 0.05]} s={[1.4, 0.1, 0.12]} c="#1b1b20" tex="metal" />
    </group>
  )
}

function CoffeeCounter({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <B p={[0, 0.5, 0]} s={[3.4, 1, 0.9]} c="#8a5c3a" tex="wood" />
      <B p={[0, 1.03, 0]} s={[3.5, 0.06, 1]} c="#e6dfd0" tex="paint" />
      <B p={[-1, 1.3, 0]} s={[0.5, 0.5, 0.4]} c="#2b2b31" tex="metal" />
      <B p={[-0.2, 1.12, 0.1]} s={[0.14, 0.18, 0.14]} c="#f0efe8" />
      <B p={[0.5, 1.12, 0.1]} s={[0.14, 0.18, 0.14]} c="#e86a4f" />
    </group>
  )
}

function Whiteboard({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 1.8, z]} rotation={[0, rot, 0]}>
      <B s={[2.6, 1.4, 0.06]} c="#f3f3f0" />
      <B p={[-0.6, 0.2, 0.04]} s={[0.9, 0.05, 0.01]} c="#3a7bd6" />
      <B p={[0.2, -0.05, 0.04]} s={[1.3, 0.05, 0.01]} c="#d6573a" />
      <B p={[-0.4, -0.3, 0.04]} s={[1.0, 0.05, 0.01]} c="#3aa86a" />
    </group>
  )
}

/* ---------- paredes ---------- */

function Wall({ x, z, len, axis, h = 3.4, c = '#a9a3b8', opacity, thick = 0.2 }: {
  x: number
  z: number
  len: number
  axis: 'x' | 'z'
  h?: number
  c?: string
  opacity?: number
  thick?: number
}) {
  const size: [number, number, number] = axis === 'x' ? [len, h, thick] : [thick, h, len]
  return (
    <B
      p={[x, h / 2, z]}
      s={size}
      c={c}
      opacity={opacity}
      tex={opacity === undefined ? 'paint' : undefined}
      rep={[Math.max(1, len / 3), Math.max(1, h / 3)]}
    />
  )
}

/** Muestra su contenido solo cuando la cámara está del lado indicado, para poder girar 360° sin que una pared tape la vista. */
function Side({ axis, above, at = 0, children }: {
  axis: 'x' | 'z'
  above: boolean
  at?: number
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ camera }) => {
    const v = axis === 'x' ? camera.position.x : camera.position.z
    ref.current.visible = above ? v > at : v < at
  })
  return <group ref={ref}>{children}</group>
}

function Label({ x, z, text, color, dim }: { x: number; z: number; text: string; color: string; dim?: boolean }) {
  return (
    <Html position={[x, 0.05, z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`zone-label${dim ? ' dim' : ''}`} style={{ borderColor: color, color }}>
        {text}
      </div>
    </Html>
  )
}

/* ---------- pisos ---------- */

function usePlankTexture() {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const g = cv.getContext('2d')!
    g.fillStyle = '#e2cfae'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(160,125,80,0.07)' : 'rgba(255,245,225,0.08)'
      g.fillRect(i * 32, 0, 32, 256)
      g.fillStyle = 'rgba(120,90,55,0.28)'
      g.fillRect(i * 32, 0, 1.5, 256)
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(7.5, 7)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
}

function ZoneFloor({ zone, x0, x1, z0, z1 }: { zone: Zone; x0: number; x1: number; z0: number; z1: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.03, (z0 + z1) / 2]}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial color={ZONES[zone].color} transparent opacity={0.14} />
    </mesh>
  )
}

function CarpetFloor() {
  const w = ROOM.x1 - ROOM.x0
  const d = ROOM.z1 - ROOM.z0
  const tex = useMemo(() => getTex('carpet', [w / 1.2, d / 1.2]), [w, d])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(ROOM.x0 + ROOM.x1) / 2, 0.04, (ROOM.z0 + ROOM.z1) / 2]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} color="#4b4f8a" roughness={1} />
    </mesh>
  )
}

/* ---------- la oficina ---------- */

export function Office({ modes }: { modes: Record<string, Mode> }) {
  const planks = usePlankTexture()
  const midX = (ROOM.x0 + ROOM.x1) / 2
  return (
    <group>
      {/* piso y base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 3]} receiveShadow>
        <planeGeometry args={[30, 28]} />
        <meshStandardMaterial map={planks} roughness={0.9} />
      </mesh>
      <B p={[0, -0.28, 3]} s={[30.4, 0.5, 28.4]} c="#4a4358" />

      {/* --- paredes exteriores: cada una solo se dibuja si la cámara está del lado opuesto --- */}
      <Side axis="z" above>
        <Wall x={0} z={-11.1} len={30.4} axis="x" />
        <B p={[0, 3.45, -11.1]} s={[30.4, 0.12, 0.28]} c="#6f6a80" />
        <B p={[-4, 2.2, -10.95]} s={[1.6, 0.9, 0.05]} c="#14141a" />
        <B p={[-4, 2.2, -10.92]} s={[1.45, 0.75, 0.02]} c="#2f7fa8" emissive="#2f7fa8" />
        <B p={[5.5, 2.2, -10.95]} s={[1.6, 0.9, 0.05]} c="#14141a" />
        <B p={[5.5, 2.2, -10.92]} s={[1.45, 0.75, 0.02]} c="#a85a2f" emissive="#a85a2f" />
        <B p={[-12, 2.7, -10.95]} s={[2.4, 0.6, 0.06]} c="#1a1520" />
        <B p={[-12, 2.7, -10.9]} s={[2.2, 0.4, 0.02]} c="#f2b441" emissive="#f2b441" />
      </Side>
      <Side axis="x" above>
        <Wall x={-15.1} z={3} len={28.4} axis="z" />
        <B p={[-15.1, 3.45, 3]} s={[0.28, 0.12, 28.4]} c="#6f6a80" />
      </Side>
      <Side axis="z" above={false}>
        <Wall x={0} z={17.1} len={30.4} axis="x" />
        <B p={[0, 3.45, 17.1]} s={[30.4, 0.12, 0.28]} c="#6f6a80" />
        <Whiteboard x={-3.6} z={16.9} rot={Math.PI} />
        <B p={[7, 2.4, 16.95]} s={[4.2, 0.9, 0.05]} c="#14141a" />
        <B p={[7, 2.4, 16.92]} s={[4.0, 0.75, 0.02]} c="#2f9ba8" emissive="#2f9ba8" />
      </Side>
      <Side axis="x" above={false}>
        <Wall x={15.1} z={3} len={28.4} axis="z" />
        <B p={[15.1, 3.45, 3]} s={[0.28, 0.12, 28.4]} c="#6f6a80" />
      </Side>

      {/* --- zonas (tintes de piso) --- */}
      <ZoneFloor zone="direccion" x0={-15} x1={-9} z0={-11} z1={-5} />
      <ZoneFloor zone="social" x0={-9} x1={0.5} z0={-11} z1={-5} />
      <ZoneFloor zone="produccion" x0={0.5} x1={10} z0={-11} z1={-5} />
      <ZoneFloor zone="legal" x0={10} x1={15} z0={-11} z1={-5} />
      <ZoneFloor zone="financiero" x0={-15} x1={-4.5} z0={-4.5} z1={5} />

      <Label x={-14.3} z={-5.4} text="DIRECCIÓN" color={ZONES.direccion.color} />
      <Label x={-8.2} z={-5.4} text="SOCIAL" color={ZONES.social.color} />
      <Label x={1.3} z={-5.4} text="PRODUCCIÓN" color={ZONES.produccion.color} />
      <Label x={10.8} z={-5.4} text="LEGAL" color={ZONES.legal.color} />
      <Label x={-14} z={4.5} text="FINANCIERO" color={ZONES.financiero.color} />
      <Label x={0} z={10.4} text="PASILLO" color="#d9c9a0" />
      <Label x={0} z={14.2} text="LOBBY" color="#d9c9a0" />
      <Label x={midX} z={10.4} text="ENTRETENIMIENTO" color="#ff7ad9" />

      {/* --- divisiones --- */}
      <Wall x={-9} z={-8} len={6} axis="z" h={2.6} c="#9fd4e6" opacity={0.28} thick={0.1} />
      <Wall x={-14.05} z={-5} len={1.9} axis="x" h={2.6} c="#9fd4e6" opacity={0.28} thick={0.1} />
      <Wall x={-10} z={-5} len={2} axis="x" h={2.6} c="#9fd4e6" opacity={0.28} thick={0.1} />
      <Wall x={0.5} z={-8} len={6} axis="z" h={1.3} />
      <Wall x={10} z={-8} len={6} axis="z" h={1.3} />
      <Wall x={-4.5} z={-2.7} len={3.6} axis="z" h={1.3} />
      <Wall x={-4.5} z={3.4} len={3.2} axis="z" h={1.3} />

      {/* --- agentes: escritorio + silla --- */}
      {AGENTS.map((a) => (
        <group key={a.id}>
          <Desk x={a.desk[0]} z={a.desk[1]} screen={modes[a.id]} />
          <Chair x={a.desk[0]} z={a.desk[1] + 0.95} />
        </group>
      ))}

      {/* director: escritorio más grande + biblioteca */}
      <B p={[-12, 0.76, -9.55]} s={[2.6, 0.06, 0.5]} c="#7a5030" tex="wood" />
      <B p={[-14.5, 1.2, -9]} s={[0.5, 2.4, 2.2]} c="#6a452c" tex="wood" />
      <Plant x={-9.8} z={-10.3} h={1.2} />

      {/* plantas */}
      <Plant x={-0.2} z={-10.3} />
      <Plant x={9.6} z={-10.3} />
      <Plant x={14.4} z={-10.3} h={1.1} />
      <Plant x={-14.4} z={4.6} />
      <Plant x={-3.6} z={10.3} h={1.0} />
      <Plant x={3.6} z={-3.6} h={1.0} />
      {[[-14.4, 16.4], [14.4, 16.4], [0, 16.4], [-8, 16.4], [8, 16.4]].map(([px, pz], i) => (
        <Plant key={`lobby${i}`} x={px} z={pz} h={1.0 + (i % 3) * 0.2} />
      ))}

      <CoffeeCounter x={COUNTER_POS[0]} z={COUNTER_POS[1]} rot={COUNTER_ROT} />

      {/* =============== ÁREA DE ENTRETENIMIENTO =============== */}
      <CarpetFloor />
      {/* tabique bajo con puerta */}
      <Wall x={ROOM.x0} z={3.0} len={5.0} axis="z" h={1.0} c="#7d6fa8" />
      <Wall x={ROOM.x0} z={12.5} len={9.0} axis="z" h={1.0} c="#7d6fa8" />
      {/* pared del fondo con la tele (se oculta si la cámara está atrás) */}
      <Side axis="z" above at={ROOM.z0}>
        <Wall x={midX} z={ROOM.z0} len={ROOM.x1 - ROOM.x0} axis="x" h={2.8} c="#5a4f86" />
        <B p={[midX, 2.85, ROOM.z0]} s={[ROOM.x1 - ROOM.x0, 0.1, 0.26]} c="#3a3260" />
        <PlasmaTV x={TV_POS[0]} z={TV_POS[1]} />
        <B p={[midX, 2.62, ROOM.z0 + 0.12]} s={[9, 0.05, 0.03]} c="#ff4fd8" emissive="#ff4fd8" />
      </Side>
      {ARCADE_POS.map(([ax, az], i) => (
        <Arcade key={i} x={ax} z={az} c={['#2d4fd0', '#c63a2e', '#2fa86a', '#8a3ad0'][i % 4]} glow={[0, 0.4, 0.2, 0.7][i % 4]} />
      ))}
      <Sofa x={SOFA_POS[0]} z={SOFA_POS[1]} rot={Math.PI} c="#5a6694" />
      {PUFF_POS.map(([px, pz], i) => (
        <Puff key={i} x={px} z={pz} c={['#e0674f', '#3fb6a8', '#e8b53a'][i % 3]} />
      ))}
      <PoolTable x={POOL_POS[0]} z={POOL_POS[1]} />
      <PoolBalls />
      <PingPong x={PINGPONG_POS[0]} z={PINGPONG_POS[1]} />
      <PingPongBall />
      <Plant x={5.1} z={10.4} h={1.0} />

      {/* ---- ampliación: zona de juegos, barra y living ---- */}
      <Rug x={LTABLE_POS[0]} z={15.2} w={4.6} d={3.0} c="#a8405e" />
      <Foosball x={FOOS_POS[0]} z={FOOS_POS[1]} />
      <Jukebox x={JUKE_POS[0]} z={JUKE_POS[1]} />
      <BarCounter x={BAR_POS[0]} z={BAR_POS[1]} />
      {STOOL_POS.map(([sx, sz], i) => (
        <Stool key={i} x={sx} z={sz} />
      ))}
      <Sofa x={LSOFA_POS[0]} z={LSOFA_POS[1]} rot={Math.PI} c="#7a4a5c" />
      <CoffeeTable x={LTABLE_POS[0]} z={LTABLE_POS[1]} />
      {LPUFF_POS.map(([px, pz], i) => (
        <Puff key={i} x={px} z={pz} c={['#3fb6a8', '#e8b53a'][i % 2]} />
      ))}
      {LAMP_POS.map(([lx, lz], i) => (
        <FloorLamp key={i} x={lx} z={lz} />
      ))}

      {/* =============== SALA DE DESARROLLO WEB: sin luz, por completar =============== */}
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9.75, 0.015, 8.25]}>
          <planeGeometry args={[10.5, 5.5]} />
          <meshStandardMaterial color="#17141c" />
        </mesh>
        <Wall x={-9.75} z={5.35} len={10.5} axis="x" h={0.9} c="#2a2733" />
        <Wall x={-4.5} z={8.3} len={5.6} axis="z" h={0.9} c="#2a2733" />
        <Wall x={-9.75} z={11.0} len={10.5} axis="x" h={0.9} c="#2a2733" />
        {[-13, -10, -7].map((dx) => (
          <group key={dx}>
            <Desk x={dx} z={8} screen="dead" />
            <Chair x={dx} z={8.95} />
          </group>
        ))}
        <B p={[-9.75, 0.9, 5.15]} s={[10.5, 0.1, 0.04]} c="#e0b020" />
        <B p={[-9.75, 0.7, 5.15]} s={[10.5, 0.1, 0.04]} c="#1a1a1a" />
        <Label x={-12} z={10.3} text="DESARROLLO WEB — SIN HABILITAR" color="#6a6578" dim />
      </group>
    </group>
  )
}
