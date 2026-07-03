// One-off script: generates favicon PNGs and ICO from favicon.svg.
// Run: node scripts/gen-favicon.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const svgBuf = readFileSync(join(ROOT, 'favicon.svg'));

async function png(size, outName) {
  const buf = await sharp(svgBuf, { density: Math.ceil(size * 72 / 64) })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(join(ROOT, outName), buf);
  console.log(`  ${outName} (${size}x${size})`);
  return buf;
}

// Build a minimal ICO file from multiple PNG buffers.
// ICO format: ICONDIR + ICONDIRENTRY[] + image data blobs
function buildIco(pngBufs, sizes) {
  const n = pngBufs.length;
  const headerSize = 6;           // ICONDIR
  const entrySize = 16;           // ICONDIRENTRY
  const dataOffset = headerSize + entrySize * n;

  // Calculate total buffer size
  let totalSize = dataOffset;
  for (const buf of pngBufs) totalSize += buf.length;

  const ico = Buffer.alloc(totalSize);
  // ICONDIR
  ico.writeUInt16LE(0, 0);  // reserved
  ico.writeUInt16LE(1, 2);  // type: 1 = ICO
  ico.writeUInt16LE(n, 4);  // image count

  let imageOffset = dataOffset;
  for (let i = 0; i < n; i++) {
    const size = sizes[i];
    const buf = pngBufs[i];
    const entry = headerSize + i * entrySize;
    ico.writeUInt8(size === 256 ? 0 : size, entry);      // width (0 = 256)
    ico.writeUInt8(size === 256 ? 0 : size, entry + 1);  // height
    ico.writeUInt8(0, entry + 2);   // color count
    ico.writeUInt8(0, entry + 3);   // reserved
    ico.writeUInt16LE(1, entry + 4);  // color planes
    ico.writeUInt16LE(32, entry + 6); // bits per pixel
    ico.writeUInt32LE(buf.length, entry + 8);  // image data size
    ico.writeUInt32LE(imageOffset, entry + 12); // image data offset
    buf.copy(ico, imageOffset);
    imageOffset += buf.length;
  }
  return ico;
}

console.log('Generating favicons...');
const [p16, p32, p48, p180] = await Promise.all([
  png(16, 'favicon-16x16.png'),
  png(32, 'favicon-32x32.png'),
  png(48, '_favicon-48.png'),   // temp, for ICO only
  png(180, 'apple-touch-icon.png'),
]);

// Combine 16, 32, 48 into ICO
const ico = buildIco([p16, p32, p48], [16, 32, 48]);
writeFileSync(join(ROOT, 'favicon.ico'), ico);
console.log('  favicon.ico (16x16, 32x32, 48x48)');

// Remove temp file
import { unlinkSync } from 'fs';
unlinkSync(join(ROOT, '_favicon-48.png'));

console.log('Done.');
