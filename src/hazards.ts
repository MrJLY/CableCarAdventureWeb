import { Container, Graphics, Sprite } from 'pixi.js';
import { Art } from './art';
import { C } from './config';
import { groundY, Track, TrackPose } from './world';

const CABIN_R = 44;
/** 超出这个横向距离就不更新（省掉屏幕外的矢量重建） */
const CULL = 1600;

export interface CabinCtx {
  x: number;
  y: number;
  s: number;
}

interface Hazard {
  readonly view: Container;
  /** 障碍中心的世界 x，用于剔除 */
  readonly cx: number;
  update(dt: number, time: number, ctx: CabinCtx): void;
  hits(x: number, y: number): boolean;
}

/* ------------------------------------------------------------------ 摆锤铁球 */

class Hammer implements Hazard {
  readonly view = new Container();
  readonly cx: number;
  private readonly rope = new Graphics();
  private readonly ball: Sprite;
  private readonly ax: number;
  private readonly ay: number;
  private readonly len = 118;
  private readonly amp: number;
  private readonly omega: number;
  private readonly phase: number;
  private bx = 0;
  private by = 0;

  constructor(art: Art, pose: TrackPose, seed: number) {
    this.cx = pose.x;
    this.ax = pose.x;
    this.ay = pose.y;
    // 摆幅大：两端能把铁球甩到缆线附近，让出下方通道
    this.amp = 1.18 + seed * 0.14;
    this.omega = 1.1 + seed * 0.35;
    this.phase = seed * 6;

    const mount = new Graphics();
    mount.beginFill(C.towerBarDark).drawRoundedRect(this.ax - 15, this.ay - 9, 30, 18, 9).endFill();
    mount.beginFill(C.towerBase).drawRoundedRect(this.ax - 9, this.ay - 18, 18, 12, 6).endFill();
    mount.beginFill(0xffffff, 0.4).drawRoundedRect(this.ax - 12, this.ay - 6, 12, 4, 2).endFill();

    this.ball = new Sprite(art.hammerBall);
    this.ball.anchor.set(0.5);
    this.ball.position.set(this.ax, this.ay + this.len);
    this.view.addChild(mount, this.rope, this.ball);
  }

  update(_dt: number, time: number, ctx: CabinCtx): void {
    if (Math.abs(this.cx - ctx.x) > CULL) return;
    const th = this.amp * Math.sin(time * this.omega + this.phase);
    this.bx = this.ax + Math.sin(th) * this.len;
    this.by = this.ay + Math.cos(th) * this.len;
    this.rope.clear();
    this.rope.lineStyle(4, C.wire, 0.95);
    this.rope.moveTo(this.ax, this.ay).lineTo(this.bx, this.by);
    this.rope.lineStyle(0);
    this.ball.position.set(this.bx, this.by);
  }

  hits(x: number, y: number): boolean {
    return Math.hypot(x - this.bx, y - this.by) < 22 + CABIN_R;
  }
}

/* ------------------------------------------------------------------ 电弧闸门 */

class Gate implements Hazard {
  readonly view = new Container();
  readonly cx: number;
  private readonly arc = new Graphics();
  private readonly y0: number;
  private readonly y1: number;
  private readonly period = 3.2;
  private readonly onRatio = 0.58;
  private readonly phase: number;
  private active = false;

  constructor(pose: TrackPose, seed: number) {
    const x = pose.x;
    this.cx = x;
    this.y0 = pose.y + 72;
    this.y1 = pose.y + 310;
    this.phase = seed * this.period;

    const bar = new Graphics();
    bar.lineStyle(3, C.wire, 0.85);
    bar.moveTo(x, pose.y).lineTo(x, this.y0);
    bar.lineStyle(0);
    bar.beginFill(C.towerBarDark).drawRoundedRect(x - 10, this.y0, 20, this.y1 - this.y0, 10).endFill();
    bar.beginFill(C.towerBase).drawCircle(x, this.y0, 13).endFill();
    bar.beginFill(C.towerBase).drawCircle(x, this.y1, 13).endFill();
    bar.beginFill(0xffffff, 0.35).drawRoundedRect(x - 6, this.y0 + 14, 5, this.y1 - this.y0 - 28, 3).endFill();
    this.view.addChild(bar, this.arc);
  }

