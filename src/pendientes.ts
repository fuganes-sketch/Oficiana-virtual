import { useSyncExternalStore } from 'react'

export type TipoPendiente = 'mail' | 'presupuesto' | 'publicacion' | 'gasto' | 'otro'

/** Algo que un agente dejó listo y que necesita la aprobación de Agustín. */
export interface Pendiente {
  id: string
  agente: string
  tipo: TipoPendiente
  titulo: string
  motivo?: string
  campos: Record<string, string>
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  creado: number
  decidido?: number
  nota?: string
  /** se envió solo (mails), sin aprobación */
  auto?: boolean
  /** Qué pasó al ejecutar lo aprobado (crear el borrador en Gmail). */
  ejecucion?: { estado: 'en_curso' | 'listo' | 'error'; detalle?: string; url?: string; ts: number }
}

export const TIPO_LABEL: Record<TipoPendiente, string> = {
  mail: 'MAIL',
  presupuesto: 'PRESUPUESTO',
  publicacion: 'PUBLICACIÓN',
  gasto: 'GASTO',
  otro: 'OTRO',
}

/** Orden y nombre de los campos de cada tipo (los de texto largo van en un cuadro grande). */
/** `fijo`: lo calcula el sistema, no se edita a mano. */
export const CAMPOS: Record<TipoPendiente, { key: string; label: string; largo?: boolean; fijo?: boolean }[]> = {
  mail: [
    { key: 'para', label: 'Para' },
    { key: 'asunto', label: 'Asunto' },
    { key: 'cuerpo', label: 'Mensaje', largo: true },
  ],
  presupuesto: [
    { key: 'cliente', label: 'Cliente', fijo: true },
    { key: 'zona', label: 'Zona', fijo: true },
    { key: 'para', label: 'Para' },
    { key: 'asunto', label: 'Asunto' },
    { key: 'mensaje', label: 'Mensaje', largo: true },
    { key: 'detalle', label: 'Detalle y total (calculado)', largo: true, fijo: true },
    { key: 'validez', label: 'Validez' },
  ],
  publicacion: [
    { key: 'red', label: 'Red' },
    { key: 'texto', label: 'Texto', largo: true },
    { key: 'imagen', label: 'Imagen / diseño', largo: true },
    { key: 'cuando', label: 'Cuándo' },
  ],
  gasto: [
    { key: 'concepto', label: 'Concepto' },
    { key: 'monto', label: 'Monto ($)' },
    { key: 'proveedor', label: 'Proveedor' },
  ],
  otro: [{ key: 'cuerpo', label: 'Detalle', largo: true }],
}

let items: Pendiente[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const usePendientes = () => useSyncExternalStore(subscribe, () => items)

export async function cargarPendientes() {
  try {
    const d = await (await fetch('/api/pendientes')).json()
    items = d.items ?? []
    emit()
  } catch {
    /* sin servidor */
  }
}

export async function decidir(
  id: string,
  accion: 'aprobar' | 'rechazar',
  datos: { campos?: Record<string, string>; nota?: string } = {},
) {
  const r = await fetch(`/api/pendientes/${id}/${accion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!r.ok) throw new Error(r.status === 409 ? 'Ya estaba decidido.' : `Error ${r.status}`)
  await cargarPendientes()
}

/** Guarda las correcciones sin aprobar (así no se pierden al cerrar o recargar). */
export async function guardarEdicion(id: string, campos: Record<string, string>) {
  const r = await fetch(`/api/pendientes/${id}/editar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campos }),
  })
  if (!r.ok) throw new Error(r.status === 409 ? 'Ya estaba decidido.' : `Error ${r.status}`)
  await cargarPendientes()
}

export async function reintentar(id: string) {
  await fetch(`/api/pendientes/${id}/reintentar`, { method: 'POST' })
  await cargarPendientes()
}
