import { getTex, type TexName } from './textures'

type V3 = [number, number, number]

/** Caja de color plana (con textura opcional): la pieza básica de todo el estilo "cuadrado". */
export function B({ p = [0, 0, 0], s, c, opacity, emissive, rot, tex, rep }: {
  p?: V3
  s: V3
  c: string
  opacity?: number
  emissive?: string
  rot?: V3
  tex?: TexName
  rep?: [number, number]
}) {
  const map = tex ? getTex(tex, rep) : null
  return (
    <mesh position={p} rotation={rot} castShadow={opacity === undefined} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={c}
        map={map}
        roughness={0.85}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 1 : 0}
      />
    </mesh>
  )
}
