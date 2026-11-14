// toktx giả cho test: ghi tham số vào FAKE_TOKTX_LOG (mỗi lần một dòng JSON) và xuất một header KTX2 hợp lệ
// với kích thước theo --resize (hoặc kích thước PNG đầu vào). Không nén thật.
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('toktx v0.0.0-fake');
  process.exit(0);
}
const [output, input] = args.slice(-2);
let w;
let h;
const resize = args.indexOf('--resize');
if (resize >= 0) [w, h] = args[resize + 1].split('x').map(Number);
else {
  const png = fs.readFileSync(input);
  w = png.readUInt32BE(16);
  h = png.readUInt32BE(20);
}
const ktx = Buffer.alloc(80);
Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ktx, 0);
ktx.writeUInt32LE(0, 12); // vkFormat (Basis: UNDEFINED)
ktx.writeUInt32LE(1, 16); // typeSize
ktx.writeUInt32LE(w, 20);
ktx.writeUInt32LE(h, 24);
fs.writeFileSync(output, ktx);
if (process.env.FAKE_TOKTX_LOG) fs.appendFileSync(process.env.FAKE_TOKTX_LOG, JSON.stringify(args) + '\n');
