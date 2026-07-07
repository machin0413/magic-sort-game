// ============================================
// カラーパレット
// 色覚特性があっても区別できるように
//  1) 色相を最大限離す  2) 明度に大きな差をつける
//  3) 各色に固有のシンボル（魔法のルーン）を刻む
// ============================================
// 序盤のレベル（先頭からN色を使う）ほど互いに離れた色になる並び順
export const COLORS = [
  { name: "ruby",   jp: "紅",  value: "#ff4d6d", glow: "#ff9db0", dark: "#b3123a", symbol: "●" },
  { name: "ocean",  jp: "青",  value: "#2f6bff", glow: "#7da3ff", dark: "#1436a8", symbol: "◆" },
  { name: "sun",    jp: "黄",  value: "#ffd60a", glow: "#fff066", dark: "#c7a300", symbol: "★" },
  { name: "leaf",   jp: "緑",  value: "#2ec96e", glow: "#7dffb0", dark: "#178a48", symbol: "✚" },
  { name: "violet", jp: "紫",  value: "#9d4edd", glow: "#c77dff", dark: "#5e1d96", symbol: "☾" },
  { name: "flame",  jp: "橙",  value: "#ff8500", glow: "#ffb700", dark: "#b85c00", symbol: "▲" },
  { name: "ice",    jp: "氷",  value: "#d8f4ff", glow: "#ffffff", dark: "#8fc3d9", symbol: "❆" },
  { name: "rose",   jp: "桃",  value: "#ff87c8", glow: "#ffc2e4", dark: "#c94f96", symbol: "♥" },
];

// ============================================
// レベルごとに巡回する背景テーマ（飽き防止）
// ============================================
export const THEMES = [
  {
    name: "twilight",
    jp: "宵闇の塔",
    sky: ["#2a1f5e", "#15103e", "#08051f"],
    accent: "#ffd700",
    mist: "rgba(157, 78, 221, 0.14)",
  },
  {
    name: "ocean",
    jp: "深海の祠",
    sky: ["#0c3a66", "#092947", "#020e1f"],
    accent: "#6fd6ff",
    mist: "rgba(79, 195, 247, 0.12)",
  },
  {
    name: "forest",
    jp: "妖精の森",
    sky: ["#12503c", "#0a3324", "#03150c"],
    accent: "#a8f0b8",
    mist: "rgba(46, 201, 110, 0.12)",
  },
  {
    name: "ember",
    jp: "残火の工房",
    sky: ["#5c2030", "#3a1218", "#1c0509"],
    accent: "#ffb46b",
    mist: "rgba(255, 133, 0, 0.12)",
  },
  {
    name: "aurora",
    jp: "極光の峰",
    sky: ["#1f2a5e", "#131b45", "#060a22"],
    accent: "#8affda",
    mist: "rgba(138, 255, 218, 0.10)",
  },
];

export function themeFor(level) {
  return THEMES[(level - 1) % THEMES.length];
}
