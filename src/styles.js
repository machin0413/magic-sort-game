// ============================================
// スタイルシート
// 快適動作を最優先にした軽量版：
//  - filter / backdrop-filter（ぼかし）は不使用（モバイルSafariで高負荷）
//  - 3D合成レイヤー（perspective / preserve-3d / translateZ）は不使用。
//    奥行きは scale と重なりで表現
//  - 常時動き続けるアニメーションは置かない。動くのは操作への反応だけ
//  - アニメーションは transform / opacity のみ（レイアウトを揺らさない）
// ボトルの立体感はグラデーション（楕円リム・液面・円柱シェード）で表現＝描画1回きりで軽い
// ============================================
export const CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; overscroll-behavior: none; }
body { font-family: system-ui, sans-serif; background: #08051f; }

.scene {
  min-height: 100dvh;
  width: 100%;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 85%, var(--mist), transparent 60%),
    radial-gradient(ellipse at 50% -10%, var(--sky0) 0%, var(--sky1) 45%, var(--sky2) 100%);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

/* 背景の星（静止・装飾はこれだけ） */
.star {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.55);
  pointer-events: none;
}

/* ---------- レイアウト ---------- */
.frame {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
  max-width: 560px;
  margin: 0 auto;
}
.brand { text-align: center; margin-bottom: 6px; }
.brand-sub {
  font-size: 10px;
  letter-spacing: 0.45em;
  color: var(--accent);
  opacity: 0.55;
  font-family: Georgia, serif;
}
.brand-title {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.12em;
  background: linear-gradient(180deg, #ffe9a8 0%, var(--accent) 55%, #c77d3a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
  font-family: Georgia, serif;
}
.theme-name {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: rgba(255,255,255,0.45);
  margin-top: 2px;
}

.statbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  margin: 8px 0 4px;
  padding: 8px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
}
.stat { text-align: center; min-width: 64px; }
.stat-label {
  font-size: 9px;
  letter-spacing: 0.3em;
  color: var(--accent);
  opacity: 0.65;
  margin-bottom: 2px;
  font-family: Georgia, serif;
}
.stat-value {
  font-size: 19px;
  font-weight: 600;
  color: rgba(255,244,214,1);
  font-family: Georgia, serif;
}
.stat-value small { font-size: 11px; opacity: 0.55; font-weight: 400; }
.stat-sep { width: 1px; height: 30px; background: rgba(255,255,255,0.12); }

/* ---------- ボード（フラット合成・奥行きはscaleで表現） ---------- */
.board-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 18px 0 6px;
  min-height: 0;
}
.board {
  width: 100%;
  pointer-events: none;
}
.row {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.row.back {
  transform: scale(0.92);
  margin-bottom: calc(var(--bw) * 0.42);
}
.bottle { pointer-events: auto; }

/* ---------- ボトル ---------- */
.bottle {
  position: relative;
  width: var(--bw);
  flex: 0 0 var(--bw);
  cursor: pointer;
}
.lift {
  position: relative;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translate(0, 0);
}
.lift.selected { transform: translateY(calc(var(--bw) * -0.24)); }
.lift.pouring { z-index: 60; }

.glass { position: relative; padding-top: calc(var(--bw) * 0.17); }

.glass-body {
  position: relative;
  width: 100%;
  height: calc(var(--bw) * 2.05);
  border: 1.5px solid rgba(255,255,255,0.30);
  border-top: none;
  border-radius: 6px 6px calc(var(--bw) * 0.5) calc(var(--bw) * 0.5)
    / 4px 4px calc(var(--bw) * 0.34) calc(var(--bw) * 0.34);
  background: linear-gradient(90deg,
    rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 20%,
    rgba(255,255,255,0.00) 50%, rgba(255,255,255,0.04) 80%,
    rgba(255,255,255,0.16) 100%);
  overflow: hidden;
  box-shadow: 0 6px 12px rgba(0,0,0,0.35);
}
.selected .glass-body {
  border-color: rgba(255,224,130,0.9);
  box-shadow: 0 0 18px rgba(255,214,90,0.5);
}
.pourable .glass-body {
  border-color: var(--accent);
}
.complete .glass-body {
  border-color: rgba(255,215,0,0.55);
}

/* 円柱の丸みを出す左右シェード（液体の上に重ねる） */
.edge-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  background: linear-gradient(90deg,
    rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.0) 24%,
    rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.10) 55%, rgba(255,255,255,0.0) 64%,
    rgba(0,0,0,0.0) 78%, rgba(0,0,0,0.32) 100%);
  border-radius: inherit;
}
.gloss {
  position: absolute;
  top: 6%;
  left: 13%;
  width: 7%;
  height: 62%;
  z-index: 6;
  background: linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.05) 80%, transparent);
  border-radius: 999px;
  pointer-events: none;
}

