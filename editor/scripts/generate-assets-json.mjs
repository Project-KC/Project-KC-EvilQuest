import fs from 'fs'
import path from 'path'

const projectRoot = process.cwd()
const assetsRoot = path.join(projectRoot, 'public', 'assets')

// Skip dirs that hold source material or runtime-only assets — we don't want
// them in the editor's asset picker.
const EXCLUDE_DIR_NAMES = new Set([
  'Bought packs',   // pre-split pack GLBs (use the split outputs in bought-assets/ instead)
])

function walk(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDE_DIR_NAMES.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walk(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

function toWebPath(fullPath) {
  const rel = path.relative(path.join(projectRoot, 'public'), fullPath)
  return '/' + rel.replace(/\\/g, '/')
}

function toName(fileName) {
  return fileName
    .replace(/\.(glb|gltf)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

const files = walk(assetsRoot)
  .filter((file) => {
    const lower = file.toLowerCase()
    return lower.endsWith('.glb') || lower.endsWith('.gltf')
  })
  .sort((a, b) => a.localeCompare(b))

const assets = files.map((file) => {
  const webPath = toWebPath(file)
  const ext = path.extname(file)
  const base = path.basename(file, ext)
  return {
    id: base,
    name: toName(path.basename(file)),
    path: webPath
  }
})

const output = { assets }

fs.writeFileSync(
  path.join(assetsRoot, 'assets.json'),
  JSON.stringify(output),
  'utf8'
)

console.log(`Wrote ${assets.length} assets to public/assets/assets.json`)