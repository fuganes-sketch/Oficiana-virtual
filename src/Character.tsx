import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { B } from './parts'
import type { Agent, Look, Mode } from './agents'
import { HALL_POINTS } from './layout'
import { chairRect, findPath, freeAt } from './nav'
import { poolArrived, poolTarget, type PoolTarget } from './pool'
import { RALLY_D, SIM, getAssignment, rallyOf, releaseAgent, requestActivity, tick, type Assignment } from './activities'

const SEAT_OFFSET = 0.85
const WALK_SPEED = 2.2

const v2 = (a: [number, number]) => new THREE.Vector2(a[0], a[1])
/** Hacia dónde va cada uno, para que no se junten todos en el mismo lugar. */
const heading = new Map<string, THREE.Vector2>()
/** Dónde está parado cada uno ahora. */
const places = new Map<string, THREE.Vector2>()

/** Elige un punto del pasillo/lobby lo más lejos posible de los demás (entre varios al azar). */
const randomHall = (id?: string) => {
  let best: THREE.Vector2 | null = null
  let bestScore = -1
  for (let n = 0; n < 8; n++) {
    const [x, z] = HALL_POINTS[Math.floor(Math.random() * HALL_POINTS.length)]
    const px = x + (Math.random() - 0.5) * 0.8
    const pz = z + (Math.random() - 0.5) * 0.8
    if (!freeAt(px, pz)) continue
    let nearest = 99
    heading.forEach((p, k) => {
      if (k !== id) nearest = Math.min(nearest, Math.hypot(p.x - px, p.y - pz))
    })
    places.forEach((p, k) => {
      if (k !== id) nearest = Math.min(nearest, Math.hypot(p.x - px, p.y - pz))
    })
    if (nearest > bestScore) {
      bestScore = nearest
      best = new THREE.Vector2(px, pz)
    }
  }
  const out = best ?? new THREE.Vector2(HALL_POINTS[0][0], HALL_POINTS[0][1])
  if (id) heading.set(id, out)
  return out
}

function Hair({ look }: { look: Look }) {
  const c = look.hair
  const has = (k: string) => look.acc.some((a) => a.kind === k)
  if (look.hairStyle === 'bald') return null
  const covered = has('cap') || has('hardhat')
  return (
    <group>
      {!covered && <B p={[0, 0.5, 0]} s={[0.5, 0.12, 0.5]} c={c} />}
      <B p={[0, 0.33, -0.21]} s={[0.5, 0.3, 0.08]} c={c} />
      {look.hairStyle === 'side' && <B p={[-0.1, 0.42, 0.235]} s={[0.3, 0.1, 0.06]} c={c} />}
      {look.hairStyle === 'long' && (
        <>
          <B p={[0, 0.05, -0.2]} s={[0.5, 0.55, 0.1]} c={c} />
          <B p={[-0.25, 0.3, 0]} s={[0.05, 0.3, 0.46]} c={c} />
          <B p={[0.25, 0.3, 0]} s={[0.05, 0.3, 0.46]} c={c} />
        </>
      )}
      {look.hairStyle === 'bun' && <B p={[0, 0.64, -0.12]} s={[0.2, 0.2, 0.2]} c={c} />}
      {look.hairStyle === 'curly' && (
        <>
          <B p={[0, 0.56, 0]} s={[0.58, 0.16, 0.58]} c={c} />
          <B p={[-0.29, 0.38, 0]} s={[0.08, 0.26, 0.4]} c={c} />
          <B p={[0.29, 0.38, 0]} s={[0.08, 0.26, 0.4]} c={c} />
        </>
      )}
      {look.hairStyle === 'spiky' && (
        <>
          <B p={[-0.14, 0.64, 0]} s={[0.1, 0.14, 0.1]} c={c} />
          <B p={[0.04, 0.68, 0.05]} s={[0.1, 0.18, 0.1]} c={c} />
          <B p={[0.16, 0.63, -0.08]} s={[0.1, 0.12, 0.1]} c={c} />
        </>
      )}
    </group>
  )
}