  update(_dt: number, time: number, ctx: CabinCtx): void {
    if (Math.abs(this.cx - ctx.x) > CULL) return;
    const t = ((time + this.phase) % this.period) / this.period;
    this.active = t < this.onRatio;

    this.arc.clear();
    if (!this.active) {
      this.arc.lineStyle(2, 0x9a8aa6, 0.35);
      this.arc.moveTo(this.cx, this.y0 + 12).lineTo(this.cx, this.y1 - 12);
      this.arc.lineStyle(0);
      return;
    }
    this.arc.lineStyle(5, 0x7fd8ff, 0.9);
    let y = this.y0 + 10;
    this.arc.moveTo(this.cx, y);
    let i = 0;
    while (y < this.y1 - 10) {
      y += 20;
      const jitter = (Math.random() - 0.5) * 22;
      this.arc.lineTo(this.cx + jitter, Math.min(y, this.y1 - 10));
      i += 1;
    }
    this.arc.lineStyle(0);
    if (i > 0) {
      this.arc.beginFill(0xffffff, 0.5).drawCircle(this.cx, this.y0, 7).endFill();
    }
  }

  hits(x: number, y: number): boolean {
    return this.active && Math.abs(x - this.cx) < 30 && y > this.y0 - 10 && y < this.y1 + 10;
  }
}

/* ------------------------------------------------------------------ 蒸汽喷口 */

class Vent implements Hazard {
  readonly view = new Container();
  readonly cx: number;
  private readonly jet = new Graphics();
  private readonly vy: number;
  private readonly h = 360;
  private readonly period = 3.6;
  private readonly phase: number;
  private blasting = false;
  private power = 0;

  constructor(art: Art, x: number, seed: number) {
    this.cx = x;
    this.vy = groundY(x);
    this.phase = seed * this.period;

    const nozzle = new Sprite(art.nozzle);
    nozzle.anchor.set(0.5, 1);
    nozzle.position.set(x, this.vy + 8);
    this.view.addChild(nozzle, this.jet);
  }

  update(_dt: number, time: number, ctx: CabinCtx): void {
    if (Math.abs(this.cx - ctx.x) > CULL) return;
    const t = (time + this.phase) % this.period;
    // 0~1.4 待机 / 1.4~2.0 预警 / 2.0~3.0 喷发
    this.blasting = t >= 2.0 && t < 3.0;
    this.power = t < 1.4 ? 0 : t < 2.0 ? (t - 1.4) / 0.6 * 0.45 : t < 3.0 ? 1 : Math.max(0, 1 - (t - 3.0) / 0.6);

    this.jet.clear();
    if (this.power <= 0.02) return;
    const height = this.h * this.power;
    const alpha = 0.25 + this.power * 0.5;
    this.jet.beginFill(0xd8f2ff, alpha);
    this.jet.drawRoundedRect(this.cx - 34, this.vy - height, 68, height, 26);
    this.jet.endFill();
    this.jet.beginFill(0xffffff, alpha * 0.85);
    this.jet.drawRoundedRect(this.cx - 18, this.vy - height + 10, 36, height - 16, 16);
    this.jet.endFill();
    this.jet.beginFill(0xbfe9ff, alpha * 0.9);
    for (let i = 0; i < 5; i++) {
      const fy = this.vy - height * (0.15 + i * 0.18);
      const r = 20 - i * 2.4;
      this.jet.drawCircle(this.cx + Math.sin(time * 9 + i) * 14, fy, r);
    }
    this.jet.endFill();
  }

  hits(x: number, y: number): boolean {
    return this.blasting && Math.abs(x - this.cx) < 44 && y < this.vy + 20 && y > this.vy - this.h;
  }
}

/* ------------------------------------------------------------------ 落石区 */

class RockZone implements Hazard {
  readonly view = new Container();
  readonly cx: number;
  private readonly rocks: { sprite: Sprite; x: number; phase: number }[] = [];
  private readonly len: number;
  private readonly fallTime = 1.35;

  constructor(art: Art, x: number, seed: number) {
    this.cx = x;
    const top = -80;
    const bottom = groundY(x) + 60;
    this.len = bottom - top;

    for (let i = 0; i < 2; i++) {
      const rx = x - 70 + i * 140;
      const sprite = new Sprite(art.rock);
      sprite.anchor.set(0.5);
      sprite.position.set(rx, -80);
      this.rocks.push({ sprite, x: rx, phase: seed * 2 + (i === 1 ? 0.5 : 0) });
      this.view.addChild(sprite);
    }
  }

