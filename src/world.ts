import { Container, Graphics, Sprite } from 'pixi.js';
import { Art } from './art';
import { C, DESIGN_HEIGHT, DESIGN_WIDTH, PHYS, SIZE, WORLD_LENGTH } from './config';

/** 起点塔 / 终点塔的 x 坐标 */
export const TRACK_START_X = 150;
export const TRACK_END_X = WORLD_LENGTH - 190;

/** 缆线 → 车厢底部（碰撞圆最低点）的总落差：绳长 + 车厢半高 + 碰撞半径 */
export const CABIN_DROP = PHYS.ropeLength + SIZE.cabinCenterOffset + SIZE.cabinRadius;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 地面基础起伏（不含岩丘） */
export function baseGroundY(x: number): number {
  return 665 - Math.sin(x * 0.0009) * 22 - Math.sin(x * 0.0021 + 1.1) * 9;
}

/* ------------------------------------------------------------------ 轨道编排 */

/**
 * 轨道由若干"特征段"手工编排：
 *   y(u) = y0 + amp * (cos(π·waves·u) - 1)
 *   x(u) = x0 + w·u - (fold·w/2π) * (1 - cos(2π·u))
 *
 * - waves 为奇数时是单调的 S 形过渡（end = y0 - 2·amp）
 * - waves 为偶数时是一个往返鼓包（end = y0）
 * - fold < 1 时 x 在中途放缓但不折返，形成平缓的横向 S 弯；两端 dx/du = w，接缝切线连续
 * - fold ≥ 1 会让 x 折返并与自身交叉，出现"压扁的小环"，视觉上不成立，不要用
 */
interface Feature {
  w: number;
  amp: number;
  waves: number;
  fold: number;
}

const FEATURES: Feature[] = [
  { w: 520, amp: 35, waves: 2, fold: 0 },
  { w: 470, amp: -40, waves: 1, fold: 0 },
  { w: 460, amp: 52, waves: 1, fold: 0 },
  { w: 430, amp: -30, waves: 2, fold: 0 },
  { w: 520, amp: -26, waves: 3, fold: 0.7 },
  { w: 380, amp: 18, waves: 4, fold: 0 },
  { w: 500, amp: -14, waves: 1, fold: 0 },
  { w: 560, amp: 44, waves: 1, fold: 0.7 },
  { w: 420, amp: -36, waves: 2, fold: 0 },
  { w: 520, amp: -42, waves: 1, fold: 0 },
  { w: 480, amp: 30, waves: 3, fold: 0 },
  { w: 640, amp: -44, waves: 1, fold: 0.7 },
  { w: 480, amp: 34, waves: 2, fold: 0 },
  { w: 520, amp: 46, waves: 1, fold: 0 },
  { w: 430, amp: -28, waves: 2, fold: 0 },
  { w: 560, amp: -30, waves: 3, fold: 0 },
  { w: 520, amp: 38, waves: 2, fold: 0 },
  { w: 250, amp: 30, waves: 1, fold: 0 },
];

const START_Y = 300;

/** 环轨：椭圆，横向/纵向半径可不同，避免"正圆"的呆板感 */
const LOOP_SHAPES = [
  { r1: 150, r2: 140 },
  { r1: 120, r2: 148 },
  { r1: 168, r2: 156 },
];

export interface TrackPose {
  x: number;
  y: number;
}

export class Track {
  readonly px: number[] = [];
  readonly py: number[] = [];
  private readonly cum: number[] = [];
  /** 每段环轨占用的弧长区间 */
  readonly loops: { s0: number; s1: number }[] = [];
  readonly total: number;
  /** x → 该处轨道的最低点（y 最大），用于把地形压在车厢下方 */
  private readonly xTable: Float32Array;
  private readonly tableOffset = 400;

