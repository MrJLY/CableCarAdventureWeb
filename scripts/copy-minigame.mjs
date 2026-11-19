import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'dist-minigame');
const srcDir = resolve(repoRoot, 'minigame');

if (!existsSync(outDir)) {
  console.error('dist-minigame 不存在，请先执行 vite build --config vite.minigame.config.ts');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

for (const file of ['game.json', 'project.config.json']) {
  cpSync(resolve(srcDir, file), resolve(outDir, file));
  console.log(`copied ${file} -> dist-minigame/${file}`);
}

console.log('微信小游戏产物已就绪：用微信开发者工具打开 dist-minigame 目录');
