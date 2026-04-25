/**
 * Generate textured .gltf variants of the Sylora Stylized Grass Pack.
 *
 * Input:
 *   - bought-assets/sylora_bloomsacape_stylized_lowpoly_grass_pack/
 *     MESH_3D_MODELS/{High,Mid,Low}Grass_Mesh.gltf  (+ .bin, geometry only)
 *     GRADIENT_GRASS_TEXTURES/*.png                   (card textures)
 *
 * Output: 3 meshes × N textures variant .gltf files next to the pack root.
 *   Each variant points at the shared mesh .bin (single copy on disk) and the
 *   shared PNG (single HTTP fetch for the browser across variants).
 *
 * Usage: bun tools/texture-sylora-grass-pack.ts
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { join, basename, relative, dirname } from 'path'

/** Write atomically: tmp file in the same dir, then rename. Survives crashes mid-write. */
function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

const PACK_ROOT = '/home/nick/projectnova-master/client/public/assets/bought-assets/sylora_bloomsacape_stylized_lowpoly_grass_pack'
const MESH_DIR = join(PACK_ROOT, 'MESH_3D_MODELS')
const TEX_DIR = join(PACK_ROOT, 'GRADIENT_GRASS_TEXTURES')

const MESHES = [
  { label: 'high_grass', gltf: 'Stylized_HighGrass_Mesh.gltf' },
  { label: 'mid_grass',  gltf: 'Stylized_MidGrass_Mesh.gltf' },
  { label: 'low_grass',  gltf: 'Stylized_LowGrass_Mesh.gltf' },
]

function padNum(s: string): string {
  const m = s.match(/(\d+)/)
  return m ? m[1].padStart(2, '0') : s
}

// Relative path helper that gives forward-slash glTF-style URIs
function relUri(from: string, to: string): string {
  return relative(dirname(from), to).replace(/\\/g, '/')
}

const texFiles = readdirSync(TEX_DIR)
  .filter(f => f.toLowerCase().endsWith('.png'))
  .sort()

if (texFiles.length === 0) {
  console.error(`No PNG textures found in ${TEX_DIR}`)
  process.exit(1)
}

console.log(`Textures: ${texFiles.length}, Meshes: ${MESHES.length}`)
console.log(`Total variants: ${texFiles.length * MESHES.length}\n`)

const assetEntries: { id: string; name: string; path: string }[] = []

for (const mesh of MESHES) {
  const srcGltfPath = join(MESH_DIR, mesh.gltf)
  if (!existsSync(srcGltfPath)) {
    console.error(`Missing: ${srcGltfPath}`)
    continue
  }
  const base = JSON.parse(readFileSync(srcGltfPath, 'utf-8'))
  // Re-point buffer URI since we're writing variants at pack root, not inside MESH_3D_MODELS/
  const binPath = join(MESH_DIR, base.buffers[0].uri)

  for (const texFile of texFiles) {
    const texPath = join(TEX_DIR, texFile)
    const n = padNum(texFile)
    const id = `${mesh.label}_${n}`
    const outPath = join(PACK_ROOT, `${id}.gltf`)

    const variant = JSON.parse(JSON.stringify(base))

    // Override the 0.01 cm-to-m scale that Blender's FBX import bakes in; the
    // geometry is already in sensible meter units.
    if (variant.nodes?.[0]) variant.nodes[0].scale = [1, 1, 1]

    // Fix buffer URI relative to outPath (variant lives at pack root)
    variant.buffers = [{
      ...variant.buffers[0],
      uri: relUri(outPath, binPath),
    }]

    // Add texture/image/sampler
    variant.images = [{
      uri: relUri(outPath, texPath),
      name: basename(texFile, '.png'),
    }]
    variant.samplers = [{
      magFilter: 9729,   // LINEAR
      minFilter: 9987,   // LINEAR_MIPMAP_LINEAR
      wrapS: 10497,      // REPEAT
      wrapT: 10497,      // REPEAT
    }]
    variant.textures = [{ source: 0, sampler: 0 }]

    // Attach texture to material, switch to alpha MASK for grass card cutout
    const mat = variant.materials[0]
    mat.pbrMetallicRoughness = {
      ...(mat.pbrMetallicRoughness || {}),
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0, texCoord: 0 },
      metallicFactor: 0,
      roughnessFactor: 1,
    }
    mat.alphaMode = 'MASK'
    mat.alphaCutoff = 0.5
    mat.doubleSided = true

    writeFileSync(outPath, JSON.stringify(variant))
    assetEntries.push({
      id,
      name: `${mesh.label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} ${n}`,
      path: `/assets/bought-assets/sylora_bloomsacape_stylized_lowpoly_grass_pack/${id}.gltf`,
    })
  }
}

console.log(`Wrote ${assetEntries.length} variants.\n`)

// Print a block the user can paste into assets.json, AND also update it directly
const ASSETS_JSON = '/home/nick/projectnova-master/client/public/assets/assets.json'
const assetsFile = JSON.parse(readFileSync(ASSETS_JSON, 'utf-8'))
const existingIds = new Set(assetsFile.assets.map((a: any) => a.id))
let added = 0
for (const e of assetEntries) {
  if (existingIds.has(e.id)) continue
  assetsFile.assets.push(e)
  added++
}
// Keep assets.json minified (single line) to match existing format
writeFileAtomic(ASSETS_JSON, JSON.stringify(assetsFile))
console.log(`Added ${added} new entries to assets.json (now ${assetsFile.assets.length} total)`)
