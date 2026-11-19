// 必须最先执行：注入 window / document / touch 适配
import '../minigame/adapter.js';
import { Game } from './game';

const wxApi = (globalThis as unknown as { wx: any }).wx;
const canvas = (globalThis as unknown as { __mainCanvas: any }).__mainCanvas;
const screen = (globalThis as unknown as { __screen: { width: number; height: number; dpr: number } })
  .__screen;

const dpr = Math.min(screen.dpr || 1, 2);
let width = Math.floor(screen.width * dpr);
let height = Math.floor(screen.height * dpr);

const game = new Game({ canvas, width, height, resolution: 1 });

if (wxApi && typeof wxApi.onWindowResize === 'function') {
  wxApi.onWindowResize((res: { windowWidth: number; windowHeight: number }) => {
    width = Math.floor(res.windowWidth * dpr);
    height = Math.floor(res.windowHeight * dpr);
    game.resize(width, height);
  });
}

export default game;
