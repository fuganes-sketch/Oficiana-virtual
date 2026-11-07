import { useEffect, useState } from 'react'

interface Estado {
  config: { activo: boolean; hora: string; para: string }
  enCurso: boolean
  ultimo: {
    fecha: string
    texto?: string
    error?: string
    envio?: { estado: 'en_curso' | 'listo' | 'error'; detalle?: string }
  } | null
}

/** Estado del reporte diario del Director (mail todas las mañanas) y botón para pedirlo ahora. */
export function Reporte() {
  const [e, setE] = useState<Estado | null>(null)
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    try {
      setE(await (await fetch('/api/reporte')).json())
    } catch {
      /* sin servidor */
    }
  }
  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), e?.enCurso ? 4000 : 30000)
    return () => clearInterval(t)
  }, [e?.enCurso])

  if (!e) return null
  const u = e.ultimo
  const hoy = new Date().toLocaleDateString('en-CA')
  let estado = `reporte diario ${e.config.hora}`
  if (e.enCurso) estado = '⏳ armando el reporte…'
  else if (u?.fecha === hoy && u.error) estado = '⚠️ falló el reporte de hoy'
  else if (u?.fecha === hoy && u.envio?.estado === 'listo') estado = '📰 reporte de hoy enviado por mail ✔'
  else if (u?.fecha === hoy && u.envio?.estado === 'error') estado = '⚠️ reporte listo, no se pudo enviar el mail'
  else if (u?.fecha === hoy && u.envio?.estado === 'en_curso') estado = '⏳ enviando el mail…'
  const reenviable = !e.enCurso && u?.fecha === hoy && u.texto && u.envio?.estado === 'error'

  const accion = async (que: 'ahora' | 'reenviar') => {
    setMsg('')
    const r = await fetch(`/api/reporte/${que}`, { method: 'POST' })
    if (!r.ok) setMsg(r.status === 409 ? 'El Director está ocupado.' : 'No se pudo.')
    void cargar()
  }

  return (
    <span className="reporte" title={u?.error ?? u?.envio?.detalle ?? `Cada mañana a las ${e.config.hora} el Director te manda el reporte a ${e.config.para}`}>
      {estado}{' '}
      {!e.enCurso && (
        <button className="link" onClick={() => void accion('ahora')}>
          enviar ahora
        </button>
      )}
      {reenviable && (
        <>
          {' · '}
          <button className="link" onClick={() => void accion('reenviar')}>
            reintentar mail
          </button>
        </>
      )}
      {msg && <b> {msg}</b>}
    </span>
  )
}