function HeadAccessories({ look }: { look: Look }) {
  return (
    <>
      {look.acc.map((a, i) => {
        switch (a.kind) {
          case 'glasses':
            return (
              <group key={i}>
                <B p={[-0.1, 0.27, 0.25]} s={[0.15, 0.11, 0.03]} c="#1a1a1f" />
                <B p={[0.1, 0.27, 0.25]} s={[0.15, 0.11, 0.03]} c="#1a1a1f" />
                <B p={[0, 0.28, 0.25]} s={[0.06, 0.03, 0.03]} c="#1a1a1f" />
              </group>
            )
          case 'headset':
            return (
              <group key={i}>
                <B p={[-0.27, 0.25, 0]} s={[0.07, 0.15, 0.15]} c="#22242c" />
                <B p={[0.27, 0.25, 0]} s={[0.07, 0.15, 0.15]} c="#22242c" />
                <B p={[0, 0.53, 0]} s={[0.54, 0.04, 0.09]} c="#22242c" />
                <B p={[0.2, 0.1, 0.22]} s={[0.03, 0.03, 0.16]} c="#22242c" />
                <B p={[0.2, 0.1, 0.31]} s={[0.05, 0.05, 0.04]} c="#e3402f" />
              </group>
            )
          case 'headphones':
            return (
              <group key={i}>
                <B p={[-0.29, 0.25, 0]} s={[0.1, 0.22, 0.22]} c={a.color} />
                <B p={[0.29, 0.25, 0]} s={[0.1, 0.22, 0.22]} c={a.color} />
                <B p={[0, 0.54, 0]} s={[0.56, 0.05, 0.1]} c="#1d1d24" />
              </group>
            )
          case 'cap':
            return (
              <group key={i}>
                <B p={[0, 0.54, 0]} s={[0.54, 0.12, 0.54]} c={a.color} />
                <B p={[0, 0.49, 0.34]} s={[0.4, 0.04, 0.2]} c={a.color} />
              </group>
            )
          case 'beret':
            return <B key={i} p={[0.04, 0.55, 0]} s={[0.5, 0.08, 0.5]} c={a.color} rot={[0, 0, 0.12]} />
          case 'visor':
            return (
              <group key={i}>
                <B p={[0, 0.43, 0]} s={[0.52, 0.06, 0.52]} c={a.color} />
                <B p={[0, 0.41, 0.34]} s={[0.44, 0.03, 0.2]} c={a.color} opacity={0.75} />
              </group>
            )
          case 'hardhat':
            return (
              <group key={i}>
                <B p={[0, 0.55, 0]} s={[0.54, 0.16, 0.54]} c="#f2c230" />
                <B p={[0, 0.47, 0.03]} s={[0.62, 0.03, 0.62]} c="#f2c230" />
              </group>
            )
          default:
            return null
        }
      })}
    </>
  )
}

