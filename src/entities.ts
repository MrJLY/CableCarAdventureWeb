import { Container, Graphics, Sprite } from 'pixi.js';
import { Art } from './art';
import { C, PHYS, SIZE } from './config';
import { Track } from './world';

export interface InputState {
  /** 减速 */
  left: boolean;
  /** 加速 */
  right: boolean;
}

export interface CabinMods {
  /** 地面摩擦系数（冰面 < 1） */
  grip: number;
  /** 区域风力 */
  wind: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 玩家：轮架沿缆线弧长前进，车厢始终垂直悬挂。
 * 右键加速、左键先减速再反向后退。
 */
export class Cabin {
  readonly display = new Container();

  private readonly track: Track;
  private readonly trolley: Sprite;
  private readonly rope = new Graphics();
  private readonly auraRing = new Graphics();
  private readonly cabinAnchor = new Container();
  private readonly cabin: Sprite;

  /** 轮架沿轨道的弧长位置 */
  s = 0;
  /** 沿轨道方向的速度 */
  vs = 0;
  /** >0 时无敌（受击闪烁） */
  invulnerable = 0;
  /** >0 时显示护盾光环（剩余秒数） */
  aura = 0;

  private posX = 0;
  private posY = 0;

  constructor(art: Art, track: Track) {
    this.track = track;
    this.trolley = new Sprite(art.trolley);
    this.trolley.anchor.set(0.5, 0);
    this.cabin = new Sprite(art.cabin);
    this.cabin.anchor.set(0.5, 0);
    this.cabinAnchor.addChild(this.cabin);
    this.display.addChild(this.auraRing, this.trolley, this.rope, this.cabinAnchor);
    this.sync();
  }

  /** 轮架的 x（世界坐标） */
  get x(): number {
    return this.posX;
  }

  get pivotY(): number {
    return this.posY;
  }

  get hookY(): number {
    return this.posY + PHYS.ropeLength;
  }

  /** 车厢中心（碰撞判定点） */
  get bodyX(): number {
    return this.posX;
  }

  get bodyY(): number {
    return this.hookY + SIZE.cabinCenterOffset;
  }

  get speed(): number {
    return Math.abs(this.vs);
  }

  update(dt: number, input: InputState, mods: CabinMods): void {
    if (input.right) this.vs += PHYS.accel * dt;
    if (input.left) this.vs -= PHYS.brake * mods.grip * dt;
    if (mods.wind !== 0) this.vs += mods.wind * dt;

    this.vs *= Math.exp(-PHYS.drag * mods.grip * dt);
    this.vs = clamp(this.vs, -PHYS.maxSpeed, PHYS.maxSpeed);
    this.s = clamp(this.s + this.vs * dt, 0, this.track.total);

    if (this.s <= 0) this.vs = Math.max(this.vs, 0);
    else if (this.s >= this.track.total) this.vs = Math.min(this.vs, 0);

    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.aura > 0) this.aura = Math.max(0, this.aura - dt);
    this.sync();
  }

  private sync(): void {
    const p = this.track.poseAt(this.s);
    this.posX = p.x;
    this.posY = p.y;
    this.trolley.position.set(p.x, p.y - 20);

    this.rope.clear();
    this.rope.lineStyle(5, C.wire, 0.95);
    this.rope.moveTo(p.x, p.y);
    this.rope.lineTo(p.x, this.hookY);
    this.rope.lineStyle(0);

    this.cabinAnchor.position.set(p.x, this.hookY);
    this.cabin.alpha = this.invulnerable > 0 ? (Math.floor(this.invulnerable * 12) % 2 ? 0.35 : 1) : 1;

    this.auraRing.clear();
    if (this.aura > 0) {
      const r = 62 + Math.sin(this.aura * 14) * 5;
      const cy = this.bodyY;
      this.auraRing.beginFill(0x7fd8ff, 0.16).drawCircle(this.posX, cy, r).endFill();
      this.auraRing.lineStyle(4, 0x9fe6ff, 0.8).drawCircle(this.posX, cy, r).lineStyle(0);
      this.auraRing.beginFill(0xffffff, 0.35).drawCircle(this.posX, cy, r * 0.55).endFill();
    }
  }

  resetTo(s: number): void {
    this.s = clamp(s, 0, this.track.total);
    this.vs = 0;
    this.invulnerable = 1.4;
    this.aura = 0;
    this.sync();
  }
}

export class Coin {
  readonly sprite: Sprite;
  collected = false;
  private readonly baseY: number;
  private readonly phase: number;

  constructor(art: Art, x: number, y: number, phase: number) {
    this.sprite = new Sprite(art.coin);
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(x, y);
    this.baseY = y;
    this.phase = phase;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(time: number): void {
    if (this.collected) return;
    this.sprite.y = this.baseY + Math.sin(time * 3 + this.phase) * 7;
    this.sprite.rotation = Math.sin(time * 2 + this.phase) * 0.15;
  }

  collect(): void {
    this.collected = true;
    this.sprite.visible = false;
  }

  reset(): void {
    this.collected = false;
    this.sprite.visible = true;
  }
}

export class Eagle {
  readonly sprite: Sprite;
  private readonly art: Art;
  private readonly cx: number;
  private readonly range: number;
  private readonly baseY: number;
  private readonly phase: number;
  private readonly speed: number;

  constructor(art: Art, cx: number, range: number, baseY: number, phase: number, speed: number) {
    this.art = art;
    this.cx = cx;
    this.range = range;
    this.baseY = baseY;
    this.phase = phase;
    this.speed = speed;
    this.sprite = new Sprite(art.eagleWingUp);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.85);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(time: number): void {
    const t = time * this.speed + this.phase;
    this.sprite.x = this.cx + Math.sin(t) * this.range;
    this.sprite.y = this.baseY + Math.sin(t * 1.7 + 1) * 34;
    this.sprite.scale.x = Math.cos(t) >= 0 ? 0.85 : -0.85;
    this.sprite.texture =
      Math.floor(time * 4 + this.phase) % 2 === 0 ? this.art.eagleWingUp : this.art.eagleWingDown;
  }
}