  constructor() {
    this.xTable = new Float32Array(WORLD_LENGTH + this.tableOffset * 2);

    let x = TRACK_START_X;
    let y = START_Y;
    let lastLoopX = -1e9;
    this.push(x, y);

    for (const f of FEATURES) {
      const x0 = x;
      const y0 = y;
      const n = Math.max(28, Math.ceil((f.w + Math.abs(f.amp) * f.waves * 3.6) / 5));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        this.push(
          x0 + f.w * u - ((f.fold * f.w) / (Math.PI * 2)) * (1 - Math.cos(Math.PI * 2 * u)),
          y0 + f.amp * (Math.cos(Math.PI * f.waves * u) - 1),
        );
      }
      x = x0 + f.w;
      y = y0 + f.amp * (Math.cos(Math.PI * f.waves) - 1);

      const shape = LOOP_SHAPES[this.loops.length];
      if (shape && y >= 338 && y <= 394 && x - lastLoopX >= 1400) {
        lastLoopX = x;
        const cx = x;
        const cy = y - shape.r2;
        const sStart = this.cum[this.cum.length - 1];
        const steps = 96;
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          this.push(cx + Math.sin(t) * shape.r1, cy + Math.cos(t) * shape.r2);
        }
        this.loops.push({ s0: sStart, s1: this.cum[this.cum.length - 1] });
      }
    }

    this.total = this.cum[this.cum.length - 1];

    for (let i = 0; i < this.px.length; i++) {
      const idx = Math.round(this.px[i]) + this.tableOffset;
      if (idx < 0 || idx >= this.xTable.length) continue;
      if (this.py[i] > this.xTable[idx]) this.xTable[idx] = this.py[i];
    }
  }

  private push(x: number, y: number): void {
    const n = this.px.length;
    if (n > 0 && Math.abs(x - this.px[n - 1]) < 0.01 && Math.abs(y - this.py[n - 1]) < 0.01) {
      return;
    }
    this.px.push(x);
    this.py.push(y);
    if (n === 0) {
      this.cum.push(0);
    } else {
      const dx = x - this.px[n - 1];
      const dy = y - this.py[n - 1];
      this.cum.push(this.cum[n - 1] + Math.hypot(dx, dy));
    }
  }

  poseAt(s: number): TrackPose {
    const t = clamp(s, 0, this.total);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo];
    const f = span > 0 ? (t - this.cum[lo]) / span : 0;
    return {
      x: this.px[lo] + (this.px[hi] - this.px[lo]) * f,
      y: this.py[lo] + (this.py[hi] - this.py[lo]) * f,
    };
  }

  yAtX(x: number): number {
    const base = Math.round(x) + this.tableOffset;
    for (let d = 0; d < 60; d++) {
      const a = this.xTable[base - d];
      if (a > 0) return a;
      const b = this.xTable[base + d];
      if (b > 0) return b;
    }
    return START_Y;
  }

  private freeCache?: { ranges: { a: number; b: number }[]; len: number };

  /** 挖掉每段环轨前后 pad 之后剩下的"可用弧长"区间 */
  private freeInfo(pad: number): { ranges: { a: number; b: number }[]; len: number } {
    if (this.freeCache) return this.freeCache;
    const pads = this.loops
      .map((L) => ({ a: L.s0 - pad, b: L.s1 + pad }))
      .sort((m, n) => m.a - n.a);
    const ranges: { a: number; b: number }[] = [];
    let cursor = 60;
    for (const p of pads) {
      if (p.a > cursor) ranges.push({ a: cursor, b: p.a });
      cursor = Math.max(cursor, p.b);
    }
    if (cursor < this.total - 60) ranges.push({ a: cursor, b: this.total - 60 });
    const len = ranges.reduce((sum, r) => sum + (r.b - r.a), 0);
    this.freeCache = { ranges, len };
    return this.freeCache;
  }

  /** 按"可用弧长"的 0~1 比例取弧长坐标，天然避开环轨 */
  atFree(f: number, pad = 360): number {
    const { ranges, len } = this.freeInfo(pad);
    let d = clamp(f, 0, 1) * len;
    for (const r of ranges) {
      const l = r.b - r.a;
      if (d <= l) return r.a + d;
      d -= l;
    }
    return ranges.length ? ranges[ranges.length - 1].b : this.total * f;
  }
}

