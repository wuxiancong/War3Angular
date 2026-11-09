const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function scoreUtf8(buf) {
  const s = buf.toString('utf8');
  return {
    s,
    fffd: (s.match(/\uFFFD/g) || []).length,
    cjk: (s.match(/[\u4e00-\u9fff]/g) || []).length,
  };
}

function convertGbkTree(root) {
  let n = 0;
  for (const p of walk(root)) {
    if (!/\.(h|j|txt|md)$/i.test(p)) continue;
    const buf = fs.readFileSync(p);
    // skip utf16
    if (buf[0] === 0xff && buf[1] === 0xfe) continue;
    if (buf[0] === 0xfe && buf[1] === 0xff) continue;
    const u = scoreUtf8(buf);
    if (u.fffd === 0) continue;
    const gbk = iconv.decode(buf, 'gbk');
    const gff = (gbk.match(/\uFFFD/g) || []).length;
    const gcjk = (gbk.match(/[\u4e00-\u9fff]/g) || []).length;
    // Prefer GBK if it yields more CJK and fewer/equal replacement chars
    if (gcjk > u.cjk && gff <= u.fffd) {
      // Only write if result looks sane (has Chinese comments)
      fs.writeFileSync(p, gbk.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
      n++;
      console.log('GBK→UTF8', path.relative(root, p), { fffd: u.fffd + '→' + gff, cjk: u.cjk + '→' + gcjk });
    }
  }
  return n;
}

function convertUtf16Txt(p) {
  const buf = fs.readFileSync(p);
  if (!(buf[0] === 0xff && buf[1] === 0xfe)) {
    console.log('skip not utf16le', p);
    return false;
  }
  const text = buf.toString('utf16le').replace(/^\uFEFF/, '');
  fs.writeFileSync(p, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
  console.log('UTF16→UTF8', p);
  return true;
}

// 1) YDTrigger GBK headers
const ydRoot =
  'D:/Qt/workspace/War3Platform/16对战平台/module/ydwe/1.0.0.2609202145/plugin/YDTrigger';
const converted = convertGbkTree(ydRoot);
console.log('converted', converted);

// 2) Any2I.h — still mixed; force clean UTF-8 content
const any2i = path.join(ydRoot, 'SaveLoadSystem/Any2I.h');
const any2iBody = `# /*
#  *  YDTrigger专用存储系统
#  *  
#  *  Any2I
#  *
#  *  By actboy168
#  *
#  */
#
#ifndef INCLUDE_YDTRIGGER_ANY2I_H
#define INCLUDE_YDTRIGGER_ANY2I_H
#
#  define YDHashAny2I(type, any)                            YDTRIGGER_ANY2I_##type##(any)
#
#  define YDHashI2I(any)                                    any
#  define YDHashR2I(any)                                    R2I(any)
#  define YDHashB2I(any)                                    ERROR "<错误>不能从布尔值转换到整数"        // 布尔的错误
#
#  if WARCRAFT_VERSION >= 124
#    define YDHashS2I(any)                                  StringHash(any)
#    define YDHashH2I(any)                                  GetHandleId(any)
#  else
#    define YDHashS2I(any)                                  YDTRIGGER_S2I(any)
#    define YDHashH2I(any)                                  YDTRIGGER_H2I(any)
#  endif
#                                          
#  define YDTRIGGER_ANY2I_integer(any)                      YDHashI2I(any)
#  define YDTRIGGER_ANY2I_real(any)                         YDHashR2I(any)
#  define YDTRIGGER_ANY2I_boolean(any)                      YDHashB2I(any)
#  define YDTRIGGER_ANY2I_string(any)                       YDHashS2I(any)
#  define YDTRIGGER_ANY2I_timer(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_trigger(any)                      YDHashH2I(any)
#  define YDTRIGGER_ANY2I_unit(any)                         YDHashH2I(any)
#  define YDTRIGGER_ANY2I_unitcode(any)                     YDHashI2I(any)
#  define YDTRIGGER_ANY2I_abilcode(any)                     YDHashI2I(any)
#  define YDTRIGGER_ANY2I_item(any)                         YDHashH2I(any)
#  define YDTRIGGER_ANY2I_itemcode(any)                     YDHashI2I(any)
#  define YDTRIGGER_ANY2I_group(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_player(any)                       YDHashH2I(any)
#  define YDTRIGGER_ANY2I_location(any)                     YDHashH2I(any)
#  define YDTRIGGER_ANY2I_destructable(any)                 YDHashH2I(any)
#  define YDTRIGGER_ANY2I_force(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_rect(any)                         YDHashH2I(any)
#  define YDTRIGGER_ANY2I_region(any)                       YDHashH2I(any)
#  define YDTRIGGER_ANY2I_sound(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_effect(any)                       YDHashH2I(any)
#  define YDTRIGGER_ANY2I_unitpool(any)                     YDHashH2I(any)
#  define YDTRIGGER_ANY2I_itempool(any)                     YDHashH2I(any)
#  define YDTRIGGER_ANY2I_quest(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_questitem(any)                    YDHashH2I(any)
#  define YDTRIGGER_ANY2I_timerdialog(any)                  YDHashH2I(any)
#  define YDTRIGGER_ANY2I_leaderboard(any)                  YDHashH2I(any)
#  define YDTRIGGER_ANY2I_multiboard(any)                   YDHashH2I(any)
#  define YDTRIGGER_ANY2I_multiboarditem(any)               YDHashH2I(any)
#  define YDTRIGGER_ANY2I_trackable(any)                    YDHashH2I(any)
#  define YDTRIGGER_ANY2I_dialog(any)                       YDHashH2I(any)
#  define YDTRIGGER_ANY2I_button(any)                       YDHashH2I(any)
#  define YDTRIGGER_ANY2I_texttag(any)                      YDHashH2I(any)
#  define YDTRIGGER_ANY2I_lightning(any)                    YDHashH2I(any)
#  define YDTRIGGER_ANY2I_image(any)                        YDHashH2I(any)
#  define YDTRIGGER_ANY2I_fogstate(any)                     YDHashH2I(any)
#  define YDTRIGGER_ANY2I_fogmodifier(any)                  YDHashH2I(any)
#  define YDTRIGGER_ANY2I_radian(any)                       YDTRIGGERR2I(any)
#  define YDTRIGGER_ANY2I_degree(any)                       YDTRIGGERR2I(any)
#  define YDTRIGGER_ANY2I_imagefile(any)                    YDTRIGGERS2I(any)
#  define YDTRIGGER_ANY2I_modelfile(any)                    YDTRIGGERS2I(any)
#
#
#endif
`;
fs.writeFileSync(any2i, any2iBody.replace(/\n/g, '\r\n'), 'utf8');
console.log('rewrote Any2I.h');

// 3) glvtable.txt — keep slot dump, fix Chinese header
const glvt = 'D:/Qt/workspace/War3Analysis/artifacts/opengl-draw/1.27.0.52240-glvtable.txt';
const glBody = fs.readFileSync(glvt);
const glText = glBody.toString('utf8');
const slots = glText.split(/\r?\n/).filter((l) => /^\s*\[\s*\d+]/.test(l));
const newGl = [
  'func F0CC0 ← .rdata:95D9A4 ; 扫描范围 95D960..95DA10, 命中位 17/45',
  '  虚表基址RVA=95D960',
  ...slots,
  '',
].join('\n');
fs.writeFileSync(glvt, newGl, 'utf8');
console.log('rewrote glvtable.txt', 'slots', slots.length);

// 4) utf16 artifacts
convertUtf16Txt('D:/Qt/workspace/War3Analysis/artifacts/opengl-draw/1.27.0.52240-glslots.txt');
convertUtf16Txt('D:/Qt/workspace/War3Analysis/artifacts/opengl-draw/fields.txt');

// 5) replace scratch fix-html-mojibake.js with a clean note (no FFFD literals)
fs.writeFileSync(
  'D:/Qt/workspace/War3Angular/scratch/fix-html-mojibake.js',
  `/**
 * Obsolete one-off mojibake fixer (kept as stub).
 * Do not re-run — it previously double-encoded Chinese in replay-3d.component.ts.
 * Prefer UTF-8 source edits via Node fs.writeFileSync(..., 'utf8') only.
 */
console.log('fix-html-mojibake.js is retired; no-op');
`,
  'utf8'
);
console.log('stubbed fix-html-mojibake.js');

// Verify
for (const p of [any2i, glvt, 'D:/Qt/workspace/War3Angular/scratch/fix-html-mojibake.js']) {
  const s = fs.readFileSync(p, 'utf8');
  console.log(path.basename(p), { fffd: (s.match(/\uFFFD/g) || []).length, cjk: (s.match(/[\u4e00-\u9fff]/g) || []).length });
}
