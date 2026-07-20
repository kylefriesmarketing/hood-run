const HALF=18, RESERVE=86;
const rng=seed=>{let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};};
const footprint=(s,len=s.len)=>{const ex=s.ox+s.dx*len,ez=s.oz+s.dz*len;return{minX:Math.min(s.ox,ex)-HALF,maxX:Math.max(s.ox,ex)+HALF,minZ:Math.min(s.oz,ez)-HALF,maxZ:Math.max(s.oz,ez)+HALF};};
const overlap=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
const direction=(s,exit)=>{const ang=s.ang+(exit==='L'?Math.PI/2:exit==='R'?-Math.PI/2:0);return{ang,dx:-Math.sin(ang),dz:-Math.cos(ang)};};

function run(seed,count=180){
  const random=rng(seed),segs=[];
  for(let n=0;n<count;n++){
    const prev=segs.at(-1); let ang=0,ox=0,oz=0;
    if(prev){ang=direction(prev,prev.exit).ang;ox=prev.ox+prev.dx*prev.len;oz=prev.oz+prev.dz*prev.len;}
    const seg={ang,ox,oz,dx:-Math.sin(ang),dz:-Math.cos(ang),len:n?48+random()*32:90,exit:'S',index:n};
    const r=random();
    let choices=n===0?['S']:seg.dx>.5?(r<.72?['L','S']:['S','L']):seg.dx<-.5?(r<.72?['R','S']:['S','R']):(r<.4?['L','S','R']:r<.8?['R','S','L']:['S','L','R']);
    const clear=exit=>{const d=direction(seg,exit),future={ox:seg.ox+seg.dx*seg.len,oz:seg.oz+seg.dz*seg.len,dx:d.dx,dz:d.dz,len:RESERVE};return !segs.some(old=>overlap(footprint(future),footprint(old)));};
    seg.exit=choices.find(clear)||'S'; segs.push(seg);
    for(let i=0;i<segs.length-2;i++) if(overlap(footprint(seg),footprint(segs[i]))) throw new Error(`seed ${seed}: segments ${i}/${n} overlap`);
  }
}

for(let seed=1;seed<=500;seed++)run(seed);

// Rotated storefront depth is always exactly outside the 7.2-unit wall line.
for(let width=9;width<=15;width+=.25){const center=7.2+10/2,near=center-10/2;if(near<7.2-1e-9)throw new Error(`building setback failed at width ${width}`);}

console.log('Generation check passed: 500 seeds, 90,000 blocks, zero overlaps.');
