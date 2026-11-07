import { useEffect, useState } from 'react'
import { agentById } from './agents'
import { CAMPOS, TIPO_LABEL, cargarPendientes, decidir, guardarEdicion, reintentar, usePendientes, type Pendiente } from './pendientes'

const cuando = (t: number) => new Date(t).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
const nombreAgente = (id: string) => {
  try {
    return agentById(id).role
  } catch {
    return id
  }
}

/** Texto completo del pendiente, para copiarlo y mandarlo a mano. */
function comoTexto(p: Pendiente) {
  return CAMPOS[p.tipo]
    .filter((c) => p.campos[c.key])
    .map((c) => `${c.label}: ${p.campos[c.key]}`)
    .join('\n')
}

function Tarjeta({ p }: { p: Pendiente }) {
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState<Record<string, string>>(p.campos)
  const [rechazando, setRechazando] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const abierto = p.estado === 'pendiente'

  const accion = async (a: 'aprobar' | 'rechazar') => {
    setError('')
    try {
      await decidir(p.id, a, { campos: a === 'aprobar' ? campos : undefined, nota: nota.trim() || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const toggleEditar = async () => {
    if (!editando) return setEditando(true)
    setError('')
    try {
      await guardarEdicion(p.id, campos) // queda guardado en el servidor, no solo en la pantalla
      setEditando(false)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comoTexto(p))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin permiso de portapapeles */
    }
  }

  return (
    <div className={`pend ${p.estado}`}>
      <div className="pend-top">
        <span className={`pend-tipo ${p.tipo}`}>{TIPO_LABEL[p.tipo]}</span>
        <span className="pend-meta">
          {nombreAgente(p.agente)} · {cuando(p.creado)}
        </span>
      </div>
      <h3>{p.titulo}</h3>
      {p.motivo && <p className="pend-motivo">{p.motivo}</p>}

      <dl className="pend-campos">
        {CAMPOS[p.tipo].map((c) => {
          const v = (abierto ? campos : p.campos)[c.key]
          if (!editando && !v) return null
          return (
            <div key={c.key}>
              <dt>{c.label}</dt>
              <dd>
                {editando && !c.fijo ? (
                  c.largo ? (
                    <textarea rows={5} value={campos[c.key] ?? ''} onChange={(e) => setCampos({ ...campos, [c.key]: e.target.value })} />
                  ) : (
                    <input value={campos[c.key] ?? ''} onChange={(e) => setCampos({ ...campos, [c.key]: e.target.value })} />
                  )
                ) : (
                  <span className="pend-texto">{v}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      {abierto && !rechazando && (
        <div className="pend-acciones">
          <button className="btn ok" onClick={() => void accion('aprobar')}>{p.tipo === 'mail' || p.tipo === 'presupuesto' ? 'Aprobar y enviar' : 'Aprobar'}</button>
          <button className="btn ghost" onClick={() => void toggleEditar()}>{editando ? 'Guardar cambios' : 'Editar'}</button>
          <button className="btn ghost no" onClick={() => setRechazando(true)}>Rechazar</button>
        </div>
      )}
      {abierto && rechazando && (
        <div className="pend-rechazo">
          <input placeholder="Motivo (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button className="btn ghost no" onClick={() => void accion('rechazar')}>Confirmar rechazo</button>
          <button className="link" onClick={() => setRechazando(false)}>cancelar</button>
        </div>
      )}

      {!abierto && (
        <div className="pend-resultado">
          <span className={`sello ${p.estado}`}>{p.auto ? 'ENVIADO SOLO' : p.estado === 'aprobado' ? 'APROBADO' : 'RECHAZADO'}</span>
          <span className="pend-meta">{p.decidido ? cuando(p.decidido) : ''}</span>
          {p.estado === 'rechazado' ? (
            <p className="pend-motivo">
              <strong>Motivo del rechazo:</strong> {p.nota ? `“${p.nota}”` : 'no lo especificaste'}
            </p>
          ) : (
            p.nota && <p className="pend-motivo">“{p.nota}”</p>
          )}
          {p.estado === 'aprobado' && (p.tipo === 'mail' || p.tipo === 'presupuesto') && p.ejecucion?.estado === 'en_curso' && (
            <p className="note">⏳ Enviando el mail…</p>
          )}
          {p.estado === 'aprobado' && p.ejecucion?.estado === 'listo' && (
            <p className="note ok-note">
              {p.ejecucion.detalle?.startsWith('Mail enviado') ? (
                <>✔ Mail enviado{p.auto ? ' automáticamente' : ''} (queda en “Enviados” de tu Gmail).</>
              ) : (
                <>
                  ✔ Borrador creado en tu Gmail.{' '}
                  <a href={p.ejecucion.url ?? 'https://mail.google.com/mail/u/0/#drafts'} target="_blank" rel="noreferrer">Abrir el borrador</a>.
                </>
              )}
            </p>
          )}
          {p.estado === 'aprobado' && p.ejecucion?.estado === 'error' && (
            <>
              <p className="pend-error">No pude enviar el mail: {p.ejecucion.detalle}</p>
              <button className="btn ghost" onClick={() => void reintentar(p.id)}>Reintentar</button>
            </>
          )}
          {p.estado === 'aprobado' && !p.ejecucion && (
            <p className="note">
              {p.tipo === 'mail' || p.tipo === 'presupuesto'
                ? 'Aprobado antes de conectar Gmail: copialo y mandalo vos.'
                : 'Este tipo todavía no se puede ejecutar solo: copialo y hacelo vos.'}
            </p>
          )}
          {p.estado === 'aprobado' && (
            <button className="btn ghost" onClick={() => void copiar()}>{copiado ? '¡Copiado!' : 'Copiar texto'}</button>
          )}
        </div>
      )}
      {guardado && <p className="note ok-note">✔ Cambios guardados.</p>}
      {error && <p className="pend-error">{error}</p>}
    </div>
  )
}

export type SubTrabajo = 'pendientes' | 'aceptados' | 'rechazados'

/** Sección TRABAJOS: lo que dejaron los agentes, dividido en pendientes, aceptados y rechazados. */
export function Trabajos({ sub, setSub }: { sub: SubTrabajo; setSub: (s: SubTrabajo) => void }) {
  const todos = usePendientes()
  const n = (e: Pendiente['estado']) => todos.filter((p) => p.estado === e).length
  const subs: [SubTrabajo, string, number][] = [
    ['pendientes', 'PENDIENTES', n('pendiente')],
    ['aceptados', 'ACEPTADOS', n('aprobado')],
    ['rechazados', 'RECHAZADOS', n('rechazado')],
  ]
  return (
    <>
      <div className="subtabs">
        {subs.map(([k, label, c]) => (
          <button key={k} className={`subtab${sub === k ? ' active' : ''}`} onClick={() => setSub(k)}>
            {label} <span className="cuenta">{c}</span>
          </button>
        ))}
      </div>
      <Bandeja vista={sub} />
    </>
  )
}

export function Bandeja({ vista }: { vista: SubTrabajo }) {
  const todos = usePendientes()
  useEffect(() => {
    void cargarPendientes()
  }, [vista])

  // mientras se crea un borrador, se consulta seguido para mostrar el resultado apenas termina
  const enCurso = todos.some((p) => p.ejecucion?.estado === 'en_curso')
  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(() => void cargarPendientes(), 2500)
    return () => clearInterval(t)
  }, [enCurso])

  const lista =
    vista === 'pendientes'
      ? todos.filter((p) => p.estado === 'pendiente')
      : todos.filter((p) => p.estado === (vista === 'aceptados' ? 'aprobado' : 'rechazado')).sort((a, b) => (b.decidido ?? 0) - (a.decidido ?? 0))

  return (
    <div className="bandeja">
      <p className="bandeja-intro">
        {vista === 'pendientes'
          ? 'Todo lo que sale hacia otras personas (mails a clientes, presupuestos, publicaciones, gastos) espera acá tu aprobación. Solo los mails que te llegan a vos se envían solos.'
          : vista === 'aceptados'
            ? 'Lo que ya aprobaste.'
            : 'Lo que rechazaste, con el motivo si lo indicaste.'}
      </p>
      {lista.length === 0 && (
        <p className="note">
          {vista === 'pendientes'
            ? 'No hay nada esperando. Pedile a un agente, por ejemplo: “armale un presupuesto a un cliente”.'
            : vista === 'aceptados'
              ? 'Todavía no aceptaste nada.'
              : 'Todavía no rechazaste nada.'}
        </p>
      )}
      {lista.map((p) => (
        <Tarjeta key={p.id} p={p} />
      ))}
    </div>
  )
}
