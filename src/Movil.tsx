import { useEffect, useState } from 'react'
import { AGENTS } from './agents'
import { Chat } from './Chat'
import { Trabajos, type SubTrabajo } from './Bandeja'
import { Reporte } from './Reporte'
import { refreshStatus, useUsage } from './chats'
import { cargarPendientes, usePendientes } from './pendientes'

/** Vista para el teléfono: solo chat con los agentes, bandeja de aprobaciones y estado del reporte (sin la oficina 3D). */
export function Movil() {
  const [id, setId] = useState('director')
  const [tab, setTab] = useState<'chat' | 'trabajos'>('chat')
  const [sub, setSub] = useState<SubTrabajo>('pendientes')
  const [encendidos, setEncendidos] = useState<string[] | null>(null)
  const usage = useUsage()
  const esperando = usePendientes().filter((p) => p.estado === 'pendiente').length
  const agente = AGENTS.find((a) => a.id === id)!

  useEffect(() => {
    const cargar = () => {
      void refreshStatus()
      void cargarPendientes()
      fetch('/api/encendidos')
        .then((r) => r.json())
        .then((d) => setEncendidos(Array.isArray(d.encendidos) ? d.encendidos : null))
        .catch(() => {})
    }
    cargar()
    const t = setInterval(cargar, 15000)
    return () => clearInterval(t)
  }, [])

  const activo = (a: string) => a === 'director' || !encendidos || encendidos.includes(a)

  return (
    <div className="movil">
      <header className="movil-top">
        <span className="brand">
          <i className="brand-dot" />
          SERVICE TECH
        </span>
        <select value={id} onChange={(e) => { setId(e.target.value); setTab('chat') }} aria-label="Agente">
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.role}
              {activo(a.id) ? '' : ' (apagado)'}
            </option>
          ))}
        </select>
      </header>

      <div className="movil-body">
        {tab === 'chat' && <Chat key={agente.id} agent={agente} enabled={activo(agente.id)} onVerBandeja={() => { setSub('pendientes'); setTab('trabajos') }} />}
        {tab === 'trabajos' && <Trabajos sub={sub} setSub={setSub} />}
      </div>

      <nav className="movil-tabs">
        <button className={tab === 'chat' ? 'tab active' : 'tab'} onClick={() => setTab('chat')}>CHAT</button>
        <button className={tab === 'trabajos' ? 'tab active' : 'tab'} onClick={() => setTab('trabajos')}>
          TRABAJOS{esperando > 0 && <span className="badge">{esperando}</span>}
        </button>
      </nav>
      <div className="movil-estado">
        <Reporte />
        {usage.fiveHour !== undefined && <span className="usage">PLAN 5 h {Math.round(usage.fiveHour * 100)}%</span>}
      </div>
    </div>
  )
}
