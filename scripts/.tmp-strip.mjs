import sharp from 'sharp';
const [dir,out,y0,...names]=process.argv.slice(2);
const Y0=+y0, w=320, h=256-Y0, z=2;
const comps=[];
for (const [i,n] of names.entries()) comps.push({input: await sharp(`${dir}/${n}`).extract({left:0,top:Y0,width:w,height:h}).resize(w*z,h*z).png().toBuffer(), left:(i%2)*w*z, top:Math.floor(i/2)*h*z});
await sharp({create:{width:w*z*2,height:h*z*Math.ceil(names.length/2),channels:4,background:'#3a8'}}).composite(comps).png().toFile(out);
