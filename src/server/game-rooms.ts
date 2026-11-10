/**
 * 网页对战房间服务 —— 锁步（Lockstep）指令中继。
 *
 * 对齐 War3 主机模型（参见 War3Bot/docs/War3Protocol.md、Host_Model_VS_Join_Model.html）：
 *   War3 主机            →  本服务
 *   W3GS_SLOTINFOJOIN    →  SSE 事件 lobby（房间槽位表）
 *   W3GS_COUNTDOWN_END   →  SSE 事件 start（随机种子 + 最终槽位）
 *   W3GS_OUTGOING_ACTION →  POST /api/game/rooms/:id/cmd
 *   W3GS_INCOMING_ACTION →  SSE 事件 turn（每 100ms 汇总一次全部玩家指令）
 *   W3GS_OUTGOING_KEEPALIVE(checksum) → POST /api/game/rooms/:id/sum（失步检测）
 *
 * 服务端不跑游戏逻辑，只负责定序与广播；各浏览器用相同种子本地模拟。
 * 传输用 SSE + POST（无需额外依赖，且能穿过 Angular 开发服务器中间件）。
 */
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const TURN_MS = 100;
const MAX_ROOMS = 50;
const MAX_CMDS_PER_TURN = 24;
const ROOM_IDLE_MS = 60_000;

interface Slot {
  token: string;
  name: string;
  heroCode: string;
  isBot: boolean;
}

interface Room {
  id: string;
  name: string;
  hostToken: string;
  seed: number;
  prepSec: number;
  started: boolean;
  ended: boolean;
  slots: (Slot | null)[];
  clients: Map<string, Response>;
  turn: number;
  pending: { slot: number; c: unknown }[];
  cmdCount: Map<number, number>;
  timer: ReturnType<typeof setInterval> | null;
  sums: Map<number, Map<number, number>>;
  emptySince: number;
  createdAt: number;
}

const rooms = new Map<string, Room>();

function cleanName(v: unknown, fallback: string): string {
  const s = String(v ?? '')
    // eslint-disable-next-line no-control-regex -- 这里就是要剔除控制字符
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
  return s || fallback;
}
function cleanCode(v: unknown): string {
  const s = String(v ?? '');
  return /^[A-Za-z0-9]{4}$/.test(s) ? s : '';
}

function lobbyState(room: Room) {
  return {
    id: room.id,
    name: room.name,
    started: room.started,
    prepSec: room.prepSec,
    slots: room.slots.map((s, i) =>
      s ? { slot: i, name: s.name, heroCode: s.heroCode, isBot: s.isBot, isHost: s.token === room.hostToken } : null
    ),
  };
}

function send(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* 连接已断开，由 close 事件清理 */
  }
}
function broadcast(room: Room, event: string, data: unknown): void {
  for (const res of room.clients.values()) send(res, event, data);
}

function slotOfToken(room: Room, token: string): number {
  return room.slots.findIndex((s) => s && !s.isBot && s.token === token);
}

function destroyRoom(room: Room): void {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
  for (const res of room.clients.values()) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  rooms.delete(room.id);
}

/** 白名单校验指令，防止把任意 JSON 广播给其他玩家 */
function sanitizeCommand(c: unknown): Record<string, unknown> | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number, optional = false): number | undefined | null => {
    const v = o[k];
    if (v === undefined && optional) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return null;
    return v;
  };
  const out: Record<string, unknown> = {};
  const put = (k: string, v: number | undefined | null): boolean => {
    if (v === null) return false;
    if (v !== undefined) out[k] = v;
    return true;
  };
  switch (o['t']) {
    case 'move':
    case 'amove':
      out['t'] = o['t'];
      return put('x', num('x', -9000, 9000)) && put('y', num('y', -9000, 9000)) ? out : null;
    case 'attack':
      out['t'] = 'attack';
      return put('id', num('id', 1, 1e9)) ? out : null;
    case 'stop':
    case 'hold':
      return { t: o['t'] };
    case 'cast':
      out['t'] = 'cast';
      return put('slot', num('slot', 0, 7)) && put('x', num('x', -9000, 9000, true)) && put('y', num('y', -9000, 9000, true)) && put('id', num('id', 1, 1e9, true))
        ? out
        : null;
    case 'use':
      out['t'] = 'use';
      return put('inv', num('inv', 0, 5)) && put('x', num('x', -9000, 9000, true)) && put('y', num('y', -9000, 9000, true)) && put('id', num('id', 1, 1e9, true))
        ? out
        : null;
    case 'learn':
      out['t'] = 'learn';
      return put('slot', num('slot', 0, 7)) ? out : null;
    case 'sell':
      out['t'] = 'sell';
      return put('inv', num('inv', 0, 5)) ? out : null;
    case 'swap':
      out['t'] = 'swap';
      return put('a', num('a', 0, 5)) && put('b', num('b', 0, 5)) ? out : null;
    case 'buy': {
      const item = cleanCode(o['item']);
      return item ? { t: 'buy', item } : null;
    }
    default:
      return null;
  }
}

