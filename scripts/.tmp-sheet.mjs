import sharp from 'sharp';
const [dir, out, ...names] = process.argv.slice(2);
const W=320,H=256, cols=4;
const rows=Math.ceil(names.length/cols);
const comps=[];
for (const [i,n] of names.entries()) {
  const buf = await sharp(`${dir}/${n}`).png().toBuffer();
  comps.push({input: buf, left:(i%cols)*W, top:Math.floor(i/cols)*H});
  const svg = `<svg width="${W}" height="20"><text x="4" y="15" font-size="14" fill="black">${n}</text></svg>`;
  comps.push({input: Buffer.from(svg), left:(i%cols)*W, top:Math.floor(i/cols)*H});
}
await sharp({create:{width:W*cols,height:H*rows,channels:4,background:'#dde'}}).composite(comps).png().toFile(out);
