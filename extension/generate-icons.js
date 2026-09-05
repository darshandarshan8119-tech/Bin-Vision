/**
 * generate-icons.js
 *
 * Generates placeholder PNG icons for the extension.
 * Run once before loading the extension in Chrome.
 *
 * Usage:
 *   node generate-icons.js
 *
 * Requires: Node.js (no npm packages needed)
 */

const fs = require('fs');
const path = require('path');

// Minimal 1x1 purple PNG (BIN-Vision brand color #6366f1)
// This is a valid PNG binary — Chrome will accept it.
// Replace with real icons before production/demo.

const SIZES = [16, 48, 128];

// Purple (#6366f1) 1x1 PNG encoded as Buffer
function createPNG(size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    
    // CRC placeholder (simplified — Chrome accepts this for small icons)
    const crc = Buffer.alloc(4, 0);
    return Buffer.concat([len, typeBytes, data, crc]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);     // width
  ihdrData.writeUInt32BE(size, 4);     // height
  ihdrData.writeUInt8(8, 8);           // bit depth
  ihdrData.writeUInt8(2, 9);           // color type: RGB
  ihdrData.writeUInt8(0, 10);          // compression
  ihdrData.writeUInt8(0, 11);          // filter
  ihdrData.writeUInt8(0, 12);          // interlace

  // Create a simple colored square (purple #6366f1 = 99, 102, 241)
  // Using Node's zlib for DEFLATE compression
  const zlib = require('zlib');
  
  // Raw image data: each row has a filter byte (0) + RGB pixels
  const rowSize = 1 + size * 3; // filter byte + RGB per pixel
  const raw = Buffer.alloc(size * rowSize, 0);
  
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      // Add a simple gradient effect
      const factor = (x + y) / (size * 2);
      raw[pixelStart + 0] = Math.round(99  + factor * 40);  // R
      raw[pixelStart + 1] = Math.round(102 + factor * 20);  // G
      raw[pixelStart + 2] = Math.round(241 - factor * 40);  // B
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idatData = compressed;

  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', idatData);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Create icons directory
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of SIZES) {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`✅ Created icons/icon${size}.png`);
}

console.log('\n🎨 Icons generated! Replace with real icons before demo.');
console.log('   Tip: Use Figma, Canva, or any icon tool to create a proper logo.');
