import './style.css';
import { Game } from './game';

const host = document.getElementById('game-root') ?? document.body;
const canvas = document.createElement('canvas');
host.appendChild(canvas);

const game = new Game({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

const onResize = (): void => game.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    game.destroy();
  });
}
