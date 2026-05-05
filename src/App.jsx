import React, { useState, useRef, useEffect } from "react";

// ============================================
// 定数
// ============================================
const COLORS = [
  { name: "ruby", value: "#e63946", glow: "#ff7a87" },
  { name: "amber", value: "#f4a261", glow: "#ffc97a" },
  { name: "emerald", value: "#06d6a0", glow: "#5dffce" },
  { name: "sapphire", value: "#4cc9f0", glow: "#9ee5ff" },
  { name: "amethyst", value: "#b66dff", glow: "#dca8ff" },
  { name: "rose", value: "#ff5d8f", glow: "#ff9dbb" },
  { name: "gold", value: "#ffd60a", glow: "#fff36b" },
  { name: "ice", value: "#90e0ef", glow: "#c4f0f8" },
];

const BOTTLE_CAPACITY = 4;

// ============================================
// 難易度設定
// ============================================
function getDifficulty(level) {
  if (level === 1) return { numColors: 3, freeBottles: 2, hiddenRate: 0 };
  if (level === 2) return { numColors: 4, freeBottles: 2, hiddenRate: 0 };
  if (level === 3) return { numColors: 5, freeBottles: 2, hiddenRate: 0 };
  if (level === 4) return { numColors: 6, freeBottles: 2, hiddenRate: 0 };
  if (level === 5) return { numColors: 6, freeBottles: 2, hiddenRate: 0.2 };
  if (level === 6) return { numColors: 7, freeBottles: 2, hiddenRate: 0.25 };
  if (level === 7) return { numColors: 6, freeBottles: 1, hiddenRate: 0.3 };
  if (level === 8) return { numColors: 7, freeBottles: 1, hiddenRate: 0.35 };
  if (level === 9) return { numColors: 8, freeBottles: 2, hiddenRate: 0.35 };
  if (level === 10) return { numColors: 8, freeBottles: 1, hiddenRate: 0.4 };
  // 11以降は最高難度を維持
  return { numColors: 8, freeBottles: 1, hiddenRate: 0.45 };
}

// ============================================
// ロジック
// ============================================
function generateStage(level) {
  const { numColors, freeBottles, hiddenRate } = getDifficulty(level);
  const numBottles = numColors + freeBottles;

  // 全ユニット作成
  const allUnits = [];
  for (let i = 0; i < numColors; i++) {
    for (let j = 0; j < BOTTLE_CAPACITY; j++) {
      allUnits.push(i);
    }
  }

  // シャッフル
  for (let i = allUnits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allUnits[i], allUnits[j]] = [allUnits[j], allUnits[i]];
  }

  // ボトルに詰める（最初の numColors 本に詰めて、残りは空）
  const bottles = [];
  for (let i = 0; i < numBottles; i++) bottles.push([]);
  let unitIdx = 0;
  for (let b = 0; b < numColors; b++) {
    for (let s = 0; s < BOTTLE_CAPACITY; s++) {
      bottles[b].push(allUnits[unitIdx++]);
    }
  }

  // 隠し色マスク
  const hidden = bottles.map((bottle) =>
    bottle.map((_, idx) => {
      if (hiddenRate === 0) return false;
      if (idx === bottle.length - 1) return false;
      return Math.random() < hiddenRate;
    })
  );

  return { bottles, hidden };
}

function isCleared(bottles) {
  return bottles.every((b) => {
    if (b.length === 0) return true;
    if (b.length !== BOTTLE_CAPACITY) return false;
    return b.every((c) => c === b[0]);
  });
}

function canPour(bottles, from, to) {
  const src = bottles[from];
  const dst = bottles[to];
  if (!src || !dst) return false;
  if (src.length === 0) return false;
  if (dst.length >= BOTTLE_CAPACITY) return false;
  if (dst.length === 0) return true;
  return src[src.length - 1] === dst[dst.length - 1];
}

function isStuck(bottles) {
  if (isCleared(bottles)) return false;
  for (let i = 0; i < bottles.length; i++) {
    for (let j = 0; j < bottles.length; j++) {
      if (i === j) continue;
      if (canPour(bottles, i, j)) return false;
    }
  }
  return true;
}

