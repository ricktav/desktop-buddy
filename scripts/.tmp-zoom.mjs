import sharp from 'sharp';
const [inp,out]=process.argv.slice(2);
const m=await sharp(inp).metadata();
console.log(m.width,m.height);
// grid overlay every 10px, zoom 4x
const z=4, W=m.width*z, H=m.height*z;
let lines='';
for(let x=0;x<=m.width;x+=10) lines+=`<line x1="${x*z}" y1="0" x2="${x*z}" y2="${H}" stroke="${x%50?'#f88':'#f00'}" stroke-width="${x%50?0.5:1.5}"/>`+(x%50?'':`<text x="${x*z+2}" y="14" font-size="14" fill="red">${x}</text>`);
for(let y=0;y<=m.height;y+=10) lines+=`<line x1="0" y1="${y*z}" x2="${W}" y2="${y*z}" stroke="${y%50?'#88f':'#00f'}" stroke-width="${y%50?0.5:1.5}"/>`+(y%50?'':`<text x="2" y="${y*z-2}" font-size="14" fill="blue">${y}</text>`);
const base=await sharp(inp).resize(W,H,{kernel:'nearest'}).flatten({background:'#cfe'}).png().toBuffer();
await sharp(base).composite([{input:Buffer.from(`<svg width="${W}" height="${H}">${lines}</svg>`)}]).png().toFile(out);
