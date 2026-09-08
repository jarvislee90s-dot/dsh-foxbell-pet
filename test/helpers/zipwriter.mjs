// test/helpers/zipwriter.mjs — 最小 zip 写入器（stored 无压缩），用于构造测试 zip。
// 刻意不用现成 writer 库：需要能写出「非法条目名」（../evil、绝对路径）——正规库会拒写/规范化，
// 而安全防护测试恰恰需要真实恶意条目。
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {{name:string,data:Buffer|string}[]} entries
 * @returns {Buffer} zip 文件字节（stored，version 20，通用位标志 0x800=UTF-8 文件名）
 */
export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8')
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)          // version needed
    lh.writeUInt16LE(0x800, 6)       // flags: UTF-8 name
    lh.writeUInt16LE(0, 8)           // method: stored
    lh.writeUInt16LE(0, 10)          // mod time
    lh.writeUInt16LE(0x21, 12)       // mod date (1996-01-01-ish, 合法 DOS 日期)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    locals.push(lh, nameBuf, data)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)          // version made by
    ch.writeUInt16LE(20, 6)          // version needed
    ch.writeUInt16LE(0x800, 8)       // flags
    ch.writeUInt16LE(0, 10)          // method
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0x21, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)          // extra len
    ch.writeUInt16LE(0, 32)          // comment len
    ch.writeUInt16LE(0, 34)          // disk number
    ch.writeUInt16LE(0, 36)          // internal attrs
    ch.writeUInt32LE(0, 38)          // external attrs
    ch.writeUInt32LE(offset, 42)     // local header offset
    centrals.push(Buffer.concat([ch, nameBuf]))

    offset += lh.length + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, cd, eocd])
}