/** Empleado cuadrado: aspecto según rol, camina, se sienta, teclea y juega. */
export function Character({ agent, mode, selected, onSelect }: {
  agent: Agent
  mode: Mode
  selected: boolean
  onSelect: (id: string) => void
}) {
  const { look, id } = agent
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const cue = useRef<THREE.Group>(null!)
  const paddle = useRef<THREE.Group>(null!)
  const mug = useRef<THREE.Group>(null!)

  const seat = useMemo(() => new THREE.Vector2(agent.desk[0], agent.desk[1] + SEAT_OFFSET), [agent])
  // la silla se deja de costado (no hacia atrás, donde está el respaldo) y se sale por el pasillo
  const exitSide = useMemo(() => new THREE.Vector2(agent.desk[0] + 0.9, agent.desk[1] + 1.0), [agent])
  const aisleSide = useMemo(
    () => new THREE.Vector2(agent.desk[0] + 0.9, agent.desk[1] + (agent.desk[1] > 2 ? 1.9 : 2.4)),
    [agent],
  )
  const chair = useMemo(() => chairRect(agent.desk), [agent])
  const route = (from: THREE.Vector2, to: THREE.Vector2) =>
    findPath([from.x, from.y], [to.x, to.y], chair).map(v2)

  const st = useRef({
    init: false,
    prevMode: null as Mode | null,
    path: [] as THREE.Vector2[],
    atSeat: false,
    atSpot: false,
    asg: null as Assignment | null,
    poolShot: -1,
    wait: 0,
    angle: Math.PI,
    pos: new THREE.Vector2(),
    phase: Math.random() * 10,
  })

  const jacket = look.acc.find((a) => a.kind === 'jacket')
  const tie = look.acc.find((a) => a.kind === 'tie')
  const hoodie = look.acc.find((a) => a.kind === 'hoodie')
  const torsoColor = jacket ? jacket.color : look.top
  const shoe = '#1b1b20'

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * SIM
    const s = st.current
    const t = state.clock.elapsedTime * SIM
    tick(t)

    if (!s.init) {
      s.init = true
      if (mode === 'idle') {
        s.pos.copy(randomHall(id))
        s.wait = 1 + Math.random() * 4
      } else {
        s.pos.copy(seat)
        s.atSeat = true
      }
      s.prevMode = mode
    }

    // cambio de estado (encendido / apagado / tarea)
    if (s.prevMode !== mode) {
      s.prevMode = mode
      s.atSpot = false
      s.asg = null
      if (mode === 'idle') {
        const dest = randomHall(id)
        s.path = s.atSeat ? [exitSide.clone(), aisleSide.clone(), ...route(aisleSide, dest)] : route(s.pos, dest)
        s.atSeat = false
        s.wait = 1 + Math.random() * 3
      } else {
        releaseAgent(id)
        if (!s.atSeat) s.path = [...route(s.pos, aisleSide), exitSide.clone(), seat.clone()]
      }
    }

    // ¿le asignaron una actividad (o se la quitaron)?
    if (mode === 'idle') {
      const asg = getAssignment(id) ?? null
      if (asg !== s.asg) {
        s.asg = asg
        s.poolShot = -1
        s.atSpot = false
        if (asg) {
          const target = v2(asg.spot)
          if (s.atSeat) {
            s.path = [exitSide.clone(), aisleSide.clone(), ...route(aisleSide, target)]
            s.atSeat = false
          } else s.path = route(s.pos, target)
        } else {
          s.path = route(s.pos, randomHall(id))
          s.wait = 1 + Math.random() * 3
        }
      }
    }

    // pool: en cada tiro el que juega camina hasta detrás de la bola blanca; el otro espera en su lugar
    let poolT: PoolTarget | null = null
    if (mode === 'idle' && s.asg && s.asg.kind === 'pool' && s.atSpot) {
      poolT = poolTarget(id)
      if (poolT && poolT.shot !== s.poolShot && s.path.length === 0) {
        s.poolShot = poolT.shot
        s.path = route(s.pos, v2(poolT.pos))
      }
    }

    let moving = false
    let targetAngle = s.angle

    if (s.path.length) {
      const target = s.path[0]
      const d = target.clone().sub(s.pos)
      const dist = d.length()
      const step = WALK_SPEED * dt
      if (dist <= step) {
        s.pos.copy(target)
        s.path.shift()
        if (!s.path.length) {
          if (mode !== 'idle') s.atSeat = true
          else if (s.asg) {
            s.atSpot = true
            s.asg.readyAt ??= t
          }
        }
      } else {
        d.normalize()
        s.pos.addScaledVector(d, step)
        moving = true
        targetAngle = Math.atan2(d.x, d.y)
      }
    } else if (mode === 'idle' && !s.asg) {
      s.wait -= dt
      if (s.wait <= 0) {
        s.wait = 3 + Math.random() * 6
        if (!requestActivity(id, t)) s.path = route(s.pos, randomHall(id))
      }
    }

    const kind = s.atSpot && s.asg ? s.asg.kind : null
    const deskSeated = s.atSeat && !moving
    const seated = deskSeated || (kind === 'sit' && !moving)
    if (!moving) {
      if (deskSeated) targetAngle = Math.PI
      else if (kind === 'pool' && poolT) targetAngle = poolT.face
      else if (kind && s.asg) targetAngle = s.asg.face
    }

    const diff = ((targetAngle - s.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    s.angle += diff * Math.min(1, dt * 10)

    root.current.position.set(s.pos.x, 0, s.pos.y)
    places.set(id, s.pos)
    root.current.rotation.y = s.angle

    const ph = s.phase
    const swing = moving ? Math.sin(t * 9 + ph) * 0.7 : 0
    let lL = swing, lR = -swing, aL = -swing * 0.8, aR = swing * 0.8
    if (seated) {
      lL = lR = -Math.PI / 2
      aL = aR = -0.5
    }
    if (deskSeated && mode === 'working') {
      aL = -1.15 + Math.sin(t * 13 + ph) * 0.07
      aR = -1.15 + Math.cos(t * 11 + ph) * 0.07
    }
    if (!moving) {
      if (kind === 'arcade') {
        aL = -1.15 + Math.sin(t * 9 + ph) * 0.05
        aR = -1.15 + Math.cos(t * 7 + ph) * 0.09
      } else if (kind === 'pool') {
        if (poolT && poolT.shot === s.poolShot && s.path.length === 0) poolArrived(id, poolT.shot)
        if (poolT && poolT.shooter && poolT.cue) {
          aR = poolT.arm
          aL = -1.15
        } else {
          aL = -0.4
          aR = -0.4
        }
      } else if (kind === 'pingpong') {
        // el brazo se arma hacia atrás y golpea justo cuando la pelota llega a la paleta
        const r = rallyOf(id, t)
        if (r) {
          const p = (((r.elapsed - (r.role ? RALLY_D : 0)) / (2 * RALLY_D)) % 1 + 1) % 1
          const c = Math.cos(p * Math.PI * 2)
          aR = -1.0 - 0.5 * c
          aL = -0.3 - 0.12 * c
        } else {
          aR = -1.0
          aL = -0.3
        }
      } else if (kind === 'coffee') {
        aL = 0
        aR = -1.6 + Math.sin(t * 0.9 + ph) * 0.25
      }
    }
    const aiming = !moving && kind === 'pool' && !!poolT && poolT.shooter && poolT.cue
    const hd = deskSeated && mode === 'off' ? 0.5 : aiming ? 0.35 : 0
    legL.current.rotation.x = THREE.MathUtils.damp(legL.current.rotation.x, lL, 14, dt)
    legR.current.rotation.x = THREE.MathUtils.damp(legR.current.rotation.x, lR, 14, dt)
    armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, aL, 14, dt)
    armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, aR, 14, dt)
    head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, hd, 6, dt)

    const sitY = kind === 'sit' && !moving && s.asg ? s.asg.sitY : 0
    const bob = moving ? Math.abs(Math.sin(t * 9 + ph)) * 0.05 : sitY
    body.current.position.y = THREE.MathUtils.damp(body.current.position.y, bob, 14, dt)

    cue.current.visible = aiming
    if (aiming && poolT) cue.current.position.y = poolT.slide
    paddle.current.visible = !moving && kind === 'pingpong'
    mug.current.visible = !moving && kind === 'coffee'
  })

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(id)
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.5, 0.62, 4]} />
          <meshBasicMaterial color="#ffc94d" />
        </mesh>
      )}
      <group ref={body}>
        {/* piernas */}
        <group ref={legL} position={[-0.14, 0.55, 0]}>
          <B p={[0, -0.25, 0]} s={[0.22, 0.5, 0.24]} c={look.pants} />
          <B p={[0, -0.52, 0.03]} s={[0.24, 0.1, 0.32]} c={shoe} />
        </group>
        <group ref={legR} position={[0.14, 0.55, 0]}>
          <B p={[0, -0.25, 0]} s={[0.22, 0.5, 0.24]} c={look.pants} />
          <B p={[0, -0.52, 0.03]} s={[0.24, 0.1, 0.32]} c={shoe} />
        </group>

        {/* torso */}
        <B p={[0, 0.9, 0]} s={[0.56, 0.7, 0.3]} c={torsoColor} tex="fabric" />
        {jacket && <B p={[0, 0.9, 0.155]} s={[0.16, 0.66, 0.02]} c="#f1f1ee" />}
        {tie && <B p={[0, 0.88, 0.17]} s={[0.09, 0.36, 0.03]} c={tie.color} />}
        {hoodie && <B p={[0, 1.2, -0.2]} s={[0.46, 0.2, 0.14]} c={hoodie.color} />}

        {/* brazos */}
        <group ref={armL} position={[-0.37, 1.22, 0]}>
          <B p={[0, -0.22, 0]} s={[0.17, 0.44, 0.19]} c={jacket ? jacket.color : look.top} />
          <B p={[0, -0.5, 0]} s={[0.15, 0.14, 0.17]} c={look.skin} />
        </group>
        <group ref={armR} position={[0.37, 1.22, 0]}>
          <B p={[0, -0.22, 0]} s={[0.17, 0.44, 0.19]} c={jacket ? jacket.color : look.top} />
          <B p={[0, -0.5, 0]} s={[0.15, 0.14, 0.17]} c={look.skin} />
          <group ref={cue} visible={false}>
            <B p={[0, -1.45, 0]} s={[0.035, 1.7, 0.035]} c="#d8aa66" />
            <B p={[0, -0.6, 0]} s={[0.055, 0.6, 0.055]} c="#3a2414" />
            <B p={[0, -2.3, 0]} s={[0.04, 0.05, 0.04]} c="#3a7bd6" />
          </group>
          <group ref={paddle} visible={false}>
            <B p={[0, -0.62, 0]} s={[0.05, 0.14, 0.05]} c="#9a6a3a" />
            <B p={[0, -0.76, 0]} s={[0.3, 0.03, 0.26]} c="#d33a3a" />
          </group>
          <group ref={mug} visible={false}>
            <B p={[0, -0.62, 0.02]} s={[0.12, 0.15, 0.12]} c="#f0efe8" />
          </group>
        </group>

        {/* cabeza */}
        <group ref={head} position={[0, 1.25, 0]}>
          <B p={[0, 0.25, 0]} s={[0.46, 0.46, 0.46]} c={look.skin} />
          <B p={[-0.1, 0.27, 0.235]} s={[0.07, 0.08, 0.02]} c="#15151a" />
          <B p={[0.1, 0.27, 0.235]} s={[0.07, 0.08, 0.02]} c="#15151a" />
          <B p={[0, 0.13, 0.235]} s={[0.12, 0.03, 0.02]} c="#8a4a3a" />
          <Hair look={look} />
          <HeadAccessories look={look} />
        </group>
      </group>

      <Html position={[0, 2.35, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`tag ${mode}${selected ? ' sel' : ''}`}>
          <span className="dot" />
          {agent.role}
        </div>
      </Html>
    </group>
  )
}
