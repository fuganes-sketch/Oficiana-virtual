import type { Plugin } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * API local de la oficina. Conecta cada agente con Claude Code (usa tu plan, sin API key).
 * Todo lo que guarda queda dentro de la carpeta del proyecto (data/), así se puede mover.
 */
interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  ts: number
  cost?: number
  /** cuántas cosas dejó este mensaje en la bandeja de pendientes */
  pendientes?: number
}

type TipoPendiente = 'mail' | 'presupuesto' | 'publicacion' | 'gasto' | 'otro'

/** Qué pasó al ejecutar lo aprobado (hoy: crear el borrador en Gmail). */
interface Ejecucion {
  estado: 'en_curso' | 'listo' | 'error'
  detalle?: string
  /** enlace al borrador creado */
  url?: string
  ts: number
}

/** Algo que un agente dejó listo y que necesita la aprobación de Agustín. */
interface Pendiente {
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
  /** se envió sola, sin pasar por la aprobación de Agustín (mails) */
  auto?: boolean
  ejecucion?: Ejecucion
}

const CAMPOS: Record<TipoPendiente, string[]> = {
  mail: ['para', 'asunto', 'cuerpo'],
  presupuesto: ['cliente', 'para', 'asunto', 'mensaje', 'detalle', 'validez', 'zona', 'total'],
  publicacion: ['red', 'texto', 'imagen', 'cuando'],
  gasto: ['concepto', 'monto', 'proveedor'],
  otro: ['cuerpo'],
}
/** Campos calculados por el sistema: Agustín no los edita a mano (si quiere otro monto, se rehace el presupuesto). */
const CAMPOS_FIJOS = new Set(['cliente', 'detalle', 'zona', 'total'])