export const TRACK = new Track();

/* ------------------------------------------------------------------ 地形 */

export interface Peak {
  x: number;
  w: number;
  h: number;
}

/**
 * 粉岩石丘：只能靠速度控制的关卡里，岩丘必须是"擦身而过"——
 * 丘顶恒定低于该处车厢底部 12~58px，是压迫感不是致命物。
 */
export const PEAKS: Peak[] = (() => {
  const rand = mulberry32(20261118);
  const list: Peak[] = [];
  let x = 900;
  while (x < WORLD_LENGTH - 700) {
    const w = 90 + rand() * 80;
    const clearance = 12 + rand() * 46;
    // 取岩丘整个跨度内轨道的最低点，避免在折返段算矮
    let trackY = 0;
    for (let i = -w; i <= w; i += 10) trackY = Math.max(trackY, TRACK.yAtX(x + i));
    const topY = trackY + CABIN_DROP + clearance;
    const h = Math.min(320, Math.max(30, baseGroundY(x) - 4 - topY));
    if (h > 32) list.push({ x, w, h });
    x += 640 + rand() * 340;
  }
  return list;
})();

function peakRise(x: number, p: Peak): number {
  const d = Math.abs(x - p.x);
  if (d >= p.w) return 0;
  return p.h * 0.5 * (1 + Math.cos((Math.PI * d) / p.w));
}

/** 地面高度（含岩丘），也是碰撞面 */
export function groundY(x: number): number {
  let y = baseGroundY(x);
  for (let i = 0; i < PEAKS.length; i++) y -= peakRise(x, PEAKS[i]);
  return y;
}

/* ------------------------------------------------------------------ 背景与装饰 */

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** 天空：用等距色带模拟渐变，避免依赖 canvas 渐变纹理 */
function buildSky(): Graphics {
  const g = new Graphics();
  const bands = 48;
  const bh = DESIGN_HEIGHT / bands;
  for (let i = 0; i < bands; i++) {
    g.beginFill(mix(C.skyTop, C.skyBottom, i / (bands - 1)));
    g.drawRect(0, i * bh - 1, DESIGN_WIDTH, bh + 2);
    g.endFill();
  }
  return g;
}

function buildMountainLayer(
  width: number,
  seed: number,
  baseY: number,
  body: number,
  light: number,
): Graphics {
  const rand = mulberry32(seed);
  const pts: { x: number; y: number }[] = [{ x: 0, y: baseY - rand() * 40 }];
  let x = 0;
  while (x < width) {
    const pw = 300 + rand() * 340;
    const ph = 130 + rand() * 190;
    pts.push({ x: x + pw * 0.5, y: baseY - ph });
    pts.push({ x: x + pw, y: baseY - 20 - rand() * 60 });
    x += pw;
  }

  const g = new Graphics();
  g.beginFill(body);
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.lineTo(width, DESIGN_HEIGHT + 60);
  g.lineTo(0, DESIGN_HEIGHT + 60);
  g.closePath();
  g.endFill();

  g.beginFill(light, 0.3);
  for (let i = 0; i < pts.length - 1; i += 2) {
    const a = pts[i];
    const p = pts[i + 1];
    g.drawPolygon([a.x, a.y, p.x, p.y, p.x, DESIGN_HEIGHT + 60, a.x, DESIGN_HEIGHT + 60]);
  }
  g.endFill();
  return g;
}

function buildGround(): Graphics {
  const g = new Graphics();
  const step = 12;
  g.beginFill(C.hillNear);
  g.moveTo(0, groundY(0));
  for (let x = step; x <= WORLD_LENGTH; x += step) {
    g.lineTo(x, groundY(x));
  }
  g.lineTo(WORLD_LENGTH, DESIGN_HEIGHT + 60);
  g.lineTo(0, DESIGN_HEIGHT + 60);
  g.closePath();
  g.endFill();

  g.beginFill(C.hillShadow);
  g.moveTo(0, groundY(0));
  for (let x = step; x <= WORLD_LENGTH; x += step) {
    g.lineTo(x, groundY(x));
  }
  for (let x = WORLD_LENGTH; x >= 0; x -= step) {
    g.lineTo(x, groundY(x) + 14);
  }
  g.closePath();
  g.endFill();
  return g;
}

