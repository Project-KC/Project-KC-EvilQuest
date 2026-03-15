import * as THREE from 'three'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function sampleNoise(x, z, scaleA = 1, scaleB = 1) {
  return (
    Math.sin(x * scaleA + z * scaleB) +
    Math.cos(x * (scaleB * 0.73) - z * (scaleA * 0.81))
  ) * 0.5
}

function groundColor(type, shade) {
  if (type === 'dirt') {
    return new THREE.Color(0.45 * shade, 0.31 * shade, 0.14 * shade)
  }

  if (type === 'sand') {
    return new THREE.Color(0.72 * shade, 0.60 * shade, 0.24 * shade)
  }

  if (type === 'path') {
    return new THREE.Color(0.42 * shade, 0.30 * shade, 0.13 * shade)
  }

  if (type === 'road') {
    return new THREE.Color(0.47 * shade, 0.46 * shade, 0.43 * shade)
  }

  if (type === 'water') {
    return new THREE.Color(0.40 * shade, 0.47 * shade, 0.66 * shade)
  }

  return new THREE.Color(0.13 * shade, 0.43 * shade, 0.07 * shade)
}

function pushVertex(vertices, colors, uvs, x, y, z, color, u, v) {
  vertices.push(x, y, z)
  colors.push(color.r, color.g, color.b)
  uvs.push(u, v)
}

function getSlopeShade(h) {
  const dx = ((h.tr + h.br) - (h.tl + h.bl)) * 0.5
  const dz = ((h.bl + h.br) - (h.tl + h.tr)) * 0.5
  const steepness = Math.abs(dx) + Math.abs(dz)

  let shade = 1.0 - steepness * 0.22
  const directional = (-dx * 0.18) + (-dz * 0.12)
  shade += directional

  return clamp(shade, 0.46, 1.04)
}

function getTileAverageHeight(h) {
  return (h.tl + h.tr + h.bl + h.br) / 4
}

function countAdjacentGround(map, x, z, groundType) {
  let count = 0
  const neighbors = [
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1]
  ]

  for (const [nx, nz] of neighbors) {
    if (map.getBaseGroundType(nx, nz) === groundType) count++
  }

  return count
}

function shouldRenderWater(map, x, z) {
  if (typeof map.shouldRenderWaterTile === 'function') {
    return map.shouldRenderWaterTile(x, z)
  }
  return map.isWaterTile(x, z)
}

function isWaterNearby(map, x, z) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (shouldRenderWater(map, x + dx, z + dz)) return true
    }
  }
  return false
}

function getWaterDistanceToLevel(map, x, z) {
  return map.getAverageTileHeight(x, z) - map.waterLevel
}


function isCliffNearby(map, x, z) {
  const h = map.getTileCornerHeights(x, z)
  const minH = Math.min(h.tl, h.tr, h.bl, h.br)
  const maxH = Math.max(h.tl, h.tr, h.bl, h.br)

  if ((maxH - minH) > 1.1) return true

  const centerAvg = getTileAverageHeight(h)
  const neighbors = [
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1]
  ]

  for (const [nx, nz] of neighbors) {
    const n = map.getTile(nx, nz)
    if (!n) continue

    const nh = map.getTileCornerHeights(nx, nz)
    const nAvg = getTileAverageHeight(nh)

    if (Math.abs(centerAvg - nAvg) > 0.9) return true
  }

  return false
}

function getNoiseExtra(type, vx, vz) {
  if (type === 'grass') {
    const bigPatch = sampleNoise(vx * 0.18, vz * 0.18, 1.0, 1.2) * 0.10
    const midPatch = sampleNoise(vx * 0.42, vz * 0.42, 0.8, 1.0) * 0.038
    const tinyDither = sampleNoise(vx * 2.4, vz * 2.4, 1.5, 1.9) * 0.014
    return bigPatch + midPatch + tinyDither
  } else if (type === 'path') {
    return sampleNoise(vx * 0.45, vz * 0.45, 1.2, 0.8) * 0.02
  } else if (type === 'road') {
    const smallVar = sampleNoise(vx * 1.2, vz * 1.2, 1.5, 0.9) * 0.025
    const tiny = sampleNoise(vx * 3.0, vz * 3.0, 2.0, 1.5) * 0.01
    return smallVar + tiny
  } else if (type === 'dirt' || type === 'sand') {
    return sampleNoise(vx * 0.5, vz * 0.5, 0.8, 1.1) * 0.02
  }
  return 0
}