function startRoom(room: Room): void {
  room.started = true;
  room.turn = 0;
  broadcast(room, 'start', {
    seed: room.seed,
    prepSec: room.prepSec,
    players: room.slots
      .map((s, i) => (s ? { slot: i, name: s.name, heroCode: s.heroCode, isBot: s.isBot } : null))
      .filter(Boolean),
  });
  room.timer = setInterval(() => {
    if (room.ended) return;
    const cmds = room.pending;
    room.pending = [];
    room.cmdCount.clear();
    broadcast(room, 'turn', { n: room.turn, cmds });
    room.turn++;
    // 无人连接超过阈值则回收
    if (room.clients.size === 0) {
      if (!room.emptySince) room.emptySince = Date.now();
      else if (Date.now() - room.emptySince > ROOM_IDLE_MS) destroyRoom(room);
    } else room.emptySince = 0;
  }, TURN_MS);
}

export function registerGameRoomRoutes(app: Express): void {
  const getRoom = (req: Request, res: Response): Room | null => {
    const room = rooms.get(String(req.params['id'] || ''));
    if (!room) {
      res.status(404).json({ error: '房间不存在或已关闭' });
      return null;
    }
    return room;
  };

  // 房间列表
  app.get('/api/game/rooms', (_req, res) => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      // 未开始且长时间无人的房间回收
      if (!room.started && room.clients.size === 0 && now - room.createdAt > ROOM_IDLE_MS) destroyRoom(room);
    }
    res.json({
      rooms: [...rooms.values()].map((r) => ({
        id: r.id,
        name: r.name,
        started: r.started,
        players: r.slots.filter((s) => s && !s.isBot).length,
        bots: r.slots.filter((s) => s?.isBot).length,
      })),
    });
  });

  // 创建房间
  app.post('/api/game/rooms', (req, res) => {
    if (rooms.size >= MAX_ROOMS) {
      res.status(429).json({ error: '房间数量已达上限，请稍后再试' });
      return;
    }
    const token = randomUUID();
    const room: Room = {
      id: randomUUID().slice(0, 8),
      name: cleanName(req.body?.name, 'DotA 6.83d 房间'),
      hostToken: token,
      seed: (Math.random() * 0x7fffffff) | 0 || 1,
      prepSec: 30,
      started: false,
      ended: false,
      slots: new Array(10).fill(null),
      clients: new Map(),
      turn: 0,
      pending: [],
      cmdCount: new Map(),
      timer: null,
      sums: new Map(),
      emptySince: 0,
      createdAt: Date.now(),
    };
    room.slots[0] = { token, name: cleanName(req.body?.playerName, '玩家1'), heroCode: cleanCode(req.body?.heroCode), isBot: false };
    rooms.set(room.id, room);
    res.json({ roomId: room.id, token, slot: 0 });
  });

  // 加入房间
  app.post('/api/game/rooms/:id/join', (req, res) => {
    const room = getRoom(req, res);
    if (!room) return;
    if (room.started) {
      res.status(409).json({ error: '游戏已经开始' });
      return;
    }
    const free = room.slots.findIndex((s) => !s);
    if (free < 0) {
      res.status(409).json({ error: '房间已满' });
      return;
    }
    const token = randomUUID();
    room.slots[free] = { token, name: cleanName(req.body?.playerName, `玩家${free + 1}`), heroCode: cleanCode(req.body?.heroCode), isBot: false };
    broadcast(room, 'lobby', lobbyState(room));
    res.json({ roomId: room.id, token, slot: free });
  });

  // 大厅操作：选英雄 / 换位 / 加减电脑 / 开始 / 离开
  app.post('/api/game/rooms/:id/update', (req, res) => {
    const room = getRoom(req, res);
    if (!room) return;
    const token = String(req.body?.token || '');
    const my = slotOfToken(room, token);
    if (my < 0) {
      res.status(403).json({ error: '无效的玩家凭证' });
      return;
    }
    const isHost = token === room.hostToken;
    const action = String(req.body?.action || '');
    if (room.started && action !== 'leave') {
      res.status(409).json({ error: '游戏已经开始' });
      return;
    }
    const target = Number(req.body?.slot);
    const validSlot = Number.isInteger(target) && target >= 0 && target < 10;
    switch (action) {
      case 'hero': {
        const code = cleanCode(req.body?.heroCode);
        if (code) (room.slots[my] as Slot).heroCode = code;
        break;
      }
      case 'slot':
        if (validSlot && !room.slots[target]) {
          room.slots[target] = room.slots[my];
          room.slots[my] = null;
        }
        break;
      case 'bot':
        if (isHost && validSlot && !room.slots[target]) {
          const code = cleanCode(req.body?.heroCode);
          if (code) room.slots[target] = { token: '', name: cleanName(req.body?.name, `电脑${target + 1}`), heroCode: code, isBot: true };
        }
        break;
      case 'kick':
        if (isHost && validSlot && room.slots[target] && room.slots[target]?.token !== room.hostToken) {
          const kicked = room.slots[target] as Slot;
          room.slots[target] = null;
          const c = room.clients.get(kicked.token);
          if (c) {
            send(c, 'kicked', {});
            c.end();
            room.clients.delete(kicked.token);
          }
        }
        break;
      case 'start': {
        if (!isHost) {
          res.status(403).json({ error: '只有房主可以开始游戏' });
          return;
        }
        if (room.slots.some((s) => s && !s.heroCode)) {
          res.status(409).json({ error: '还有玩家没有选择英雄' });
          return;
        }
        const prep = Number(req.body?.prepSec);
        if (Number.isFinite(prep)) room.prepSec = Math.max(5, Math.min(90, prep));
        startRoom(room);
        res.json({ ok: true });
        return;
      }
      case 'leave': {
        room.slots[my] = null;
        const c = room.clients.get(token);
        if (c) c.end();
        room.clients.delete(token);
        if (token === room.hostToken) {
          // 房主离开：未开始则解散，已开始则对局继续（其英雄原地不动）
          if (!room.started) {
            broadcast(room, 'closed', {});
            destroyRoom(room);
            res.json({ ok: true });
            return;
          }
        }
        break;
      }
      default:
        res.status(400).json({ error: '未知操作' });
        return;
    }
    broadcast(room, 'lobby', lobbyState(room));
    // 回执携带调用者当前槽位（换位后客户端据此更新）
    res.json({ ok: true, slot: slotOfToken(room, token) });
  });

  // 事件流
  app.get('/api/game/rooms/:id/events', (req, res) => {
    const room = getRoom(req, res);
    if (!room) return;
    const token = String(req.query['token'] || '');
    if (slotOfToken(room, token) < 0) {
      res.status(403).json({ error: '无效的玩家凭证' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    const old = room.clients.get(token);
    if (old && old !== res) old.end();
    room.clients.set(token, res);
    send(res, 'lobby', lobbyState(room));
    req.on('close', () => {
      if (room.clients.get(token) === res) room.clients.delete(token);
      if (!room.started && rooms.has(room.id)) {
        // 大厅阶段断线视为离开
        const s = slotOfToken(room, token);
        if (s >= 0 && token !== room.hostToken) {
          room.slots[s] = null;
          broadcast(room, 'lobby', lobbyState(room));
        }
      }
    });
  });

  // 上行指令
  app.post('/api/game/rooms/:id/cmd', (req, res) => {
    const room = getRoom(req, res);
    if (!room) return;
    const slot = slotOfToken(room, String(req.body?.token || ''));
    if (slot < 0 || !room.started) {
      res.status(403).json({ error: '无效的玩家凭证' });
      return;
    }
    const list = Array.isArray(req.body?.cmds) ? (req.body.cmds as unknown[]) : [];
    let n = room.cmdCount.get(slot) || 0;
    for (const raw of list) {
      if (n >= MAX_CMDS_PER_TURN) break;
      const c = sanitizeCommand(raw);
      if (!c) continue;
      room.pending.push({ slot, c });
      n++;
    }
    room.cmdCount.set(slot, n);
    res.json({ ok: true });
  });

  // 校验和上报（失步检测）
  app.post('/api/game/rooms/:id/sum', (req, res) => {
    const room = getRoom(req, res);
    if (!room) return;
    const slot = slotOfToken(room, String(req.body?.token || ''));
    const turn = Number(req.body?.turn);
    const sum = Number(req.body?.sum);
    if (slot < 0 || !Number.isInteger(turn) || !Number.isFinite(sum)) {
      res.status(400).json({ error: '参数错误' });
      return;
    }
    if (req.body?.ended === true) room.ended = true;
    let m = room.sums.get(turn);
    if (!m) {
      m = new Map();
      room.sums.set(turn, m);
      // 只保留最近 20 个采样点
      if (room.sums.size > 20) room.sums.delete(room.sums.keys().next().value as number);
    }
    m.set(slot, sum);
    const values = new Set(m.values());
    if (values.size > 1) broadcast(room, 'desync', { turn, sums: Object.fromEntries(m) });
    res.json({ ok: true });
  });
}