/** 两侧的粉色多边形崖壁（呼应概念图） */
function buildCliff(x0: number, x1: number, height: number, flip: boolean): Graphics {
  const g = new Graphics();
  const gy = groundY(flip ? x1 : x0) + 30;
  const pts: number[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const h = height * (0.55 + 0.45 * Math.sin(t * Math.PI));
    pts.push(x, gy - h);
  }
  g.beginFill(C.rockMid);
  g.drawPolygon([...pts, x1, gy, x0, gy]);
  g.endFill();

  g.beginFill(C.rockLight, 0.75);
  g.drawPolygon([x0, gy, pts[0], pts[1], x0 + (x1 - x0) * 0.32, gy - height * 0.5, x0 + (x1 - x0) * 0.2, gy]);
  g.endFill();

  g.beginFill(C.rockDark, 0.5);
  g.drawPolygon([x1, gy, pts[pts.length - 2], pts[pts.length - 1], x1 - (x1 - x0) * 0.28, gy - height * 0.42]);
  g.endFill();
  return g;
}

function buildRocks(): Graphics {
  const g = new Graphics();
  for (const p of PEAKS) {
    const pts: number[] = [];
    for (let x = p.x - p.w; x <= p.x + p.w; x += 10) pts.push(x, groundY(x));
    for (let x = p.x + p.w; x >= p.x - p.w; x -= 10) {
      pts.push(x, Math.max(baseGroundY(x) + 8, groundY(x) + 8));
    }
    g.beginFill(C.rockMid).drawPolygon(pts).endFill();

    const topY = groundY(p.x);
    const baseY = Math.max(baseGroundY(p.x), topY) + 24;
    g.beginFill(C.rockLight, 0.6);
    g.drawPolygon([p.x, topY, p.x - p.w * 0.85, groundY(p.x - p.w * 0.85), p.x - p.w * 0.15, baseY]);
    g.endFill();
    g.beginFill(C.rockDark, 0.35);
    g.drawPolygon([p.x, topY, p.x + p.w * 0.85, groundY(p.x + p.w * 0.85), p.x + p.w * 0.22, baseY + 8]);
    g.endFill();
  }
  return g;
}

function buildTower(x: number, topY: number): Container {
  const c = new Container();
  const top = topY - 46;
  const bottom = groundY(x) + 10;
  const g = new Graphics();
  const halfTop = 16;
  const halfBottom = 34;

  g.lineStyle(9, C.towerBar, 1);
  g.moveTo(x - halfBottom, bottom).lineTo(x - halfTop, top);
  g.moveTo(x + halfBottom, bottom).lineTo(x + halfTop, top);
  g.lineStyle(7, C.towerBarDark, 1);
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4;
    const t1 = (i + 1) / 4;
    const y0 = bottom + (top - bottom) * t0;
    const y1 = bottom + (top - bottom) * t1;
    const w0 = halfBottom + (halfTop - halfBottom) * t0;
    const w1 = halfBottom + (halfTop - halfBottom) * t1;
    g.moveTo(x - w0, y0).lineTo(x + w1, y1);
    g.moveTo(x + w0, y0).lineTo(x - w1, y1);
  }
  g.lineStyle(0);

  g.beginFill(C.towerBase).drawRoundedRect(x - 34, top - 12, 68, 16, 8).endFill();
  g.beginFill(0xffffff, 0.5).drawRoundedRect(x - 28, top - 9, 40, 5, 2).endFill();
  g.beginFill(C.towerBase).drawRoundedRect(x - 42, bottom - 6, 84, 18, 8).endFill();

  c.addChild(g);
  return c;
}