// Average the slope shades of all tiles sharing this vertex for smooth lighting transitions
function getVertexSlopeShade(map, vx, vz) {
  const sharingTiles = [
    [vx - 1, vz - 1],
    [vx,     vz - 1],
    [vx - 1, vz    ],
    [vx,     vz    ]
  ]

  let total = 0
  let count = 0
  for (const [tx, tz] of sharingTiles) {
    if (!map.getTile(tx, tz)) continue
    total += getSlopeShade(map.getTileCornerHeights(tx, tz))
    count++
  }

  return count > 0 ? total / count : 1.0
}

// Darken vertices that sit lower than their neighbours (valley ambient occlusion)
function getVertexAO(map, vx, vz) {
  const h = map.getVertexHeight(vx, vz)
  let sum = 0, count = 0
  for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = vx + dx, nz = vz + dz
    if (nx < 0 || nx > map.width || nz < 0 || nz > map.height) continue
    sum += map.getVertexHeight(nx, nz)
    count++
  }
  if (count === 0) return 1.0
  const depression = (sum / count) - h  // positive = vertex is lower than neighbours
  return 1.0 - clamp(depression * 0.16, 0, 0.40)
}

function getCornerBlendedColor(map, cornerX, cornerZ, shade) {
  // Average the ground colors of all tiles sharing this corner.
  // Noise is also blended here using the same weights so that both tiles
  // sharing a vertex always produce the same output color — no seams.
  const sharingTiles = [
    [cornerX - 1, cornerZ - 1],
    [cornerX,     cornerZ - 1],
    [cornerX - 1, cornerZ    ],
    [cornerX,     cornerZ    ]
  ]

  let r = 0, g = 0, b = 0, noise = 0, totalWeight = 0
  for (const [nx, nz] of sharingTiles) {
    if (!map.getTile(nx, nz)) continue
    const type = map.getBaseGroundType(nx, nz)
    if (type === 'road') continue  // road doesn't bleed into neighbours
    const w = type === 'path' ? 0.6 : 1.0
    const c = groundColor(type, 1.0)
    r += c.r * w; g += c.g * w; b += c.b * w
    noise += getNoiseExtra(type, cornerX, cornerZ) * w
    totalWeight += w
  }

  if (totalWeight === 0) return groundColor('grass', shade)
  const s = shade + noise / totalWeight
  return new THREE.Color((r / totalWeight) * s, (g / totalWeight) * s, (b / totalWeight) * s)
}

function avgColor(a, b, c) {
  return new THREE.Color((a.r + b.r + c.r) / 3, (a.g + b.g + c.g) / 3, (a.b + b.b + c.b) / 3)
}

