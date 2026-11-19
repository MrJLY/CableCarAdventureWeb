import { Container, Graphics, Sprite } from 'pixi.js';
import { Art } from './art';
import { C, DESIGN_HEIGHT, DESIGN_WIDTH, PHYS, SIZE } from './config';
import { Feature, LevelDef, LoopShape } from './levels';

/** 轨道起点 x（终点由各关自己的特征段决定） */
export const TRACK_START_X = 150;

/** 缆线 → 车厢底部（碰撞圆最低点）的总落差：绳长 + 车厢半高 + 碰撞半径 */
export const CABIN_DROP = PHYS.ropeLength + SIZE.cabinCenterOffset + SIZE.cabinRadius;

const START_Y = 300;

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

/* ------------------------------------------------------------------ 轨道 */

export interface TrackPose {
  x: number;
  y: number;
}

/**
 * 缆线轨道：按弧长参数化的折线，由若干"特征段"拼接，中间可插入椭圆环轨。
 *
 *   y(u) = y0 + amp * (cos(π·waves·u) - 1)
 *   x(u) = x0 + w·u - (fold·w/2π) * (1 - cos(2π·u))
 *
 * - waves 奇数 → 单调的 S 形过渡（段末 y = y0 - 2·amp）；偶数 → 一个往返鼓包
 * - fold 约 0.7 → x 中途放缓但不折返；**fold ≥ 1 会自交出"压扁的小环"，不要用**
 * - 两式在 u = 0 / 1 处 dy/du = 0、dx/du = w，接缝切线连续
 */
export class Track {
  readonly px: number[] = [];
  readonly py: number[] = [];
  readonly endX: number;
  readonly total: number;
  /** 每段环轨占用的弧长区间 */
  readonly loops: { s0: number; s1: number }[] = [];

  private readonly cum: number[] = [];
  private readonly xTable: Float32Array;
  private readonly tableOffset = 400;

  constructor(features: Feature[], loopShapes: LoopShape[]) {
    let x = TRACK_START_X;
    let y = START_Y;
    let lastLoopX = -1e9;
    this.push(x, y);

    for (const f of features) {
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

      const shape = loopShapes[this.loops.length];
      if (shape && y >= 338 && y <= 394 && x - lastLoopX >= 1400) {
        lastLoopX = x;
        const cy = y - shape.r2;
        const sStart = this.cum[this.cum.length - 1];
        const steps = 96;
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          this.push(x + Math.sin(t) * shape.r1, cy + Math.cos(t) * shape.r2);
        }
        this.loops.push({ s0: sStart, s1: this.cum[this.cum.length - 1] });
      }
    }

    this.endX = x;
    this.total = this.cum[this.cum.length - 1];

    let maxX = 0;
    for (let i = 0; i < this.px.length; i++) maxX = Math.max(maxX, this.px[i]);
    this.xTable = new Float32Array(Math.ceil(maxX) + this.tableOffset * 2);
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

  /** 该 x 处轨道能达到的最低点（y 最大），供地形与摆放使用 */
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

/* ------------------------------------------------------------------ 关卡地形 */

export interface Peak {
  x: number;
  w: number;
  h: number;
}

function peakRise(x: number, p: Peak): number {
  const d = Math.abs(x - p.x);
  if (d >= p.w) return 0;
  return p.h * 0.5 * (1 + Math.cos((Math.PI * d) / p.w));
}

/**
 * 粉岩石丘：因为只有速度控制、没有垂直闪避手段，
 * 丘顶必须恒定低于该处车厢底部 12~58px，是压迫感不是致命物。
 */
function buildPeaks(track: Track, width: number): Peak[] {
  const rand = mulberry32(20261118);
  const list: Peak[] = [];
  let x = 900;
  while (x < width - 700) {
    const w = 90 + rand() * 80;
    const clearance = 12 + rand() * 46;
    // 取岩丘整个跨度内轨道的最低点，避免在折返段算矮
    let trackY = 0;
    for (let i = -w; i <= w; i += 10) trackY = Math.max(trackY, track.yAtX(x + i));
    const topY = trackY + CABIN_DROP + clearance;
    const h = Math.min(320, Math.max(30, baseGroundY(x) - 4 - topY));
    if (h > 32) list.push({ x, w, h });
    x += 640 + rand() * 340;
  }
  return list;
}

export class Level {
  readonly def: LevelDef;
  readonly track: Track;
  readonly peaks: Peak[];
  /** 整个世界（含终点塔）的右边界 */
  readonly width: number;

  constructor(def: LevelDef) {
    this.def = def;
    this.track = new Track(def.features, def.loops);
    this.width = this.track.endX + 190;
    this.peaks = buildPeaks(this.track, this.width);
  }

