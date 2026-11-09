import fs from 'fs';

const path = 'D:/Qt/workspace/War3Angular/public/assets/maps/dota683/buildings.json';
let text = fs.readFileSync(path, 'utf8');
const mergedNote =
  '  "note": "源自 DotA v6.83d war3map.j CreateAllUnits/Sent_Buildings + Units\\\\UnitUI.slk：坐标/朝向以 CreateUnit 为准，模型路径以 war3map/UnitUI 为准（近卫 etol=war3mapImported\\\\final_export）；scale 为 3D 场景调优（勿直接套用 UnitUI modelScale）。",';
let firstNote = true;
const re =
  /<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> [^\r\n]+/g;
text = text.replace(re, (_, head) => {
  if (firstNote && head.includes('"note"')) {
    firstNote = false;
    return mergedNote;
  }
  return head.trimEnd();
});
if (/<<<<<<<|=======|>>>>>>>/.test(text)) {
  console.error('Unresolved markers remain');
  process.exit(1);
}
JSON.parse(text);
fs.writeFileSync(path, text);
console.log('buildings.json OK');
