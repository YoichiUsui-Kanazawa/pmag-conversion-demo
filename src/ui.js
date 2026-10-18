// 入力パネル（数値入力 + スライダーの連動）と変換結果の表示

import { normalizeDeg } from './geometry.js';

// wrap: 360° で巡回する角度 / それ以外は範囲外を端に丸める
const GROUPS = [
  {
    title: '古地磁気測定結果',
    sub: '試片座標',
    items: [
      { key: 'dec', label: '偏角 D', min: 0, max: 360, wrap: true },
      { key: 'inc', label: '伏角 I', min: -90, max: 90 },
    ],
  },
  {
    title: 'ブロック試料の方位面',
    sub: '地理座標で測る',
    items: [
      { key: 'blockStrike', label: '走向', min: 0, max: 360, wrap: true },
      { key: 'blockDip', label: '傾斜', min: 0, max: 90 },
    ],
  },
  {
    title: '試片のコア面',
    sub: 'ブロック座標で測る',
    items: [
      { key: 'specStrike', label: '走向', min: 0, max: 360, wrap: true },
      { key: 'specDip', label: '傾斜', min: 0, max: 90 },
    ],
  },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const applyRange = (item, v) => (item.wrap ? normalizeDeg(v) : clamp(v, item.min, item.max));
const fmt = (v, digits) => {
  const s = v.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; // -0.0 を 0.0 にする
};

/**
 * 入力パネルを root に作る。値が変わるたびに onChange(state) を呼ぶ。
 * state は { dec, inc, blockStrike, blockDip, specStrike, specDip }（度）。
 */
export function createInputs(root, initial, onChange) {
  const state = { ...initial };
  const controls = {};

  for (const group of GROUPS) {
    const h = document.createElement('h3');
    h.innerHTML = `${group.title} <small>（${group.sub}）</small>`;
    root.append(h);

    for (const item of group.items) {
      const id = `f-${item.key}`;
      const row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = `
        <label for="${id}">${item.label}</label>
        <input type="range" id="${id}-range" min="${item.min}" max="${item.max}" step="1" aria-label="${item.label} スライダー">
        <span class="num"><input type="number" id="${id}" inputmode="decimal" step="0.1" aria-label="${item.label}（度）">°</span>`;
      root.append(row);

      const range = row.querySelector('input[type="range"]');
      const num = row.querySelector('input[type="number"]');
      controls[item.key] = { range, num, item };

      const commit = (v) => {
        state[item.key] = applyRange(item, v);
        range.value = state[item.key];
        onChange({ ...state });
      };

      range.addEventListener('input', () => {
        num.value = fmt(Number(range.value), 1).replace(/\.0$/, '');
        num.classList.remove('invalid');
        commit(Number(range.value));
      });

      // 入力中は打ちかけの文字を書き換えない。値が取れたら即座に反映する
      num.addEventListener('input', () => {
        const v = parseFloat(num.value);
        const ok = Number.isFinite(v);
        num.classList.toggle('invalid', !ok || (!item.wrap && (v < item.min || v > item.max)));
        if (ok) commit(v);
      });
      // 確定時に、実際に使われた値（巡回・丸め後）へそろえる
      num.addEventListener('change', () => {
        num.value = String(Number(state[item.key].toFixed(2)));
        num.classList.remove('invalid');
      });
    }
  }

  // 初期値を反映
  for (const [key, { range, num }] of Object.entries(controls)) {
    range.value = state[key];
    num.value = String(state[key]);
  }

  return { state };
}

const ROWS = [
  { key: 'specimen', view: 'spec', name: '試片座標' },
  { key: 'block', view: 'block', name: 'ブロック座標' },
  { key: 'geographic', view: 'geo', name: '地理座標' },
];

/** 変換結果の表を tbody に描く。現在の視点に対応する行を強調する */
export function renderResults(tbody, result, view) {
  tbody.replaceChildren(
    ...ROWS.map(({ key, view: rowView, name }) => {
      const { dec, inc, vec } = result[key];
      const polar = Math.abs(inc) > 89.9999;
      const cells = [
        name,
        polar ? '—' : `${fmt(dec, 1)}°`,
        `${fmt(inc, 1)}°`,
        ...vec.map((c) => fmt(c, 3)),
      ];
      const tr = document.createElement('tr');
      tr.classList.toggle('current', rowView === view);
      cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      return tr;
    }),
  );
}
