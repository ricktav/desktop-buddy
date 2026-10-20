import sharp from 'sharp';
const [inp,out,x0,y0,x1,y1,zz]=process.argv.slice(2);
const X0=+x0,Y0=+y0,X1=+x1,Y1=+y1,z=+zz;
const w=X1-X0,h=Y1-Y0,W=w*z,H=h*z;
let lines='';
for(let x=Math.ceil(X0/5)*5;x<=X1;x+=5) lines+=`<line x1="${(x-X0)*z}" y1="0" x2="${(x-X0)*z}" y2="${H}" stroke="${x%10?'#fbb':'#f00'}" stroke-width="${x%10?0.5:1}"/>`+(x%10?'':`<text x="${(x-X0)*z+2}" y="12" font-size="11" fill="red">${x}</text>`);
for(let y=Math.ceil(Y0/5)*5;y<=Y1;y+=5) lines+=`<line x1="0" y1="${(y-Y0)*z}" x2="${W}" y2="${(y-Y0)*z}" stroke="${y%10?'#bbf':'#00f'}" stroke-width="${y%10?0.5:1}"/>`+(y%10?'':`<text x="2" y="${(y-Y0)*z-2}" font-size="11" fill="blue">${y}</text>`);
const base=await sharp(inp).extract({left:X0,top:Y0,width:w,height:h}).resize(W,H,{kernel:'nearest'}).flatten({background:'#3a8'}).png().toBuffer();
await sharp(base).composite([{input:Buffer.from(`<svg width="${W}" height="${H}">${lines}</svg>`)}]).png().toFile(out);
