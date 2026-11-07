import { useSyncExternalStore } from 'react'
import { cargarPendientes } from './pendientes'

/** Estado de los chats con los agentes. Vive fuera de los componentes: la charla sigue aunque cambies de agente. */
export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  ts: number
  cost?: number
  /** cuántas cosas dejó este mensaje en la bandeja de pendientes */
  pendientes?: number
}

export interface ChatState {
  messages: ChatMsg[]
  streaming: string
  /** lo que está haciendo ahora (por ejemplo, buscando en internet) */
  estado?: string
  sending: boolean
  error: string | null
  loaded: boolean
  configured: boolean
}

export interface Usage {
  fiveHour?: number
  sevenDay?: number
  fiveHourResetsAt?: number
  sevenDayResetsAt?: number
}

const states = new Map<string, ChatState>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const get = (id: string): ChatState => {
  let s = states.get(id)
  if (!s) {
    s = { messages: [], streaming: '', sending: false, error: null, loaded: false, configured: true }
    states.set(id, s)
  }
  return s
}
const set = (id: string, p: Partial<ChatState>) => {
  states.set(id, { ...get(id), ...p })
  emit()
}

export const useChat = (id: string) => useSyncExternalStore(subscribe, () => get(id))

let usage: Usage = {}
export const useUsage = () => useSyncExternalStore(subscribe, () => usage)
const setUsage = (u: Usage) => {
  usage = { ...u }
  emit()
}

let busyHook: (id: string, busy: boolean) => void = () => {}
/** La oficina se entera de cuándo un agente está trabajando (para sentarlo en su escritorio). */
export const setBusyHook = (fn: (id: string, busy: boolean) => void) => {
  busyHook = fn
}

export async function loadChat(id: string) {
  try {
    const r = await fetch(`/api/chat/${id}`)
    const d = await r.json()
    if (!get(id).sending) set(id, { messages: d.history ?? [], configured: !!d.configured, loaded: true, error: null })
    else set(id, { configured: !!d.configured, loaded: true })
  } catch {
    set(id, { loaded: true, error: 'No pude conectar con la oficina (¿está el servidor corriendo?).' })
  }
}

/** Espera a que el agente termine en el servidor y vuelve a cargar su chat con la respuesta guardada. */
async function recuperar(id: string) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    try {
      const d = await (await fetch('/api/status')).json()
      if (!(d.busy ?? []).includes(id)) break
    } catch {
      /* sin conexión todavía: se sigue intentando */
    }
  }
  try {
    const d = await (await fetch(`/api/chat/${id}`)).json()
    set(id, { messages: d.history ?? [], configured: !!d.configured, loaded: true, error: null, estado: '' })
  } catch {
    set(id, { error: 'No pude recuperar la respuesta. Tocá otro agente y volvé, o recargá la página.', estado: '' })
  }
}

export async function refreshStatus() {
  try {
    const d = await (await fetch('/api/status')).json()
    if (d.usage) setUsage(d.usage)
  } catch {
    /* sin servidor */
  }
}

export async function resetChat(id: string) {
  if (get(id).sending) return
  await fetch(`/api/chat/${id}/reset`, { method: 'POST' })
  set(id, { messages: [], streaming: '', error: null })
}

/** Qué agentes están encendidos (lo guarda la pantalla): el Director solo puede consultar a los encendidos. */
function encendidosAhora(): string[] | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem('service-tech-oficina-v1') ?? 'null') as Record<string, { enabled: boolean }> | null
    if (!raw) return undefined
    return Object.keys(raw).filter((k) => raw[k].enabled)
  } catch {
    return undefined
  }
}

export async function sendChat(id: string, text: string) {
  const msg = text.trim()
  const s = get(id)
  if (!msg || s.sending) return
  set(id, {
    messages: [...s.messages, { role: 'user', text: msg, ts: Date.now() }],
    streaming: '',
    sending: true,
    error: null,
  })
  busyHook(id, true)
  try {
    const res = await fetch(`/api/chat/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, encendidos: encendidosAhora() }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(
        e.error === 'sin_configurar'
          ? 'Este agente todavía no tiene su personalidad cargada.'
          : e.error === 'ocupado'
            ? 'Este agente todavía está respondiendo otra cosa.'
            : `Error ${res.status}`,
      )
    }
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let acc = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const event = /^event: (.*)$/m.exec(block)?.[1]
        const raw = /^data: (.*)$/m.exec(block)?.[1]
        if (!event || !raw) continue
        const data = JSON.parse(raw)
        if (event === 'estado') {
          set(id, { estado: data.text })
        } else if (event === 'delta') {
          acc += data.text
          set(id, { streaming: acc, estado: '' })
        } else if (event === 'done') {
          set(id, {
            messages: [
              ...get(id).messages,
              { role: 'assistant', text: data.text, ts: Date.now(), cost: data.cost, pendientes: data.pendientes || undefined },
            ],
            streaming: '',
            estado: '',
          })
          if (data.usage) setUsage(data.usage)
          if (data.pendientes) void cargarPendientes()
        } else if (event === 'error') {
          throw new Error(data.message)
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const cortada = e instanceof TypeError || /network|load failed|fetch|conexi/i.test(msg)
    if (cortada) {
      // se perdió la conexión (por ejemplo, el teléfono se bloqueó): el agente sigue trabajando en la PC; se espera y se recupera
      set(id, { streaming: '', estado: '⏳ se cortó la conexión; el trabajo sigue en la PC, esperando la respuesta…', error: null })
      await recuperar(id)
    } else {
      set(id, { error: msg, streaming: '', estado: '' })
    }
  } finally {
    set(id, { sending: false })
    busyHook(id, false)
  }
}
