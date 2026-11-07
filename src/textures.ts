import * as THREE from 'three'

/** Texturas procedurales en escala de grises: el color de cada mueble las tiñe. Sin archivos externos. */
export type TexName = 'wood' | 'fabric' | 'felt' | 'metal' | 'paint' | 'carpet' | 'clay'

const SIZE = 128
const base = new Map<TexName, HTMLCanvasElement>()
const cache = new Map<string, THREE.CanvasTexture>()

function rnd(seed: number) {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function paintNoise(img: ImageData, mean: number, amp: number, r: () => number) {
  for (let i = 0; i < img.data.length; i += 4) {
    const v = mean + (r() - 0.5) * amp
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
}

function build(name: TexName): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = SIZE
  const g = cv.getContext('2d')!
  const r = rnd(name.length * 7919 + name.charCodeAt(0))
  const img = g.createImageData(SIZE, SIZE)

  if (name === 'fabric') {
    paintNoise(img, 215, 16, r)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const k = (y * SIZE + x) * 4
        const w = (((x >> 1) + (y >> 1)) & 1) * 22 - 11
        img.data[k] += w
        img.data[k + 1] += w
        img.data[k + 2] += w
      }
    g.putImageData(img, 0, 0)
  } else if (name === 'felt') {
    paintNoise(img, 220, 34, r)
    g.putImageData(img, 0, 0)
  } else if (name === 'clay') {
    paintNoise(img, 225, 30, r)
    g.putImageData(img, 0, 0)
  } else if (name === 'carpet') {
    paintNoise(img, 205, 46, r)
    g.putImageData(img, 0, 0)
    g.fillStyle = 'rgba(0,0,0,0.07)'
    for (let i = 0; i < SIZE; i += 32) {
      g.fillRect(i, 0, 16, SIZE)
    }
  } else if (name === 'paint') {
    paintNoise(img, 242, 10, r)
    g.putImageData(img, 0, 0)
  } else if (name === 'metal') {
    paintNoise(img, 225, 6, r)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const k = (y * SIZE + x) * 4
        const w = Math.sin(x * 0.9) * 8 + (r() - 0.5) * 8
        img.data[k] += w
        img.data[k + 1] += w
        img.data[k + 2] += w
      }
    g.putImageData(img, 0, 0)
  } else {
    // wood: veta horizontal
    g.fillStyle = '#f0f0f0'
    g.fillRect(0, 0, SIZE, SIZE)
    for (let i = 0; i < 46; i++) {
      const y = r() * SIZE
      g.strokeStyle = `rgba(70,45,20,${0.1 + r() * 0.22})`
      g.lineWidth = 0.6 + r() * 1.8
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= SIZE; x += 16) g.lineTo(x, y + Math.sin(x * 0.06 + i) * (1 + r() * 2))
      g.stroke()
    }
    for (let k = 0; k < 2; k++) {
      const cx = r() * SIZE, cy = r() * SIZE
      g.strokeStyle = 'rgba(60,38,16,0.3)'
      g.lineWidth = 1
      for (let rr = 2; rr < 9; rr += 2) {
        g.beginPath()
        g.ellipse(cx, cy, rr * 2, rr * 0.8, 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
  }
  return cv
}

export function getTex(name: TexName, rep: [number, number] = [1, 1]): THREE.CanvasTexture {
  const key = `${name}:${rep[0]}:${rep[1]}`
  let t = cache.get(key)
  if (!t) {
    let cv = base.get(name)
    if (!cv) {
      cv = build(name)
      base.set(name, cv)
    }
    t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rep[0], rep[1])
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    cache.set(key, t)
  }
  return t
}
