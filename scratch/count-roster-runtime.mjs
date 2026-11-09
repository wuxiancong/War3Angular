// Quick sanity: parse ZH list length from roster source and ensure 112 force/alias coverage
import fs from 'fs';
const src = fs.readFileSync(new URL('../src/app/replay3d/dota-hero-roster.ts', import.meta.url), 'utf8');
const zhBlock = src.slice(src.indexOf('export const ZH_HERO_NAMES'), src.indexOf('];', src.indexOf('export const ZH_HERO_NAMES')) + 2);
const zh = [...zhBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
console.log('ZH entries', zh.length, 'heroes', zh.length - 1);
console.log('sample', zh[1], zh[12], zh[20], zh[112]);
