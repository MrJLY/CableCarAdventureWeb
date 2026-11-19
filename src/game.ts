import { Application, Container, Sprite } from 'pixi.js';
import { Art, buildArt } from './art';
import { Sfx } from './audio';
import { C, DESIGN_HEIGHT, DESIGN_WIDTH, PICKUP, SIZE } from './config';
import { Cabin, Coin, Eagle, InputState } from './entities';
import { Obstacles } from './hazards';
import { LEVELS } from './levels';
import { PickupKind, Pickups } from './pickups';
import { Hud } from './ui';
import { Level, World } from './world';

/** 出生点：沿轨道的弧长，避开起点的塔架 */
const SPAWN_S = 170;

export interface GameOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution: number;
}

type State = 'ready' | 'playing' | 'paused' | 'over' | 'clear' | 'win';

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
  private readonly hud: Hud;
  private readonly sfx = new Sfx();

  /** 关卡内容都挂在 stage 下，切关时整体销毁重建 */
  private stage = new Container();
  private level!: Level;
  private world!: World;
  private obstacles!: Obstacles;
  private pickups!: Pickups;
  private cabin!: Cabin;

  private coins: Coin[] = [];
  private eagles: Eagle[] = [];
  private sparks: Spark[] = [];

  private levelIndex = 0;
  private levelStartScore = 0;
  private state: State = 'ready';
  private lives = 3;
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
    this.hud = new Hud(this.art);

    this.root.addChild(this.stage, this.hud.root);
    this.app.stage.addChild(this.root);

    this.hud.onPause = () => this.togglePause();
    this.hud.onOverlayTap = () => this.onOverlayTap();
    this.hud.onToggleSound = () => {
      this.sfx.setEnabled(this.sfx.muted);
      this.hud.setMuted(this.sfx.muted);
      this.sfx.resume();
    };

    this.loadLevel(0);
    this.hud.showOverlay(LEVELS[0].name, '轻触屏幕开始');

    this.bindInput();
    this.resize(options.width, options.height);
    this.app.ticker.add(this.onTick);
  }

  // ---------------------------------------------------------------- 关卡装载

  private loadLevel(index: number): void {
    this.levelIndex = index;
    const def = LEVELS[index];
    this.level = new Level(def);
    this.levelStartScore = this.score;

    this.stage.destroy({ children: true });
    this.stage = new Container();
    this.root.addChildAt(this.stage, 0);

    this.world = new World(this.art, this.level);
    this.obstacles = new Obstacles(this.art, this.level);
    this.pickups = new Pickups(this.art, this.level);
    this.cabin = new Cabin(this.art, this.level.track);

    this.stage.addChild(
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
    );

    this.spawnEntities();
    this.world.actorLayer.addChild(this.cabin.display);

    this.lives = def.lives;
    this.hud.setMaxLives(def.lives);
    this.hud.setLives(this.lives);
    this.hud.setCoins(this.score);
    this.hud.updateEffects(0, 0);

    this.resetLevelState();
  }

  private resetLevelState(): void {
    this.elapsed = 0;
    this.cameraX = 0;
    this.shieldTime = 0;
    this.magnetTime = 0;
    this.score = this.levelStartScore;
    this.hud.setCoins(this.score);
    this.hud.updateEffects(0, 0);
    this.coins.forEach((c) => c.reset());
    this.pickups.reset();
    this.obstacles.reset();
    this.cabin.resetTo(SPAWN_S);
    this.cabin.invulnerable = 0;
    for (const s of this.sparks) s.sprite.destroy();
    this.sparks = [];
    this.snapCamera();
  }

  private startLevel(index: number): void {
    this.loadLevel(index);
    this.state = 'playing';
    this.hud.hideOverlay();
  }

  private restartLevel(): void {
    this.lives = this.level.def.lives;
    this.hud.setLives(this.lives);
    this.resetLevelState();
    this.state = 'playing';
    this.hud.hideOverlay();
  }

  private spawnEntities(): void {
    const rand = rng(20261118);
    const track = this.level.track;
    this.coins = [];
    this.eagles = [];

    for (let s = 420; s < track.total - 240; s += 175 + rand() * 95) {
      const p = track.poseAt(s);
      const coin = new Coin(this.art, p.x, p.y + 165 + Math.sin(s * 0.005) * 45, rand() * Math.PI * 2);
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

  // ---------------------------------------------------------------- 输入

  private bindInput(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    // 首次交互时解锁音频上下文
    const unlock = (): void => this.sfx.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

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
      if (e.code === 'Enter' && this.state !== 'playing') this.onOverlayTap();
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
    const ctx = this.cabinCtx();

    if (this.state === 'playing') {
      this.input.left = this.keys.left || this.hud.input.left;
      this.input.right = this.keys.right || this.hud.input.right;

      this.shieldTime = Math.max(0, this.shieldTime - dt);
      this.magnetTime = Math.max(0, this.magnetTime - dt);
      this.cabin.aura = this.shieldTime;
      this.hud.updateEffects(this.shieldTime / PICKUP.shield, this.magnetTime / PICKUP.magnet);

      const fx = this.obstacles.effects(this.cabin.s);
      this.cabin.update(dt, this.input, { grip: fx.grip, wind: fx.wind });
      this.obstacles.update(dt, this.elapsed, ctx);
      this.pickups.update(this.elapsed);
      this.checkSafety();
      this.updateEntities();
      this.checkCollisions();
      this.checkPickups();
    } else if (this.state === 'paused' || this.state === 'ready') {
      this.hud.releaseAll();
      this.obstacles.update(dt, this.elapsed, ctx);
      this.pickups.update(this.elapsed);
    } else {
      this.updateEntities();
      this.obstacles.update(dt, this.elapsed, ctx);
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
    if (this.cabin.s >= this.level.track.total - 40) {
      this.clearLevel();
    }
  }

  private cabinCtx(): { x: number; y: number; s: number } {
    return { x: this.cabin.bodyX, y: this.cabin.bodyY, s: this.cabin.s };
  }

  private checkCollisions(): void {
    const bx = this.cabin.bodyX;
    const by = this.cabin.bodyY;

    // 地形
    if (by + SIZE.cabinRadius > this.level.groundY(bx)) {
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
        this.sfx.coin();
      }
    }
  }

  private checkPickups(): void {
    const kind = this.pickups.collect(this.cabin.bodyX, this.cabin.bodyY, 50);
    if (!kind) return;

    this.applyPickup(kind);
    this.spawnSpark(this.cabin.bodyX, this.cabin.bodyY);
    this.sfx.pickup(kind);
  }

  private applyPickup(kind: PickupKind): void {
    switch (kind) {
      case 'shield':
        this.shieldTime = PICKUP.shield;
        this.cabin.aura = PICKUP.shield;
        break;
      case 'magnet':
        this.magnetTime = PICKUP.magnet;
        break;
      case 'life':
        this.lives = Math.min(this.level.def.lives, this.lives + 1);
        this.hud.setLives(this.lives);
        break;
    }
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
    this.sfx.crash();
    if (this.lives <= 0) {
      this.state = 'over';
      this.sfx.over();
      this.hud.showOverlay('缆 绳 断 了', `收集金币 ${this.score}  ·  轻触重试本关`);
      return;
    }
    // 只扣血，不弹回：给一段无敌时间让车继续往前开过障碍
    this.cabin.invulnerable = 1.4;
  }

  private clearLevel(): void {
    if (this.state !== 'playing') return;
    this.sfx.clear();
    if (this.levelIndex + 1 < LEVELS.length) {
      this.state = 'clear';
      const next = LEVELS[this.levelIndex + 1].name;
      this.hud.showOverlay('本 关 通 过 !', `金币 ${this.score}  ·  轻触进入 ${next}`);
    } else {
      this.state = 'win';
      this.hud.showOverlay('全 部 通 关 !', `共收集 ${this.score} 枚金币  ·  轻触从头再来`);
    }
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
    switch (this.state) {
      case 'ready':
        this.state = 'playing';
        this.hud.hideOverlay();
        break;
      case 'paused':
        this.state = 'playing';
        this.hud.hideOverlay();
        break;
      case 'over':
        this.restartLevel();
        break;
      case 'clear':
        this.startLevel(this.levelIndex + 1);
        break;
      case 'win':
        this.score = 0;
        this.startLevel(0);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- 渲染

  private render(): void {
    const target = Math.max(
      0,
      Math.min(this.level.width - DESIGN_WIDTH, this.cabin.x - DESIGN_WIDTH * 0.34),
    );
    this.cameraX += (target - this.cameraX) * 0.14;
    this.world.update(this.cameraX);
    this.obstacles.below.x = -this.cameraX;
    this.obstacles.above.x = -this.cameraX;
    this.pickups.layer.x = -this.cameraX;
  }

  /** 换关 / 重开时相机直接对准，避免长距离平移 */
  private snapCamera(): void {
    this.cameraX = Math.max(
      0,
      Math.min(this.level.width - DESIGN_WIDTH, this.cabin.x - DESIGN_WIDTH * 0.34),
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
