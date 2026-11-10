/**
 * 对局会话：把「指令来源」（本地 / 房间服务器）与引擎逻辑帧解耦。
 *
 *  - 单机：本地每 100ms 生成一个回合，玩家指令延后一个回合执行（与联机手感一致）
 *  - 联机：只有收到服务器下发的回合包才推进逻辑（锁步）；积压时加速追帧
 */
import { GameEngine, TICK_MS, TICKS_PER_TURN, type Command, type TurnCommand } from './game-engine';

export interface LobbySlot {
  slot: number;
  name: string;
  heroCode: string;
  isBot: boolean;
  isHost: boolean;
}
export interface LobbyState {
  id: string;
  name: string;
  started: boolean;
  prepSec: number;
  slots: (LobbySlot | null)[];
}
export interface StartPayload {
  seed: number;
  prepSec: number;
  players: { slot: number; name: string; heroCode: string; isBot: boolean }[];
}

/** 房间连接（大厅 + 对局共用一条 SSE） */
export class RoomConnection {
  private es?: EventSource;
  onLobby: (s: LobbyState) => void = () => undefined;
  onStart: (s: StartPayload) => void = () => undefined;
  onTurn: (n: number, cmds: TurnCommand[]) => void = () => undefined;
  onDesync: (turn: number) => void = () => undefined;
  onClosed: (reason: string) => void = () => undefined;

  constructor(
    readonly roomId: string,
    readonly token: string,
    /** 当前槽位（大厅换位后由服务端回执更新） */
    public slot: number
  ) {}

  connect(): void {
    const es = new EventSource(`/api/game/rooms/${this.roomId}/events?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.addEventListener('lobby', (e) => this.onLobby(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('start', (e) => this.onStart(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('turn', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { n: number; cmds: TurnCommand[] };
      this.onTurn(d.n, d.cmds || []);
    });
    es.addEventListener('desync', (e) => this.onDesync(JSON.parse((e as MessageEvent).data).turn));
    es.addEventListener('kicked', () => this.onClosed('你已被房主移出房间'));
    es.addEventListener('closed', () => this.onClosed('房主已解散房间'));
  }

  async update(body: Record<string, unknown>): Promise<string> {
    const r = await fetch(`/api/game/rooms/${this.roomId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      if (typeof j.slot === 'number' && j.slot >= 0) this.slot = j.slot;
      return '';
    }
    return j.error || `请求失败(${r.status})`;
  }

  sendCommands(cmds: Command[]): void {
    void fetch(`/api/game/rooms/${this.roomId}/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, cmds }),
      keepalive: true,
    }).catch(() => undefined);
  }

  sendChecksum(turn: number, sum: number, ended: boolean): void {
    void fetch(`/api/game/rooms/${this.roomId}/sum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, turn, sum, ended }),
    }).catch(() => undefined);
  }

  close(leave = true): void {
    this.es?.close();
    this.es = undefined;
    if (leave) void this.update({ action: 'leave' }).catch(() => undefined);
  }
}

export class GameSession {
  /** 已收到但尚未模拟的回合 */
  private queue: TurnCommand[][] = [];
  private localPending: Command[] = [];
  private outbox: Command[] = [];
  private acc = 0;
  private tickInTurn = 0;
  private turnNo = 0;
  private flushTimer = 0;
  /** 最近一帧推进的逻辑帧数（调试显示） */
  lastSteps = 0;
  desyncAt = -1;

  constructor(
    readonly engine: GameEngine,
    readonly mySlot: number,
    private readonly room: RoomConnection | null
  ) {
    if (room) {
      room.onTurn = (_n, cmds) => this.queue.push(cmds);
      room.onDesync = (turn) => {
        if (this.desyncAt < 0) this.desyncAt = turn;
      };
    }
  }

  get online(): boolean {
    return !!this.room;
  }
  /** 回合积压数（联机延迟指示） */
  get backlog(): number {
    return this.queue.length;
  }

  send(c: Command): void {
    if (this.room) this.outbox.push(c);
    else this.localPending.push(c);
  }

  /** 每个渲染帧调用，返回本帧推进的逻辑帧数 */
  pump(dtMs: number): number {
    // 联机：每 ~33ms 合并上行一次
    if (this.room) {
      this.flushTimer += dtMs;
      if (this.outbox.length && this.flushTimer >= 33) {
        this.room.sendCommands(this.outbox);
        this.outbox = [];
        this.flushTimer = 0;
      }
    }
    this.acc += Math.min(dtMs, 250);
    let steps = 0;
    // 联机积压时追帧：轻微积压每帧 8 个逻辑帧；标签页切到后台再回来等大量积压时一次追完（逻辑约 160 倍速，足够）
    const maxSteps = this.room && this.queue.length > 3 ? (this.queue.length > 20 ? 600 : 8) : 3;
    if (this.room && this.queue.length > 3) this.acc = Math.max(this.acc, TICK_MS * 2);
    while (this.acc >= TICK_MS && steps < maxSteps) {
      let cmds: TurnCommand[] = [];
      if (this.tickInTurn === 0) {
        if (this.room) {
          const next = this.queue.shift();
          if (!next) {
            // 等待服务器回合：冻结逻辑时间，避免超前
            this.acc = Math.min(this.acc, TICK_MS);
            break;
          }
          cmds = next;
        } else {
          cmds = this.localPending.map((c) => ({ slot: this.mySlot, c }));
          this.localPending = [];
        }
        this.turnNo++;
        if (this.room && this.turnNo % 50 === 0) {
          this.room.sendChecksum(this.turnNo, this.engine.checksum(), this.engine.winner >= 0);
        }
      }
      this.engine.step(cmds);
      this.tickInTurn = (this.tickInTurn + 1) % TICKS_PER_TURN;
      this.acc -= TICK_MS;
      steps++;
    }
    this.lastSteps = steps;
    return steps;
  }
}
