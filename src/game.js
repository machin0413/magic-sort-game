// ============================================
// ゲームロジック（純粋関数のみ・UI非依存）
// ============================================
export const BOTTLE_CAPACITY = 4;
export const MAX_BOTTLES = 14;

// ============================================
// 難易度設定
// ============================================
export function getDifficulty(level) {
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
  // 11以降：5の倍数レベルは息抜き回、それ以外は高難度を維持しつつ緩やかに上昇
  if (level % 5 === 0) return { numColors: 7, freeBottles: 2, hiddenRate: 0.15 };
  const hiddenRate = Math.min(0.5, 0.4 + Math.floor((level - 10) / 10) * 0.05);
  return { numColors: 8, freeBottles: 1, hiddenRate };
}

// ============================================
// ステージ生成
// ============================================
export function generateStage(level, rng = Math.random) {
  const { numColors, freeBottles, hiddenRate } = getDifficulty(level);
  const numBottles = numColors + freeBottles;

  const allUnits = [];
  for (let i = 0; i < numColors; i++) {
    for (let j = 0; j < BOTTLE_CAPACITY; j++) allUnits.push(i);
  }

  for (let i = allUnits.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allUnits[i], allUnits[j]] = [allUnits[j], allUnits[i]];
  }

  const bottles = [];
  for (let i = 0; i < numBottles; i++) bottles.push([]);
  let unitIdx = 0;
  for (let b = 0; b < numColors; b++) {
    for (let s = 0; s < BOTTLE_CAPACITY; s++) {
      bottles[b].push(allUnits[unitIdx++]);
    }
  }

  const hidden = bottles.map((bottle) =>
    bottle.map((_, idx) => {
      if (hiddenRate === 0) return false;
      if (idx === bottle.length - 1) return false;
      return rng() < hiddenRate;
    })
  );

  return { bottles, hidden, par: computePar(bottles, numColors) };
}

// 連続する同色の塊の数。1手で塊は最大1つしか減らないので
// (塊数 - 色数) がおおよその理論最小手数になる
export function countBlocks(bottles) {
  let blocks = 0;
  for (const b of bottles) {
    for (let i = 0; i < b.length; i++) {
      if (i === 0 || b[i] !== b[i - 1]) blocks++;
    }
  }
  return blocks;
}

export function computePar(bottles, numColors) {
  return Math.max(1, countBlocks(bottles) - numColors);
}

export function starsFor(moves, par) {
  if (moves <= Math.ceil(par * 1.35) + 1) return 3;
  if (moves <= Math.ceil(par * 2.0) + 4) return 2;
  return 1;
}

// ============================================
// 判定
// ============================================
export function isCleared(bottles) {
  return bottles.every((b) => {
    if (b.length === 0) return true;
    if (b.length !== BOTTLE_CAPACITY) return false;
    return b.every((c) => c === b[0]);
  });
}

export function isBottleComplete(bottle) {
  return bottle.length === BOTTLE_CAPACITY && bottle.every((c) => c === bottle[0]);
}

export function canPour(bottles, from, to) {
  const src = bottles[from];
  const dst = bottles[to];
  if (!src || !dst || from === to) return false;
  if (src.length === 0) return false;
  if (isBottleComplete(src)) return false;
  if (dst.length >= BOTTLE_CAPACITY) return false;
  if (dst.length === 0) return true;
  return src[src.length - 1] === dst[dst.length - 1];
}

export function isStuck(bottles) {
  if (isCleared(bottles)) return false;
  for (let i = 0; i < bottles.length; i++) {
    for (let j = 0; j < bottles.length; j++) {
      if (i === j) continue;
      if (canPour(bottles, i, j)) return false;
    }
  }
  return true;
}

// 注いだ場合に移動するユニット数（アニメーション時間の計算用）
export function pourAmount(bottles, from, to) {
  const src = bottles[from];
  const dst = bottles[to];
  const topColor = src[src.length - 1];
  let run = 0;
  for (let i = src.length - 1; i >= 0 && src[i] === topColor; i--) run++;
  return Math.min(run, BOTTLE_CAPACITY - dst.length);
}

export function pour(bottles, from, to) {
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

// 最上段になった隠し色を開示する（一度開示されたら戻らない）
export function revealHidden(bottlesArr, hiddenArr) {
  return hiddenArr.map((bh, bi) =>
    bh.map((h, si) => {
      if (!h) return false;
      if (si === bottlesArr[bi].length - 1) return false;
      return true;
    })
  );
}

// ============================================
// セーブデータ
// ============================================
const SAVE_KEY = "magic-sort-save-v2";

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.level !== "number" || s.level < 1) return null;
    return {
      level: Math.floor(s.level),
      sound: s.sound !== false,
      runes: s.runes !== false,
      totalStars: s.totalStars || 0,
      clears: s.clears || 0,
      best: s.best || {},
    };
  } catch {
    return null;
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ストレージ不可の環境ではセーブなしで続行
  }
}
