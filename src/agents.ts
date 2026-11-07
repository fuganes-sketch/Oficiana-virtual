export type Zone = 'direccion' | 'social' | 'produccion' | 'financiero' | 'legal'
export type Mode = 'working' | 'idle' | 'off'

export type Accessory =
  | { kind: 'jacket'; color: string }
  | { kind: 'tie'; color: string }
  | { kind: 'glasses' }
  | { kind: 'headset' }
  | { kind: 'headphones'; color: string }
  | { kind: 'cap'; color: string }
  | { kind: 'beret'; color: string }
  | { kind: 'visor'; color: string }
  | { kind: 'hardhat' }
  | { kind: 'hoodie'; color: string }

export type HairStyle = 'short' | 'side' | 'long' | 'bun' | 'curly' | 'spiky' | 'bald'

export interface Look {
  skin: string
  hair: string
  hairStyle: HairStyle
  top: string
  pants: string
  acc: Accessory[]
}

export interface Agent {
  id: string
  role: string
  zone: Zone
  level: 'director' | 'admin' | 'staff'
  reportsTo: string | null
  desk: [number, number]
  look: Look
  summary: string
}

export const ZONES: Record<Zone, { label: string; color: string }> = {
  direccion: { label: 'DIRECCIÓN', color: '#c9a45c' },
  social: { label: 'SOCIAL', color: '#e0749a' },
  produccion: { label: 'PRODUCCIÓN', color: '#4fb0c6' },
  financiero: { label: 'FINANCIERO', color: '#6cc07a' },
  legal: { label: 'LEGAL', color: '#9c86d8' },
}

const SKIN = ['#f2c9a0', '#e0a97c', '#c68863', '#8d5a3b', '#f7d7b5']

