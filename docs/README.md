# 缆车大冒险 · 文档目录

2D 钢索缆车游戏（Skywire 类），Pixi.js + TypeScript + Vite，同时产出 Web 与微信小游戏。

| 文档 | 内容 |
| --- | --- |
| [dev-notes.md](./dev-notes.md) | 开发要点：架构、坐标系、轨道/物理/障碍参数、构建与验证方式 |
| [todo.md](./todo.md) | 待开发 / 待修复 / 待优化清单 |

## 快速上手

```bash
npm install
npm run dev              # 本地开发（默认 5173，被占用会自动顺延）
npm run build            # Web 产物 → dist-web/
npm run build:minigame   # 微信小游戏产物 → dist-minigame/（用微信开发者工具打开该目录）
```

## 公网访问（GitHub Pages）

仓库已带 `.github/workflows/deploy-pages.yml`，推送到 `main` 会自动构建并发布。

首次使用需在仓库 **Settings → Pages → Source** 选 **GitHub Actions**（工作流里带了
`enablement: true`，多数情况下会自动开启，若 Actions 报 `Get Pages site failed` 就手动点一下）。

发布地址：<https://mrjly.github.io/CableCarAdventureWeb/>

其他可选托管：Netlify / Vercel / Cloudflare Pages 直接连仓库，
Build command 填 `npm run build`，Publish directory 填 `dist-web` 即可。
`vite.config.ts` 里 `base: './'` 用的是相对路径，部署在任意子路径下都能正常加载。

## 代码结构

```
src/
  config.ts    设计分辨率、配色、物理参数、尺寸
  levels.ts    三个关卡的配置（轨道段 / 环轨 / 障碍 / 区域 / 道具数）
  art.ts       Graphics 程序化绘制并烘焙成纹理
  world.ts     轨道曲线 / 环轨 / 关卡地形 / 视差背景
  entities.ts  车厢、金币、秃鹫
  hazards.ts   8 种障碍 + 区域（冰面/风/雾）
  pickups.ts   随机掉落的道具（护盾/磁铁/加命）
  ui.ts        HUD、暂停、加速减速按钮、遮罩层
  game.ts      主循环、碰撞、分数、相机
  main.ts      Web 入口
  minigame.ts  微信小游戏入口
minigame/
  adapter.js   微信小游戏适配层（window / document / canvas / touch）
  game.json
  project.config.json
```