function pour(bottles, from, to) {
  const newBottles = bottles.map((b) => [...b]);
  const topColor = newBottles[from][newBottles[from].length - 1];
  while (
    newBottles[from].length > 0 &&
    newBottles[from][newBottles[from].length - 1] === topColor &&
    newBottles[to].length < BOTTLE_CAPACITY
  ) {
    newBottles[to].push(newBottles[from].pop());
  }
  return newBottles;
}

function revealHidden(bottlesArr, hiddenArr) {
  return hiddenArr.map((bh, bi) =>
    bh.map((h, si) => {
      if (!h) return false;
      if (si === bottlesArr[bi].length - 1) return false;
      return true;
    })
  );
}

// ============================================
// メインコンポーネント
// ============================================
export default function MagicSort() {
  // 初期化を遅延評価で1回だけ実行（確実に動く）
  const [gameState, setGameState] = useState(() => {
    const stage = generateStage(1);
    return {
      level: 1,
      bottles: stage.bottles,
      hidden: stage.hidden,
      selected: null,
      history: [],
      moves: 0,
      cleared: false,
      stuck: false,
    };
  });

  const [showDebug, setShowDebug] = useState(false);
  const [pourAnim, setPourAnim] = useState(null); // { from, to, color } | null
  const queuedClickRef = useRef(null); // アニメ中に来たクリックを記憶
  const isProcessingRef = useRef(false); // 処理中フラグ

  const { level, bottles, hidden, selected, history, moves, cleared, stuck } = gameState;

  // 実際の処理ロジック（クリック処理本体）
  const processClick = (idx, currentState) => {
    const { bottles: curBottles, hidden: curHidden, selected: curSelected, history: curHistory, moves: curMoves } = currentState;

    if (currentState.cleared || currentState.stuck) return;

    if (curSelected === null) {
      if (curBottles[idx].length === 0) return;
      setGameState({ ...currentState, selected: idx });
      return;
    }

    if (curSelected === idx) {
      setGameState({ ...currentState, selected: null });
      return;
    }

    if (canPour(curBottles, curSelected, idx)) {
      const colorIdx = curBottles[curSelected][curBottles[curSelected].length - 1];
      const color = COLORS[colorIdx];
      const fromIdx = curSelected;
      const toIdx = idx;

      // 注ぐ方向を計算
      const fromRow = Math.floor(fromIdx / cols);
      const fromCol = fromIdx % cols;
      const toRow = Math.floor(toIdx / cols);
      const toCol = toIdx % cols;
      let direction;
      if (toRow === fromRow) {
        direction = toCol > fromCol ? "right" : "left";
      } else if (toCol === fromCol) {
        direction = toRow > fromRow ? "down" : "up";
      } else {
        direction = toCol > fromCol ? "right" : "left";
      }

      // データを即座に更新（高速化）
      const newBottles = pour(curBottles, fromIdx, toIdx);
      const newHidden = revealHidden(newBottles, curHidden);
      const newHistory = [...curHistory, {
        bottles: curBottles.map((b) => [...b]),
        hidden: curHidden.map((h) => [...h]),
      }];

      isProcessingRef.current = true;
      setPourAnim({ from: fromIdx, to: toIdx, color, direction });

      // ごく短い遅延でデータを更新（傾き始めと同時に色が動く）
      setTimeout(() => {
        setGameState({
          ...currentState,
          bottles: newBottles,
          hidden: newHidden,
          history: newHistory,
          moves: curMoves + 1,
          selected: null,
          cleared: isCleared(newBottles),
          stuck: !isCleared(newBottles) && isStuck(newBottles),
        });
      }, 80);

      // アニメ終了
      setTimeout(() => {
        setPourAnim(null);
        isProcessingRef.current = false;
        // キューに溜まったクリックを処理
        if (queuedClickRef.current !== null) {
          const queuedIdx = queuedClickRef.current;
          queuedClickRef.current = null;
          // 最新のstateで再処理
          setGameState((latest) => {
            // setGameState コールバック内で processClick を呼ぶのは状態同期が難しいので、
            // 次のtickで処理
            setTimeout(() => processClick(queuedIdx, latest), 0);
            return latest;
          });
        }
      }, 250);
    } else {
      if (curBottles[idx].length > 0) {
        setGameState({ ...currentState, selected: idx });
      } else {
        setGameState({ ...currentState, selected: null });
      }
    }
  };

  const handleBottleClick = (idx) => {
    // アニメ中はクリックを記憶（最新の1つだけ覚える）
    if (isProcessingRef.current) {
      queuedClickRef.current = idx;
      return;
    }
    processClick(idx, gameState);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setGameState({
      ...gameState,
      bottles: last.bottles,
      hidden: last.hidden,
      history: history.slice(0, -1),
      moves: Math.max(0, moves - 1),
      selected: null,
      stuck: false,
    });
  };

  const handleReset = () => {
    const stage = generateStage(level);
    setGameState({
      level,
      bottles: stage.bottles,
      hidden: stage.hidden,
      selected: null,
      history: [],
      moves: 0,
      cleared: false,
      stuck: false,
    });
  };

  const handleNextLevel = () => {
    const newLevel = level + 1;
    const stage = generateStage(newLevel);
    setGameState({
      level: newLevel,
      bottles: stage.bottles,
      hidden: stage.hidden,
      selected: null,
      history: [],
      moves: 0,
      cleared: false,
      stuck: false,
    });
  };

  const handleAddBottle = () => {
    if (bottles.length >= 14) return;
    const newHistory = [...history, { bottles: bottles.map((b) => [...b]), hidden: hidden.map((h) => [...h]) }];
    setGameState({
      ...gameState,
      bottles: [...bottles, []],
      hidden: [...hidden, []],
      history: newHistory,
      stuck: false,
    });
  };

  const cols = 5;
  const difficulty = getDifficulty(level);

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      position: "relative",
      overflow: "hidden",
      background: "radial-gradient(ellipse at 50% 0%, #2a1f5e 0%, #15103e 40%, #08051f 100%)",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* デバッグパネル */}
      {showDebug && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "rgba(0,0,0,0.85)",
          color: "#0f0",
          padding: "8px 12px",
          fontSize: "10px",
          fontFamily: "monospace",
          zIndex: 1000,
          maxHeight: "30vh",
          overflowY: "auto",
          borderBottom: "1px solid #0f0",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <strong>🔍 DEBUG</strong>
            <button
              onClick={() => setShowDebug(false)}
              style={{ background: "transparent", color: "#0f0", border: "1px solid #0f0", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
            >
              CLOSE
            </button>
          </div>
          <div>level={level} | bottles.length={bottles.length} | colors={difficulty.numColors} | selected={selected} | moves={moves}</div>
          <div style={{ marginTop: 4 }}>
            <strong>bottles:</strong>
            {bottles.map((b, i) => (
              <div key={i} style={{ marginLeft: 8 }}>
                [{i}] len={b.length} = [{b.map(c => c !== undefined ? COLORS[c]?.name || `??${c}` : "U").join(", ")}]
              </div>
            ))}
          </div>
        </div>
      )}

      {!showDebug && (
        <button
          onClick={() => setShowDebug(true)}
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            background: "rgba(0,255,0,0.2)",
            color: "#0f0",
            border: "1px solid #0f0",
            padding: "4px 8px",
            fontSize: "10px",
            zIndex: 1000,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          DEBUG
        </button>
      )}

      <div style={{
        position: "relative",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        padding: "16px",
        maxWidth: "480px",
        margin: "0 auto",
        paddingTop: showDebug ? "180px" : "16px",
      }}>
        {/* ヘッダー */}
        <header style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.4em", color: "rgba(255, 215, 0, 0.5)", marginBottom: 2 }}>
            ~ MYSTIC POTION ~
          </div>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "0.1em",
            background: "linear-gradient(180deg, #ffd700 0%, #f4a261 60%, #c77d3a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: 0,
            fontFamily: "Georgia, serif",
          }}>
            Magic Sort
          </h1>
        </header>

        {/* ステータス */}
        <div style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          marginBottom: 16,
          padding: "8px 16px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,215,0,0.12)",
        }}>
          <Stat label="LEVEL" value={String(level).padStart(3, "0")} />
          <div style={{ width: 1, height: 32, background: "rgba(255,215,0,0.15)" }} />
          <Stat label="MOVES" value={moves} />
          <div style={{ width: 1, height: 32, background: "rgba(255,215,0,0.15)" }} />
          <Stat label="COLORS" value={difficulty.numColors} />
        </div>

        {/* ボトル群 */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 0",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: "10px",
            width: "100%",
          }}>
            {bottles.map((bottle, idx) => (
              <Bottle
                key={idx}
                bottle={bottle}
                hidden={hidden[idx] || []}
                isSelected={selected === idx}
                isPouringFrom={pourAnim && pourAnim.from === idx}
                pouringColor={pourAnim && pourAnim.from === idx ? pourAnim.color : null}
                pourDirection={pourAnim && pourAnim.from === idx ? pourAnim.direction : null}
                onClick={() => handleBottleClick(idx)}
                debugIdx={idx}
                showDebug={showDebug}
              />
            ))}
          </div>
        </div>

        {/* コントロール */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
          <ControlButton onClick={handleUndo} disabled={history.length === 0} icon="↶" label="UNDO" />
          <ControlButton onClick={handleAddBottle} disabled={bottles.length >= 14} icon="+" label="ADD" />
          <ControlButton onClick={handleReset} icon="⟳" label="RESET" />
        </div>
      </div>

      {/* モーダル */}
      {cleared && (
        <Modal title="CLEAR" subtitle="魔法は完成した">
          <p style={{ color: "rgba(255,236,179,0.8)", textAlign: "center", marginBottom: 8, fontSize: 16 }}>
            {moves} 手で完成
          </p>
          <p style={{ color: "rgba(255,215,0,0.6)", textAlign: "center", marginBottom: 24, fontSize: 12, letterSpacing: "0.2em", fontFamily: "Georgia, serif" }}>
            NEXT: LEVEL {String(level + 1).padStart(3, "0")}
          </p>
          <button
            onClick={handleNextLevel}
            style={{
              width: "100%",
              padding: "12px 32px",
              borderRadius: 999,
              fontWeight: 600,
              letterSpacing: "0.2em",
              fontSize: 14,
              cursor: "pointer",
              background: "linear-gradient(135deg, #ffd700 0%, #f4a261 100%)",
              color: "#1a1a3e",
              boxShadow: "0 0 30px rgba(244, 162, 97, 0.5)",
              fontFamily: "Georgia, serif",
              border: "none",
            }}
          >
            NEXT LEVEL
          </button>
        </Modal>
      )}

      {stuck && !cleared && (
        <Modal title="STUCK" subtitle="手詰まり">
          <p style={{ color: "rgba(255,236,179,0.8)", textAlign: "center", marginBottom: 24, fontSize: 14 }}>
            ボトルを追加するか、リセットしましょう
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleAddBottle}
              disabled={bottles.length >= 14}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 999,
                fontWeight: 600,
                letterSpacing: "0.15em",
                fontSize: 12,
                cursor: bottles.length >= 14 ? "not-allowed" : "pointer",
                opacity: bottles.length >= 14 ? 0.4 : 1,
                background: "linear-gradient(135deg, #4cc9f0 0%, #b66dff 100%)",
                color: "white",
                fontFamily: "Georgia, serif",
                border: "none",
              }}
            >
              + BOTTLE
            </button>
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 999,
                fontWeight: 600,
                letterSpacing: "0.15em",
                fontSize: 12,
                cursor: "pointer",
                background: "linear-gradient(135deg, #ffd700 0%, #f4a261 100%)",
                color: "#1a1a3e",
                fontFamily: "Georgia, serif",
                border: "none",
              }}
            >
              RESET
            </button>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes streamPour {
          0% { opacity: 0; transform: translateX(-50%) translateY(-30px) scaleY(0); }
          15% { opacity: 1; transform: translateX(-50%) translateY(-10px) scaleY(0.5); }
          80% { opacity: 1; transform: translateX(-50%) translateY(0px) scaleY(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(0px) scaleY(1); }
        }
      `}</style>
    </div>
  );
}

// ============================================
// ボトルコンポーネント
// ============================================
function Bottle({ bottle, hidden, isSelected, isPouringFrom, pouringColor, pourDirection, onClick, debugIdx, showDebug }) {
  // 傾きアニメーションのスタイルを方向で決定
  let pourTransform = "rotate(0)";
  let pourTransformOrigin = "bottom center";
  if (isPouringFrom) {
    if (pourDirection === "right") {
      pourTransform = "rotate(25deg) translateX(8px)";
      pourTransformOrigin = "bottom left";
    } else if (pourDirection === "left") {
      pourTransform = "rotate(-25deg) translateX(-8px)";
      pourTransformOrigin = "bottom right";
    } else if (pourDirection === "down") {
      // 真下：少し持ち上げるだけ
      pourTransform = "translateY(-8px)";
      pourTransformOrigin = "bottom center";
    } else if (pourDirection === "up") {
      // 真上：少し下に下がるだけ
      pourTransform = "translateY(4px)";
      pourTransformOrigin = "bottom center";
    }
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: isSelected ? "translateY(-12px)" : "translateY(0)",
        transition: "transform 0.3s",
      }}
    >
      {/* デバッグ表示 */}
      {showDebug && (
        <div style={{
          fontSize: 9,
          color: "#0f0",
          fontFamily: "monospace",
          marginBottom: 2,
        }}>
          #{debugIdx} ({bottle.length})
        </div>
      )}

      {/* 傾き用ラッパー */}
      <div style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transformOrigin: pourTransformOrigin,
        transform: pourTransform,
        transition: isPouringFrom ? "transform 0.1s ease-out" : "transform 0.15s ease-in",
        position: "relative",
        zIndex: isPouringFrom ? 30 : 1,
      }}>

        {/* 首 */}
        <div style={{
          width: "38%",
          height: 10,
          background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))",
          borderRadius: "3px 3px 0 0",
          border: "1.5px solid rgba(255,215,0,0.25)",
          borderBottom: "none",
        }} />

        {/* 胴体（高さ固定） */}
        <div style={{
          width: "100%",
          height: 140,
          background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
          borderRadius: "6px 6px 22px 22px",
          border: `2px solid ${isSelected ? "rgba(255, 215, 0, 0.85)" : "rgba(255,255,255,0.25)"}`,
          boxShadow: isSelected
            ? "0 0 30px rgba(255, 215, 0, 0.5)"
            : "0 6px 20px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column-reverse", // 下から積む
          padding: "3px",
          boxSizing: "border-box",
          position: "relative",
        }}>
        {/* 4つのスロットを必ず作る（空も含めて） */}
        {Array.from({ length: BOTTLE_CAPACITY }).map((_, slotIdx) => {
          const colorIdx = bottle[slotIdx]; // 該当層の色（undefinedなら空）
          const isFilled = colorIdx !== undefined;
          const isHiddenLayer = isFilled && hidden[slotIdx];
          const color = isFilled ? COLORS[colorIdx] : null;

          return (
            <div
              key={slotIdx}
              style={{
                width: "100%",
                height: `${100 / BOTTLE_CAPACITY}%`,
                flex: `0 0 ${100 / BOTTLE_CAPACITY}%`,
                background: !isFilled
                  ? "transparent"
                  : isHiddenLayer
                    ? "linear-gradient(180deg, #3a2f6e, #1f1850)"
                    : `linear-gradient(180deg, ${color.glow} 0%, ${color.value} 100%)`,
                boxShadow: isFilled && !isHiddenLayer
                  ? `inset 0 -3px 6px rgba(0,0,0,0.25), inset 0 2px 4px ${color.glow}99`
                  : isHiddenLayer
                    ? "inset 0 -3px 6px rgba(0,0,0,0.5)"
                    : "none",
                borderRadius: slotIdx === 0 ? "0 0 17px 17px" : "0",
                position: "relative",
                transition: "background 0.15s ease",
              }}
            >
              {/* 上面ハイライト */}
              {isFilled && !isHiddenLayer && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 4,
                  right: 4,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${color.glow}, transparent)`,
                  opacity: 0.7,
                }} />
              )}
              {/* ?マーク */}
              {isHiddenLayer && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(220, 200, 255, 0.7)",
                  fontWeight: 700,
                  fontSize: 18,
                  fontFamily: "Georgia, serif",
                }}>
                  ?
                </div>
              )}
            </div>
          );
        })}

        {/* ガラスのキラリ */}
        <div style={{
          position: "absolute",
          top: 8,
          left: 8,
          width: 3,
          height: "30%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.7), transparent)",
          borderRadius: 999,
          opacity: 0.8,
          pointerEvents: "none",
        }} />
      </div>
      </div>{/* 傾き用ラッパー終了 */}

      {/* 影 */}
      <div style={{
        width: "70%",
        height: 5,
        marginTop: 4,
        background: "radial-gradient(ellipse, rgba(0,0,0,0.6), transparent 70%)",
        filter: "blur(3px)",
      }} />
    </div>
  );
}