  update(_dt: number, time: number, ctx: CabinCtx): void {
    if (Math.abs(this.cx - ctx.x) > CULL) return;
    for (const r of this.rocks) {
      const t = ((time + r.phase) % this.fallTime) / this.fallTime;
      r.sprite.y = -80 + this.len * t * t;
      r.sprite.rotation = t * 0.6;
    }
  }

  hits(x: number, y: number): boolean {
    for (const r of this.rocks) {
      if (r.sprite.y < -20) continue;
      if (Math.hypot(x - r.x, y - r.sprite.y) < 24 + CABIN_R) return true;
    }
    return false;
  }
}

/* ------------------------------------------------------------------ 蜂群追击 */

class Swarm {
  readonly view = new Container();
  private readonly track: Track;
  private readonly sprites: Sprite[] = [];
  private pos = 0;
  private active = false;
  private px = 0;
  private py = 0;
  private readonly speed = 470;

  constructor(art: Art, track: Track) {
    this.track = track;
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(art.swarm);
      s.anchor.set(0.5);
      s.scale.set(0.72 - i * 0.13);
      this.sprites.push(s);
      this.view.addChild(s);
    }
    this.view.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  get arcPos(): number {
    return this.pos;
  }

  start(atS: number): void {
    this.pos = atS;
    this.active = true;
    this.view.visible = true;
  }

  stop(): void {
    this.active = false;
    this.view.visible = false;
  }

  update(dt: number, time: number): void {
    if (!this.active) return;
    this.pos += this.speed * dt;
    const p = this.track.poseAt(this.pos);
    this.px = p.x;
    this.py = p.y + 150;
    this.view.position.set(p.x, this.py);
    this.sprites.forEach((sp, i) => {
      sp.position.set(Math.sin(time * 7 + i * 2.1) * 24, Math.cos(time * 6 + i * 1.7) * 16);
      sp.rotation = Math.sin(time * 5 + i) * 0.25;
    });
  }

  hits(x: number, y: number): boolean {
    return this.active && Math.hypot(x - this.px, y - this.py) < 96;
  }
}

/* ------------------------------------------------------------------ 区域 */

type ZoneKind = 'ice' | 'wind' | 'fog';

interface Zone {
  kind: ZoneKind;
  s0: number;
  s1: number;
  power: number;
}

function buildIce(x0: number, x1: number): Graphics {
  const g = new Graphics();
  const step = 16;
  g.beginFill(0xd6f2ff, 0.8);
  g.moveTo(x0, groundY(x0) - 4);
  for (let x = x0; x <= x1; x += step) g.lineTo(x, groundY(x) - 4);
  for (let x = x1; x >= x0; x -= step) g.lineTo(x, groundY(x) + 96);
  g.closePath();
  g.endFill();
  g.beginFill(0xffffff, 0.32);
  g.moveTo(x0, groundY(x0) - 4);
  for (let x = x0; x <= x1; x += step) g.lineTo(x, groundY(x) - 4);
  for (let x = x1; x >= x0; x -= step) g.lineTo(x, groundY(x) + 34);
  g.closePath();
  g.endFill();
  g.beginFill(0xffffff, 0.95);
  for (let x = x0 + 26; x < x1; x += 92) {
    g.drawPolygon([x, groundY(x) + 2, x + 14, groundY(x) - 22, x + 28, groundY(x) + 2]);
  }
  g.endFill();
  return g;
}

function buildWind(x0: number, x1: number, dir: 1 | -1): Graphics {
  const g = new Graphics();
  g.lineStyle(5, 0x8fcbef, 0.75);
  for (let y = 190; y < 620; y += 92) {
    for (let x = x0; x < x1; x += 190) {
      g.moveTo(x, y).lineTo(x + 78 * dir, y);
    }
  }
  g.lineStyle(4, 0xffffff, 0.7);
  for (let y = 236; y < 620; y += 92) {
    for (let x = x0 + 80; x < x1; x += 190) {
      g.moveTo(x, y).lineTo(x + 54 * dir, y);
    }
  }
  g.lineStyle(0);
  return g;
}

function buildFog(art: Art, x0: number, x1: number): Container {
  const c = new Container();
  const span = x1 - x0;
  const n = Math.max(8, Math.ceil(span / 95));
  for (let i = 0; i <= n; i++) {
    const s = new Sprite(art.clouds[0]);
    s.anchor.set(0.5);
    s.tint = 0xf4fbff;
    s.alpha = 0.26 + ((i * 7) % 5) * 0.03;
    s.scale.set(1.1 + ((i * 13) % 7) * 0.14);
    s.position.set(x0 - 60 + (i / n) * (span + 120), 60 + ((i * 97) % 11) * 38);
    c.addChild(s);
  }
  return c;
}

