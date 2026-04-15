/**
 * Extract a single animation from a GLB file into a minimal standalone GLB.
 * Strips unused buffer data so the output is small.
 *
 * Usage: bun tools/extract-animation.ts <input.glb> <animName> <output.glb>
 */

import { readFileSync, writeFileSync } from 'fs';

const [inputPath, animName, outputPath] = process.argv.slice(2);
if (!inputPath || !animName || !outputPath) {
  console.log('Usage: bun tools/extract-animation.ts <input.glb> <animName> <output.glb>');
  process.exit(1);
}

// Parse GLB
const buf = readFileSync(inputPath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const magic = dv.getUint32(0, true);
if (magic !== 0x46546C67) throw new Error('Not a GLB file');

const jsonLen = dv.getUint32(12, true);
const jsonPad = (4 - jsonLen % 4) % 4;
const jsonStr = new TextDecoder().decode(buf.slice(20, 20 + jsonLen));
const gltf = JSON.parse(jsonStr);

// Binary chunk
const binChunkOffset = 20 + jsonLen + jsonPad;
const binLen = dv.getUint32(binChunkOffset, true);
const binData = buf.slice(binChunkOffset + 8, binChunkOffset + 8 + binLen);

// Find the target animation
const animIdx = gltf.animations?.findIndex((a: any) => a.name === animName);
if (animIdx === -1 || animIdx === undefined) {
  console.log(`Animation '${animName}' not found. Available:`);
  for (const a of gltf.animations ?? []) console.log(`  ${a.name}`);
  process.exit(1);
}
console.log(`Found '${animName}' at index ${animIdx}`);

const targetAnim = gltf.animations[animIdx];

// Collect all accessor indices used by this animation + skins (for the armature)
const usedAccessors = new Set<number>();
for (const sampler of targetAnim.samplers ?? []) {
  usedAccessors.add(sampler.input);
  usedAccessors.add(sampler.output);
}
for (const skin of gltf.skins ?? []) {
  if (skin.inverseBindMatrices != null) usedAccessors.add(skin.inverseBindMatrices);
}

// Collect used bufferViews
const usedBufferViews = new Set<number>();
for (const accIdx of usedAccessors) {
  const acc = gltf.accessors[accIdx];
  if (acc.bufferView != null) usedBufferViews.add(acc.bufferView);
}

// Build new binary buffer with only the used bufferViews
const sortedBVs = [...usedBufferViews].sort((a, b) => a - b);
const bvMapping = new Map<number, number>(); // old index → new index
const newBufferViews: any[] = [];
const chunks: Buffer[] = [];
let newOffset = 0;

for (const oldIdx of sortedBVs) {
  const bv = gltf.bufferViews[oldIdx];
  const start = bv.byteOffset ?? 0;
  const len = bv.byteLength;
  const chunk = binData.slice(start, start + len);

  // Align to 4 bytes
  const pad = (4 - len % 4) % 4;

  bvMapping.set(oldIdx, newBufferViews.length);
  newBufferViews.push({
    buffer: 0,
    byteOffset: newOffset,
    byteLength: len,
    ...(bv.target ? { target: bv.target } : {}),
  });
  chunks.push(Buffer.from(chunk));
  if (pad > 0) chunks.push(Buffer.alloc(pad));
  newOffset += len + pad;
}

const newBinData = Buffer.concat(chunks);

// Remap accessor bufferView indices
const accMapping = new Map<number, number>(); // old → new
const newAccessors: any[] = [];
for (const oldAccIdx of usedAccessors) {
  const acc = { ...gltf.accessors[oldAccIdx] };
  if (acc.bufferView != null) {
    acc.bufferView = bvMapping.get(acc.bufferView);
  }
  accMapping.set(oldAccIdx, newAccessors.length);
  newAccessors.push(acc);
}

// Remap animation sampler references
for (const sampler of targetAnim.samplers) {
  sampler.input = accMapping.get(sampler.input)!;
  sampler.output = accMapping.get(sampler.output)!;
}

// Remap skin inverseBindMatrices
for (const skin of gltf.skins ?? []) {
  if (skin.inverseBindMatrices != null) {
    skin.inverseBindMatrices = accMapping.get(skin.inverseBindMatrices)!;
  }
}

// Strip meshes from nodes
for (const node of gltf.nodes ?? []) {
  delete node.mesh;
}

// Build minimal GLTF
gltf.animations = [targetAnim];
gltf.accessors = newAccessors;
gltf.bufferViews = newBufferViews;
gltf.buffers = [{ byteLength: newBinData.length }];
gltf.meshes = [];
delete gltf.images;
delete gltf.textures;
delete gltf.materials;
delete gltf.samplers;

// Write GLB
const newJsonStr = JSON.stringify(gltf);
const newJsonBuf = new TextEncoder().encode(newJsonStr);
const newJsonPadded = newJsonBuf.length + (4 - newJsonBuf.length % 4) % 4;
const newBinPadded = newBinData.length + (4 - newBinData.length % 4) % 4;
const totalLen = 12 + 8 + newJsonPadded + 8 + newBinPadded;

const outBuf = Buffer.alloc(totalLen);
const outDv = new DataView(outBuf.buffer);

// GLB header
outDv.setUint32(0, 0x46546C67, true);
outDv.setUint32(4, 2, true);
outDv.setUint32(8, totalLen, true);

// JSON chunk
outDv.setUint32(12, newJsonPadded, true);
outDv.setUint32(16, 0x4E4F534A, true);
outBuf.set(newJsonBuf, 20);
for (let i = newJsonBuf.length; i < newJsonPadded; i++) outBuf[20 + i] = 0x20;

// BIN chunk
const bo = 20 + newJsonPadded;
outDv.setUint32(bo, newBinPadded, true);
outDv.setUint32(bo + 4, 0x004E4942, true);
outBuf.set(newBinData, bo + 8);

writeFileSync(outputPath, outBuf);
const origMB = buf.length / 1024 / 1024;
const newMB = outBuf.length / 1024 / 1024;
console.log(`Written ${outputPath} (${origMB.toFixed(1)}MB → ${newMB.toFixed(2)}MB)`);
