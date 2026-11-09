const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('title="Expand toolbar"', 'title="展开工具栏"');
s = s.replace(/>\s*Expand\s*<\/button>/, '>展开工具栏</button>');
s = s.replace('title="Collapse toolbar"', 'title="收起工具栏"');
s = s.replace(/>\s*Collapse\s*<\/button>/, '>收起</button>');
fs.writeFileSync(p, s);
console.log('expand', /展开工具栏/.test(s), 'collapse', /收起工具栏/.test(s));