/* ---------- 液体 ---------- */
.liquid {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 3px;
  top: 0;
  border-radius: 4px 4px calc(var(--bw) * 0.46) calc(var(--bw) * 0.46)
    / 3px 3px calc(var(--bw) * 0.30) calc(var(--bw) * 0.30);
  overflow: hidden;
}
.seg {
  position: absolute;
  left: 0;
  right: 0;
  height: 23.5%;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 流入はopacity+transformのみ（レイアウトを動かさない） */
.seg.newfill { animation: fillUp 0.2s ease-out both; }
@keyframes fillUp {
  from { opacity: 0; transform: translateY(30%); }
}

.seg .sym {
  font-size: calc(var(--bw) * 0.30);
  line-height: 1;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 2px rgba(0,0,0,0.65);
}
.seg.hidden-seg .sym { color: rgba(220,205,255,0.85); font-size: calc(var(--bw) * 0.34); }

/* 液面の楕円（3D感の要） */
.surface {
  position: absolute;
  left: 0;
  right: 0;
  height: calc(var(--bw) * 0.26);
  transform: translateY(50%);
  border-radius: 50%;
  z-index: 4;
  box-shadow: inset 0 2px 5px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.2);
}

/* 空ボトルの底 */
.base-ellipse {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: calc(var(--bw) * 0.06);
  height: calc(var(--bw) * 0.2);
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
}

/* ---------- リム（口の楕円） ---------- */
.rim {
  position: absolute;
  top: 0;
  left: -1px;
  right: -1px;
  height: calc(var(--bw) * 0.34);
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.5);
  background: linear-gradient(180deg, rgba(10,8,34,0.72), rgba(30,26,70,0.35));
  z-index: 8;
  box-shadow: inset 0 3px 6px rgba(0,0,0,0.5);
}
.selected .rim { border-color: rgba(255,224,130,0.95); }

/* 注ぎ先ヒント */
.hint {
  position: absolute;
  top: calc(var(--bw) * -0.5);
  left: 0;
  right: 0;
  text-align: center;
  font-size: calc(var(--bw) * 0.36);
  color: var(--accent);
  animation: hintBob 0.7s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 9;
}
@keyframes hintBob {
  from { transform: translateY(0); opacity: 0.65; }
  to { transform: translateY(5px); opacity: 1; }
}

/* ---------- 完成ボトル ---------- */
.cork {
  position: absolute;
  top: calc(var(--bw) * -0.16);
  left: 32%;
  right: 32%;
  height: calc(var(--bw) * 0.3);
  border-radius: 5px 5px 3px 3px;
  background: linear-gradient(180deg, #d9a066, #9c6b3c 70%, #7a4f28);
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  z-index: 10;
  animation: corkIn 0.3s cubic-bezier(0.3, 1.6, 0.5, 1) both;
}
@keyframes corkIn {
  from { transform: translateY(-14px) scale(0.6); opacity: 0; }
}
.seal-star {
  position: absolute;
  top: calc(var(--bw) * -0.62);
  left: 0;
  right: 0;
  text-align: center;
  font-size: calc(var(--bw) * 0.4);
  color: #ffe27a;
  z-index: 10;
  animation: sealPop 0.8s ease-out both;
  pointer-events: none;
}
@keyframes sealPop {
  0% { transform: scale(0) rotate(-90deg); opacity: 0; }
  40% { transform: scale(1.5) rotate(10deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 0.9; }
}
.flash .seal-flash {
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  z-index: 9;
  border: 3px solid rgba(255,224,130,0.9);
  border-radius: 12px;
  animation: flashRing 0.7s ease-out both;
  pointer-events: none;
}
@keyframes flashRing {
  0% { opacity: 0; transform: scale(0.9); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.12); }
}

/* 接地影（ぼかし不使用・グラデーションのみ） */
.ground-shadow {
  width: 74%;
  height: calc(var(--bw) * 0.13);
  margin: 5px auto 0;
  background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 68%);
  transition: opacity 0.18s ease;
}
.selected + .ground-shadow, .pouring + .ground-shadow { opacity: 0.35; }

/* ---------- 注ぎ中ボトルのクローン（画面座標オーバーレイ） ---------- */
.clone-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 60;
}
.clone {
  position: absolute;
  transform-origin: 50% calc(var(--bw) * 1.11);
  will-change: transform;
}
.clone .glass-body { box-shadow: none; }

