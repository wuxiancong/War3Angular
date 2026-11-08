const fs = require('fs');
const j = fs.readFileSync('D:/Qt/workspace/War3Bot/war3files/war3map.j', 'utf8');

function fourCC(n) {
  n = n >>> 0;
  return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

const placeholders = new Map();
const re = /set (\w+)=CreateUnit\(p,(\d+),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)\)/g;
let m;
while ((m = re.exec(j))) {
  placeholders.set(m[1], {
    id: fourCC(+m[2]),
    x: +m[3],
    y: +m[4],
    face: +m[5],
  });
}

// Recreate mapping from HB1 GetUnitX + CreateUnit facing
const hb = j.slice(j.indexOf('function HB1'), j.indexOf('endfunction', j.indexOf('function HB1')) + 12);
const getXY = [...hb.matchAll(/set (\w+)=GetUnitX\((\w+)\)\r?\nset (\w+)=GetUnitY\((\w+)\)/g)];
const coordOf = new Map();
for (const g of getXY) {
  const [, xv, xu, yv, yu] = g;
  if (xu !== yu) continue;
  const ph = placeholders.get(xu);
  if (!ph) continue;
  coordOf.set(xv, ph);
  coordOf.set(yv, ph);
}

const creates = [...hb.matchAll(/CreateUnit\(([^,]+),(\d+),(\w+),(\w+),(-?\d+)\)/g)];
console.log('recreated', creates.length);
for (const c of creates) {
  const [, owner, type, xv, yv, face] = c;
  const ph = coordOf.get(xv) || placeholders.get(xv);
  const id = fourCC(+type);
  console.log(
    JSON.stringify({
      unitId: id,
      x: ph?.x,
      y: ph?.y,
      face: +face,
      owner: owner.trim(),
      phId: ph?.id,
    })
  );
}
