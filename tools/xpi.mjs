/**
 * A minimal ZIP writer, for one purpose: producing the XPI that Playwright's Firefox
 * has to be handed.
 *
 * Playwright cannot load a Firefox extension the way it loads a Chromium one
 * (`--load-extension`): a persistent profile is rebuilt at launch, so a pre-seeded XPI
 * is deleted before Firefox looks for it, and `about:addons` — where a temporary add-on
 * would normally be loaded by hand — is not reachable for automation. What is left is
 * the marionette protocol, and its `Addon:Install` command takes a path to an archive.
 *
 * So this writes one: stored (uncompressed) entries, no directories, no zip64, which is
 * the least that works and the least that can go wrong.
 */
export class ZipArchive {
  #entries = [];
  #offset = 0;

  /** @param {string} name path inside the archive @param {Buffer} contents */
  add(name, contents) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    this.#entries.push({ local, nameBytes, contents, crc });
    this.#offset += local.length + nameBytes.length + contents.length;
  }

  /** @returns {Buffer} the complete archive */
  finalize() {
    const central = [];
    let centralSize = 0;
    let localOffset = 0;
    for (const entry of this.#entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0); // central directory header
      header.writeUInt16LE(20, 4); // version made by
      header.writeUInt16LE(20, 6); // version needed
      header.writeUInt16LE(0, 8); // flags
      header.writeUInt16LE(0, 10); // method: stored
      header.writeUInt16LE(0, 12); // mod time
      header.writeUInt16LE(0x21, 14); // mod date
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.contents.length, 20);
      header.writeUInt32LE(entry.contents.length, 24);
      header.writeUInt16LE(entry.nameBytes.length, 28);
      header.writeUInt16LE(0, 30); // extra
      header.writeUInt16LE(0, 32); // comment
      header.writeUInt16LE(0, 34); // disk number
      header.writeUInt16LE(0, 36); // internal attributes
      header.writeUInt32LE(0, 38); // external attributes
      // Where this entry's local header starts, which is not the same counter as the
      // one walking the central directory.
      header.writeUInt32LE(localOffset, 42);
      central.push(header, entry.nameBytes);
      centralSize += header.length + entry.nameBytes.length;
      localOffset += entry.local.length + entry.nameBytes.length + entry.contents.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central directory
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.#entries.length, 8);
    end.writeUInt16LE(this.#entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(this.#offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([
      ...this.#entries.flatMap((entry) => [entry.local, entry.nameBytes, entry.contents]),
      ...central,
      end,
    ]);
  }
}

/** CRC-32 (IEEE), the checksum every ZIP entry carries. */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}