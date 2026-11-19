import { Application, Container, Sprite } from 'pixi.js';
import { Art, buildArt } from './art';
import { C, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_LIVES, PICKUP, SIZE, WORLD_LENGTH } from './config';
import { Cabin, Coin, Eagle, InputState } from './entities';
import { Obstacles } from './hazards';
import { Pickups } from './pickups';
import { Hud } from './ui';
import { World, groundY } from './world';

/** 出生点：沿轨道的弧长，避开起点的塔架 */
const SPAWN_S = 170;

export interface GameOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution: number;
}

type State = 'ready' | 'playing' | 'paused' | 'over' | 'win';

interface Spark {
  sprite: Sprite;
  life: number;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  readonly app: Application;
  private readonly art: Art;
  private readonly root = new Container();
  private readonly world: World;
  private readonly obstacles: Obstacles;
  private readonly pickups: Pickups;
  private readonly hud: Hud;
  private readonly cabin: Cabin;

  private coins: Coin[] = [];
  private eagles: Eagle[] = [];
  private sparks: Spark[] = [];

  private state: State = 'ready';
  private lives = MAX_LIVES;
  private score = 0;
  private elapsed = 0;
  private cameraX = 0;
  private shieldTime = 0;
  private magnetTime = 0;
  private keys = { left: false, right: false };
  private readonly input: InputState = { left: false, right: false };

  constructor(options: GameOptions) {
    this.app = new Application({
      view: options.canvas,
      width: options.width,
      height: options.height,
      backgroundColor: C.skyTop,
      antialias: true,
      resolution: options.resolution,
      autoDensity: options.resolution !== 1,
      powerPreference: 'high-performance',
    });

    this.art = buildArt(this.app.renderer);
    this.world = new World(this.art);
    this.obstacles = new Obstacles(this.art, this.world.track);
    this.pickups = new Pickups(this.art, this.world.track);
    this.hud = new Hud(this.art);
    this.cabin = new Cabin(this.art, this.world.track);

    this.root.addChild(
      this.world.sky,
      this.world.farLayer,
      this.world.midLayer,
      this.world.farCloudLayer,
      this.world.nearCloudLayer,
      this.world.terrainLayer,
      this.world.trackLayer,
      this.obstacles.below,
      this.pickups.layer,
      this.world.actorLayer,
      this.obstacles.above,
      this.hud.root,
    );
    this.app.stage.addChild(this.root);

    this.spawnLevel();
    this.world.actorLayer.addChild(this.cabin.display);
    this.cabin.resetTo(SPAWN_S);
    this.cabin.invulnerable = 0;
    this.snapCamera();

    this.hud.onPause = () => this.togglePause();
    this.hud.onOverlayTap = () => this.onOverlayTap();
    this.hud.setLives(this.lives);
    this.hud.setCoins(this.score);
    this.hud.showOverlay('缆 车 大 冒 险', '轻触屏幕开始');

    this.bindInput();
    this.resize(options.width, options.height);
    this.app.ticker.add(this.onTick);
  }

  // ---------------------------------------------------------------- 关卡

  private spawnLevel(): void {
    const rand = rng(20261118);
    const track = this.world.track;
    this.coins = [];
    this.eagles = [];

    for (let s = 420; s < track.total - 240; s += 175 + rand() * 95) {
      const p = track.poseAt(s);
      const y = p.y + 165 + Math.sin(s * 0.005) * 45;
      const coin = new Coin(this.art, p.x, y, rand() * Math.PI * 2);
      this.coins.push(coin);
      this.world.actorLayer.addChild(coin.sprite);
    }

    for (let f = 0.09; f < 0.99; f += 0.045 + rand() * 0.03) {
      const s = track.total * f;
      if (track.loops.some((L) => s > L.s0 - 520 && s < L.s1 + 520)) continue;
      const p = track.poseAt(s);
      const eagle = new Eagle(
        this.art,
        p.x,
        80 + rand() * 150,
        p.y + 140 + rand() * 80,
        rand() * Math.PI * 2,
        0.32 + rand() * 0.36,
      );
      this.eagles.push(eagle);
      this.world.actorLayer.addChild(eagle.sprite);
    }
  }

