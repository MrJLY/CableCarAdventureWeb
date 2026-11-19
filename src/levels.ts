/** 轨道的单个"特征段"，见 world.ts 的 Track 说明 */
export interface Feature {
  w: number;
  amp: number;
  waves: number;
  fold: number;
}

/** 环轨椭圆半径 */
export interface LoopShape {
  r1: number;
  r2: number;
}

export type ObstacleKind = 'hammer' | 'gate' | 'vent' | 'rock';
export type ZoneKind = 'ice' | 'wind' | 'fog';

/** 障碍：[可用弧长比例, 类型, 随机种子] */
export type ObstacleSpec = [number, ObstacleKind, number];

export interface ZoneSpec {
  kind: ZoneKind;
  f0: number;
  f1: number;
  power: number;
}

export interface LevelDef {
  name: string;
  subtitle: string;
  /** 初始生命数 */
  lives: number;
  features: Feature[];
  loops: LoopShape[];
  obstacles: ObstacleSpec[];
  zones: ZoneSpec[];
  /** 蜂群追击的可用弧长区间比例 */
  swarm?: [number, number];
  pickups: number;
}

/* ------------------------------------------------------------------ 轨道编排 */

const EASY_FEATURES: Feature[] = [
  { w: 560, amp: 26, waves: 2, fold: 0 },
  { w: 520, amp: -30, waves: 1, fold: 0 },
  { w: 480, amp: 24, waves: 2, fold: 0 },
  { w: 540, amp: 56, waves: 1, fold: 0 },
  { w: 520, amp: -22, waves: 4, fold: 0 },
  { w: 560, amp: -50, waves: 1, fold: 0 },
  { w: 500, amp: 32, waves: 2, fold: 0 },
  { w: 540, amp: 40, waves: 1, fold: 0 },
  { w: 560, amp: -20, waves: 3, fold: 0 },
  { w: 520, amp: -26, waves: 1, fold: 0 },
];

const MEDIUM_FEATURES: Feature[] = [
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

const HARD_FEATURES: Feature[] = [
  ...MEDIUM_FEATURES,
  { w: 560, amp: 30, waves: 2, fold: 0 },
  { w: 520, amp: -44, waves: 1, fold: 0 },
  { w: 560, amp: 36, waves: 3, fold: 0.7 },
  { w: 520, amp: 32, waves: 1, fold: 0 },
];

/* ------------------------------------------------------------------ 关卡 */

export const LEVELS: LevelDef[] = [
  {
    name: '第一关 · 缆车试车',
    subtitle: '路面平缓，障碍稀疏',
    lives: 5,
    features: EASY_FEATURES,
    loops: [
      { r1: 152, r2: 138 },
      { r1: 138, r2: 146 },
    ],
    obstacles: [
      [0.22, 'hammer', 0.25],
      [0.45, 'gate', 0.4],
      [0.68, 'rock', 0.6],
      [0.9, 'vent', 0.15],
    ],
    zones: [{ kind: 'ice', f0: 0.55, f1: 0.6, power: 0 }],
    pickups: 6,
  },
  {
    name: '第二关 · 山间往返',
    subtitle: '环轨、闸门、蜂群轮番上阵',
    lives: 4,
    features: MEDIUM_FEATURES,
    loops: [
      { r1: 150, r2: 140 },
      { r1: 120, r2: 148 },
      { r1: 168, r2: 156 },
    ],
    obstacles: [
      [0.1, 'hammer', 0.2],
      [0.24, 'gate', 0.3],
      [0.38, 'vent', 0.1],
      [0.52, 'rock', 0.4],
      [0.66, 'gate', 0.75],
      [0.8, 'hammer', 0.6],
      [0.93, 'vent', 0.45],
    ],
    zones: [
      { kind: 'fog', f0: 0.16, f1: 0.2, power: 0 },
      { kind: 'ice', f0: 0.55, f1: 0.6, power: 0 },
      { kind: 'wind', f0: 0.72, f1: 0.76, power: 300 },
    ],
    swarm: [0.84, 0.9],
    pickups: 8,
  },
  {
    name: '第三关 · 风暴线路',
    subtitle: '逆风、浓雾与蜂群同时开火',
    lives: 3,
    features: HARD_FEATURES,
    loops: [
      { r1: 150, r2: 140 },
      { r1: 120, r2: 148 },
      { r1: 168, r2: 156 },
      { r1: 145, r2: 150 },
    ],
    obstacles: [
      [0.06, 'hammer', 0.2],
      [0.15, 'gate', 0.35],
      [0.24, 'vent', 0.1],
      [0.33, 'rock', 0.45],
      [0.42, 'hammer', 0.6],
      [0.51, 'gate', 0.75],
      [0.6, 'vent', 0.5],
      [0.68, 'rock', 0.85],
      [0.77, 'hammer', 0.3],
      [0.86, 'gate', 0.65],
      [0.95, 'hammer', 0.5],
    ],
    zones: [
      { kind: 'fog', f0: 0.12, f1: 0.16, power: 0 },
      { kind: 'ice', f0: 0.37, f1: 0.41, power: 0 },
      { kind: 'wind', f0: 0.55, f1: 0.59, power: 320 },
      { kind: 'wind', f0: 0.72, f1: 0.76, power: -340 },
      { kind: 'fog', f0: 0.9, f1: 0.94, power: 0 },
    ],
    swarm: [0.79, 0.85],
    pickups: 9,
  },
];