/* ---------- 注ぎストリーム ---------- */
.stream-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 55;
}
.stream {
  position: absolute;
  width: 7px;
  border-radius: 4px;
  transform-origin: top center;
  animation: streamIn 0.13s ease-out 0.17s both;
}
@keyframes streamIn {
  0% { transform: scaleY(0); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: scaleY(1); opacity: 1; }
}
.splash {
  position: absolute;
  width: 26px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--pc);
  opacity: 0;
  animation: splashRing 0.4s ease-out 0.2s infinite;
}
@keyframes splashRing {
  0% { transform: scale(0.3); opacity: 0.9; }
  100% { transform: scale(1.4); opacity: 0; }
}

/* ---------- コントロール ---------- */
.controls {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
}
.ctrl {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  max-width: 78px;
  padding: 9px 0 7px;
  border-radius: 14px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.16);
  cursor: pointer;
  color: inherit;
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.ctrl:active { transform: scale(0.93); }
.ctrl:disabled { opacity: 0.25; cursor: not-allowed; }
.ctrl-icon { font-size: 18px; color: var(--accent); line-height: 1; margin-bottom: 3px; }
.ctrl-label {
  font-size: 8px;
  letter-spacing: 0.2em;
  color: rgba(255,244,214,0.8);
  font-weight: 600;
  font-family: Georgia, serif;
}

/* ---------- モーダル ---------- */
.modal-back {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 0 24px;
  background: rgba(5,3,20,0.9);
  animation: fadeIn 0.25s ease both;
}
@keyframes fadeIn { from { opacity: 0; } }
.modal {
  position: relative;
  max-width: 400px;
  width: 100%;
  max-height: 82dvh;
  overflow-y: auto;
  padding: 26px 24px;
  border-radius: 24px;
  text-align: center;
  background: linear-gradient(180deg, rgba(42,31,94,0.98), rgba(15,10,50,0.98));
  border: 1px solid rgba(255,215,0,0.35);
  animation: popIn 0.3s cubic-bezier(0.3, 1.4, 0.5, 1) both;
}
@keyframes popIn { from { transform: scale(0.85) translateY(16px); opacity: 0; } }
.modal-sub {
  font-size: 10px;
  letter-spacing: 0.5em;
  color: rgba(255,215,0,0.7);
  margin-bottom: 6px;
  font-family: Georgia, serif;
}
.modal-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 14px;
  letter-spacing: 0.15em;
  background: linear-gradient(180deg, #ffd700, #f4a261);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: Georgia, serif;
}
.stars-row { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; }
.star-big { font-size: 38px; color: #3a3160; }
.star-big.earned {
  color: #ffd94d;
  animation: starPop 0.45s cubic-bezier(0.3, 1.8, 0.5, 1) both;
}
.star-big.earned:nth-child(2) { animation-delay: 0.15s; }
.star-big.earned:nth-child(3) { animation-delay: 0.3s; }
@keyframes starPop { from { transform: scale(0) rotate(-120deg); opacity: 0; } }

.btn {
  width: 100%;
  padding: 13px 24px;
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 0.18em;
  font-size: 13px;
  cursor: pointer;
  border: none;
  font-family: Georgia, serif;
  transition: transform 0.15s ease;
}
.btn:active { transform: scale(0.96); }
.btn.primary {
  background: linear-gradient(135deg, #ffd700 0%, #f4a261 100%);
  color: #1a1a3e;
}
.btn.ghost {
  background: rgba(255,255,255,0.07);
  color: rgba(255,244,214,0.9);
  border: 1px solid rgba(255,255,255,0.2);
}
.btn.cool {
  background: linear-gradient(135deg, #4cc9f0 0%, #b66dff 100%);
  color: #fff;
}
.btn:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-row { display: flex; gap: 10px; }
.btn-row .btn { flex: 1; padding-left: 8px; padding-right: 8px; }
.modal-note { color: rgba(255,236,179,0.8); font-size: 14px; margin: 0 0 18px; }

/* レベル選択 */
.level-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 4px 0 16px;
}
.level-cell {
  padding: 8px 2px 6px;
  border-radius: 12px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  cursor: pointer;
  color: rgba(255,244,214,0.95);
  font-family: Georgia, serif;
}
.level-cell.current { border-color: var(--accent); }
.level-cell:active { transform: scale(0.94); }
.level-num { font-size: 15px; font-weight: 700; }
.level-stars { font-size: 9px; color: #ffd94d; letter-spacing: 0.1em; min-height: 12px; }

/* クリア紙吹雪 */
.confetti {
  position: absolute;
  top: -16px;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  opacity: 0;
  animation: confettiFall 1.9s ease-in forwards;
  pointer-events: none;
}
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(560deg); opacity: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  .hint, .confetti { animation: none; }
}
`;
