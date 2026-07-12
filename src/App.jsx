import React, { useState, useRef, useEffect } from "react";
import {
  BOTTLE_CAPACITY,
  MAX_BOTTLES,
  getDifficulty,
  generateStage,
  isCleared,
  isBottleComplete,
  canPour,
  isStuck,
  pour,
  pourAmount,
  revealHidden,
  starsFor,
  loadSave,
  persistSave,
} from "./game.js";
import { COLORS, themeFor } from "./colors.js";
import { sfx, setMuted } from "./audio.js";
import { CSS } from "./styles.js";

// 液体1ユニットの高さ（ボトル内高に対する%）
const UNIT_H = 23.5;

// 注ぎアニメーションのタイミング（CSSのtransition/delayと同期）
// ゲーム状態はクリック即時に更新され、アニメーションは演出として後追いする
const T_MOVE = 140;
const T_BACK = 180;

// 背景装飾はモジュール読み込み時に一度だけ生成
const BG_STARS = Array.from({ length: 34 }, () => ({
  left: Math.random() * 100,
  top: Math.random() * 60,
  delay: Math.random() * 3,
  dur: 2.2 + Math.random() * 2.5,
  size: 1.5 + Math.random() * 2,
}));
const BG_RISE = Array.from({ length: 9 }, () => ({
  left: 4 + Math.random() * 92,
  delay: Math.random() * 9,
  dur: 7 + Math.random() * 6,
}));

// タッチ端末では視差を切る（タップのたびに盤面が動いて注ぎ座標がずれるため）
const FINE_POINTER =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function freshGame(level) {
  const stage = generateStage(level);
  return {
    level,
    bottles: stage.bottles,
    hidden: stage.hidden,
    par: stage.par,
    selected: null,
    history: [],
    moves: 0,
    cleared: false,
    stuck: false,
    stars: 0,
  };
}

