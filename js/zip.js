'use strict';

// Минимальный генератор ZIP (метод "stored", без сжатия) — без внешних библиотек.
// files: [{ name: string, data: ArrayBuffer | Uint8Array }]
// Возвращает Blob типа application/zip.

function crc32(bytes) {
  let table = crc32._table;
  if (!table) {
    table = crc32._table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(d) {
  const date = d || new Date();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xFFFF, date: day & 0xFFFF };
}

class ByteChunks {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  u8(v) { return this.bytes(new Uint8Array([v & 0xFF])); }
  u16(v) {
    const a = new Uint8Array(2);
    a[0] = v & 0xFF; a[1] = (v >>> 8) & 0xFF;
    return this.bytes(a);
  }
  u32(v) {
    const a = new Uint8Array(4);
    a[0] = v & 0xFF; a[1] = (v >>> 8) & 0xFF; a[2] = (v >>> 16) & 0xFF; a[3] = (v >>> 24) & 0xFF;
    return this.bytes(a);
  }
  bytes(a) { this.chunks.push(a); this.length += a.length; return this; }
  text(s) { return this.bytes(new TextEncoder().encode(s)); }
  toUint8Array() {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

async function createZip(files) {
  const local = new ByteChunks();
  const central = new ByteChunks();
  const { time, date } = dosDateTime(new Date());
  let offset = 0;

  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    let data;
    if (f.data instanceof Uint8Array) {
      data = f.data;
    } else if (f.data instanceof ArrayBuffer) {
      data = new Uint8Array(f.data);
    } else {
      data = new Uint8Array(await f.data.arrayBuffer());
    }
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    local.u32(0x04034b50).u16(20).u16(0x0800).u16(0).u16(time).u16(date)
      .u32(crc).u32(size).u32(size).u16(nameBytes.length).u16(0);
    local.bytes(nameBytes);
    local.bytes(data);

    // Central directory header
    central.u32(0x02014b50).u16(20).u16(20).u16(0x0800).u16(0).u16(time).u16(date)
      .u32(crc).u32(size).u32(size).u16(nameBytes.length).u16(0).u16(0)
      .u16(0).u16(0).u32(0).u32(offset);
    central.bytes(nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const cdOffset = local.length;
  const cdBytes = central.toUint8Array();
  local.bytes(cdBytes);

  // End of central directory
  local.u32(0x06054b50).u16(0).u16(0)
    .u16(files.length).u16(files.length)
    .u32(cdBytes.length).u32(cdOffset).u16(0);

  return new Blob([local.toUint8Array()], { type: 'application/zip' });
}
