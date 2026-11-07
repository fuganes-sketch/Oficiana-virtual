import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Office } from './Office'
import { Character } from './Character'
import { AGENTS, ZONES, agentById, type Mode } from './agents'
import { setModes } from './activities'
import { Chat } from './Chat'
import { refreshStatus, setBusyHook, useUsage } from './chats'
import { Trabajos, type SubTrabajo } from './Bandeja'
import { Reporte } from './Reporte'
import { Movil } from './Movil'
import { cargarPendientes, usePendientes } from './pendientes'

interface AgentState {
  enabled: boolean
  busy: boolean
}
type States = Record<string, AgentState>

/** Solo para pruebas: ?zoom=80&look=7,8&cam=back&notags */
const qs = new URLSearchParams(location.search)
const back = qs.get('cam') === 'back'
const look = (qs.get('look') ?? '0,3').split(',').map(Number) as [number, number]
if (qs.has('notags')) document.body.classList.add('notags')

const STORAGE_KEY = 'service-tech-oficina-v1'
const ADMINS_KEY = 'service-tech-todos-encendidos-v1'
const BRAND = 'SERVICE TECH'

const defaultStates = (): States =>
  Object.fromEntries(AGENTS.map((a) => [a.id, { enabled: true, busy: false }]))

function loadStates(): States {
  const base = defaultStates()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(base, JSON.parse(raw))
    for (const k of Object.keys(base)) base[k] = { ...base[k], busy: false }
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
  // una sola vez: todos los empleados quedan encendidos (a disposición del Director y de los administradores)
  try {
    if (!localStorage.getItem(ADMINS_KEY)) {
      for (const a of AGENTS) base[a.id] = { ...base[a.id], enabled: true }
      localStorage.setItem(ADMINS_KEY, '1')
    }
  } catch {
    /* sin almacenamiento */
  }
  if (location.search.includes('demo=work')) for (const a of AGENTS) base[a.id] = { enabled: true, busy: true }
  base.director = { enabled: true, busy: base.director?.busy ?? false }
  return base
}

const modeOf = (s: AgentState): Mode => (!s.enabled ? 'off' : s.busy ? 'working' : 'idle')
const MODE_LABEL: Record<Mode, string> = { working: 'Trabajando', idle: 'Libre', off: 'Apagado' }