function buildWire(track: Track): Graphics {
  const g = new Graphics();
  g.lineStyle(5, C.wire, 1);
  g.moveTo(track.px[0], track.py[0]);
  for (let i = 1; i < track.px.length; i++) {
    g.lineTo(track.px[i], track.py[i]);
  }
  g.lineStyle(0);
  return g;
}

export class World {
  readonly sky: Graphics;
  readonly track = TRACK;
  readonly farLayer = new Container();
  readonly midLayer = new Container();
  readonly farCloudLayer = new Container();
  readonly nearCloudLayer = new Container();
  readonly terrainLayer = new Container();
  readonly trackLayer = new Container();
  readonly actorLayer = new Container();

  constructor(art: Art) {
    this.sky = buildSky();

    const farWidth = WORLD_LENGTH * 0.2 + DESIGN_WIDTH + 200;
    const midWidth = WORLD_LENGTH * 0.45 + DESIGN_WIDTH + 200;

    this.farLayer.addChild(buildMountainLayer(farWidth, 1.7, 665, C.mountainA, 0xffffff));
    this.midLayer.addChild(buildMountainLayer(midWidth, 4.2, 700, C.mountainB, 0xffffff));

    this.buildClouds(this.farCloudLayer, art, WORLD_LENGTH * 0.3 + DESIGN_WIDTH, 11, 0.9);
    this.buildClouds(this.nearCloudLayer, art, WORLD_LENGTH * 0.7 + DESIGN_WIDTH, 23, 0.55);

    this.terrainLayer.addChild(buildCliff(0, 260, 150, false));
    this.terrainLayer.addChild(buildCliff(WORLD_LENGTH - 300, WORLD_LENGTH, 170, true));
    this.terrainLayer.addChild(buildGround());
    this.terrainLayer.addChild(buildRocks());
    this.decorate(this.terrainLayer, art);

    const t = this.track;
    const startTop = t.poseAt(0).y;
    const endTop = t.poseAt(t.total).y;
    this.trackLayer.addChild(buildTower(TRACK_START_X, startTop));
    this.trackLayer.addChild(buildTower(TRACK_END_X, endTop));
    this.trackLayer.addChild(buildWire(t));

    const startFlag = new Sprite(art.flag);
    startFlag.position.set(TRACK_START_X - 20, startTop - 118);
    startFlag.scale.set(0.55);
    const endFlag = new Sprite(art.flag);
    endFlag.position.set(TRACK_END_X - 20, endTop - 118);
    endFlag.scale.set(0.55);
    this.trackLayer.addChild(startFlag, endFlag);
  }

  private buildClouds(layer: Container, art: Art, width: number, seed: number, scale: number): void {
    const rand = mulberry32(seed);
    const count = Math.ceil(width / 420);
    for (let i = 0; i < count; i++) {
      const s = new Sprite(art.clouds[0]);
      s.anchor.set(0.5);
      const sc = scale * (0.7 + rand() * 0.7);
      s.scale.set(sc);
      s.position.set(rand() * width, 60 + rand() * 300);
      s.alpha = 0.75 + rand() * 0.25;
      layer.addChild(s);
    }
  }

  private decorate(layer: Container, art: Art): void {
    const rand = mulberry32(97);
    for (let x = 60; x < WORLD_LENGTH; x += 40 + rand() * 90) {
      if (baseGroundY(x) - groundY(x) > 8) continue;
      const isPine = rand() > 0.45;
      const s = new Sprite(isPine ? art.pine : art.bush);
      s.anchor.set(0.5, 1);
      s.scale.set(0.55 + rand() * 0.55);
      s.position.set(x, groundY(x) + 8);
      s.alpha = 0.95;
      layer.addChild(s);
    }
  }

  update(cameraX: number): void {
    this.farLayer.x = -cameraX * 0.2;
    this.midLayer.x = -cameraX * 0.45;
    this.farCloudLayer.x = -cameraX * 0.3;
    this.nearCloudLayer.x = -cameraX * 0.62;
    this.terrainLayer.x = -cameraX;
    this.trackLayer.x = -cameraX;
    this.actorLayer.x = -cameraX;
  }
}
