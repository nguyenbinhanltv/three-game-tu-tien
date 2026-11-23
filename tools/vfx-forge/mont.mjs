import sharp from 'sharp';
const [dir, out, ...skills] = process.argv.slice(2);
const W = 480, H = 270, times = ['0', '30', '150', '400'];
const comp = [];
for (let r = 0; r < skills.length; r++) for (let i = 0; i < 4; i++) comp.push({ input: await sharp(`${dir}/${skills[r]}/${skills[r]}-1080p-+${times[i]}ms.jpg`).resize(W, H).jpeg().toBuffer(), left: i * W, top: r * H });
await sharp({ create: { width: W * 4, height: H * skills.length, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 85 }).toFile(out);
