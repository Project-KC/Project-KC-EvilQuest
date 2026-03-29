// Binary protocol helpers for game socket
// All game packets: [opcode (1 byte), ...payload]

// Shared encode buffer — avoids per-call allocation of DataView.
// Max packet: 1 opcode + 10 int16 values = 21 bytes. 32 gives headroom.
const _encBuf = new ArrayBuffer(32);
const _encView = new DataView(_encBuf);
const _encU8 = new Uint8Array(_encBuf);

export function encodePacket(opcode: number, ...values: number[]): Uint8Array {
  const len = 1 + values.length * 2;
  _encView.setUint8(0, opcode);
  for (let i = 0; i < values.length; i++) {
    _encView.setInt16(1 + i * 2, values[i]);
  }
  return _encU8.slice(0, len);
}

export function decodePacket(data: ArrayBuffer): { opcode: number; values: number[] } {
  const view = new DataView(data);
  const opcode = view.getUint8(0);
  const values: number[] = [];
  for (let i = 1; i < view.byteLength; i += 2) {
    if (i + 1 < view.byteLength) {
      values.push(view.getInt16(i));
    }
  }
  return { opcode, values };
}

// String packet: [opcode, stringLength (2 bytes), ...utf8 bytes, ...extra int16 values]
export function encodeStringPacket(opcode: number, str: string, ...values: number[]): Uint8Array {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  const buf = new Uint8Array(1 + 2 + strBytes.length + values.length * 2);
  const view = new DataView(buf.buffer);
  view.setUint8(0, opcode);
  view.setUint16(1, strBytes.length);
  buf.set(strBytes, 3);
  for (let i = 0; i < values.length; i++) {
    view.setInt16(3 + strBytes.length + i * 2, values[i]);
  }
  return buf;
}

export function decodeStringPacket(data: ArrayBuffer): { opcode: number; str: string; values: number[] } {
  const view = new DataView(data);
  const opcode = view.getUint8(0);
  const strLen = view.getUint16(1);
  const decoder = new TextDecoder();
  const str = decoder.decode(new Uint8Array(data, 3, strLen));
  const values: number[] = [];
  for (let i = 3 + strLen; i + 1 < view.byteLength; i += 2) {
    values.push(view.getInt16(i));
  }
  return { opcode, str, values };
}