export const AGENTS: Agent[] = [
  {
    id: 'director', role: 'Director', zone: 'direccion', level: 'director', reportsTo: null,
    desk: [-12, -9],
    look: { skin: SKIN[0], hair: '#2a2420', hairStyle: 'side', top: '#262b3a', pants: '#1c1f2b',
      acc: [{ kind: 'jacket', color: '#262b3a' }, { kind: 'tie', color: '#b3261e' }] },
    summary: 'Se encarga de que todo funcione y administra las prioridades. Filtra los reportes y te entrega solo los más importantes.',
  },
  // --- Social ---
  {
    id: 'admin-social', role: 'Admin. Social', zone: 'social', level: 'admin', reportsTo: 'director',
    desk: [-7, -9],
    look: { skin: SKIN[1], hair: '#5b2f1a', hairStyle: 'long', top: '#c7457a', pants: '#2b2b36',
      acc: [{ kind: 'jacket', color: '#c7457a' }, { kind: 'glasses' }] },
    summary: 'Coordina a RRPP, Redes sociales y Marketing.',
  },
  {
    id: 'rrpp', role: 'RRPP', zone: 'social', level: 'staff', reportsTo: 'admin-social',
    desk: [-5, -9],
    look: { skin: SKIN[2], hair: '#1b1b1b', hairStyle: 'curly', top: '#e8a33d', pants: '#3a3f52',
      acc: [{ kind: 'headset' }] },
    summary: 'Escribe los diálogos con los clientes y piensa cómo captarlos y ofrecer los servicios de forma llamativa.',
  },
  {
    id: 'redes', role: 'Redes sociales', zone: 'social', level: 'staff', reportsTo: 'admin-social',
    desk: [-3, -9],
    look: { skin: SKIN[4], hair: '#d9a441', hairStyle: 'spiky', top: '#7a4cd6', pants: '#23232e',
      acc: [{ kind: 'headphones', color: '#ff5fa2' }] },
    summary: 'Cada mañana reporta las tendencias de Instagram, TikTok, Facebook y YouTube, y publica el contenido que prepara Marketing.',
  },
  {
    id: 'marketing', role: 'Marketing', zone: 'social', level: 'staff', reportsTo: 'admin-social',
    desk: [-1, -9],
    look: { skin: SKIN[3], hair: '#161616', hairStyle: 'short', top: '#ef6a3c', pants: '#33384a',
      acc: [{ kind: 'cap', color: '#1f1f1f' }] },
    summary: 'Planifica las campañas de Instagram y Facebook y el contenido para redes. Se lo pasa a Redes sociales para que lo publique.',
  },
  // --- Producción ---
  {
    id: 'admin-produccion', role: 'Admin. Producción', zone: 'produccion', level: 'admin', reportsTo: 'director',
    desk: [2.5, -9],
    look: { skin: SKIN[0], hair: '#3b2a1c', hairStyle: 'short', top: '#2f7f95', pants: '#262b3a',
      acc: [{ kind: 'jacket', color: '#2f7f95' }, { kind: 'tie', color: '#e8e8e8' }] },
    summary: 'Coordina al Diseñador gráfico, Soporte técnico experto y Team leader.',
  },
  {
    id: 'disenador', role: 'Diseñador gráfico', zone: 'produccion', level: 'staff', reportsTo: 'admin-produccion',
    desk: [4.5, -9],
    look: { skin: SKIN[1], hair: '#2a1a40', hairStyle: 'bun', top: '#f1f1ec', pants: '#2b2b36',
      acc: [{ kind: 'beret', color: '#d33a5a' }] },
    summary: 'Diseña flyers, publicaciones y cualquier pieza de la marca.',
  },
  {
    id: 'soporte', role: 'Soporte técnico', zone: 'produccion', level: 'staff', reportsTo: 'admin-produccion',
    desk: [6.5, -9],
    look: { skin: SKIN[2], hair: '#1f1a17', hairStyle: 'short', top: '#3a3f4b', pants: '#232834',
      acc: [{ kind: 'hoodie', color: '#3a3f4b' }, { kind: 'headset' }] },
    summary: 'Te asesora en diagnósticos y dudas técnicas.',
  },
  {
    id: 'team-leader', role: 'Team leader', zone: 'produccion', level: 'staff', reportsTo: 'admin-produccion',
    desk: [8.5, -9],
    look: { skin: SKIN[4], hair: '#7a5a2e', hairStyle: 'side', top: '#3c8f5a', pants: '#2c3040',
      acc: [{ kind: 'tie', color: '#f2c14e' }] },
    summary: 'Lleva los proyectos adelante y los ordena por prioridad y relevancia para la marca.',
  },
  // --- Legal ---
  {
    id: 'legal', role: 'Legal e impuestos', zone: 'legal', level: 'staff', reportsTo: 'director',
    desk: [12.5, -9],
    look: { skin: SKIN[3], hair: '#d8d8d8', hairStyle: 'short', top: '#4a2f66', pants: '#1f1f2a',
      acc: [{ kind: 'jacket', color: '#4a2f66' }, { kind: 'glasses' }, { kind: 'tie', color: '#cfcfcf' }] },
    summary: 'Facturación, monotributo, términos del servicio, garantías y devoluciones. Trabaja por su cuenta y le responde al Director.',
  },
  // --- Financiero ---
  {
    id: 'admin-financiero', role: 'Admin. Financiero', zone: 'financiero', level: 'admin', reportsTo: 'director',
    desk: [-13, -1],
    look: { skin: SKIN[0], hair: '#222', hairStyle: 'bald', top: '#2f6b46', pants: '#222a2a',
      acc: [{ kind: 'jacket', color: '#2f6b46' }, { kind: 'tie', color: '#e8e8e8' }] },
    summary: 'Coordina Ventas, Tesorero, Analista de métricas, Inversionista y Operaciones e inventario.',
  },
  {
    id: 'ventas', role: 'Ventas y atención', zone: 'financiero', level: 'staff', reportsTo: 'admin-financiero',
    desk: [-10, -1],
    look: { skin: SKIN[1], hair: '#6b3a1e', hairStyle: 'long', top: '#e56b5d', pants: '#2c3040',
      acc: [{ kind: 'headset' }] },
    summary: 'Arma presupuestos con el listado Freelance/Taller según la zona, y hace seguimiento de consultas, reclamos y garantías.',
  },
  {
    id: 'tesorero', role: 'Tesorero', zone: 'financiero', level: 'staff', reportsTo: 'admin-financiero',
    desk: [-7, -1],
    look: { skin: SKIN[4], hair: '#4a3b2a', hairStyle: 'side', top: '#f1efe4', pants: '#2b3a2b',
      acc: [{ kind: 'visor', color: '#4fc27a' }, { kind: 'tie', color: '#2f6b46' }] },
    summary: 'Lleva las cuentas: cada ingreso y gasto, con reportes de ganancias y pérdidas.',
  },
  {
    id: 'analista', role: 'Analista de métricas', zone: 'financiero', level: 'staff', reportsTo: 'admin-financiero',
    desk: [-13, 2.5],
    look: { skin: SKIN[2], hair: '#151515', hairStyle: 'curly', top: '#4c78d6', pants: '#272c3c',
      acc: [{ kind: 'glasses' }] },
    summary: 'Mide si las campañas, los precios y las ventas funcionan.',
  },
  {
    id: 'inversionista', role: 'Inversionista', zone: 'financiero', level: 'staff', reportsTo: 'admin-financiero',
    desk: [-10, 2.5],
    look: { skin: SKIN[0], hair: '#b8b8b8', hairStyle: 'short', top: '#1d2a3a', pants: '#181d28',
      acc: [{ kind: 'jacket', color: '#1d2a3a' }, { kind: 'tie', color: '#d4a82f' }] },
    summary: 'Busca los mejores precios y proveedores de periféricos, cargadores y productos de informática.',
  },
  {
    id: 'operaciones', role: 'Operaciones e inventario', zone: 'financiero', level: 'staff', reportsTo: 'admin-financiero',
    desk: [-7, 2.5],
    look: { skin: SKIN[3], hair: '#222', hairStyle: 'short', top: '#e08a1e', pants: '#3a3a3a',
      acc: [{ kind: 'hardhat' }] },
    summary: 'Stock, pedidos a proveedores, envíos y tiempos de entrega.',
  },
]

export const agentById = (id: string) => AGENTS.find((a) => a.id === id)!
