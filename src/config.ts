/** 设计分辨率（横屏 16:9），实际渲染按屏幕等比缩放并留黑边 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** 关卡长度（世界坐标，像素） */
export const WORLD_LENGTH = 9000;

/** 出生点 */
export const START_X = 150;

/** 生命值 */
export const MAX_LIVES = 3;

/** 颜色取自概念图：薄荷、粉、紫、奶白 */
export const C = {
  skyTop: 0x8fd3f7,
  skyBottom: 0xd9f1ff,

  cloudBody: 0xffffff,
  cloudShade: 0xffd8e8,

  mountainA: 0xb6e8dd,
  mountainB: 0x9bdfcd,
  mountainC: 0x86d3bf,

  hillFar: 0xa4dd7c,
  hillNear: 0x86cf5e,
  hillShadow: 0x6cb44a,

  rockLight: 0xf8bcd0,
  rockMid: 0xf0a3bf,
  rockDark: 0xdd85a8,

  treeLight: 0x7cc95a,
  treeDark: 0x5aa93f,
  trunk: 0x9a6b4f,

  wire: 0x8d6f92,
  towerBar: 0x8c7fa6,
  towerBarDark: 0x6f6386,
  towerBase: 0xa79cc0,

  cabinBody: 0xffffff,
  cabinTrim: 0xf0709c,
  cabinGlass: 0x9dd9f5,
  cabinGlassEdge: 0x6ec2ea,
  cabinetMetal: 0x7f7396,

  coinFill: 0xffc93c,
  coinLight: 0xffe591,
  coinEdge: 0xe39b12,

  eagleBody: 0x7a5566,
  eagleWing: 0x5f3f4f,
  eagleBelly: 0xfdfbf7,
  eagleBeak: 0xf7c948,

  heart: 0xff6b8e,
  heartEdge: 0xe04a70,

  panel: 0xfbf3e6,
  panelEdge: 0xe8d9c3,
  ink: 0x6d5a7a,
  inkSoft: 0x9a8aa6,
  accent: 0xf0709c,
} as const;

/** 物理与手感参数，单位：像素 / 秒 */
export const PHYS = {
  /** 按住加速键的水平加速度 */
  accel: 900,
  /** 按住减速键的减速度 */
  brake: 1500,
  /** 松手后的滑行阻尼（每秒指数衰减系数） */
  drag: 1.1,
  /** 水平速度上限 */
  maxSpeed: 620,
  /** 吊绳固定长度（轮架 → 车厢挂钩） */
  ropeLength: 130,
} as const;

/** 道具效果时长（秒） */
export const PICKUP = {
  shield: 5,
  magnet: 6,
  /** 磁铁生效时的金币吸取半径 */
  magnetRadius: 170,
} as const;

/** 角色尺寸 */
export const SIZE = {
  cabinW: 104,
  cabinH: 96,
  /** 碰撞圆半径（以车厢中心计） */
  cabinRadius: 44,
  /** 挂钩到车厢中心的距离 */
  cabinCenterOffset: 48,
  coinRadius: 22,
  eagleRadius: 44,
} as const;