function addTileGeometry(vertices, colors, uvs, indices, base, tileType, h, x, z, map, shadowInf) {
  const shadeTL = getVertexSlopeShade(map, x,     z    )
  const shadeTR = getVertexSlopeShade(map, x + 1, z    )
  const shadeBL = getVertexSlopeShade(map, x,     z + 1)
  const shadeBR = getVertexSlopeShade(map, x + 1, z + 1)
  const slopeShade = (shadeTL + shadeTR + shadeBL + shadeBR) / 4

  const tile = map.getTile(x, z)
  const groundBType = tile?.groundB || null
  const splitDir = tile?.split || 'forward'

  let cTL, cTR, cBL, cBR
  if (tileType === 'road') {
    const noise = getNoiseExtra('road', x + 0.5, z + 0.5)
    cTL = groundColor('road', Math.max(shadeTL + noise, 0.5))
    cTR = groundColor('road', Math.max(shadeTR + noise, 0.5))
    cBL = groundColor('road', Math.max(shadeBL + noise, 0.5))
    cBR = groundColor('road', Math.max(shadeBR + noise, 0.5))
  } else {
    cTL = getCornerBlendedColor(map, x,     z,     shadeTL)
    cTR = getCornerBlendedColor(map, x + 1, z,     shadeTR)
    cBL = getCornerBlendedColor(map, x,     z + 1, shadeBL)
    cBR = getCornerBlendedColor(map, x + 1, z + 1, shadeBR)
  }

  const nearWater = isWaterNearby(map, x, z)
  const nearCliff = isCliffNearby(map, x, z)
  const waterDistance = getWaterDistanceToLevel(map, x, z)

  if (tileType !== 'water' && nearWater) {
    for (const c of [cTL, cTR, cBL, cBR]) {
      c.r *= 1.05
      c.g *= 0.95
      c.b *= 0.86
    }
  }

  if (tileType !== 'water' && waterDistance > 0 && waterDistance < 1.15) {
    const t = 1 - clamp(waterDistance / 1.15, 0, 1)
    for (const c of [cTL, cTR, cBL, cBR]) {
      c.r *= 1 + t * 0.06
      c.g *= 1 - t * 0.08
      c.b *= 1 - t * 0.14
    }
  }

  if (tileType !== 'water' && nearCliff) {
    for (const c of [cTL, cTR, cBL, cBR]) {
      c.r *= 1.04
      c.g *= 0.92
      c.b *= 0.84
    }
  }

  if (tileType === 'grass') {
    const adjacentPaths = countAdjacentGround(map, x, z, 'path')
    if (adjacentPaths > 0) {
      const pathInfluence = 1 + adjacentPaths * 0.02
      for (const c of [cTL, cTR, cBL, cBR]) {
        c.r *= 1.03 * pathInfluence
        c.g *= 0.94
        c.b *= 0.84
      }
    }
  }

  // Valley ambient occlusion — darken vertices lower than their surroundings
  if (tileType !== 'water') {
    cTL.multiplyScalar(getVertexAO(map, x,     z    ))
    cTR.multiplyScalar(getVertexAO(map, x + 1, z    ))
    cBL.multiplyScalar(getVertexAO(map, x,     z + 1))
    cBR.multiplyScalar(getVertexAO(map, x + 1, z + 1))
  }

  // Object proximity shadow — darken terrain near placed assets (RS2 style)
  const shadowableType = tileType === 'grass' || tileType === 'dirt' || tileType === 'path'
  if (shadowableType && shadowInf) {
    cTL.multiplyScalar(shadowInf[z    ][x    ])
    cTR.multiplyScalar(shadowInf[z    ][x + 1])
    cBL.multiplyScalar(shadowInf[z + 1][x    ])
    cBR.multiplyScalar(shadowInf[z + 1][x + 1])
  }

  if (groundBType && groundBType !== tileType) {
    // Split tile: flat solid color per triangle, no corner blending
    const noiseA = getNoiseExtra(tileType, x + 0.25, z + 0.25)
    const noiseB = getNoiseExtra(groundBType, x + 0.75, z + 0.75)
    const cA = groundColor(tileType, Math.max(slopeShade + noiseA, 0.5))
    const cB = groundColor(groundBType, Math.max(slopeShade + noiseB, 0.5))
    const avgAO = (getVertexAO(map, x, z) + getVertexAO(map, x+1, z) + getVertexAO(map, x, z+1) + getVertexAO(map, x+1, z+1)) / 4
    const shadowableA = tileType === 'grass' || tileType === 'dirt' || tileType === 'path'
    const shadowableB = groundBType === 'grass' || groundBType === 'dirt' || groundBType === 'path'
    const avgShadow = shadowInf
      ? (shadowInf[z][x] + shadowInf[z][x+1] + shadowInf[z+1][x] + shadowInf[z+1][x+1]) / 4
      : 1.0
    cA.multiplyScalar(avgAO * (shadowableA && shadowInf ? avgShadow : 1.0))
    cB.multiplyScalar(avgAO * (shadowableB && shadowInf ? avgShadow : 1.0))

    if (splitDir === 'forward') {
      // Triangle A (tileType): TL, BL, TR
      pushVertex(vertices, colors, uvs, x,     h.tl, z,     cA, 0, 0)
      pushVertex(vertices, colors, uvs, x,     h.bl, z + 1, cA, 0, 1)
      pushVertex(vertices, colors, uvs, x + 1, h.tr, z,     cA, 1, 0)
      // Triangle B (groundBType): BL, BR, TR
      pushVertex(vertices, colors, uvs, x,     h.bl, z + 1, cB, 0, 1)
      pushVertex(vertices, colors, uvs, x + 1, h.br, z + 1, cB, 1, 1)
      pushVertex(vertices, colors, uvs, x + 1, h.tr, z,     cB, 1, 0)
    } else {
      // Triangle A (tileType): TL, BL, BR
      pushVertex(vertices, colors, uvs, x,     h.tl, z,     cA, 0, 0)
      pushVertex(vertices, colors, uvs, x,     h.bl, z + 1, cA, 0, 1)
      pushVertex(vertices, colors, uvs, x + 1, h.br, z + 1, cA, 1, 1)
      // Triangle B (groundBType): TL, BR, TR
      pushVertex(vertices, colors, uvs, x,     h.tl, z,     cB, 0, 0)
      pushVertex(vertices, colors, uvs, x + 1, h.br, z + 1, cB, 1, 1)
      pushVertex(vertices, colors, uvs, x + 1, h.tr, z,     cB, 1, 0)
    }

    indices.push(base + 0, base + 1, base + 2, base + 3, base + 4, base + 5)
    return 6
  }

  pushVertex(vertices, colors, uvs, x,     h.tl, z,     cTL, 0, 0)
  pushVertex(vertices, colors, uvs, x + 1, h.tr, z,     cTR, 1, 0)
  pushVertex(vertices, colors, uvs, x,     h.bl, z + 1, cBL, 0, 1)
  pushVertex(vertices, colors, uvs, x + 1, h.br, z + 1, cBR, 1, 1)

  if (splitDir === 'forward') {
    indices.push(base + 0, base + 2, base + 1, base + 2, base + 3, base + 1)
  } else {
    indices.push(base + 0, base + 2, base + 3, base + 0, base + 3, base + 1)
  }
  return 4
}

