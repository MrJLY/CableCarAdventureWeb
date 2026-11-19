import { Graphics, IRenderer, Rectangle, Texture } from 'pixi.js';
import { C, SIZE } from './config';

/** 在离屏绘制后烘焙成纹理，避免每帧重新三角化矢量图�?*/
function bake(renderer: IRenderer, w: number, h: number, draw: (g: Graphics) => void): Texture {
  const g = new Graphics();
  draw(g);
  const texture = renderer.generateTexture(g, {
    resolution: 2,
    region: new Rectangle(0, 0, w, h),
  });
  g.destroy();
  return texture;
}

function star(g: Graphics, cx: number, cy: number, outer: number, inner: number, points = 5): void {
  const step = Math.PI / points;
  let a = -Math.PI / 2;
  g.moveTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  for (let i = 0; i < points * 2; i++) {
    a += step;
    const r = i % 2 === 0 ? outer : inner;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function heartPath(g: Graphics, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  g.moveTo(cx, y + h * 0.3);
  g.bezierCurveTo(cx, y, x, y, x, y + h * 0.3);
  g.bezierCurveTo(x, y + h * 0.58, cx, y + h * 0.78, cx, y + h);
  g.bezierCurveTo(cx, y + h * 0.78, x + w, y + h * 0.58, x + w, y + h * 0.3);
  g.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3);
  g.closePath();
}

export interface Art {
  coin: Texture;
  spark: Texture;
  heart: Texture;
  heartEmpty: Texture;
  cabin: Texture;
  trolley: Texture;
  eagleWingUp: Texture;
  eagleWingDown: Texture;
  clouds: Texture[];
  pine: Texture;
  bush: Texture;
  flag: Texture;
  hammerBall: Texture;
  rock: Texture;
  swarm: Texture;
  nozzle: Texture;
  pickupShield: Texture;
  pickupLife: Texture;
  pickupMagnet: Texture;
}

function makeCoin(renderer: IRenderer): Texture {
  return bake(renderer, 48, 48, (g) => {
    g.beginFill(C.coinEdge).drawCircle(24, 24, 22).endFill();
    g.beginFill(C.coinFill).drawCircle(24, 24, 19).endFill();
    g.beginFill(C.coinLight);
    star(g, 24, 24, 12, 5.2);
    g.endFill();
    g.beginFill(0xffffff, 0.45).drawCircle(16, 14, 4.5).endFill();
  });
}

function makeSpark(renderer: IRenderer): Texture {
  return bake(renderer, 44, 44, (g) => {
    g.beginFill(0xffffff);
    star(g, 22, 22, 20, 4, 4);
    g.endFill();
  });
}

function makeHeart(renderer: IRenderer, filled: boolean): Texture {
  return bake(renderer, 44, 40, (g) => {
    g.beginFill(filled ? C.heartEdge : 0xd6c9dd, filled ? 1 : 0.85);
    heartPath(g, 2, 2, 40, 36);
    g.endFill();
    g.beginFill(filled ? C.heart : 0xe8deee, filled ? 1 : 0.85);
    heartPath(g, 4.5, 4, 35, 31.5);
    g.endFill();
    if (filled) {
      g.beginFill(0xffffff, 0.55).drawEllipse(14, 13, 5.5, 4).endFill();
    }
  });
}

function makeCabin(renderer: IRenderer): Texture {
  const w = SIZE.cabinW;
  const h = SIZE.cabinH + 24;
  return bake(renderer, w, h, (g) => {
    // 挂杆
    g.beginFill(C.cabinetMetal).drawRoundedRect(w / 2 - 6, 0, 12, 22, 6).endFill();
    g.beginFill(C.towerBarDark).drawRoundedRect(w / 2 - 17, 18, 34, 8, 4).endFill();
    // 车厢（粉色底 + 奶白面板�?    g.beginFill(C.cabinTrim).drawRoundedRect(2, 24, w - 4, h - 26, 18).endFill();
    g.beginFill(0xffffff).drawRoundedRect(2, 24, w - 4, h - 58, 18).endFill();
    // 车窗
    g.lineStyle(3, C.cabinGlassEdge, 1);
    g.beginFill(C.cabinGlass);
    g.drawRoundedRect(15, 40, 34, 30, 9);
    g.drawRoundedRect(w - 49, 40, 34, 30, 9);
    g.endFill();
    g.lineStyle(0);
    // 车窗高光
    g.beginFill(0xffffff, 0.7);
    g.drawRoundedRect(20, 45, 8, 20, 4);
    g.drawRoundedRect(w - 44, 45, 8, 20, 4);
    g.endFill();
    // 底部装饰�?    g.beginFill(0xffffff, 0.35).drawRoundedRect(14, h - 26, w - 28, 8, 4).endFill();
  });
}

function makeTrolley(renderer: IRenderer): Texture {
  return bake(renderer, 76, 46, (g) => {
    g.beginFill(C.towerBarDark).drawRoundedRect(4, 6, 68, 24, 12).endFill();
    g.beginFill(C.towerBase).drawCircle(20, 18, 12).endFill();
    g.beginFill(C.towerBase).drawCircle(56, 18, 12).endFill();
    g.beginFill(0xffffff, 0.85).drawCircle(20, 18, 5).endFill();
    g.beginFill(0xffffff, 0.85).drawCircle(56, 18, 5).endFill();
    g.beginFill(C.cabinetMetal).drawRoundedRect(32, 28, 12, 18, 5).endFill();
  });
}

function makeEagle(renderer: IRenderer, wingsUp: boolean): Texture {
  return bake(renderer, 116, 84, (g) => {
    // 双翼
    g.beginFill(C.eagleWing);
    if (wingsUp) {
      g.drawPolygon([58, 46, 26, 4, 2, 12, 10, 34, 40, 50]);
      g.drawPolygon([62, 46, 72, 8, 96, 10, 90, 34, 74, 50]);
    } else {
      g.drawPolygon([58, 46, 22, 26, 4, 48, 24, 60, 48, 56]);
      g.drawPolygon([62, 46, 78, 30, 104, 40, 96, 62, 72, 58]);
    }
    g.endFill();
    // 身体
    g.beginFill(C.eagleBody).drawEllipse(58, 50, 24, 17).endFill();
    g.beginFill(C.eagleBelly).drawEllipse(58, 55, 17, 10).endFill();
    // �?    g.beginFill(C.eagleBelly).drawCircle(84, 34, 13).endFill();
    g.beginFill(C.eagleBeak).drawPolygon([95, 30, 112, 36, 95, 42]).endFill();
    g.beginFill(0x3d2b35).drawCircle(88, 31, 2.6).endFill();
    // 尾羽
    g.beginFill(C.eagleWing).drawPolygon([36, 48, 8, 40, 12, 56, 38, 58]).endFill();
  });
}

function makeCloud(renderer: IRenderer): Texture {
  const w = 240;
  const h = 120;
  const blobs: [number, number, number][] = [
    [58, 76, 34],
    [104, 56, 44],
    [156, 62, 38],
    [198, 80, 28],
    [110, 88, 36],
  ];
  return bake(renderer, w, h, (g) => {
    g.beginFill(C.cloudShade, 0.9);
    for (const [x, y, r] of blobs) g.drawCircle(x, y + 7, r);
    g.endFill();
    g.beginFill(C.cloudBody);
    for (const [x, y, r] of blobs) g.drawCircle(x, y, r);
    g.endFill();
  });
}

function makePine(renderer: IRenderer): Texture {
  return bake(renderer, 64, 104, (g) => {
    g.beginFill(C.trunk).drawRect(28, 72, 8, 30).endFill();
    g.beginFill(C.treeDark);
    g.drawPolygon([32, 6, 6, 44, 58, 44]);
    g.drawPolygon([32, 28, 2, 72, 62, 72]);
    g.endFill();
    g.beginFill(C.treeLight);
    g.drawPolygon([32, 12, 12, 42, 52, 42]);
    g.endFill();
  });
}

function makeBush(renderer: IRenderer): Texture {
  return bake(renderer, 84, 52, (g) => {
    g.beginFill(C.treeDark);
    g.drawCircle(26, 34, 20).drawCircle(48, 26, 24).drawCircle(66, 36, 17);
    g.endFill();
    g.beginFill(C.treeLight);
    g.drawCircle(26, 30, 18).drawCircle(48, 22, 22).drawCircle(66, 32, 15);
    g.endFill();
  });
}

function makeFlag(renderer: IRenderer): Texture {
  return bake(renderer, 56, 78, (g) => {
    g.beginFill(C.towerBarDark).drawRoundedRect(8, 4, 8, 72, 4).endFill();
    g.beginFill(C.accent).drawPolygon([16, 8, 54, 24, 16, 42]).endFill();
  });
}

function makeHammerBall(renderer: IRenderer): Texture {
  return bake(renderer, 60, 60, (g) => {
    g.beginFill(C.towerBarDark).drawRoundedRect(24, 0, 12, 12, 5).endFill();
    g.beginFill(0x5f5670).drawCircle(30, 34, 24).endFill();
    g.beginFill(0x7d728f).drawCircle(26, 29, 16).endFill();
    g.beginFill(0xffffff, 0.45).drawCircle(21, 24, 7).endFill();
  });
}

function makeRock(renderer: IRenderer): Texture {
  return bake(renderer, 46, 40, (g) => {
    g.beginFill(0x8f8279).drawPolygon([5, 22, 15, 6, 32, 4, 42, 20, 33, 36, 13, 36]).endFill();
    g.beginFill(0xb2a59b).drawPolygon([5, 22, 15, 6, 27, 8, 15, 24]).endFill();
  });
}

function makeSwarm(renderer: IRenderer): Texture {
  const bees: [number, number][] = [
    [26, 34],
    [54, 20],
    [82, 36],
    [98, 58],
    [48, 56],
    [74, 68],
    [28, 66],
  ];
  return bake(renderer, 120, 90, (g) => {
    g.beginFill(0xffffff, 0.7);
    for (const [x, y] of bees) g.drawEllipse(x, y - 13, 14, 7);
    g.endFill();
    for (const [x, y] of bees) {
      g.beginFill(C.coinFill).drawCircle(x, y, 11);
      g.beginFill(0x3d2b35, 0.85).drawRect(x - 9, y + 2, 18, 3);
      g.beginFill(0x3d2b35).drawCircle(x + 6, y - 3, 4.5);
    }
    g.endFill();
  });
}

function makeNozzle(renderer: IRenderer): Texture {
  return bake(renderer, 64, 46, (g) => {
    g.beginFill(0x6f6470).drawPolygon([6, 46, 15, 12, 49, 12, 58, 46]).endFill();
    g.beginFill(0x8c8199).drawPolygon([15, 46, 21, 16, 43, 16, 49, 46]).endFill();
    g.beginFill(0x4f4658).drawRoundedRect(17, 6, 30, 10, 5).endFill();
  });
}

/** 道具统一外观：白色圆底 + 彩色描边 + 图标 */
function makePickup(renderer: IRenderer, edge: number, draw: (g: Graphics) => void): Texture {
  return bake(renderer, 76, 76, (g) => {
    g.beginFill(edge, 0.35).drawCircle(38, 38, 35).endFill();
    g.lineStyle(4, 0xffffff, 0.9).drawCircle(38, 38, 32).lineStyle(0);
    g.beginFill(0xffffff).drawCircle(38, 38, 29).endFill();
    draw(g);
  });
}

function makePickupShield(renderer: IRenderer): Texture {
  return makePickup(renderer, 0x5fc8f5, (g) => {
    g.beginFill(0x5fc8f5);
    g.drawPolygon([38, 14, 55, 23, 55, 40, 48, 53, 38, 60, 28, 53, 21, 40, 21, 23]);
    g.endFill();
    g.beginFill(0xffffff, 0.7);
    g.drawPolygon([38, 21, 48, 27, 48, 39, 38, 51]);
    g.endFill();
  });
}

function makePickupLife(renderer: IRenderer): Texture {
  return makePickup(renderer, C.heart, (g) => {
    g.beginFill(C.heart);
    heartPath(g, 15, 17, 46, 42);
    g.endFill();
    g.beginFill(0xffffff);
    g.drawRoundedRect(35, 27, 6, 20, 3);
    g.drawRoundedRect(28, 34, 20, 6, 3);
    g.endFill();
  });
}

function makePickupMagnet(renderer: IRenderer): Texture {
  return makePickup(renderer, 0xe0574f, (g) => {
    g.lineStyle(12, 0xe0574f, 1);
    g.arc(38, 36, 15, 0, Math.PI);
    g.lineStyle(0);
    g.beginFill(0xe0574f);
    g.drawRoundedRect(18, 36, 12, 14, 3);
    g.drawRoundedRect(46, 36, 12, 14, 3);
    g.endFill();
    g.beginFill(0xf0f0f5);
    g.drawRoundedRect(18, 44, 12, 8, 3);
    g.drawRoundedRect(46, 44, 12, 8, 3);
    g.endFill();
  });
}

export function buildArt(renderer: IRenderer): Art {
  return {
    coin: makeCoin(renderer),
    spark: makeSpark(renderer),
    heart: makeHeart(renderer, true),
    heartEmpty: makeHeart(renderer, false),
    cabin: makeCabin(renderer),
    trolley: makeTrolley(renderer),
    eagleWingUp: makeEagle(renderer, true),
    eagleWingDown: makeEagle(renderer, false),
    clouds: [makeCloud(renderer)],
    pine: makePine(renderer),
    bush: makeBush(renderer),
    flag: makeFlag(renderer),
    hammerBall: makeHammerBall(renderer),
    rock: makeRock(renderer),
    swarm: makeSwarm(renderer),
    nozzle: makeNozzle(renderer),
    pickupShield: makePickupShield(renderer),
    pickupLife: makePickupLife(renderer),
    pickupMagnet: makePickupMagnet(renderer),
  };
}

export function destroyArt(art: Art): void {
  for (const value of Object.values(art)) {
    if (Array.isArray(value)) value.forEach((t) => t.destroy(true));
    else value.destroy(true);
  }
}
