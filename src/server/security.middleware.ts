<<<<<<< HEAD
=======
// --- AI 修改开始 [LADDER-API]：安全签名鉴权、防重放攻击与速率限制中间件 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// 平台 War3Bot 与 War3Angular 间通信共享私钥 (生产环境由环境变量注入)
const BOT_SECRET_KEY = process.env['BOT_SECRET_KEY'] || 'War3_Bot_Ladder_Secret_Token_2026';

// 内存防重放 Nonce 缓存容器 (保留 5 分钟内使用过的随机 Nonce)
const usedNonces = new Map<string, number>();

// 定期清理过期的 Nonce (5 分钟)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expireAt] of usedNonces.entries()) {
    if (now > expireAt) {
      usedNonces.delete(nonce);
    }
  }
}, 60 * 1000);

/**
 * 校验 War3Bot 主机上报战绩的特权签名
 * 规则：
 * 1. 检查 X-Bot-Timestamp 是否在 60 秒时间窗口内 (防过期与时间漂移)
 * 2. 检查 X-Bot-Nonce 是否已被使用过 (防重放攻击)
 * 3. 重新计算 HMAC-SHA256(timestamp + "." + nonce + "." + matchId + "." + rawBody)
 */
export function verifyBotSignature(req: Request, res: Response, next: NextFunction): void {
  const timestampHeader = req.headers['x-bot-timestamp'] as string;
  const nonce = req.headers['x-bot-nonce'] as string;
  const signature = req.headers['x-bot-signature'] as string;

  if (!timestampHeader || !nonce || !signature) {
    res.status(401).json({
      success: false,
      error: '缺少安全鉴权请求头 (X-Bot-Timestamp, X-Bot-Nonce, X-Bot-Signature)',
    });
    return;
  }

  // 1. 校验时间戳 (允许正负 60 秒误差)
  const reqTime = parseInt(timestampHeader, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(reqTime) || Math.abs(nowSec - reqTime) > 60) {
    res.status(403).json({
      success: false,
      error: '请求已过期或服务器时间漂移过大，签名无效',
    });
    return;
  }

  // 2. 校验防重放 Nonce
  if (usedNonces.has(nonce)) {
    res.status(403).json({
      success: false,
      error: '检测到重复提交的请求凭证 (Replay Attack Detected)',
    });
    return;
  }

  // 3. 计算并对比 HMAC 签名
  const matchId = String(req.body?.matchId || '');
  const rawPayload = JSON.stringify(req.body || {});
  const signBase = `${reqTime}.${nonce}.${matchId}.${rawPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', BOT_SECRET_KEY)
    .update(signBase, 'utf8')
    .digest('hex');

  // 使用安全常量时间对比，防止时序旁路攻击 (Timing Attack)
  const isMatch =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));

  if (!isMatch) {
    res.status(403).json({
      success: false,
      error: '特权签名校验失败，无权提交天梯比赛战果',
    });
    return;
  }

  // 记录 Nonce 有效期 5 分钟
  usedNonces.set(nonce, Date.now() + 5 * 60 * 1000);
  next();
}

/**
 * 客户端请求速率限制器 (简单滑动计数，防爆破与恶意爬取)
 */
const ipHitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests = 60, windowSeconds = 60) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const clientState = ipHitMap.get(ip);

    if (!clientState || now > clientState.resetTime) {
      ipHitMap.set(ip, { count: 1, resetTime: now + windowSeconds * 1000 });
      next();
      return;
    }

    if (clientState.count >= maxRequests) {
      res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试 (Rate limit exceeded)',
      });
      return;
    }

    clientState.count++;
    next();
  };
}
<<<<<<< HEAD
=======
// --- AI 修改结束 [LADDER-API]：安全签名鉴权、防重放攻击与速率限制中间件 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5