export function buildTerrainMeshes(map, waterTexture, shadowInf = null) {
  const landVertices = []
  const landColors = []
  const landUVs = []
  const landIndices = []

  const waterVertices = []
  const waterColors = []
  const waterUVs = []
  const waterIndices = []

  let landBase = 0
  let waterBase = 0

  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const h = map.getTileCornerHeights(x, z)
      const landType = map.getBaseGroundType(x, z)
      const waterY = map.waterLevel + 0.02

      landBase += addTileGeometry(
        landVertices,
        landColors,
        landUVs,
        landIndices,
        landBase,
        landType,
        h,
        x,
        z,
        map,
        shadowInf
      )

      if (shouldRenderWater(map, x, z)) {
        addTileGeometry(
          waterVertices,
          waterColors,
          waterUVs,
          waterIndices,
          waterBase,
          'water',
          {
            tl: waterY,
            tr: waterY,
            bl: waterY,
            br: waterY
          },
          x,
          z,
          map
        )
        waterBase += 4
      }
    }
  }

  const group = new THREE.Group()
  group.name = 'terrain-group'

  if (landVertices.length > 0) {
    const landGeometry = new THREE.BufferGeometry()
    landGeometry.setAttribute('position', new THREE.Float32BufferAttribute(landVertices, 3))
    landGeometry.setAttribute('color', new THREE.Float32BufferAttribute(landColors, 3))
    landGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(landUVs, 2))
    landGeometry.setIndex(landIndices)
    landGeometry.computeVertexNormals()

    const landMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    })

    const landMesh = new THREE.Mesh(landGeometry, landMaterial)
    landMesh.name = 'terrain-land'
    landMesh.receiveShadow = true
    group.add(landMesh)
  }

  if (waterVertices.length > 0) {
    const waterGeometry = new THREE.BufferGeometry()
    waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3))
    waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3))
    waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUVs, 2))
    waterGeometry.setIndex(waterIndices)
    waterGeometry.computeVertexNormals()

    if (waterTexture) {
      waterTexture.wrapS = THREE.RepeatWrapping
      waterTexture.wrapT = THREE.RepeatWrapping
      waterTexture.repeat.set(1, 1)
      waterTexture.colorSpace = THREE.SRGBColorSpace
    }

    const waterMaterial = new THREE.MeshLambertMaterial({
      map: waterTexture || null,
      color: waterTexture ? 0xc9d9ff : 0x6b84b4,
      flatShading: true,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })

    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial)
    waterMesh.name = 'terrain-water'
    waterMesh.receiveShadow = true
    waterMesh.renderOrder = 2
    group.add(waterMesh)
  }

  return group
}