  private resetRun(): void {
    this.lives = MAX_LIVES;
    this.score = 0;
    this.elapsed = 0;
    this.cameraX = 0;
    this.shieldTime = 0;
    this.magnetTime = 0;
    this.hud.setLives(this.lives);
    this.hud.setCoins(this.score);
    this.hud.updateEffects(0, 0);
    this.coins.forEach((c) => c.reset());
    this.cabin.resetTo(SPAWN_S);
    this.obstacles.reset();
    this.pickups.reset();
    for (const s of this.sparks) s.sprite.destroy();
    this.sparks = [];
    this.world.update(0);
    this.snapCamera();
  }

  // ---------------------------------------------------------------- 输入

  private bindInput(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const setKey = (code: string, down: boolean): boolean => {
      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.keys.left = down;
          return true;
        case 'ArrowRight':
        case 'KeyD':
          this.keys.right = down;
          return true;
        default:
          return false;
      }
    };

    window.addEventListener('keydown', (e) => {
      if (setKey(e.code, true)) e.preventDefault();
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.state !== 'ready') this.togglePause();
      if (e.code === 'Enter' && (this.state === 'ready' || this.state === 'over' || this.state === 'win')) {
        this.onOverlayTap();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (setKey(e.code, false)) e.preventDefault();
    });
    window.addEventListener('blur', () => {
      this.keys.left = this.keys.right = false;
      this.hud.releaseAll();
    });
  }

  // ---------------------------------------------------------------- 主循环

  private onTick = (delta: number): void => {
    const dt = Math.min(delta / 60, 0.05);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
    this.render();
  };

  private step(dt: number): void {
    this.elapsed += dt;

    if (this.state === 'playing') {
      this.input.left = this.keys.left || this.hud.input.left;
      this.input.right = this.keys.right || this.hud.input.right;

      this.shieldTime = Math.max(0, this.shieldTime - dt);
      this.magnetTime = Math.max(0, this.magnetTime - dt);
      this.cabin.aura = this.shieldTime;
      this.hud.updateEffects(this.shieldTime / PICKUP.shield, this.magnetTime / PICKUP.magnet);

      const fx = this.obstacles.effects(this.cabin.s);
      this.cabin.update(dt, this.input, { grip: fx.grip, wind: fx.wind });
      this.obstacles.update(dt, this.elapsed, this.cabinCtx());
      this.pickups.update(this.elapsed);
      this.checkSafety();
      this.updateEntities();
      this.checkCollisions();
      this.checkPickups();
    } else if (this.state === 'paused' || this.state === 'ready') {
      this.hud.releaseAll();
      this.obstacles.update(dt, this.elapsed, this.cabinCtx());
      this.pickups.update(this.elapsed);
    } else {
      this.updateEntities();
      this.obstacles.update(dt, this.elapsed, this.cabinCtx());
      this.pickups.update(this.elapsed);
    }

    for (const eagle of this.eagles) eagle.update(this.elapsed);
    this.updateSparks(dt);
  }

  private updateEntities(): void {
    for (const coin of this.coins) coin.update(this.elapsed);
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.sprite.scale.set(0.5 + (1 - s.life) * 1.4);
      s.sprite.alpha = Math.max(0, s.life);
      if (s.life <= 0) {
        s.sprite.destroy();
        this.sparks.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- 规则

  private checkSafety(): void {
    if (this.cabin.s >= this.world.track.total - 40) {
      this.win();
    }
  }

  private cabinCtx(): { x: number; y: number; s: number } {
    return { x: this.cabin.bodyX, y: this.cabin.bodyY, s: this.cabin.s };
  }

  private checkCollisions(): void {
    const bx = this.cabin.bodyX;
    const by = this.cabin.bodyY;

    // 地形
    if (by + SIZE.cabinRadius > groundY(bx)) {
      this.crash();
      return;
    }

    // 障碍物（摆锤 / 闸门 / 蒸汽 / 落石 / 蜂群）
    if (this.obstacles.hits(bx, by)) {
      this.crash();
      return;
    }

    // 秃鹫
    for (const eagle of this.eagles) {
      const dx = eagle.x - bx;
      const dy = eagle.y - by;
      if (dx * dx + dy * dy < (SIZE.eagleRadius + 26) ** 2) {
        this.crash();
        return;
      }
    }

    // 金币
    const pickR = this.magnetTime > 0 ? PICKUP.magnetRadius : 62;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const dx = coin.x - bx;
      const dy = coin.y - by;
      if (dx * dx + dy * dy < pickR * pickR) {
        coin.collect();
        this.score += 1;
        this.hud.setCoins(this.score);
        this.spawnSpark(coin.x, coin.y);
      }
    }
  }

  private checkPickups(): void {
    const kind = this.pickups.collect(this.cabin.bodyX, this.cabin.bodyY, 50);
    if (!kind) return;

    switch (kind) {
      case 'shield':
        this.shieldTime = PICKUP.shield;
        this.cabin.aura = PICKUP.shield;
        break;
      case 'magnet':
        this.magnetTime = PICKUP.magnet;
        break;
      case 'life':
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.hud.setLives(this.lives);
        break;
    }
    this.spawnSpark(this.cabin.bodyX, this.cabin.bodyY);
  }

  private spawnSpark(x: number, y: number): void {
    const sprite = new Sprite(this.art.spark);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = C.coinLight;
    this.world.actorLayer.addChild(sprite);
    this.sparks.push({ sprite, life: 0.35 });
  }

  private crash(): void {
    if (this.shieldTime > 0) return;
    if (this.cabin.invulnerable > 0) return;
    this.lives -= 1;
    this.hud.setLives(this.lives);
    if (this.lives <= 0) {
      this.state = 'over';
      this.hud.showOverlay('旅 程 结 束', `收集金币 ${this.score}  ·  轻触重新开始`);
      return;
    }
    // 只扣血，不弹回：给一段无敌时间让车继续往前开过障碍
    this.cabin.invulnerable = 1.4;
  }

  private win(): void {
    if (this.state !== 'playing') return;
    this.state = 'win';
    this.hud.showOverlay('抵 达 终 点 !', `一共收集了 ${this.score} 枚金币  ·  轻触再来一次`);
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showOverlay('已 暂 停', '轻触继续');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hideOverlay();
    }
  }

  private onOverlayTap(): void {
    if (this.state === 'ready') {
      this.state = 'playing';
      this.hud.hideOverlay();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hideOverlay();
    } else if (this.state === 'over' || this.state === 'win') {
      this.resetRun();
      this.state = 'playing';
      this.hud.hideOverlay();
    }
  }

  // ---------------------------------------------------------------- 渲染

  private render(): void {
    const target = Math.max(
      0,
      Math.min(WORLD_LENGTH - DESIGN_WIDTH, this.cabin.x - DESIGN_WIDTH * 0.34),
    );
    this.cameraX += (target - this.cameraX) * 0.14;
    this.world.update(this.cameraX);
    this.obstacles.below.x = -this.cameraX;
    this.obstacles.above.x = -this.cameraX;
    this.pickups.layer.x = -this.cameraX;
  }

  /** 复活 / 重开时相机直接对准，避免长距离平移 */
  private snapCamera(): void {
    this.cameraX = Math.max(
      0,
      Math.min(WORLD_LENGTH - DESIGN_WIDTH, this.cabin.x - DESIGN_WIDTH * 0.34),
    );
    this.world.update(this.cameraX);
    this.obstacles.below.x = -this.cameraX;
    this.obstacles.above.x = -this.cameraX;
    this.pickups.layer.x = -this.cameraX;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.root.scale.set(scale);
    this.root.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.app.destroy(true, { children: true });
  }
}