  /** 地面高度（含岩丘），也是碰撞面 */
  groundY(x: number): number {
    let y = baseGroundY(x);
    for (let i = 0; i < this.peaks.length; i++) y -= peakRise(x, this.peaks[i]);
    return y;
  }
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

function buildGround(level: Level): Graphics {
  const g = new Graphics();
  const step = 12;
  const w = level.width;
  g.beginFill(C.hillNear);
  g.moveTo(0, level.groundY(0));
  for (let x = step; x <= w; x += step) g.lineTo(x, level.groundY(x));
  g.lineTo(w, DESIGN_HEIGHT + 60);
  g.lineTo(0, DESIGN_HEIGHT + 60);
  g.closePath();
  g.endFill();

  g.beginFill(C.hillShadow);
  g.moveTo(0, level.groundY(0));
  for (let x = step; x <= w; x += step) g.lineTo(x, level.groundY(x));
  for (let x = w; x >= 0; x -= step) g.lineTo(x, level.groundY(x) + 14);
  g.closePath();
  g.endFill();
  return g;
}

/** 两侧的粉色多边形崖壁（呼应概念图） */
function buildCliff(level: Level, x0: number, x1: number, height: number, flip: boolean): Graphics {
  const g = new Graphics();
  const gy = level.groundY(flip ? x1 : x0) + 30;
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

function buildRocks(level: Level): Graphics {
  const g = new Graphics();
  for (const p of level.peaks) {
    const pts: number[] = [];
    for (let x = p.x - p.w; x <= p.x + p.w; x += 10) pts.push(x, level.groundY(x));
    for (let x = p.x + p.w; x >= p.x - p.w; x -= 10) {
      pts.push(x, Math.max(baseGroundY(x) + 8, level.groundY(x) + 8));
    }
    g.beginFill(C.rockMid).drawPolygon(pts).endFill();

    const topY = level.groundY(p.x);
    const baseY = Math.max(baseGroundY(p.x), topY) + 24;
    g.beginFill(C.rockLight, 0.6);
    g.drawPolygon([p.x, topY, p.x - p.w * 0.85, level.groundY(p.x - p.w * 0.85), p.x - p.w * 0.15, baseY]);
    g.endFill();
    g.beginFill(C.rockDark, 0.35);
    g.drawPolygon([p.x, topY, p.x + p.w * 0.85, level.groundY(p.x + p.w * 0.85), p.x + p.w * 0.22, baseY + 8]);
    g.endFill();
  }
  return g;
}

function buildTower(level: Level, x: number, topY: number): Container {
  const c = new Container();
  const top = topY - 46;
  const bottom = level.groundY(x) + 10;
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
  readonly track: Track;
  readonly farLayer = new Container();
  readonly midLayer = new Container();
  readonly farCloudLayer = new Container();
  readonly nearCloudLayer = new Container();
  readonly terrainLayer = new Container();
  readonly trackLayer = new Container();
  readonly actorLayer = new Container();

  constructor(art: Art, level: Level) {
    this.sky = buildSky();
    this.track = level.track;

    const farWidth = level.width * 0.2 + DESIGN_WIDTH + 200;
    const midWidth = level.width * 0.45 + DESIGN_WIDTH + 200;

    this.farLayer.addChild(buildMountainLayer(farWidth, 1.7, 665, C.mountainA, 0xffffff));
    this.midLayer.addChild(buildMountainLayer(midWidth, 4.2, 700, C.mountainB, 0xffffff));

    this.buildClouds(this.farCloudLayer, art, level.width * 0.3 + DESIGN_WIDTH, 11, 0.9);
    this.buildClouds(this.nearCloudLayer, art, level.width * 0.7 + DESIGN_WIDTH, 23, 0.55);

    this.terrainLayer.addChild(buildCliff(level, 0, 260, 150, false));
    this.terrainLayer.addChild(buildCliff(level, level.width - 300, level.width, 170, true));
    this.terrainLayer.addChild(buildGround(level));
    this.terrainLayer.addChild(buildRocks(level));
    this.decorate(this.terrainLayer, art, level);

    const startTop = level.track.poseAt(0).y;
    const endTop = level.track.poseAt(level.track.total).y;
    this.trackLayer.addChild(buildTower(level, TRACK_START_X, startTop));
    this.trackLayer.addChild(buildTower(level, level.track.endX, endTop));
    this.trackLayer.addChild(buildWire(level.track));

    const startFlag = new Sprite(art.flag);
    startFlag.position.set(TRACK_START_X - 20, startTop - 118);
    startFlag.scale.set(0.55);
    const endFlag = new Sprite(art.flag);
    endFlag.position.set(level.track.endX - 20, endTop - 118);
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

  private decorate(layer: Container, art: Art, level: Level): void {
    const rand = mulberry32(97);
    for (let x = 60; x < level.width; x += 40 + rand() * 90) {
      if (baseGroundY(x) - level.groundY(x) > 8) continue;
      const isPine = rand() > 0.45;
      const s = new Sprite(isPine ? art.pine : art.bush);
      s.anchor.set(0.5, 1);
      s.scale.set(0.55 + rand() * 0.55);
      s.position.set(x, level.groundY(x) + 8);
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