export function buildCliffMeshes(map) {
  const vertices = []
  const indices = []
  const colors = []
  let base = 0

  function cliffColor(topY, bottomY) {
    const drop = Math.max(0, topY - bottomY)
    const shade = clamp(0.92 - drop * 0.12, 0.42, 0.92)
    return new THREE.Color(0.37 * shade, 0.29 * shade, 0.12 * shade)
  }

  function pushColoredQuad(a, b, c, d, color) {
    vertices.push(...a, ...b, ...c, ...d)
    for (let i = 0; i < 4; i++) {
      colors.push(color.r, color.g, color.b)
    }
    indices.push(
      base + 0, base + 2, base + 1,
      base + 2, base + 3, base + 1
    )
    base += 4
  }

  function addVerticalFace(x1, z1, top1, top2, bottom1, bottom2, isXAxisFace) {
    const eps = 0.01
    const color = cliffColor((top1 + top2) * 0.5, (bottom1 + bottom2) * 0.5)

    if (isXAxisFace) {
      pushColoredQuad(
        [x1, top1, z1],
        [x1, top2, z1 + 1],
        [x1, bottom1 + eps, z1],
        [x1, bottom2 + eps, z1 + 1],
        color
      )
    } else {
      pushColoredQuad(
        [x1, top1, z1],
        [x1 + 1, top2, z1],
        [x1, bottom1 + eps, z1],
        [x1 + 1, bottom2 + eps, z1],
        color
      )
    }
  }

  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const h = map.getTileCornerHeights(x, z)

      const rightTile = map.getTile(x + 1, z)
      if (rightTile) {
        const rh = map.getTileCornerHeights(x + 1, z)

        const aTop1 = h.tr
        const aTop2 = h.br
        const bTop1 = rh.tl
        const bTop2 = rh.bl

        const avgA = (aTop1 + aTop2) * 0.5
        const avgB = (bTop1 + bTop2) * 0.5

        if (Math.abs(avgA - avgB) > 0.01) {
          if (avgA > avgB) {
            addVerticalFace(x + 1, z, aTop1, aTop2, bTop1, bTop2, true)
          } else {
            addVerticalFace(x + 1, z, bTop1, bTop2, aTop1, aTop2, true)
          }
        }
      }

      const downTile = map.getTile(x, z + 1)
      if (downTile) {
        const dh = map.getTileCornerHeights(x, z + 1)

        const aTop1 = h.bl
        const aTop2 = h.br
        const bTop1 = dh.tl
        const bTop2 = dh.tr

        const avgA = (aTop1 + aTop2) * 0.5
        const avgB = (bTop1 + bTop2) * 0.5

        if (Math.abs(avgA - avgB) > 0.01) {
          if (avgA > avgB) {
            addVerticalFace(x, z + 1, aTop1, aTop2, bTop1, bTop2, false)
          } else {
            addVerticalFace(x, z + 1, bTop1, bTop2, aTop1, aTop2, false)
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'cliffs'
  return mesh
}

function rotateUV(u, v, rotation) {
  const cx = 0.5
  const cy = 0.5
  const x = u - cx
  const y = v - cy

  const r = rotation % 4
  if (r === 1) return [-y + cx, x + cy]
  if (r === 2) return [-x + cx, -y + cy]
  if (r === 3) return [y + cx, -x + cy]
  return [u, v]
}

function scaledRotatedUVs(rotation, scale) {
  const s = Math.max(0.1, scale)
  const base = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ]

  return base.map(([u, v]) => {
    const su = (u - 0.5) / s + 0.5
    const sv = (v - 0.5) / s + 0.5
    return rotateUV(su, sv, rotation)
  })
}

export function buildTextureOverlays(map, textureRegistry, textureCache) {
  const group = new THREE.Group()
  group.name = 'texture-overlays'

  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.getTile(x, z)
      if (!tile || !tile.textureId) continue

      const textureInfo = textureRegistry.find((t) => t.id === tile.textureId)
      if (!textureInfo) continue

      const texture = textureCache.get(textureInfo.id)
      if (!texture) continue

      const h = map.getTileCornerHeights(x, z)
      const uv = scaledRotatedUVs(tile.textureRotation, tile.textureScale)

      const overlayOffset = 0.008

      const vertices = [
        x,     h.tl + overlayOffset, z,
        x + 1, h.tr + overlayOffset, z,
        x,     h.bl + overlayOffset, z + 1,
        x + 1, h.br + overlayOffset, z + 1
      ]

      const uvs = [
        uv[0][0], uv[0][1],
        uv[1][0], uv[1][1],
        uv[2][0], uv[2][1],
        uv[3][0], uv[3][1]
      ]

      const indices = tile.split === 'forward'
        ? [0, 2, 1, 2, 3, 1]
        : [0, 2, 3, 0, 3, 1]

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()

      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.colorSpace = THREE.SRGBColorSpace

      const material = new THREE.MeshLambertMaterial({
        map: texture,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })

      const mesh = new THREE.Mesh(geometry, material)
      group.add(mesh)
    }
  }

  return group
}

