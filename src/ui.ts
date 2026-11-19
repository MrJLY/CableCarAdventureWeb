import { Circle, Container, Graphics, Rectangle, Sprite, Text, TextStyle } from 'pixi.js';
import { Art } from './art';
import { C, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_LIVES } from './config';
import { InputState } from './entities';

function label(text: string, size: number, color: number = C.ink, weight: string | number = '800'): Text {
  return new Text(
    text,
    new TextStyle({
      fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: size,
      fontWeight: String(weight) as TextStyle['fontWeight'],
      fill: color,
      align: 'center',
    }),
  );
}

function roundPanel(w: number, h: number, r: number): Graphics {
  const g = new Graphics();
  g.beginFill(C.panelEdge).drawRoundedRect(0, 0, w, h, r).endFill();
  g.beginFill(C.panel).drawRoundedRect(3, 3, w - 6, h - 6, r - 3).endFill();
  g.beginFill(0xffffff, 0.75).drawRoundedRect(9, 8, w - 18, (h - 16) * 0.42, r * 0.6).endFill();
  return g;
}

class HoldButton extends Container {
  constructor(radius: number, face: number, glyph: Container) {
    super();
    const base = new Graphics();
    base.beginFill(C.panelEdge).drawCircle(0, 0, radius).endFill();
    base.beginFill(face).drawCircle(0, 0, radius - 5).endFill();
    base.beginFill(0xffffff, 0.45).drawEllipse(0, -radius * 0.4, radius * 0.6, radius * 0.3).endFill();
    this.addChild(base, glyph);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Circle(0, 0, radius);
  }

  bind(onDown: () => void, onUp: () => void): void {
    const down = (): void => {
      this.scale.set(0.92);
      onDown();
    };
    const up = (): void => {
      this.scale.set(1);
      onUp();
    };
    this.on('pointerdown', down);
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
    this.on('pointercancel', up);
  }
}

export class Hud {
  readonly root = new Container();
  readonly input: InputState = { left: false, right: false };

  /** 生命 */
  private readonly hearts: Sprite[] = [];
  private readonly coinText: Text;
  private readonly art: Art;
  private readonly effectSlots: { sprite: Sprite; bar: Graphics }[] = [];
  private readonly effectXs: number[] = [];
  private readonly overlay = new Container();
  private readonly overlayTitle: Text;
  private readonly overlayHint: Text;
  private readonly overlayDim: Graphics;