interface PrecioDB {
  fecha: string
  zonas: Record<string, string>
  dolar_referencia?: { valor: number; fecha: string }
  servicios: { id: string; servicio: string; equipo: string; precios: Record<string, { freelance: number; local: number }> }[]
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/**
 * Herramientas de Gmail que SÍ se permiten (solo crear borradores) y lo que se bloquea expresamente.
 * ToolSearch es el buscador interno de Claude Code: con tantos conectores, las herramientas se cargan bajo demanda.
 */
const GMAIL_PERMITIDA = 'mcp__claude_ai_Gmail__create_draft'
/** Única excepción a "nada se envía solo": el reporte diario, y solo a la dirección de Agustín. */
const GMAIL_ENVIAR = 'mcp__claude_ai_Gmail__send_message'
const BUSCADOR = 'ToolSearch'
const GMAIL_BLOQUEADAS = [
  // herramientas internas de Claude Code (no se restringen con --tools porque eso deja sin conectores)
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Agent',
  'mcp__claude_ai_Gmail__send_message',
  'mcp__claude_ai_Gmail__reply',
  'mcp__claude_ai_Gmail__forward',
  'mcp__claude_ai_Gmail__delete_draft',
  'mcp__claude_ai_Gmail__trash_message',
  'mcp__claude_ai_Gmail__trash_thread',
  'mcp__claude_ai_mailerfind',
  'mcp__claude_ai_apify',
  'mcp__claude_ai_Google_Drive',
  'mcp__claude_ai_Figma',
  'mcp__claude_ai_Claude_Docs',
  'mcp__claude_ai_Runway_Export',
]

/** Claude Code espera alias como "opus" o "sonnet"; acá se aceptan nombres escritos a mano ("opus 5.5"). */
function normalizarModelo(m: string | undefined) {
  const t = (m ?? '').trim().toLowerCase()
  if (!t) return 'sonnet'
  if (t.startsWith('claude-')) return t
  for (const alias of ['opus', 'sonnet', 'haiku']) if (t.includes(alias)) return alias
  return t
}

interface Usage {
  fiveHour?: number
  sevenDay?: number
  fiveHourResetsAt?: number
  sevenDayResetsAt?: number
  updatedAt?: number
}

interface RunResult {
  ok: boolean
  text: string
  cost?: number
  error?: string
  resumeFailed?: boolean
}

interface Opciones {
  /** los mails dirigidos a Agustín se envían solos, sin aprobación (los de clientes siempre se revisan) */
  mailAutomatico: boolean
  /** al aprobar un mail o presupuesto para un cliente se envía (false: solo se crea el borrador en Gmail) */
  enviarAlAprobar: boolean
  /** tope de mails automáticos por día (corta cualquier bucle) */
  maxMailsDia: number
}
interface ReporteCfg {
  activo: boolean
  hora: string
  para: string
}
interface ReporteArchivo {
  fecha: string
  texto?: string
  creado: number
  intentos: number
  costo?: number
  error?: string
  envio?: { estado: 'en_curso' | 'listo' | 'error'; detalle?: string; ts: number }
}

const TIMEOUT_MS = 420_000
const NL = String.fromCharCode(10)

export function oficinaApi(): Plugin {
  return {
    name: 'oficina-api',
    configureServer(server) {
      const ROOT = server.config.root
      // Acceso: solo esta PC y los dispositivos de la red privada de Tailscale (100.64.0.0/10). Cualquier otro (Wi-Fi, internet) recibe 403.
      server.middlewares.use((req, res, next) => {
        const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
        const [a, b] = ip.split('.').map(Number)
        const permitido = ip === '127.0.0.1' || ip === '::1' || (a === 100 && b >= 64 && b <= 127)
        if (permitido) return next()
        console.log(`[oficina] acceso rechazado desde ${ip}`)
        res.statusCode = 403
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Acceso no permitido')
      })
      const DATA = path.join(ROOT, 'data')
      const CHATS = path.join(DATA, 'chats')
      const WORK = path.join(DATA, 'workspace')
      const AGENTS_DIR = path.join(ROOT, 'agents')
      for (const d of [DATA, CHATS, WORK]) fs.mkdirSync(d, { recursive: true })

      const readJson = <T,>(p: string, fallback: T): T => {
        try {
          return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
        } catch {
          return fallback
        }
      }
      const writeJson = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2))

      const sessionsFile = path.join(DATA, 'sessions.json')
      const usageFile = path.join(DATA, 'usage.json')
      let usage: Usage = readJson<Usage>(usageFile, {})
      const busy = new Set<string>()

      const pendientesFile = path.join(DATA, 'pendientes.json')
      const leerPendientes = () => readJson<Pendiente[]>(pendientesFile, [])
      const guardarPendientes = (l: Pendiente[]) => writeJson(pendientesFile, l)

      const preciosFile = path.join(DATA, 'precios', 'precios.json')
      const leerPrecios = () => readJson<PrecioDB | null>(preciosFile, null)

      /** Tabla de precios (Freelance/Taller, pesos) para que Ventas la tenga en su prompt. */
      function tablaPrecios() {
        const db = leerPrecios()
        if (!db) return ''
        const zonas = Object.keys(db.zonas)
        const filas = db.servicios.map(
          (s) => `${s.id} | ${s.servicio} | ${s.equipo} | ` + zonas.map((z) => `${s.precios[z]?.freelance ?? '-'}`).join(' | '),
        )
        return [
          '## Lista de precios (cargada y verificada)',
          `Pesos argentinos, columna "Freelance/Taller", lista de ${db.fecha}, zona ` + zonas.map((z) => db.zonas[z]).join(', ') + '. Es la ÚNICA lista de precios del negocio: no existen otras.',
          'Formato: id | servicio | equipo | precio.',
          ...filas,
        ].join(NL)
      }

      /** El sistema calcula el presupuesto con la lista oficial: el agente solo elige servicios y cantidades. */
      function armarPresupuesto(d: any): { error: string } | { titulo: string; campos: Record<string, string> } {
        const db = leerPrecios()
        if (!db) return { error: 'No encuentro la lista de precios (data/precios/precios.json).' }
        const unica = Object.keys(db.zonas)
        // con una sola lista cargada, la zona no hace falta: se usa esa
        const zona = String(d.zona ?? '').trim() || (unica.length === 1 ? unica[0] : '')
        if (!db.zonas[zona]) return { error: `La zona "${zona}" no está cargada. Zonas disponibles: ${Object.keys(db.zonas).join(', ')}.` }
        if (!Array.isArray(d.items) || d.items.length === 0) return { error: 'El presupuesto no tiene servicios.' }
        const repetidos = new Set<string>()
        const vistos = new Set<string>()
        for (const s of db.servicios) {
          if (vistos.has(s.servicio)) repetidos.add(s.servicio)
          vistos.add(s.servicio)
        }
        const lineas: string[] = []
        let total = 0
        for (const it of d.items) {
          const s = db.servicios.find((x) => x.id === String(it?.id ?? '').trim())
          if (!s) return { error: `El servicio "${it?.id}" no existe en la lista.` }
          const precio = s.precios[zona]?.freelance
          if (typeof precio !== 'number') return { error: `El servicio ${s.id} no tiene precio para la zona ${zona}.` }
          const cant = Math.min(99, Math.max(1, Math.round(Number(it.cantidad) || 1)))
          const nombre = s.servicio + (repetidos.has(s.servicio) ? ` (${s.equipo.replace(/\s+/g, ' ')})` : '')
          lineas.push(`• ${nombre}${cant > 1 ? ` x${cant}` : ''} — ${pesos(precio * cant)}`)
          total += precio * cant
        }
        if (Array.isArray(d.ajustes)) {
          for (const a of d.ajustes) {
            const monto = Number(a?.monto)
            if (!Number.isFinite(monto) || monto === 0) continue
            lineas.push(`• ${String(a?.concepto ?? 'Ajuste').slice(0, 120)} — ${monto < 0 ? '-' : ''}${pesos(Math.abs(monto))}`)
            total += monto
          }
        }
        if (total <= 0) return { error: 'El total del presupuesto da cero o negativo.' }
        const cliente = String(d.cliente ?? '').slice(0, 120)
        return {
          titulo: String(d.titulo ?? `Presupuesto${cliente ? ' ' + cliente : ''}`).slice(0, 160),
          campos: {
            cliente,
            para: String(d.para ?? '').slice(0, 200),
            asunto: String(d.asunto ?? `Presupuesto Service Tech${cliente ? ' - ' + cliente : ''}`).slice(0, 200),
            mensaje: String(d.mensaje ?? '').slice(0, 4000),
            detalle: lineas.join(NL) + NL + NL + 'TOTAL: ' + pesos(total),
            validez: String(d.validez ?? '7 días').slice(0, 80),
            zona: db.zonas[zona],
            total: String(total),
          },
        }
      }

      /** Texto final del mail que va al borrador de Gmail. */
      function mailDe(it: Pendiente) {
        if (it.tipo === 'presupuesto') {
          const db = leerPrecios()
          const c = it.campos
          return {
            para: c.para ?? '',
            asunto: c.asunto ?? it.titulo,
            cuerpo: [c.mensaje, c.detalle, `Validez del presupuesto: ${c.validez}.`, `Valores en pesos argentinos${db ? ` (lista de ${db.fecha})` : ''}.`]
              .filter(Boolean)
              .join(NL + NL),
          }
        }
        return { para: it.campos.para ?? '', asunto: it.campos.asunto ?? it.titulo, cuerpo: it.campos.cuerpo ?? '' }
      }

      /**
       * Los agentes no tienen herramientas: para proponer algo que sale al exterior escriben un bloque
       * ```pendiente { json } ``` al final de su mensaje. Acá se saca del texto y se guarda en la bandeja.
       */
      function extraerPendientes(texto: string, agente: string) {
        const items: Pendiente[] = []
        const errores: string[] = []
        const limpio = texto
          .replace(/```pendiente[^\r\n]*\r?\n([\s\S]*?)```/g, (_m, cuerpo: string) => {
            try {
              const d = JSON.parse(cuerpo.trim())
              if (d.tipo === 'presupuesto') {
                const r = armarPresupuesto(d)
                if ('error' in r) errores.push(r.error)
                else
                  items.push({
                    id: randomUUID(),
                    agente,
                    tipo: 'presupuesto',
                    titulo: r.titulo,
                    motivo: d.motivo ? String(d.motivo).slice(0, 1000) : undefined,
                    campos: r.campos,
                    estado: 'pendiente',
                    creado: Date.now(),
                  })
                return ''
              }
              const tipo: TipoPendiente = ['mail', 'publicacion', 'gasto'].includes(d.tipo) ? d.tipo : 'otro'
              const campos: Record<string, string> = {}
              for (const k of CAMPOS[tipo]) if (d[k] !== undefined && d[k] !== null) campos[k] = String(d[k]).slice(0, 8000)
              items.push({
                id: randomUUID(),
                agente,
                tipo,
                titulo: String(d.titulo ?? 'Sin título').slice(0, 160),
                motivo: d.motivo ? String(d.motivo).slice(0, 1000) : undefined,
                campos,
                estado: 'pendiente',
                creado: Date.now(),
              })
            } catch {
              errores.push('Un bloque de pendiente vino mal formado y no se pudo guardar.')
            }
            return ''
          })
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        return { limpio, items, errores }
      }

      const validId = (id: string) => /^[a-z0-9-]+$/.test(id)
      const chatFile = (id: string) => path.join(CHATS, `${id}.json`)

      function readAgent(id: string) {
        const p = path.join(AGENTS_DIR, `${id}.md`)
        if (!validId(id) || !fs.existsSync(p)) return null
        const raw = fs.readFileSync(p, 'utf-8')
        const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
        const meta: Record<string, string> = {}
        let body = raw
        if (m) {
          for (const line of m[1].split(/\r?\n/)) {
            const i = line.indexOf(':')
            if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
          }
          body = m[2]
        }
        return { meta, body: body.trim() }
      }

      function systemPrompt(id: string) {
        const agent = readAgent(id)!
        const shared = fs.existsSync(path.join(AGENTS_DIR, '_contexto.md'))
          ? fs.readFileSync(path.join(AGENTS_DIR, '_contexto.md'), 'utf-8')
          : ''
        const hoy = new Date().toLocaleDateString('es-AR', { dateStyle: 'full' })
        const precios = agent.meta.precios === 'si' ? tablaPrecios() : ''
        const miMail = `Mail de Agustín (para cuando te pida que le mandes algo a él): ${leerConfig().reporte.para}`
        // la identidad de marca (logo, colores, Instagram) solo la reciben los agentes de diseño y social (`marca: si`)
        const marca =
          agent.meta.marca === 'si' && fs.existsSync(path.join(AGENTS_DIR, '_marca.md'))
            ? '\n\n---\n\n' + fs.readFileSync(path.join(AGENTS_DIR, '_marca.md'), 'utf-8')
            : ''
        return `${shared}\n\n${miMail}\n\n---\n\n${agent.body}${precios ? '\n\n---\n\n' + precios : ''}${marca}\n\n---\nHoy es ${hoy}.`
      }

      function updateUsage(info: any) {
        const w = info?.unifiedWindows
        if (!w) return
        usage = {
          fiveHour: w.five_hour?.utilization,
          sevenDay: w.seven_day?.utilization,
          fiveHourResetsAt: w.five_hour?.resetsAt,
          sevenDayResetsAt: w.seven_day?.resetsAt,
          updatedAt: Date.now(),
        }
        writeJson(usageFile, usage)
      }

      /** Corre Claude Code sin herramientas, con la personalidad del agente. */
      function runClaude(o: {
        system: string
        model: string
        message: string
        sessionId: string
        resume: boolean
        onDelta: (t: string) => void
        /** avisa cuando el agente usa una herramienta (búsqueda en internet) */
        onTool?: (nombre: string) => void
        onChild: (c: ChildProcess) => void
      }): Promise<RunResult> {
        return new Promise((resolve) => {
          const args = [
            '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
            '--system-prompt', o.system,
            // único acceso externo de los agentes: buscar y leer páginas web (sin archivos, sin comandos, sin conectores)
            '--tools', 'WebSearch,WebFetch',
            '--allowedTools', 'WebSearch,WebFetch',
            '--setting-sources', '',
            '--strict-mcp-config',
            '--model', o.model,
            ...(o.resume ? ['--resume', o.sessionId] : ['--session-id', o.sessionId]),
          ]
          const child = spawn('claude', args, {
            cwd: WORK,
            env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          })
          o.onChild(child)
          const t0 = Date.now()
          console.log(`[oficina] claude iniciado (pid ${child.pid}, ${o.resume ? 'retoma' : 'nueva'} sesión)`)
          let buf = ''
          let streamed = ''
          let result: any = null
          let stderr = ''
          const timer = setTimeout(() => child.kill(), TIMEOUT_MS)

          child.stdout.on('data', (d: Buffer) => {
            buf += d.toString('utf-8')
            let nl: number
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim()
              buf = buf.slice(nl + 1)
              if (!line.startsWith('{')) continue
              let e: any
              try {
                e = JSON.parse(line)
              } catch {
                continue
              }
              if (e.type === 'stream_event') {
                const ev = e.event
                if (ev?.type === 'content_block_start' && /tool_use/.test(String(ev.content_block?.type))) {
                  o.onTool?.(String(ev.content_block?.name ?? ''))
                }
                if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                  streamed += ev.delta.text
                  o.onDelta(ev.delta.text)
                }
              } else if (e.type === 'rate_limit_event') {
                updateUsage(e.rate_limit_info)
              } else if (e.type === 'result') {
                result = e
              }
            }
          })
          child.stderr.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8')
            console.log('[oficina] stderr:', d.toString('utf-8').slice(0, 300))
          })
          child.on('error', (err) => {
            clearTimeout(timer)
            resolve({ ok: false, text: '', error: `No pude iniciar Claude Code: ${err.message}` })
          })
          child.on('close', (code) => {
            clearTimeout(timer)
            console.log(`[oficina] claude terminó (código ${code}, ${Date.now() - t0} ms, resultado: ${result ? (result.is_error ? 'error' : 'ok') : 'ninguno'})`)
            if (result && !result.is_error) {
              resolve({ ok: true, text: String(result.result ?? streamed), cost: result.total_cost_usd })
              return
            }
            const msg = String(result?.result ?? stderr ?? '').trim()
            resolve({
              ok: false,
              text: streamed,
              error: msg || `Claude Code terminó con código ${code}`,
              resumeFailed: o.resume && /no conversation found|session/i.test(msg + stderr),
            })
          })
          child.stdin.write(o.message)
          child.stdin.end()
        })
      }

      /**
       * Crea UN borrador en Gmail con Claude Code. Solo se permite la herramienta de crear borradores;
       * enviar, responder y reenviar están bloqueados. Agustín revisa el borrador y lo manda él.
       */
      function crearBorradorGmail(
        m: { para: string; asunto: string; cuerpo: string },
        enviar = false,
      ): Promise<{ ok: boolean; detalle: string; url?: string }> {
        const permitida = enviar ? GMAIL_ENVIAR : GMAIL_PERMITIDA
        const bloqueadas = [...GMAIL_BLOQUEADAS.filter((x) => x !== permitida), ...(enviar ? [GMAIL_PERMITIDA] : [])]
        return new Promise((resolve) => {
          const sistema = enviar
            ? 'Tu única tarea es enviar UN mail con la herramienta send_message de Gmail, usando EXACTAMENTE los datos que te pasan ' +
              '(destinatario, asunto y cuerpo, sin cambiar ni agregar texto) y un único destinatario. No respondas, no reenvíes, no crees borradores y no uses ninguna otra herramienta, salvo la búsqueda de herramientas para encontrar send_message. ' +
              'Al terminar respondé solo "OK" o "ERROR: motivo".'
            :
            'Tu única tarea es crear UN borrador en Gmail con la herramienta create_draft, usando EXACTAMENTE los datos que te pasan ' +
            '(destinatario, asunto y cuerpo, sin cambiar ni agregar texto). No envíes, no respondas, no reenvíes y no uses ninguna otra herramienta, salvo la búsqueda de herramientas para encontrar create_draft. ' +
            'Si el destinatario está vacío, creá el borrador sin destinatario. Al terminar respondé solo "OK" o "ERROR: motivo".'
          const pedido = JSON.stringify({ to: m.para, subject: m.asunto, body: m.cuerpo })
          const child = spawn(
            'claude',
            [
              '-p', '--output-format', 'stream-json', '--verbose',
              '--model', 'sonnet',
              '--setting-sources', '',
              '--no-session-persistence',
              '--system-prompt', sistema,
              '--disallowedTools', bloqueadas.join(','),
              '--allowedTools', `${permitida},${BUSCADOR}`,
            ],
            { cwd: WORK, env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
          )
          let buf = ''
          const herramientas: string[] = []
          let resultadoHerramienta = ''
          let falloHerramienta = false
          let final = ''
          let stderr = ''
          const timer = setTimeout(() => child.kill(), 120_000)
          child.stdout.on('data', (d: Buffer) => {
            buf += d.toString('utf-8')
            let nl: number
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim()
              buf = buf.slice(nl + 1)
              if (!line.startsWith('{')) continue
              let e: any
              try {
                e = JSON.parse(line)
              } catch {
                continue
              }
              if (e.type === 'assistant') {
                for (const b of e.message?.content ?? []) if (b.type === 'tool_use') herramientas.push(String(b.name))
              } else if (e.type === 'user') {
                for (const b of e.message?.content ?? []) {
                  if (b.type === 'tool_result') {
                    if (b.is_error) falloHerramienta = true
                    resultadoHerramienta = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
                  }
                }
              } else if (e.type === 'rate_limit_event') {
                updateUsage(e.rate_limit_info)
              } else if (e.type === 'result') {
                final = String(e.result ?? '')
              }
            }
          })
          child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf-8')))
          child.on('error', (err) => {
            clearTimeout(timer)
            resolve({ ok: false, detalle: `No pude iniciar Claude Code: ${err.message}` })
          })
          child.on('close', () => {
            clearTimeout(timer)
            console.log(`[oficina] gmail: herramientas usadas = ${herramientas.join(', ') || 'ninguna'}`)
            const otras = herramientas.filter((h) => h !== permitida && h !== BUSCADOR)
            if (otras.length) return resolve({ ok: false, detalle: `Se intentó usar una herramienta no permitida (${otras.join(', ')}). No se hizo nada.` })
            if (!herramientas.includes(permitida)) {
              return resolve({ ok: false, detalle: (final || stderr || 'No se pudo conectar con Gmail.').slice(0, 400) })
            }
            if (falloHerramienta) return resolve({ ok: false, detalle: `Gmail respondió con un error: ${resultadoHerramienta}`.slice(0, 400) })
            let url: string | undefined
            try {
              url = JSON.parse(resultadoHerramienta).viewUrl
            } catch {
              /* sin enlace */
            }
            resolve({ ok: true, detalle: enviar ? 'Mail enviado.' : 'Borrador creado en Gmail.', url })
          })
          child.stdin.write(`${enviar ? 'Enviá el mail' : 'Creá el borrador'} con estos datos exactos (JSON): ${pedido}`)
          child.stdin.end()
        })
      }

      const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e.trim())

      /** ¿El mail va a la casilla de Agustín (y a nadie más)? Solo esos salen sin aprobación. */
      const esParaAgustin = (para: string) => emailOk(para) && para.trim().toLowerCase() === leerConfig().reporte.para.trim().toLowerCase()

      /**
       * Guarda lo que dejaron los agentes. Los mails dirigidos a Agustín se envían solos; todo lo demás
       * (mails y presupuestos a clientes, publicaciones, gastos...) queda en la bandeja esperando su aprobación.
       */
      function registrarPendientes(items: Pendiente[]): { pendientes: number; notas: string[] } {
        if (!items.length) return { pendientes: 0, notas: [] }
        const op = leerOpciones()
        const lista = leerPendientes()
        const hoy = hoyISO()
        let enviadosHoy = lista.filter((p) => p.auto && new Date(p.decidido ?? 0).toLocaleDateString('en-CA') === hoy).length
        const ejecutar: string[] = []
        const notas: string[] = []
        let pendientes = 0
        for (const it of items) {
          const m = it.tipo === 'mail' || it.tipo === 'presupuesto' ? mailDe(it) : null
          if (op.mailAutomatico && m && esParaAgustin(m.para) && m.cuerpo.trim() && enviadosHoy < op.maxMailsDia) {
            it.estado = 'aprobado'
            it.decidido = Date.now()
            it.auto = true
            it.nota = 'Enviado automáticamente (es para vos)'
            it.ejecucion = { estado: 'en_curso', ts: Date.now() }
            enviadosHoy++
            ejecutar.push(it.id)
            notas.push(`✉️ Enviando el mail a ${m.para.trim()} (${m.asunto}).`)
          } else {
            pendientes++
          }
          lista.push(it)
        }
        guardarPendientes(lista)
        for (const id of ejecutar) void ejecutarAprobado(id)
        return { pendientes, notas }
      }

      async function ejecutarAprobado(id: string) {
        const lista = leerPendientes()
        const it = lista.find((p) => p.id === id)
        if (!it || it.estado !== 'aprobado' || (it.tipo !== 'mail' && it.tipo !== 'presupuesto')) return
        it.ejecucion = { estado: 'en_curso', ts: Date.now() }
        guardarPendientes(lista)
        const r = await crearBorradorGmail(mailDe(it), leerOpciones().enviarAlAprobar)
        const otra = leerPendientes()
        const actual = otra.find((p) => p.id === id)
        if (!actual) return
        actual.ejecucion = { estado: r.ok ? 'listo' : 'error', detalle: r.detalle, url: r.url, ts: Date.now() }
        guardarPendientes(otra)
      }

      const json = (res: ServerResponse, status: number, body: unknown) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(body))
      }
      const readBody = (req: IncomingMessage) =>
        new Promise<string>((resolve) => {
          let b = ''
          req.on('data', (c) => (b += c))
          req.on('end', () => resolve(b))
        })

      /** Nombres de todos los agentes y a quién puede consultar cada uno (los admins a su equipo; el Director a admins y Legal). */
      const NOMBRES: Record<string, string> = {
        director: 'Director',
        'admin-social': 'Admin. Social', rrpp: 'RRPP', redes: 'Redes sociales', marketing: 'Marketing',
        'admin-produccion': 'Admin. Producción', disenador: 'Diseñador gráfico', soporte: 'Soporte técnico', 'team-leader': 'Team leader',
        'admin-financiero': 'Admin. Financiero', ventas: 'Ventas y atención', tesorero: 'Tesorero', analista: 'Analista de métricas',
        inversionista: 'Inversionista', operaciones: 'Operaciones e inventario',
        legal: 'Legal e impuestos',
      }
      const EQUIPO: Record<string, string[]> = {
        director: ['admin-social', 'admin-produccion', 'admin-financiero', 'legal'],
        'admin-social': ['rrpp', 'redes', 'marketing'],
        'admin-produccion': ['disenador', 'soporte', 'team-leader'],
        'admin-financiero': ['ventas', 'tesorero', 'analista', 'inversionista', 'operaciones'],
      }

      // qué agentes están encendidos (la pantalla lo avisa; el reporte automático corre sin pantalla)
      const encendidosFile = path.join(DATA, 'encendidos.json')
      const leerEncendidos = () => readJson<string[] | null>(encendidosFile, null)

      function extraerConsultas(texto: string, de: string) {
        const permitidos = EQUIPO[de] ?? []
        const consultas: { a: string; pedido: string }[] = []
        const limpio = texto
          .replace(/```consulta[^\r\n]*\r?\n([\s\S]*?)```/g, (_m, cuerpo: string) => {
            try {
              const d = JSON.parse(cuerpo.trim())
              if (permitidos.includes(d.a) && d.pedido) consultas.push({ a: d.a, pedido: String(d.pedido).slice(0, 3000) })
            } catch {
              /* bloque inválido: se ignora */
            }
            return ''
          })
          .trim()
        return { limpio, consultas: consultas.slice(0, 5) }
      }

      /** Un turno de conversación con un agente (sesión propia, se retoma si existe). Guarda la sesión. */
      async function turno(
        id: string,
        message: string,
        history: ChatMsg[],
        hooks: { onDelta?: (t: string) => void; onChild?: (c: ChildProcess) => void; onTool?: (n: string) => void } = {},
      ): Promise<RunResult> {
        const agent = readAgent(id)!
        const sessions = readJson<Record<string, string>>(sessionsFile, {})
        const hadSession = !!sessions[id]
        let sid = sessions[id] ?? randomUUID()
        const base = {
          system: systemPrompt(id),
          model: normalizarModelo(agent.meta.modelo),
          onDelta: hooks.onDelta ?? (() => {}),
          onChild: hooks.onChild ?? (() => {}),
          onTool: hooks.onTool,
        }
        let r = await runClaude({ ...base, message, sessionId: sid, resume: hadSession })
        if (!r.ok && r.resumeFailed) {
          sid = randomUUID()
          const previa = history
            .slice(0, -1)
            .slice(-20)
            .map((m) => `${m.role === 'user' ? 'Agustín' : 'Vos'}: ${m.text}`)
            .join(NL)
          const retomado = previa
            ? `(Se perdió la sesión anterior. Esto es lo último que hablaron:${NL}${previa}${NL})${NL}${NL}Mensaje nuevo:${NL}${message}`
            : message
          r = await runClaude({ ...base, message: retomado, sessionId: sid, resume: false })
        }
        if (r.ok) {
          const s2 = readJson<Record<string, string>>(sessionsFile, {})
          s2[id] = sid
          writeJson(sessionsFile, s2)
        }
        return r
      }

      interface Cierre {
        texto: string
        pendientes: number
        cost: number
      }

      /**
       * Termina el turno de un agente: deja sus pendientes en la bandeja y, si pidió información a su equipo,
       * las corre, le devuelve las respuestas y devuelve lo que dijo al final.
       * `soloFinal`: descarta el texto previo a las consultas (se usa en el reporte).
       */
      async function cerrarTurno(
        id: string,
        r: RunResult,
        history: ChatMsg[],
        enc: string[] | null,
        paraQuien: string,
        hooks: { onDelta?: (t: string) => void; onChild?: (c: ChildProcess) => void; onTool?: (n: string) => void } = {},
        soloFinal = false,
      ): Promise<Cierre> {
        const { limpio: sinConsultas, consultas } = extraerConsultas(r.text, id)
        const p1 = extraerPendientes(sinConsultas, id)
        const g1 = registrarPendientes(p1.items)
        let todos = g1.pendientes
        let texto =
          p1.limpio ||
          (p1.items.length ? (g1.pendientes ? 'Listo, lo dejé en la bandeja para que lo apruebes.' : 'Listo.') : p1.errores.length || consultas.length ? '' : r.text)
        if (g1.notas.length) texto = [texto, ...g1.notas].filter(Boolean).join(NL + NL)
        if (p1.errores.length) texto = [texto, `⚠️ No pude dejarlo en la bandeja: ${p1.errores.join(' ')}`].filter(Boolean).join(NL + NL)
        if (consultas.length && (soloFinal || id !== 'director')) texto = ''
        let cost = r.cost ?? 0

        if (consultas.length) {
          const nombres = consultas.map((c) => NOMBRES[c.a]).join(', ')
          hooks.onDelta?.(`${NL}${NL}⏳ Consultando a ${nombres}…${NL}${NL}`)
          const resp = await Promise.all(consultas.map((c) => consultar(id, c.a, c.pedido, enc, hooks.onChild)))
          const mensaje2 =
            `Respuestas de tu equipo (es información para vos; armale a ${paraQuien} un solo resumen corto y priorizado, sin pegar todo):` +
            NL +
            consultas.map((c, i) => `${NL}### ${NOMBRES[c.a]}${NL}${resp[i].texto}`).join(NL)
          for (const x of resp) {
            todos += x.pendientes
            cost += x.cost
          }
          history.push({ role: 'assistant', text: texto || '(consulta al equipo)', ts: Date.now() })
          const r2 = await turno(id, mensaje2, history, hooks)
          history.pop()
          if (r2.ok) {
            cost += r2.cost ?? 0
            const l2 = extraerConsultas(r2.text, id).limpio
            const p2 = extraerPendientes(l2, id)
            const g2 = registrarPendientes(p2.items)
            todos += g2.pendientes
            texto = [texto, p2.limpio || l2, ...g2.notas].filter(Boolean).join(NL + NL)
          } else {
            texto = [texto, `⚠️ Tu equipo respondió, pero no pude armar el resumen: ${r2.error ?? 'error'}`].filter(Boolean).join(NL + NL)
          }
        }
        return { texto, pendientes: todos, cost }
      }

      /** Un agente le pide algo a otro; queda registrado en el chat de quien responde. */
      async function consultar(
        de: string,
        a: string,
        pedido: string,
        enc: string[] | null,
        onChild?: (c: ChildProcess) => void,
      ): Promise<{ texto: string; pendientes: number; cost: number }> {
        const vacio = (texto: string) => ({ texto, pendientes: 0, cost: 0 })
        if (!readAgent(a)) return vacio('(Todavía no tiene su personalidad cargada.)')
        if (enc && !enc.includes(a)) return vacio('(Está APAGADO: Agustín tiene que encenderlo para poder consultarlo.)')
        if (busy.has(a)) return vacio('(Está ocupado con otra conversación; probá de nuevo en un momento.)')
        busy.add(a)
        try {
          const msg = `${NOMBRES[de] ?? de} te pide: ${pedido}`
          const hist = readJson<ChatMsg[]>(chatFile(a), [])
          hist.push({ role: 'user', text: `🧭 ${msg}`, ts: Date.now() })
          writeJson(chatFile(a), hist)
          const r = await turno(a, msg, hist, { onChild })
          if (!r.ok) return vacio(`(No pude obtener la respuesta: ${r.error ?? 'error'})`)
          const c = await cerrarTurno(a, r, hist, enc, NOMBRES[de] ?? de, { onChild })
          const texto = c.texto || r.text
          hist.push({ role: 'assistant', text: texto, ts: Date.now(), cost: c.cost, pendientes: c.pendientes || undefined })
          writeJson(chatFile(a), hist)
          return { texto: texto + (c.pendientes ? `${NL}(Dejó ${c.pendientes} pendiente(s) en la bandeja de Agustín.)` : ''), pendientes: c.pendientes, cost: c.cost }
        } finally {
          busy.delete(a)
        }
      }

      async function chat(id: string, req: IncomingMessage, res: ServerResponse) {
        const agent = readAgent(id)
        if (!agent) return json(res, 404, { error: 'sin_configurar' })
        if (busy.has(id)) return json(res, 409, { error: 'ocupado' })
        let message = ''
        let enc: string[] | null = leerEncendidos()
        try {
          const b = JSON.parse(await readBody(req))
          message = String(b.message ?? '').trim()
          if (Array.isArray(b.encendidos)) enc = b.encendidos.map(String)
        } catch {
          /* cuerpo inválido */
        }
        if (!message) return json(res, 400, { error: 'mensaje_vacio' })

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        busy.add(id)
        const history = readJson<ChatMsg[]>(chatFile(id), [])
        history.push({ role: 'user', text: message, ts: Date.now() })
        writeJson(chatFile(id), history)

        // si se pierde la conexión (por ejemplo, el teléfono se bloquea) el trabajo NO se corta: sigue y la respuesta
        // queda guardada en el chat; la pantalla la recupera al volver
        let cerrada = false
        res.on('close', () => (cerrada = true))
        const send = (event: string, data: unknown) => {
          if (!cerrada && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }
        const hooks = {
          onDelta: (t: string) => send('delta', { text: t }),
          onTool: (n: string) => send('estado', { text: n === 'WebFetch' ? '🔎 leyendo una página web…' : '🔎 buscando en internet…' }),
        }

        const r = await turno(id, message, history, hooks)
        if (!r.ok) {
          busy.delete(id)
          send('error', { message: r.error ?? 'Error desconocido' })
          return void res.end()
        }
        const c = await cerrarTurno(id, r, history, enc, 'Agustín', hooks)
        busy.delete(id)
        history.push({ role: 'assistant', text: c.texto, ts: Date.now(), cost: c.cost, pendientes: c.pendientes || undefined })
        writeJson(chatFile(id), history)
        send('done', { text: c.texto, cost: c.cost, usage, pendientes: c.pendientes })
        res.end()
      }

      // ---------------------------------------------------------------- reporte diario

      const configFile = path.join(DATA, 'config.json')
      const REPORTES = path.join(DATA, 'reportes')
      fs.mkdirSync(REPORTES, { recursive: true })
      const leerConfig = () => {
        const c = readJson<{ reporte?: Partial<ReporteCfg> }>(configFile, {})
        return { reporte: { activo: true, hora: '08:00', para: 'agustinezequielfuganes@gmail.com', ...(c.reporte ?? {}) } as ReporteCfg }
      }
      const leerOpciones = (): Opciones => {
        const c = readJson<{ opciones?: Partial<Opciones> }>(configFile, {})
        return { mailAutomatico: true, enviarAlAprobar: true, maxMailsDia: 30, ...(c.opciones ?? {}) }
      }
      const hoyISO = () => new Date().toLocaleDateString('en-CA')
      const reporteFile = (f: string) => path.join(REPORTES, `${f}.json`)
      let reporteEnCurso = false

      const plano = (t: string) => t.replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '').replace(/`/g, '')

      /** Lo que el sistema sabe (bandeja y actividad de las últimas 24 h): lo único "objetivo" que tiene el Director. */
      function novedadesDelSistema() {
        const ahora = Date.now()
        const desde = ahora - 24 * 3600 * 1000
        const horas = (t: number) => Math.max(0, Math.round((ahora - t) / 3600000))
        const todos = leerPendientes()
        const esperando = todos.filter((p) => p.estado === 'pendiente')
        const decididos = todos.filter((p) => p.estado !== 'pendiente' && (p.decidido ?? 0) >= desde)
        const lineas: string[] = []
        lineas.push(`Esperando la aprobación de Agustín (${esperando.length}):`)
        for (const p of esperando) lineas.push(`- [${p.tipo}] ${p.titulo} (de ${NOMBRES[p.agente] ?? p.agente}, hace ${horas(p.creado)} h)`)
        if (!esperando.length) lineas.push('- nada')
        lineas.push(`Decidido por Agustín en las últimas 24 h (${decididos.length}):`)
        for (const p of decididos) lineas.push(`- [${p.tipo}] ${p.titulo}: ${p.estado}${p.ejecucion?.estado === 'error' ? ' (falló al ejecutarse)' : ''}`)
        if (!decididos.length) lineas.push('- nada')
        const actividad: string[] = []
        for (const id of Object.keys(NOMBRES)) {
          const h = readJson<ChatMsg[]>(chatFile(id), [])
          const n = h.filter((m) => m.role === 'user' && m.ts >= desde && !m.text.startsWith('📰')).length
          if (n) actividad.push(`${NOMBRES[id]}: ${n} mensaje(s)`)
        }
        lineas.push(`Actividad de chat en las últimas 24 h: ${actividad.join('; ') || 'ninguna'}.`)
        return lineas.join(NL)
      }

      async function generarReporte(): Promise<{ ok: boolean; error?: string }> {
        if (reporteEnCurso) return { ok: false, error: 'Ya se está generando un reporte.' }
        if (busy.has('director')) return { ok: false, error: 'El Director está ocupado con otra conversación.' }
        if (!readAgent('director')) return { ok: false, error: 'Falta agents/director.md.' }
        reporteEnCurso = true
        busy.add('director')
        const fecha = hoyISO()
        const previo = readJson<ReporteArchivo | null>(reporteFile(fecha), null)
        const intentos = (previo?.intentos ?? 0) + 1
        const cfg = leerConfig().reporte
        try {
          const hoy = new Date().toLocaleDateString('es-AR', { dateStyle: 'full' })
          const enc = leerEncendidos()
          // el sistema (no el Director) consulta siempre a los tres administradores y a Legal
          const areas = ['admin-social', 'admin-produccion', 'admin-financiero', 'legal']
          const pedido =
            `Reporte matutino del ${hoy}. Contame, corto y concreto: (1) novedades desde ayer, (2) trabajos trabados o riesgos, (3) qué necesita decidir Agustín y con qué prioridad. ` +
            'Si no hay nada nuevo, decilo en una línea. Solo consultá a tu equipo si hay algo concreto que averiguar; no inventes avances.'
          const resp = await Promise.all(areas.map((a) => consultar('director', a, pedido, enc)))
          let costoEquipo = 0
          let pendEquipo = 0
          for (const x of resp) {
            costoEquipo += x.cost
            pendEquipo += x.pendientes
          }
          const mensaje =
            `[REPORTE DIARIO AUTOMÁTICO] Es la mañana de ${hoy}. Armá el reporte matutino para Agustín con el formato del reporte diario.${NL}${NL}` +
            `Datos del sistema (de hoy; no arrastres pendientes de reportes anteriores):${NL}${novedadesDelSistema()}${NL}${NL}` +
            `Respuestas de los administradores y de Legal a tu pedido de hoy:${NL}` +
            areas.map((a, i) => `${NL}### ${NOMBRES[a]}${NL}${resp[i].texto}`).join(NL)
          const hist = readJson<ChatMsg[]>(chatFile('director'), [])
          hist.push({ role: 'user', text: '📰 Reporte diario (automático)', ts: Date.now() })
          writeJson(chatFile('director'), hist)
          const r = await turno('director', mensaje, hist)
          if (!r.ok) throw new Error(r.error ?? 'El Director no respondió.')
          const c = await cerrarTurno('director', r, hist, enc, 'Agustín', {}, true)
          c.cost += costoEquipo
          c.pendientes += pendEquipo
          if (!c.texto.trim()) throw new Error('El Director no entregó el reporte.')
          hist.push({ role: 'assistant', text: c.texto, ts: Date.now(), cost: c.cost, pendientes: c.pendientes || undefined })
          writeJson(chatFile('director'), hist)
          const arch: ReporteArchivo = { fecha, texto: c.texto, creado: Date.now(), intentos, costo: c.cost }
          writeJson(reporteFile(fecha), arch)
          if (cfg.para) await enviarReporte(arch)
          return { ok: true }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.log('[oficina] reporte falló:', msg)
          writeJson(reporteFile(fecha), { fecha, creado: Date.now(), intentos, error: msg } satisfies ReporteArchivo)
          return { ok: false, error: msg }
        } finally {
          busy.delete('director')
          reporteEnCurso = false
        }
      }

      async function enviarReporte(arch: ReporteArchivo) {
        const cfg = leerConfig().reporte
        if (!arch.texto) return
        arch.envio = { estado: 'en_curso', ts: Date.now() }
        writeJson(reporteFile(arch.fecha), arch)
        const cuerpo =
          plano(arch.texto) +
          `${NL}${NL}—${NL}Reporte automático de la oficina de Service Tech. Publicaciones, gastos y otros pedidos esperan tu aprobación en la bandeja; los mails se envían solos.`
        // solo a la dirección de Agustín (la que figura en la configuración)
        const r = await crearBorradorGmail({ para: cfg.para, asunto: `Service Tech · Reporte del día ${arch.fecha}`, cuerpo }, true)
        arch.envio = { estado: r.ok ? 'listo' : 'error', detalle: r.detalle, ts: Date.now() }
        writeJson(reporteFile(arch.fecha), arch)
      }

      // todos los días a la hora configurada (si la PC estaba apagada, sale apenas se inicia la oficina)
      const revisarReporte = () => {
        const cfg = leerConfig().reporte
        if (!cfg.activo || reporteEnCurso) return
        const [h, m] = cfg.hora.split(':').map(Number)
        const ahora = new Date()
        if (ahora.getHours() * 60 + ahora.getMinutes() < (h || 0) * 60 + (m || 0)) return
        const hoy = readJson<ReporteArchivo | null>(reporteFile(hoyISO()), null)
        if (hoy?.texto) return
        if (hoy && (hoy.intentos >= 3 || Date.now() - hoy.creado < 15 * 60 * 1000)) return // reintenta cada 15 min, hasta 3 veces
        void generarReporte()
      }
      const timerReporte = setInterval(revisarReporte, 60_000)
      const primero = setTimeout(revisarReporte, 20_000)
      server.httpServer?.on('close', () => {
        clearInterval(timerReporte)
        clearTimeout(primero)
      })

      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const parts = url.pathname.split('/').filter(Boolean)

          if (req.method === 'GET' && parts[0] === 'status') {
            const configured = fs
              .readdirSync(AGENTS_DIR)
              .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
              .map((f) => f.replace(/\.md$/, ''))
            const esperando = leerPendientes().filter((p) => p.estado === 'pendiente').length
            return json(res, 200, { configured, busy: [...busy], usage, pendientes: esperando })
          }
          if (parts[0] === 'encendidos' && req.method === 'GET') return json(res, 200, { encendidos: leerEncendidos() })
          if (parts[0] === 'encendidos' && req.method === 'POST') {
            try {
              const b = JSON.parse(await readBody(req))
              if (Array.isArray(b.encendidos)) writeJson(encendidosFile, b.encendidos.map(String))
            } catch {
              /* ignorar */
            }
            return json(res, 200, { ok: true })
          }
          if (parts[0] === 'reporte') {
            const cfg = leerConfig().reporte
            if (req.method === 'GET') {
              const ultimo = fs.existsSync(REPORTES)
                ? fs.readdirSync(REPORTES).filter((f) => f.endsWith('.json')).sort().pop()
                : undefined
              return json(res, 200, { config: cfg, enCurso: reporteEnCurso, ultimo: ultimo ? readJson(path.join(REPORTES, ultimo), null) : null })
            }
            if (req.method === 'POST' && parts[1] === 'ahora') {
              if (reporteEnCurso || busy.has('director')) return json(res, 409, { error: 'ocupado' })
              void generarReporte()
              return json(res, 202, { ok: true })
            }
            if (req.method === 'POST' && parts[1] === 'reenviar') {
              const arch = readJson<ReporteArchivo | null>(reporteFile(hoyISO()), null)
              if (!arch?.texto) return json(res, 404, { error: 'sin_reporte_hoy' })
              void enviarReporte(arch)
              return json(res, 202, { ok: true })
            }
          }
          if (parts[0] === 'pendientes') {
            const lista = leerPendientes()
            if (req.method === 'GET' && !parts[1]) {
              return json(res, 200, { items: lista.sort((a, b) => b.creado - a.creado) })
            }
            // POST /api/pendientes/:id/aprobar | /rechazar
            if (req.method === 'POST' && parts[1] && validId(parts[1]) && (parts[2] === 'aprobar' || parts[2] === 'rechazar')) {
              const it = lista.find((p) => p.id === parts[1])
              if (!it) return json(res, 404, { error: 'no_existe' })
              if (it.estado !== 'pendiente') return json(res, 409, { error: 'ya_decidido' })
              let cuerpo: { campos?: Record<string, unknown>; nota?: string } = {}
              try {
                cuerpo = JSON.parse((await readBody(req)) || '{}')
              } catch {
                /* sin cuerpo */
              }
              if (parts[2] === 'aprobar' && cuerpo.campos) {
                // Agustín puede corregir el texto antes de aprobar (menos lo que calcula el sistema)
                for (const k of CAMPOS[it.tipo])
                  if (cuerpo.campos[k] !== undefined && !(it.tipo === 'presupuesto' && CAMPOS_FIJOS.has(k)))
                    it.campos[k] = String(cuerpo.campos[k]).slice(0, 8000)
              }
              it.estado = parts[2] === 'aprobar' ? 'aprobado' : 'rechazado'
              it.decidido = Date.now()
              if (cuerpo.nota) it.nota = String(cuerpo.nota).slice(0, 1000)
              guardarPendientes(lista)
              // lo aprobado se ejecuta en segundo plano: por ahora, dejar el borrador listo en Gmail
              if (it.estado === 'aprobado') void ejecutarAprobado(it.id)
              return json(res, 200, { item: it })
            }
            // POST /api/pendientes/:id/editar: guarda las correcciones de Agustín sin aprobar todavía
            if (req.method === 'POST' && parts[1] && validId(parts[1]) && parts[2] === 'editar') {
              const it = lista.find((p) => p.id === parts[1])
              if (!it) return json(res, 404, { error: 'no_existe' })
              if (it.estado !== 'pendiente') return json(res, 409, { error: 'ya_decidido' })
              let cuerpo: { campos?: Record<string, unknown> } = {}
              try {
                cuerpo = JSON.parse((await readBody(req)) || '{}')
              } catch {
                /* sin cuerpo */
              }
              for (const k of CAMPOS[it.tipo])
                if (cuerpo.campos?.[k] !== undefined && !(it.tipo === 'presupuesto' && CAMPOS_FIJOS.has(k)))
                  it.campos[k] = String(cuerpo.campos[k]).slice(0, 8000)
              guardarPendientes(lista)
              return json(res, 200, { item: it })
            }
            // POST /api/pendientes/:id/reintentar: vuelve a crear el borrador si falló
            if (req.method === 'POST' && parts[1] && validId(parts[1]) && parts[2] === 'reintentar') {
              const it = lista.find((p) => p.id === parts[1])
              if (!it || it.estado !== 'aprobado' || it.ejecucion?.estado !== 'error') return json(res, 409, { error: 'no_se_puede_reintentar' })
              void ejecutarAprobado(it.id)
              return json(res, 200, { ok: true })
            }
          }
          if (parts[0] === 'chat' && parts[1] && validId(parts[1])) {
            const id = parts[1]
            if (req.method === 'GET' && !parts[2]) {
              return json(res, 200, {
                configured: !!readAgent(id),
                busy: busy.has(id),
                history: readJson<ChatMsg[]>(chatFile(id), []),
              })
            }
            if (req.method === 'POST' && !parts[2]) return await chat(id, req, res)
            if (req.method === 'POST' && parts[2] === 'reset') {
              if (busy.has(id)) return json(res, 409, { error: 'ocupado' })
              fs.rmSync(chatFile(id), { force: true })
              const s = readJson<Record<string, string>>(sessionsFile, {})
              delete s[id]
              writeJson(sessionsFile, s)
              return json(res, 200, { ok: true })
            }
          }
          next()
        } catch (err) {
          if (!res.headersSent) json(res, 500, { error: String(err) })
          else res.end()
        }
      })
    },
  }
}