export function buildTexturePlanes(map, textureRegistry, textureCache) {
  const group = new THREE.Group()
  group.name = 'texture-planes'

  for (const plane of map.texturePlanes) {
    const textureInfo = textureRegistry.find((t) => t.id === plane.textureId)
    if (!textureInfo) continue

    const texture = textureCache.get(textureInfo.id)
    if (!texture) continue

    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true

    const width = Math.max(0.01, plane.width || 1)
    const height = Math.max(0.01, plane.height || 1)

    const geometry = new THREE.PlaneGeometry(width, height)
    const isSelected = map.selectedTexturePlaneId === plane.id

    const material = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      color: isSelected ? 0xeaf4ff : 0xffffff
    })

    const mesh = new THREE.Mesh(geometry, material)

    const px = plane.position?.x ?? 0
    const py = plane.position?.y ?? 0
    const pz = plane.position?.z ?? 0

    const rx = plane.rotation?.x ?? 0
    const ry = plane.rotation?.y ?? 0
    const rz = plane.rotation?.z ?? 0

    const sx = plane.scale?.x ?? 1
    const sy = plane.scale?.y ?? 1
    const sz = plane.scale?.z ?? 1

    mesh.position.set(px, py, pz)
    mesh.rotation.set(rx, ry, rz)
    mesh.scale.set(sx, sy, sz)
    mesh.renderOrder = 10
    mesh.userData.texturePlane = plane

    group.add(mesh)
  }

  return group
}