export default function App() {
  const [save, setSave] = useState(() => {
    return (
      loadSave() || {
        level: 1,
        sound: true,
        runes: true,
        totalStars: 0,
        clears: 0,
        best: {},
      }
    );
  });
  const [game, setGame] = useState(() => freshGame(loadSave()?.level || 1));
  const [anims, setAnims] = useState([]); // 進行中の注ぎ演出（複数同時可）
  const [flash, setFlash] = useState(null); // { idx, key }
  const [showLevels, setShowLevels] = useState(false);

  const gameRef = useRef(game);
  gameRef.current = game;
  const saveRef = useRef(save);
  saveRef.current = save;
  const animsRef = useRef(anims);
  animsRef.current = anims;
  const bottleRefs = useRef([]);
  const sceneRef = useRef(null);
  const boardRef = useRef(null);
  const animSeq = useRef(0);

  useEffect(() => {
    setMuted(!save.sound);
  }, [save.sound]);

  // 検証・デバッグ用フック
  useEffect(() => {
    window.__ms = {
      get game() {
        return gameRef.current;
      },
      get anims() {
        return animsRef.current;
      },
      click: (i) => handleBottleClick(i),
      load: (lv) => loadLevel(lv),
    };
  });

  const { level, bottles, hidden, par, selected, history, moves, cleared, stuck } = game;
  const theme = themeFor(level);
  const difficulty = getDifficulty(level);

  // ---------- レイアウト（5本までは1列、以降は奥/手前の2列） ----------
  const n = bottles.length;
  const backCount = n > 5 ? Math.ceil(n / 2) : 0;
  const rowsIdx = backCount
    ? [
        Array.from({ length: backCount }, (_, i) => i),
        Array.from({ length: n - backCount }, (_, i) => backCount + i),
      ]
    : [Array.from({ length: n }, (_, i) => i)];
  const maxRowLen = Math.max(...rowsIdx.map((r) => r.length));

  const updateSave = (patch) => {
    const next = { ...saveRef.current, ...patch };
    setSave(next);
    persistSave(next);
  };

  // gameRefを即時更新してからsetStateする。
  // 描画を待たずに次のクリックを処理できるので、高速連打でも状態がずれない
  const commitGame = (next) => {
    gameRef.current = next;
    setGame(next);
  };

  const loadLevel = (lv) => {
    setAnims([]);
    setFlash(null);
    setShowLevels(false);
    commitGame(freshGame(lv));
  };

  // ---------- 注ぎのジオメトリ ----------
  // 注ぎ中のボトルは3D盤面から切り離した画面座標のクローンとして飛ばすので、
  // getBoundingClientRect（射影済みの実座標）だけで厳密に位置合わせできる
  const computePourGeometry = (fromIdx, toIdx) => {
    const sEl = bottleRefs.current[fromIdx];
    const tEl = bottleRefs.current[toIdx];
    if (!sEl || !tEl) return null;
    const s = sEl.getBoundingClientRect();
    const t = tEl.getBoundingClientRect();
    const bwS = s.width;
    const bwT = t.width;
    const sCx = s.left + bwS / 2;
    const tCx = t.left + bwT / 2;
    const side = tCx >= sCx ? 1 : -1;
    const tgtRimY = t.top + 0.17 * bwT; // 注ぎ先リム中心
    const mouthX = tCx; // 口をリムの真上に置く
    const mouthY = tgtRimY - 0.52 * bwT;
    // ボトル中心（transform-origin）から見た回転72°後の口のオフセットを逆算
    const restCy = s.top + 1.11 * bwS;
    return {
      bw: bwS,
      left: s.left,
      top: s.top,
      cx: mouthX - side * 0.894 * bwS - sCx,
      cy: mouthY + 0.29 * bwS - restCy,
      rot: side * 72,
      stream: {
        x: mouthX,
        top: mouthY,
        h: tgtRimY - mouthY,
        splashTop: tgtRimY - 5,
        splashX: tCx,
      },
    };
  };

  // ---------- クリック処理 ----------
  const processClick = (idx, cur) => {
    if (cur.cleared || cur.stuck) return;
    const curBottles = cur.bottles;

    if (cur.selected === null) {
      if (curBottles[idx].length === 0 || isBottleComplete(curBottles[idx])) {
        sfx.deny();
        return;
      }
      sfx.select();
      commitGame({ ...cur, selected: idx });
      return;
    }

    if (cur.selected === idx) {
      sfx.deselect();
      commitGame({ ...cur, selected: null });
      return;
    }

    if (canPour(curBottles, cur.selected, idx)) {
      const fromIdx = cur.selected;
      const toIdx = idx;
      const units = pourAmount(curBottles, fromIdx, toIdx);
      const colorIdx = curBottles[fromIdx][curBottles[fromIdx].length - 1];
      const geo = computePourGeometry(fromIdx, toIdx);

      const newBottles = pour(curBottles, fromIdx, toIdx);
      const newHidden = revealHidden(newBottles, cur.hidden);
      const newMoves = cur.moves + 1;
      const nowCleared = isCleared(newBottles);
      const nowStuck = !nowCleared && isStuck(newBottles);
      const justCompleted =
        isBottleComplete(newBottles[toIdx]) && !isBottleComplete(curBottles[toIdx]);
      const stars = nowCleared ? starsFor(newMoves, cur.par) : 0;
      const newState = {
        ...cur,
        bottles: newBottles,
        hidden: newHidden,
        history: [
          ...cur.history,
          { bottles: curBottles.map((b) => [...b]), hidden: cur.hidden.map((h) => [...h]) },
        ],
        moves: newMoves,
        selected: null,
        cleared: nowCleared,
        stuck: nowStuck,
        stars,
      };

      // 状態はクリックした瞬間に確定させる（入力を一切ブロックしない）
      sfx.pour(units);
      commitGame(newState);
      if (justCompleted) {
        setFlash({ idx: toIdx, key: Date.now() });
        sfx.complete();
      }
      if (nowCleared) {
        sfx.clear();
        const s = saveRef.current;
        const prevBest = s.best[cur.level] || 0;
        updateSave({
          level: Math.max(s.level, cur.level + 1),
          totalStars: s.totalStars + Math.max(0, stars - prevBest),
          clears: s.clears + 1,
          best: { ...s.best, [cur.level]: Math.max(prevBest, stars) },
        });
      } else if (nowStuck) {
        sfx.stuck();
      }

      // 演出は独立して後追いさせる（同じボトルの古い演出は即完了扱い）
      const id = ++animSeq.current;
      setAnims((prev) => [
        ...prev.filter(
          (a) => a.from !== fromIdx && a.to !== fromIdx && a.from !== toIdx && a.to !== toIdx
        ),
        {
          id,
          from: fromIdx,
          to: toIdx,
          colorIdx,
          units,
          prevToLen: curBottles[toIdx].length,
          srcContents: [...curBottles[fromIdx]],
          srcHidden: [...cur.hidden[fromIdx]],
          flying: false,
          returning: false,
          ...(geo || { bw: null, stream: null }),
        },
      ]);
      // 初期姿勢を1フレーム描画してからtransitionで飛ばす
      setTimeout(() => {
        setAnims((prev) => prev.map((a) => (a.id === id ? { ...a, flying: true } : a)));
      }, 30);
      const holdMs = 30 + T_MOVE + 170 + units * 70;
      setTimeout(() => {
        setAnims((prev) => prev.map((a) => (a.id === id ? { ...a, returning: true } : a)));
      }, holdMs);
      setTimeout(() => {
        setAnims((prev) => prev.filter((a) => a.id !== id));
      }, holdMs + T_BACK);
    } else {
      if (curBottles[idx].length > 0 && !isBottleComplete(curBottles[idx])) {
        sfx.select();
        commitGame({ ...cur, selected: idx });
      } else {
        sfx.deny();
        commitGame({ ...cur, selected: null });
      }
    }
  };

  const handleBottleClick = (idx) => {
    processClick(idx, gameRef.current);
  };

  const handleUndo = () => {
    const cur = gameRef.current;
    if (cur.history.length === 0) return;
    sfx.undo();
    setAnims([]);
    const last = cur.history[cur.history.length - 1];
    commitGame({
      ...cur,
      bottles: last.bottles,
      hidden: last.hidden,
      history: cur.history.slice(0, -1),
      moves: Math.max(0, cur.moves - 1),
      selected: null,
      cleared: false,
      stuck: false,
      stars: 0,
    });
  };

  const handleReset = () => loadLevel(level);
  const handleNext = () => loadLevel(level + 1);

  const handleAddBottle = () => {
    const cur = gameRef.current;
    if (cur.bottles.length >= MAX_BOTTLES) return;
    sfx.select();
    commitGame({
      ...cur,
      bottles: [...cur.bottles, []],
      hidden: [...cur.hidden, []],
      history: [
        ...cur.history,
        { bottles: cur.bottles.map((b) => [...b]), hidden: cur.hidden.map((h) => [...h]) },
      ],
      stuck: false,
    });
  };

  const toggleSound = () => updateSave({ sound: !saveRef.current.sound });
  const toggleRunes = () => updateSave({ runes: !saveRef.current.runes });

  // ---------- 視差（ポインタ追従・stateを介さず直接CSS変数を更新） ----------
  const handleParallax = (e) => {
    // タッチ端末では無効。注ぎ演出中も盤面を動かさない（クローンとの位置ずれ防止）
    if (!FINE_POINTER || animsRef.current.length > 0) return;
    const el = boardRef.current;
    if (!el || !sceneRef.current) return;
    const r = sceneRef.current.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tx", `${(nx * 6).toFixed(2)}deg`);
    el.style.setProperty("--ty", `${(-ny * 4).toFixed(2)}deg`);
  };
  const resetParallax = () => {
    const el = boardRef.current;
    if (!el) return;
    el.style.setProperty("--tx", "0deg");
    el.style.setProperty("--ty", "0deg");
  };

  // ---------- 描画 ----------
  const bwCalc = `min(72px, calc((min(100vw, 560px) - 32px - ${(maxRowLen - 1) * 10}px) / ${maxRowLen}))`;
  const showClearModal = cleared && anims.length === 0;
  const showStuckModal = stuck && !cleared && anims.length === 0;

  return (
    <div
      className="scene"
      ref={(el) => (sceneRef.current = el)}
      onPointerMove={handleParallax}
      onPointerLeave={resetParallax}
      style={{
        "--sky0": theme.sky[0],
        "--sky1": theme.sky[1],
        "--sky2": theme.sky[2],
        "--accent": theme.accent,
        "--mist": theme.mist,
      }}
    >
      <style>{CSS}</style>

      {/* 背景装飾 */}
      {BG_STARS.map((s, i) => (
        <div
          key={i}
          className="star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
          }}
        />
      ))}
      <div className="bg-orb" style={{ width: 260, height: 260, left: "-8%", top: "8%", background: theme.mist }} />
      <div className="bg-orb" style={{ width: 300, height: 300, right: "-12%", top: "42%", background: theme.mist, animationDelay: "-8s" }} />
      {BG_RISE.map((b, i) => (
        <div
          key={i}
          className="rise"
          style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}
        />
      ))}
      <div className="bg-mist" />

      <div className="frame">
        <header className="brand">
          <div className="brand-sub">~ MYSTIC POTION ~</div>
          <h1 className="brand-title">Magic Sort</h1>
          <div className="theme-name">{theme.jp}</div>
        </header>

        <div className="statbar">
          <div className="stat">
            <div className="stat-label">LEVEL</div>
            <div className="stat-value">{String(level).padStart(3, "0")}</div>
          </div>
          <div className="stat-sep" />
          <div className="stat">
            <div className="stat-label">MOVES</div>
            <div className="stat-value">
              {moves} <small>/ {par}</small>
            </div>
          </div>
          <div className="stat-sep" />
          <div className="stat">
            <div className="stat-label">STARS</div>
            <div className="stat-value">★ {save.totalStars}</div>
          </div>
        </div>

        <div className="board-wrap">
          <div className="board" ref={(el) => (boardRef.current = el)} style={{ "--bw": bwCalc }}>
            {rowsIdx.map((row, ri) => (
              <div key={ri} className={`row ${backCount && ri === 0 ? "back" : "front"}`}>
                {row.map((idx) => {
                  let srcAnim = null;
                  let tgtAnim = null;
                  for (const a of anims) {
                    if (a.from === idx) srcAnim = a;
                    if (a.to === idx && !a.returning) tgtAnim = a;
                  }
                  return (
                    <Bottle
                      key={idx}
                      idx={idx}
                      bottle={bottles[idx]}
                      hiddenArr={hidden[idx] || []}
                      isSelected={selected === idx}
                      pourable={
                        selected !== null && selected !== idx && canPour(bottles, selected, idx)
                      }
                      complete={isBottleComplete(bottles[idx])}
                      flashing={flash && flash.idx === idx}
                      srcAnim={srcAnim}
                      tgtAnim={tgtAnim}
                      showRunes={save.runes}
                      refFn={(el) => (bottleRefs.current[idx] = el)}
                      onClick={() => handleBottleClick(idx)}
                    />
                  );
                })}
              </div>
            ))}
          </div>

        </div>

        <div className="controls">
          <button className="ctrl" onClick={handleUndo} disabled={history.length === 0}>
            <div className="ctrl-icon">↶</div>
            <div className="ctrl-label">UNDO</div>
          </button>
          <button className="ctrl" onClick={handleAddBottle} disabled={bottles.length >= MAX_BOTTLES}>
            <div className="ctrl-icon">+</div>
            <div className="ctrl-label">ADD</div>
          </button>
          <button className="ctrl" onClick={handleReset}>
            <div className="ctrl-icon">⟳</div>
            <div className="ctrl-label">RESET</div>
          </button>
          <button className="ctrl" onClick={() => setShowLevels(true)}>
            <div className="ctrl-icon">▦</div>
            <div className="ctrl-label">LEVELS</div>
          </button>
          <button className="ctrl" onClick={toggleRunes}>
            <div className="ctrl-icon" style={{ opacity: save.runes ? 1 : 0.45 }}>
              {save.runes ? "❖" : "◇"}
            </div>
            <div className="ctrl-label">RUNES</div>
          </button>
          <button className="ctrl" onClick={toggleSound}>
            <div className="ctrl-icon">{save.sound ? "♪" : "∅"}</div>
            <div className="ctrl-label">{save.sound ? "SOUND" : "MUTED"}</div>
          </button>
        </div>
      </div>

      {/* 注ぎ演出のオーバーレイ。
          perspective/transform を持つ要素の内側に置くと position:fixed の基準が
          ビューポートでなくなるため、必ず .scene 直下に置くこと */}
      {anims.some((a) => !a.returning && a.stream) && (
        <div className="stream-layer">
          {anims
            .filter((a) => !a.returning && a.stream)
            .map((a) => (
              <React.Fragment key={a.id}>
                <div
                  className="stream"
                  style={{
                    left: a.stream.x - 3,
                    top: a.stream.top,
                    height: a.stream.h,
                    "--pc": COLORS[a.colorIdx].value,
                    background: `linear-gradient(180deg, ${COLORS[a.colorIdx].glow}, ${COLORS[a.colorIdx].value})`,
                  }}
                />
                <div
                  className="splash"
                  style={{
                    left: a.stream.splashX - 13,
                    top: a.stream.splashTop,
                    "--pc": COLORS[a.colorIdx].glow,
                  }}
                />
              </React.Fragment>
            ))}
        </div>
      )}

      {/* 注ぎ中のボトル本体（画面座標で正確に飛ばすクローン） */}
      {anims.some((a) => a.bw != null) && (
        <div className="clone-layer">
          {anims
            .filter((a) => a.bw != null)
            .map((a) => (
              <BottleClone key={a.id} anim={a} showRunes={save.runes} />
            ))}
        </div>
      )}

      {/* クリアモーダル */}
      {showClearModal && (
        <Modal title="CLEAR" subtitle="魔法は完成した">
          <Confetti />
          <div className="stars-row">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`star-big ${game.stars >= i ? "earned" : ""}`}>
                ★
              </div>
            ))}
          </div>
          <p className="modal-note">
            {moves} 手で完成（PAR {par}）
          </p>
          <button className="btn primary" onClick={handleNext}>
            NEXT — LEVEL {String(level + 1).padStart(3, "0")}
          </button>
          <div style={{ height: 10 }} />
          <button className="btn ghost" onClick={handleReset}>
            REPLAY
          </button>
        </Modal>
      )}

      {/* 手詰まりモーダル */}
      {showStuckModal && (
        <Modal title="STUCK" subtitle="手詰まり">
          <p className="modal-note">打つ手がありません。戻るか、ボトルを追加しましょう</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={handleUndo} disabled={history.length === 0}>
              ↶ UNDO
            </button>
            <button
              className="btn cool"
              onClick={handleAddBottle}
              disabled={bottles.length >= MAX_BOTTLES}
            >
              + BOTTLE
            </button>
            <button className="btn primary" onClick={handleReset}>
              RESET
            </button>
          </div>
        </Modal>
      )}

      {/* レベル選択モーダル */}
      {showLevels && (
        <Modal title="LEVELS" subtitle="旅の記録">
          <div className="level-grid">
            {Array.from({ length: save.level }, (_, i) => i + 1).map((lv) => (
              <button
                key={lv}
                className={`level-cell ${lv === level ? "current" : ""}`}
                onClick={() => loadLevel(lv)}
              >
                <div className="level-num">{lv}</div>
                <div className="level-stars">
                  {save.best[lv] ? "★".repeat(save.best[lv]) : lv < save.level ? "—" : "NEW"}
                </div>
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setShowLevels(false)}>
            CLOSE
          </button>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// ボトル（純粋コンポーネント・フックなし）
// ============================================
// 液体の積層（ボトル本体とクローンで共用）
function LiquidStack({ bottle, hiddenArr, showRunes, tgtAnim }) {
  const len = bottle.length;
  const topColor = len > 0 ? COLORS[bottle[len - 1]] : null;
  return (
    <div className="liquid">
      {len === 0 && <div className="base-ellipse" />}
      {bottle.map((colorIdx, slotIdx) => {
        const isHidden = hiddenArr[slotIdx];
        const c = COLORS[colorIdx];
        const isNew = tgtAnim && slotIdx >= tgtAnim.prevToLen;
        return (
          <div
            key={slotIdx}
            className={`seg ${isHidden ? "hidden-seg" : ""} ${isNew ? "newfill" : ""}`}
            style={{
              bottom: `${slotIdx * UNIT_H}%`,
              background: isHidden
                ? "linear-gradient(180deg, #2c2450, #171034)"
                : `linear-gradient(180deg, ${c.glow} 0%, ${c.value} 45%, ${c.dark} 100%)`,
              boxShadow: isHidden
                ? "inset 0 2px 6px rgba(0,0,0,0.5)"
                : "inset 0 1px 1px rgba(255,255,255,0.3)",
              animationDelay: isNew
                ? `${0.1 + (slotIdx - tgtAnim.prevToLen) * 0.06}s`
                : undefined,
            }}
          >
            {(isHidden || showRunes) && (
              <div className="sym">{isHidden ? "?" : c.symbol}</div>
            )}
          </div>
        );
      })}
      {len > 0 && (
        <div
          className="surface"
          style={{
            bottom: `${len * UNIT_H}%`,
            background: `radial-gradient(ellipse at 50% 38%, ${topColor.glow}, ${topColor.value} 78%)`,
          }}
        />
      )}
    </div>
  );
}

function Bottle({
  idx,
  bottle,
  hiddenArr,
  isSelected,
  pourable,
  complete,
  flashing,
  srcAnim,
  tgtAnim,
  showRunes,
  refFn,
  onClick,
}) {
  // 注ぎ中は画面座標のクローンが本体の代わりに飛ぶので、実体は隠す
  const cloneFlying = srcAnim && srcAnim.bw != null;

  const liftCls = [
    "lift",
    isSelected ? "selected" : "",
    srcAnim ? "pouring" : "",
    complete ? "complete" : "",
    flashing ? "flash" : "",
    pourable ? "pourable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="bottle" ref={refFn} onClick={onClick} data-testid={`bottle-${idx}`}>
      <div className={liftCls} style={cloneFlying ? { visibility: "hidden" } : undefined}>
        <div className="glass">
          <div className="glass-body">
            <LiquidStack
              bottle={bottle}
              hiddenArr={hiddenArr}
              showRunes={showRunes}
              tgtAnim={tgtAnim}
            />
            <div className="edge-shade" />
            <div className="gloss" />
          </div>
          <div className="rim" />
          {complete && <div className="cork" />}
          {flashing && <div className="seal-star">✦</div>}
          {pourable && <div className="hint">▾</div>}
        </div>
      </div>
      <div className="ground-shadow" />
    </div>
  );
}

// 注ぎ中のボトルの分身。3D盤面の外（画面座標）で飛ばすことで
// 視差や遠近法の影響を受けず、注ぎ先の口へ正確に位置合わせできる
function BottleClone({ anim, showRunes }) {
  const contents = anim.returning
    ? anim.srcContents.slice(0, anim.srcContents.length - anim.units)
    : anim.srcContents;
  // 待機（選択で浮いた位置）→ 注ぎ姿勢 → 元の位置、をtransitionで移動
  const pose = anim.returning
    ? "translate(0px, 0px) rotate(0deg)"
    : anim.flying
      ? `translate(${anim.cx}px, ${anim.cy}px) rotate(${anim.rot}deg)`
      : `translate(0px, ${(-0.24 * anim.bw).toFixed(1)}px) rotate(0deg)`;
  return (
    <div
      className="clone"
      style={{
        left: anim.left,
        top: anim.top,
        width: anim.bw,
        "--bw": `${anim.bw}px`,
        transform: pose,
        transition: anim.returning
          ? "transform 0.18s cubic-bezier(0.3, 0, 0.55, 1)"
          : "transform 0.14s cubic-bezier(0.4, 0, 0.5, 1)",
      }}
    >
      <div className="glass">
        <div className="glass-body">
          <LiquidStack
            bottle={contents}
            hiddenArr={anim.srcHidden}
            showRunes={showRunes}
            tgtAnim={null}
          />
          <div className="edge-shade" />
          <div className="gloss" />
        </div>
        <div className="rim" />
      </div>
    </div>
  );
}

// ============================================
// 補助コンポーネント（純粋）
// ============================================
function Modal({ title, subtitle, children }) {
  return (
    <div className="modal-back">
      <div className="modal">
        <div className="modal-sub">{subtitle}</div>
        <h2 className="modal-title">✦ {title} ✦</h2>
        {children}
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: 26 }, (_, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${(i * 137) % 100}%`,
            background: COLORS[i % COLORS.length].value,
            animationDelay: `${(i % 9) * 0.13}s`,
          }}
        />
      ))}
    </div>
  );
}
