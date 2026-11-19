import { Container, Sprite } from 'pixi.js';
import { Art } from './art';
import { Track } from './world';

export type PickupKind = 'shield' | 'life' | 'magnet';

/** 抽取池：护盾最常见，加命最稀有 */
const POOL: PickupKind[] = ['shield', 'magnet', 'shield', 'life'];

interface Pickup {
  kind: PickupKind;
  sprite: Sprite;
  baseY: number;
  phase: number;
  taken: boolean;
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

export class Pickups {
  readonly layer = new Container();
  private readonly items: Pickup[] = [];

  constructor(art: Art, track: Track) {
    const rand = mulberry32(77123);
    const tex: Record<PickupKind, Sprite['texture']> = {
      shield: art.pickupShield,
      life: art.pickupLife,
      magnet: art.pickupMagnet,
    };

    for (let i = 0; i < 9; i++) {
      const s = track.atFree(0.09 + i * 0.098 + rand() * 0.03);
      const p = track.poseAt(s);
      const kind = POOL[Math.floor(rand() * POOL.length)];
      const sprite = new Sprite(tex[kind]);
      sprite.anchor.set(0.5);
      sprite.position.set(p.x, p.y + 168);
      sprite.scale.set(0.86);
      this.layer.addChild(sprite);
      this.items.push({ kind, sprite, baseY: p.y + 168, phase: rand() * Math.PI * 2, taken: false });
    }
  }

  update(time: number): void {
    for (const it of this.items) {
      if (it.taken) continue;
      it.sprite.y = it.baseY + Math.sin(time * 2.6 + it.phase) * 8;
      it.sprite.rotation = Math.sin(time * 1.8 + it.phase) * 0.12;
    }
  }

  /** 命中则返回道具类型 */
  collect(x: number, y: number, radius: number): PickupKind | null {
    for (const it of this.items) {
      if (it.taken) continue;
      const dx = it.sprite.x - x;
      const dy = it.sprite.y - y;
      if (dx * dx + dy * dy > radius * radius) continue;
      it.taken = true;
      it.sprite.visible = false;
      return it.kind;
    }
    return null;
  }

  reset(): void {
    for (const it of this.items) {
      it.taken = false;
      it.sprite.visible = true;
    }
  }
}
