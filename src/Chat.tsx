import { Fragment, useEffect, useRef, useState } from 'react'
import type { Agent } from './agents'
import { loadChat, resetChat, sendChat, useChat } from './chats'

/** Texto del agente: respeta los saltos de línea y las **negritas**. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
          )}
        </Fragment>
      ))}
    </>
  )
}

const MARCA_RE = /```(pendiente|consulta)/
/** Mientras llega el texto, se ocultan los bloques técnicos (pendiente / consulta), cerrados o a medio escribir. */
function visible(streaming: string) {
  const sinCerrados = streaming.replace(/```(?:pendiente|consulta)[^\r\n]*\r?\n[\s\S]*?```/g, '')
  const i = sinCerrados.search(MARCA_RE)
  return { texto: (i >= 0 ? sinCerrados.slice(0, i) : sinCerrados).trimEnd(), preparando: i >= 0 ? MARCA_RE.exec(sinCerrados)![1] : '' }
}

export function Chat({ agent, enabled, onVerBandeja }: { agent: Agent; enabled: boolean; onVerBandeja: () => void }) {
  const chat = useChat(agent.id)
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chat.loaded) void loadChat(agent.id)
  }, [agent.id, chat.loaded])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages.length, chat.streaming, chat.error])

  const canSend = enabled && chat.configured && !chat.sending && text.trim().length > 0
  const submit = () => {
    if (!canSend) return
    void sendChat(agent.id, text)
    setText('')
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span>Hablando con <b>{agent.role}</b></span>
        {chat.messages.length > 0 && (
          <button className="link" disabled={chat.sending} onClick={() => void resetChat(agent.id)}>
            nueva conversación
          </button>
        )}
      </div>

      <div className="chat-msgs">
        {!chat.configured && (
          <p className="note">Este agente todavía no tiene su personalidad cargada. Falta el archivo agents/{agent.id}.md.</p>
        )}
        {chat.configured && chat.messages.length === 0 && !chat.sending && (
          <p className="note">Escribile al {agent.role}. Mientras responde, el empleado se sienta a trabajar en su escritorio.</p>
        )}
        {chat.messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <Rich text={m.text} />
            {!!m.pendientes && (
              <button className="en-bandeja" onClick={onVerBandeja}>
                📥 {m.pendientes === 1 ? 'Dejó 1 pendiente' : `Dejó ${m.pendientes} pendientes`} en la bandeja — ver
              </button>
            )}
          </div>
        ))}
        {chat.sending && (
          <div className="msg assistant">
            {chat.streaming ? (
              <>
                <Rich text={visible(chat.streaming).texto} />
                {visible(chat.streaming).preparando === 'pendiente' && <span className="typing"> 📥 preparando el pendiente…</span>}
                {visible(chat.streaming).preparando === 'consulta' && <span className="typing"> 🧭 preparando la consulta…</span>}
              </>
            ) : (
              <span className="typing">{chat.estado || 'pensando…'}</span>
            )}
            {!!chat.streaming && !!chat.estado && <span className="typing"> {chat.estado}</span>}
          </div>
        )}
        {chat.error && <div className="msg error">{chat.error}</div>}
        <div ref={end} />
      </div>

      <div className="chat-input">
        <textarea
          value={text}
          rows={2}
          placeholder={enabled ? `Mensaje para ${agent.role}…` : `${agent.role} está apagado: encendelo para hablarle`}
          disabled={!enabled || !chat.configured}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="btn" disabled={!canSend} onClick={submit}>
          {chat.sending ? 'Respondiendo…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