  constructor(art: Art) {
    this.art = art;
    // 生命
    const heartsBox = new Container();
    heartsBox.position.set(24, 20);
    heartsBox.addChild(roundPanel(MAX_LIVES * 46 + 28, 60, 30));
    for (let i = 0; i < MAX_LIVES; i++) {
      const s = new Sprite(art.heart);
      s.anchor.set(0.5);
      s.position.set(46 + i * 46, 30);
      this.hearts.push(s);
      heartsBox.addChild(s);
    }

    // 金币
    const coinBox = new Container();
    const panelW = 196;
    coinBox.position.set(DESIGN_WIDTH - 24 - panelW, 20);
    coinBox.addChild(roundPanel(panelW, 60, 30));
    const coinIcon = new Sprite(art.coin);
    coinIcon.anchor.set(0.5);
    coinIcon.position.set(38, 30);
    coinIcon.scale.set(0.86);
    this.coinText = label('× 0', 32);
    this.coinText.anchor.set(0, 0.5);
    this.coinText.position.set(66, 31);
    coinBox.addChild(coinIcon, this.coinText);

    // 暂停
    const pauseGlyph = new Graphics();
    pauseGlyph.beginFill(C.ink);
    pauseGlyph.drawRoundedRect(-11, -14, 8, 28, 3);
    pauseGlyph.drawRoundedRect(4, -14, 8, 28, 3);
    pauseGlyph.endFill();
    const pauseBtn = new HoldButton(30, C.panel, pauseGlyph);
    pauseBtn.position.set(DESIGN_WIDTH - 24 - panelW - 44, 50);

    // 减速（左）
    const brakeText = label('减速', 32);
    brakeText.anchor.set(0.5);
    const brakeBtn = new HoldButton(58, C.panel, brakeText);
    brakeBtn.position.set(104, DESIGN_HEIGHT - 104);
    brakeBtn.bind(() => (this.input.left = true), () => (this.input.left = false));

    // 加速（右）
    const accelText = label('加速', 32, 0xffffff);
    accelText.anchor.set(0.5);
    const accelBtn = new HoldButton(66, C.accent, accelText);
    accelBtn.position.set(DESIGN_WIDTH - 112, DESIGN_HEIGHT - 104);
    accelBtn.bind(() => (this.input.right = true), () => (this.input.right = false));

    // 遮罩层（开始 / 结束）
    this.overlayDim = new Graphics();
    this.overlayDim.beginFill(0x2b1f3a, 0.55).drawRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).endFill();
    this.overlayTitle = label('', 64, 0xffffff);
    this.overlayTitle.anchor.set(0.5);
    this.overlayTitle.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 40);
    this.overlayHint = label('', 30, 0xffe8f2);
    this.overlayHint.anchor.set(0.5);
    this.overlayHint.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 + 44);
    this.overlay.addChild(this.overlayDim, this.overlayTitle, this.overlayHint);
    this.overlay.visible = false;

    this.root.addChild(heartsBox, coinBox, pauseBtn, brakeBtn, accelBtn);

    // 生效中的道具（底部居中）
    const effects: Sprite['texture'][] = [art.pickupShield, art.pickupMagnet];
    for (let i = 0; i < effects.length; i++) {
      const x = DESIGN_WIDTH / 2 + (i - (effects.length - 1) / 2) * 88;
      const sp = new Sprite(effects[i]);
      sp.anchor.set(0.5);
      sp.scale.set(0.7);
      sp.position.set(x, DESIGN_HEIGHT - 60);
      sp.visible = false;
      const bar = new Graphics();
      this.effectXs.push(x);
      this.effectSlots.push({ sprite: sp, bar });
      this.root.addChild(sp, bar);
    }

    this.root.addChild(this.overlay);
    this.root.eventMode = 'static';

    pauseBtn.bind(
      () => this.onPause?.(),
      () => {},
    );
    this.overlay.eventMode = 'static';
    this.overlay.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.overlay.on('pointerdown', () => this.onOverlayTap?.());
  }

  onPause?: () => void;
  onOverlayTap?: () => void;

  setLives(lives: number): void {
    this.hearts.forEach((h, i) => {
      h.texture = i < lives ? this.art.heart : this.art.heartEmpty;
    });
  }

  setCoins(total: number): void {
    this.coinText.text = `× ${total}`;
  }

  /** 各限时道具的剩余比例，0 表示未生效 */
  updateEffects(shield: number, magnet: number): void {
    const ratios = [shield, magnet];
    for (let i = 0; i < this.effectSlots.length; i++) {
      const slot = this.effectSlots[i];
      const r = Math.max(0, Math.min(1, ratios[i]));
      slot.sprite.visible = r > 0;
      slot.bar.clear();
      if (r <= 0) continue;
      const w = 48;
      const x = this.effectXs[i] - w / 2;
      const y = DESIGN_HEIGHT - 86;
      slot.bar.beginFill(C.panelEdge).drawRoundedRect(x, y, w, 8, 4).endFill();
      slot.bar.beginFill(0xffffff, 0.9).drawRoundedRect(x + 1.5, y + 1.5, w - 3, 5, 2.5).endFill();
      slot.bar.beginFill(C.accent, 0.95).drawRoundedRect(x + 1.5, y + 1.5, (w - 3) * r, 5, 2.5).endFill();
    }
  }

  showOverlay(title: string, hint: string): void {
    this.overlayTitle.text = title;
    this.overlayHint.text = hint;
    this.overlay.visible = true;
  }

  hideOverlay(): void {
    this.overlay.visible = false;
  }

  releaseAll(): void {
    this.input.left = false;
    this.input.right = false;
  }
}