function Oficina() {
  const [states, setStates] = useState<States>(loadStates)
  const [selectedId, setSelectedId] = useState<string>('director')
  const [tab, setTab] = useState<'ficha' | 'chat' | 'trabajos'>('chat')
  const [sub, setSub] = useState<SubTrabajo>('pendientes')
  const verPendientes = () => {
    setSub('pendientes')
    setTab('trabajos')
  }
  const usage = useUsage()
  const esperando = usePendientes().filter((p) => p.estado === 'pendiente').length

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
    } catch {
      /* ignorar */
    }
  }, [states])

  // el servidor necesita saber quién está encendido (el reporte de la mañana corre sin la pantalla abierta)
  useEffect(() => {
    const encendidos = Object.keys(states).filter((k) => states[k].enabled)
    void fetch('/api/encendidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encendidos }) }).catch(() => {})
  }, [states])

  const modes = useMemo(
    () => Object.fromEntries(AGENTS.map((a) => [a.id, modeOf(states[a.id])])) as Record<string, Mode>,
    [states],
  )

  setModes(modes)

  const patch = (id: string, p: Partial<AgentState>) =>
    setStates((s) => {
      const next = { ...s[id], ...p }
      if (id === 'director') next.enabled = true
      if (!next.enabled) next.busy = false
      return { ...s, [id]: next }
    })

  const setAll = (enabled: boolean) =>
    setStates((s) =>
      Object.fromEntries(
        AGENTS.map((a) => [a.id, { enabled: a.id === 'director' ? true : enabled, busy: enabled ? s[a.id].busy : false }]),
      ),
    )

  // cuando un agente está respondiendo en el chat, su empleado se sienta a trabajar
  useEffect(() => {
    setBusyHook((id, busy) => patch(id, { busy }))
    void refreshStatus()
    void cargarPendientes()
    const t = setInterval(() => {
      void refreshStatus()
      void cargarPendientes()
    }, 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => {
    const c = { working: 0, idle: 0, off: 0 }
    for (const m of Object.values(modes)) c[m]++
    return c
  }, [modes])

  const sel = agentById(selectedId)
  const selMode = modes[sel.id]
  const boss = sel.reportsTo ? agentById(sel.reportsTo) : null

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-dot" />
          {BRAND} <em>HEADQUARTERS</em>
        </div>
        <div className="chips">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              className={`chip ${modes[a.id]}${a.id === selectedId ? ' sel' : ''}`}
              onClick={() => setSelectedId(a.id)}
              title={a.role}
            >
              <span className="dot" />
              {a.role}
            </button>
          ))}
        </div>
      </header>

      <main className="stage">
        <div className="canvas-wrap">
          <Canvas
            orthographic
            shadows
            camera={{ position: [(look[0] + (back ? -26 : 26)), 24, (look[1] + (back ? -26 : 26))], zoom: Number(qs.get('zoom')) || 24, near: -100, far: 200 }}
            onPointerMissed={() => (document.body.style.cursor = 'auto')}
          >
            <color attach="background" args={['#0b0806']} />
            <ambientLight intensity={0.95} />
            <hemisphereLight args={['#fff2e0', '#6a5a7a', 0.5]} />
            <directionalLight
              position={[14, 24, 10]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-30}
              shadow-camera-right={30}
              shadow-camera-top={30}
              shadow-camera-bottom={-30}
              shadow-camera-near={1}
              shadow-camera-far={80}
              shadow-bias={-0.0004}
            />
            <Office modes={modes} />
            {AGENTS.map((a) => (
              <Character
                key={a.id}
                agent={a}
                mode={modes[a.id]}
                selected={a.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
            <OrbitControls
              target={[look[0], 0, look[1]]}
              enableDamping
              minZoom={14}
              maxZoom={90}
              minPolarAngle={0.25}
              maxPolarAngle={1.45}
            />
          </Canvas>
          <div className="hint">arrastrar: girar 360° · rueda: zoom · clic derecho: mover · clic en un empleado: ficha</div>
        </div>

        <aside className="side">
          <div className="side-head">
            <span className="kicker">{BRAND} HQ</span>
            <p>Oficina virtual de agentes.</p>
          </div>
          <div className="tabs">
            {(['chat', 'ficha', 'trabajos'] as const).map((t) => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t.toUpperCase()}
                {t === 'trabajos' && esperando > 0 && <span className="badge">{esperando}</span>}
              </button>
            ))}
          </div>

          {tab === 'chat' && (
            <Chat key={sel.id} agent={sel} enabled={states[sel.id].enabled} onVerBandeja={verPendientes} />
          )}
          {tab === 'trabajos' && <Trabajos sub={sub} setSub={setSub} />}

          {tab === 'ficha' && (
          <div className="card">
            <div className="card-zone" style={{ color: ZONES[sel.zone].color }}>
              {ZONES[sel.zone].label}
            </div>
            <h2>{sel.role}</h2>
            <div className={`status ${selMode}`}>
              <span className="dot" />
              {MODE_LABEL[selMode]}
            </div>
            <p className="summary">{sel.summary}</p>
            <dl>
              <dt>Responde a</dt>
              <dd>{boss ? boss.role : 'Agustín'}</dd>
              <dt>Nivel</dt>
              <dd>{sel.level === 'director' ? 'Director' : sel.level === 'admin' ? 'Administrador' : 'Equipo'}</dd>
            </dl>

            <label className={`switch${sel.id === 'director' ? ' locked' : ''}`}>
              <input
                type="checkbox"
                checked={states[sel.id].enabled}
                disabled={sel.id === 'director'}
                onChange={(e) => patch(sel.id, { enabled: e.target.checked })}
              />
              <span className="slider" />
              <span>{sel.id === 'director' ? 'Siempre encendido' : states[sel.id].enabled ? 'Encendido' : 'Apagado'}</span>
            </label>

            <button
              className="btn"
              disabled={!states[sel.id].enabled}
              onClick={() => patch(sel.id, { busy: !states[sel.id].busy })}
            >
              {states[sel.id].busy ? 'Marcar como libre' : 'Simular tarea (demo)'}
            </button>
            <p className="note">Para hablarle, usá la pestaña CHAT.</p>
          </div>
          )}

          <div className="bulk">
            <button className="btn ghost" onClick={() => setAll(true)}>Encender todos</button>
            <button className="btn ghost" onClick={() => setAll(false)}>Apagar todos</button>
          </div>
        </aside>
      </main>

      <footer className="status-bar">
        <span className="ok">● CONECTADO</span>
        <span>{counts.working} trabajando</span>
        <span>{counts.idle} libres</span>
        <span>{counts.off} apagados</span>
        {esperando > 0 && (
          <button className="por-aprobar" onClick={verPendientes}>
            📥 {esperando} {esperando === 1 ? 'pendiente' : 'pendientes'} de tu aprobación
          </button>
        )}
        <Reporte />
        {usage.fiveHour !== undefined && (
          <span className="usage" title="Cuánto de tu plan de Claude se usó en la ventana de 5 horas y en la semana">
            PLAN: 5 h {Math.round(usage.fiveHour * 100)}%
            {usage.sevenDay !== undefined && ` · semana ${Math.round(usage.sevenDay * 100)}%`}
          </span>
        )}
      </footer>
    </div>
  )
}

/** En el teléfono (pantalla angosta o ?movil) se muestra solo el chat y la bandeja; en la compu, la oficina 3D. */
const esMovil = () => location.search.includes('movil') || window.matchMedia('(max-width: 760px)').matches

export default function App() {
  const [movil, setMovil] = useState(esMovil)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const f = () => setMovil(esMovil())
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return movil ? <Movil /> : <Oficina />
}
