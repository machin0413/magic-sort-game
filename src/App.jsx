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
const T_MOVE = 280;
const T_BACK = 240;

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
      loadSave() || { level: 1, sound: true, totalStars: 0, clears: 0, best: {} }
    );
  });
  const [game, setGame] = useState(() => freshGame(loadSave()?.level || 1));
  const [pourAnim, setPourAnim] = useState(null);
  const [flash, setFlash] = useState(null); // { idx, key }
  const [showLevels, setShowLevels] = useState(false);

  const gameRef = useRef(game);
  gameRef.current = game;
  const saveRef = useRef(save);
  saveRef.current = save;
  const bottleRefs = useRef([]);
  const sceneRef = useRef(null);
  const boardRef = useRef(null);
  const isProcessingRef = useRef(false);
  const queuedClickRef = useRef(null);

  useEffect(() => {
    setMuted(!save.sound);
  }, [save.sound]);

  // 検証・デバッグ用フック
  useEffect(() => {
    window.__ms = {
      get game() {
        return gameRef.current;
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

  const loadLevel = (lv) => {
    isProcessingRef.current = false;
    queuedClickRef.current = null;
    setPourAnim(null);
    setFlash(null);
    setShowLevels(false);
    setGame(freshGame(lv));
  };

  // ---------- 注ぎの3Dジオメトリ ----------
  const computePourGeometry = (fromIdx, toIdx) => {
    const sceneEl = sceneRef.current;
    const sEl = bottleRefs.current[fromIdx];
    const tEl = bottleRefs.current[toIdx];
    if (!sceneEl || !sEl || !tEl) return null;
    const wrap = sceneEl.getBoundingClientRect();
    const s = sEl.getBoundingClientRect();
    const t = tEl.getBoundingClientRect();
    const bw = s.width;
    const sCx = s.left + s.width / 2;
    const tCx = t.left + t.width / 2;
    const side = tCx >= sCx ? 1 : -1;
    // 回転後にボトルの口が注ぎ先リムの真上へ来る位置を逆算（回転72°前提）
    const desiredCx = tCx - side * 0.894 * bw;
    const desiredCy = t.top - 0.09 * bw;
    const srcCenterY = s.top + 1.11 * bw;
    // 奥の列はperspectiveで縮小表示されるため移動量を補正
    const backScale = fromIdx < backCount ? 1.085 : 1;
    const tx = (desiredCx - sCx) * backScale;
    const ty = (desiredCy - srcCenterY) * backScale;
    const tgtRimY = t.top + 0.17 * bw;
    return {
      tx,
      ty,
      rot: side * 72,
      stream: {
        x: tCx - wrap.left,
        top: tgtRimY - 0.55 * bw - wrap.top,
        h: 0.55 * bw,
        splashTop: tgtRimY - wrap.top - 5,
        splashX: tCx - wrap.left,
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
      setGame({ ...cur, selected: idx });
      return;
    }

    if (cur.selected === idx) {
      sfx.deselect();
      setGame({ ...cur, selected: null });
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

      const tPour = 240 + units * 150;
      isProcessingRef.current = true;
      sfx.pour(units);
      setPourAnim({
        from: fromIdx,
        to: toIdx,
        colorIdx,
        units,
        prevToLen: curBottles[toIdx].length,
        returning: false,
        ...(geo || { tx: 0, ty: -30, rot: 40, stream: null }),
      });

      setTimeout(() => {
        setGame(newState);
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
      }, T_MOVE);

      setTimeout(() => {
        setPourAnim((p) => (p ? { ...p, returning: true } : null));
      }, T_MOVE + tPour);

      setTimeout(() => {
        setPourAnim(null);
        isProcessingRef.current = false;
        if (queuedClickRef.current !== null) {
          const q = queuedClickRef.current;
          queuedClickRef.current = null;
          processClick(q, gameRef.current);
        }
      }, T_MOVE + tPour + T_BACK);
    } else {
      if (curBottles[idx].length > 0 && !isBottleComplete(curBottles[idx])) {
        sfx.select();
        setGame({ ...cur, selected: idx });
      } else {
        sfx.deny();
        setGame({ ...cur, selected: null });
      }
    }
  };

  const handleBottleClick = (idx) => {
    if (isProcessingRef.current) {
      queuedClickRef.current = idx;
      return;
    }
    processClick(idx, gameRef.current);
  };

  const handleUndo = () => {
    const cur = gameRef.current;
    if (cur.history.length === 0 || isProcessingRef.current) return;
    sfx.undo();
    const last = cur.history[cur.history.length - 1];
    setGame({
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
    if (cur.bottles.length >= MAX_BOTTLES || isProcessingRef.current) return;
    sfx.select();
    setGame({
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

  // ---------- 視差（ポインタ追従・stateを介さず直接CSS変数を更新） ----------
  const handleParallax = (e) => {
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
  const showClearModal = cleared && !pourAnim;
  const showStuckModal = stuck && !cleared && !pourAnim;

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
                {row.map((idx) => (
                  <Bottle
                    key={idx}
                    idx={idx}
                    bottle={bottles[idx]}
                    hiddenArr={hidden[idx] || []}
                    isSelected={selected === idx}
                    pourable={
                      selected !== null &&
                      selected !== idx &&
                      !pourAnim &&
                      canPour(bottles, selected, idx)
                    }
                    complete={isBottleComplete(bottles[idx])}
                    flashing={flash && flash.idx === idx}
                    pourAnim={pourAnim}
                    refFn={(el) => (bottleRefs.current[idx] = el)}
                    onClick={() => handleBottleClick(idx)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* 注ぎストリーム（3D変形の外のオーバーレイ） */}
          {pourAnim && !pourAnim.returning && pourAnim.stream && (
            <div className="stream-layer" style={{ position: "fixed", inset: 0 }}>
              <div
                className="stream"
                style={{
                  left: pourAnim.stream.x - 3,
                  top: pourAnim.stream.top,
                  height: pourAnim.stream.h,
                  "--pc": COLORS[pourAnim.colorIdx].value,
                  background: `linear-gradient(180deg, ${COLORS[pourAnim.colorIdx].glow}, ${COLORS[pourAnim.colorIdx].value})`,
                }}
              />
              <div
                className="splash"
                style={{
                  left: pourAnim.stream.splashX - 13,
                  top: pourAnim.stream.splashTop,
                  "--pc": COLORS[pourAnim.colorIdx].glow,
                }}
              />
            </div>
          )}
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
          <button className="ctrl" onClick={toggleSound}>
            <div className="ctrl-icon">{save.sound ? "♪" : "∅"}</div>
            <div className="ctrl-label">{save.sound ? "SOUND" : "MUTED"}</div>
          </button>
        </div>
      </div>

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
function Bottle({
  idx,
  bottle,
  hiddenArr,
  isSelected,
  pourable,
  complete,
  flashing,
  pourAnim,
  refFn,
  onClick,
}) {
  const isSource = pourAnim && pourAnim.from === idx;
  const isTarget = pourAnim && pourAnim.to === idx;
  const len = bottle.length;
  const topColor = len > 0 ? COLORS[bottle[len - 1]] : null;

  const liftStyle =
    isSource && !pourAnim.returning
      ? { transform: `translate(${pourAnim.tx}px, ${pourAnim.ty}px) rotate(${pourAnim.rot}deg)` }
      : undefined;

  const liftCls = [
    "lift",
    isSelected ? "selected" : "",
    isSource ? "pouring" : "",
    complete ? "complete" : "",
    flashing ? "flash" : "",
    pourable ? "pourable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="bottle"
      ref={refFn}
      onClick={onClick}
      data-testid={`bottle-${idx}`}
      style={isSource ? { zIndex: 60 } : undefined}
    >
      <div className={liftCls} style={liftStyle}>
        <div className="glass">
          <div className="glass-body">
            <div className="liquid">
              {len === 0 && <div className="base-ellipse" />}
              {bottle.map((colorIdx, slotIdx) => {
                const isHidden = hiddenArr[slotIdx];
                const c = COLORS[colorIdx];
                const isNew =
                  isTarget && pourAnim.prevToLen != null && slotIdx >= pourAnim.prevToLen;
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
                        ? `${(slotIdx - pourAnim.prevToLen) * 0.09}s`
                        : undefined,
                    }}
                  >
                    <div className="sym">{isHidden ? "?" : c.symbol}</div>
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