// ============================================
// 補助コンポーネント
// ============================================
function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontSize: 9,
        letterSpacing: "0.3em",
        color: "rgba(255,215,0,0.5)",
        marginBottom: 2,
        fontFamily: "Georgia, serif",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 600,
        color: "rgba(255,236,179,1)",
        fontFamily: "Georgia, serif",
      }}>
        {value}
      </div>
    </div>
  );
}

function ControlButton({ onClick, disabled, icon, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        maxWidth: 96,
        padding: "10px 0",
        borderRadius: 16,
        background: "linear-gradient(135deg, rgba(182, 109, 255, 0.18) 0%, rgba(76, 201, 240, 0.12) 100%)",
        border: "1px solid rgba(255, 215, 0, 0.25)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.25 : 1,
        transition: "all 0.2s",
      }}
    >
      <div style={{ fontSize: 20, color: "rgba(255,215,0,0.9)", lineHeight: 1, marginBottom: 4 }}>
        {icon}
      </div>
      <div style={{
        fontSize: 9,
        letterSpacing: "0.2em",
        color: "rgba(255,236,179,0.8)",
        fontWeight: 600,
        fontFamily: "Georgia, serif",
      }}>
        {label}
      </div>
    </button>
  );
}

function Modal({ title, subtitle, children }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
      padding: "0 24px",
      background: "rgba(5, 3, 20, 0.85)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        position: "relative",
        maxWidth: 384,
        width: "100%",
        padding: 28,
        borderRadius: 24,
        textAlign: "center",
        background: "linear-gradient(180deg, rgba(42, 31, 94, 0.96), rgba(15, 10, 50, 0.96))",
        border: "1px solid rgba(255, 215, 0, 0.35)",
        boxShadow: "0 0 60px rgba(182, 109, 255, 0.4)",
      }}>
        <div style={{
          fontSize: 10,
          letterSpacing: "0.5em",
          color: "rgba(255,215,0,0.7)",
          marginBottom: 8,
          fontFamily: "Georgia, serif",
        }}>
          {subtitle}
        </div>
        <h2 style={{
          fontSize: 30,
          fontWeight: 700,
          marginBottom: 20,
          letterSpacing: "0.15em",
          background: "linear-gradient(180deg, #ffd700, #f4a261)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontFamily: "Georgia, serif",
        }}>
          ✦ {title} ✦
        </h2>
        {children}
      </div>
    </div>
  );
}