/* ------------------------------------------------------------------ 管理器 */

export class Obstacles {
  readonly below = new Container();
  readonly above = new Container();

  private readonly items: Hazard[] = [];
  private readonly zones: Zone[] = [];
  private readonly swarm: Swarm;
  private readonly swarmFrom: number;
  private readonly swarmTo: number;
  private swarmSpent = false;

  constructor(art: Art, track: Track) {
    const atFree = (f: number): number => track.atFree(f);

    const layout: [number, 'hammer' | 'gate' | 'vent' | 'rock', number][] = [
      [0.05, 'hammer', 0.2],
      [0.13, 'gate', 0.3],
      [0.235, 'vent', 0.1],
      [0.33, 'rock', 0.4],
      [0.42, 'hammer', 0.6],
      [0.52, 'gate', 0.75],
      [0.62, 'vent', 0.45],
      [0.72, 'rock', 0.8],
      [0.83, 'hammer', 0.35],
      [0.95, 'hammer', 0.5],
    ];

    for (const [f, kind, seed] of layout) {
      const pose = track.poseAt(atFree(f));
      let h: Hazard;
      if (kind === 'hammer') h = new Hammer(art, pose, seed);
      else if (kind === 'gate') h = new Gate(pose, seed);
      else if (kind === 'vent') h = new Vent(art, pose.x, seed);
      else h = new RockZone(art, pose.x, seed);
      this.items.push(h);
      this.below.addChild(h.view);
    }

    this.addZone('fog', atFree(0.165), atFree(0.2), 0, track, art);
    this.addZone('ice', atFree(0.56), atFree(0.6), 0, track, art);
    this.addZone('wind', atFree(0.64), atFree(0.675), 300, track, art);
    this.addZone('wind', atFree(0.78), atFree(0.81), -320, track, art);

    this.swarm = new Swarm(art, track);
    this.below.addChild(this.swarm.view);
    this.swarmFrom = atFree(0.875);
    this.swarmTo = atFree(0.94);
  }

  private addZone(
    kind: ZoneKind,
    s0: number,
    s1: number,
    power: number,
    track: Track,
    art: Art,
  ): void {
    this.zones.push({ kind, s0, s1, power });

    let x0 = Infinity;
    let x1 = -Infinity;
    for (let i = 0; i <= 24; i++) {
      const p = track.poseAt(s0 + ((s1 - s0) * i) / 24);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
    }

    if (kind === 'fog') this.above.addChild(buildFog(art, x0, x1));
    else if (kind === 'ice') this.below.addChild(buildIce(x0, x1));
    else this.below.addChild(buildWind(x0, x1, power > 0 ? 1 : -1));
  }

  /** 当前弧长处的地面摩擦力系数与风力 */
  effects(s: number): { grip: number; wind: number } {
    let grip = 1;
    let wind = 0;
    for (const z of this.zones) {
      if (s < z.s0 || s > z.s1) continue;
      if (z.kind === 'ice') grip *= 0.3;
      else if (z.kind === 'wind') wind += z.power;
    }
    return { grip, wind };
  }

  update(dt: number, time: number, ctx: CabinCtx): void {
    for (const h of this.items) {
      const near = Math.abs(h.cx - ctx.x) <= CULL;
      h.view.visible = near;
      if (near) h.update(dt, time, ctx);
    }

    if (!this.swarm.isActive) {
      if (ctx.s > this.swarmTo || ctx.s < this.swarmFrom) this.swarmSpent = false;
      else if (!this.swarmSpent) this.swarm.start(this.swarmFrom - 300);
    } else {
      this.swarm.update(dt, time);
      if (ctx.s > this.swarmTo || ctx.s - this.swarm.arcPos > 560) {
        this.swarm.stop();
        this.swarmSpent = true;
      }
    }
  }

  hits(x: number, y: number): boolean {
    if (this.swarm.hits(x, y)) return true;
    for (const h of this.items) {
      if (h.hits(x, y)) return true;
    }
    return false;
  }

  reset(): void {
    this.swarm.stop();
    this.swarmSpent = false;
  }
}
