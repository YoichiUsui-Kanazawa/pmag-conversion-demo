// 座標計算モジュール（DOM / three.js に依存しない純粋な計算）
//
// 地理座標: Xg=北, Yg=東, Zg=鉛直下向き（右手系）
// ベクトルは [x, y, z]、行列は行優先の 3x3（[[r00,r01,r02],[r10,r11,r12],[r20,r21,r22]]）。
// 回転行列 R は「子座標系の軸を親座標系で表した列ベクトル」を並べたもの:
//   v_parent = R · v_child,  v_child = Rᵀ · v_parent

const DEG = Math.PI / 180;

export const toRad = (deg) => deg * DEG;
export const toDeg = (rad) => rad / DEG;

/** 角度を [0, 360) に正規化する（-0 や 360 近傍の丸め誤差も 0 に寄せる） */
export function normalizeDeg(deg) {
  const d = ((deg % 360) + 360) % 360;
  return d >= 360 - 1e-9 ? 0 : d;
}

/** 0 近傍の -0 / 丸め誤差を 0 にそろえる（表示用） */
const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : x);

export function matVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function matMul(a, b) {
  return a.map((_, i) =>
    b[0].map((__, j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]),
  );
}

export function transpose(m) {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

/**
 * 走向・傾斜から座標系の回転行列を作る（親座標系での各軸を列に持つ）。
 *   X = 走向方向（親の X から Y 側へ strike 度）
 *   Y = 傾斜方向（走向の右手側へ下る向き）
 *   Z = X × Y（親の Z 側＝下向き、傾斜 0〜90° で保証される）
 * 地理座標に対するブロック座標、ブロック座標に対する試片座標で同じ式を使う。
 */
export function frameFromStrikeDip(strikeDeg, dipDeg) {
  const a = toRad(strikeDeg);
  const d = toRad(dipDeg);
  const [ca, sa, cd, sd] = [Math.cos(a), Math.sin(a), Math.cos(d), Math.sin(d)];
  const x = [ca, sa, 0];
  const y = [-sa * cd, ca * cd, sd];
  const z = [sa * sd, -ca * sd, cd];
  // 軸を列に並べる
  return [
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]],
  ].map((row) => row.map(clean));
}

/** 偏角・伏角（度）→ 単位ベクトル。偏角は X から Y 側、伏角は +Z（下）を正とする */
export function dirToVector(decDeg, incDeg) {
  const d = toRad(decDeg);
  const i = toRad(incDeg);
  return [Math.cos(i) * Math.cos(d), Math.cos(i) * Math.sin(d), Math.sin(i)].map(clean);
}

/** ベクトル → 偏角 [0,360)・伏角 [-90,90]（度）。真下/真上では偏角 0 とする */
export function vectorToDir(v) {
  const [x, y, z] = v;
  const h = Math.hypot(x, y);
  const len = Math.hypot(h, z);
  const inc = toDeg(Math.asin(Math.max(-1, Math.min(1, z / len))));
  const dec = h < 1e-12 ? 0 : normalizeDeg(toDeg(Math.atan2(y, x)));
  return { dec, inc };
}

/**
 * 試片座標の測定結果を、ブロック座標・地理座標に変換する。
 * @param {object} p
 *   dec, inc                   試片座標での偏角・伏角
 *   blockStrike, blockDip      ブロック方位面の走向・傾斜（地理座標基準）
 *   specStrike, specDip        試片コア面の走向・傾斜（ブロック座標基準）
 * @returns 各座標系での {vec, dec, inc} と、座標系間の回転行列
 */
export function convertDirection(p) {
  const gb = frameFromStrikeDip(p.blockStrike, p.blockDip); // 地理 ← ブロック
  const bs = frameFromStrikeDip(p.specStrike, p.specDip); // ブロック ← 試片
  const gs = matMul(gb, bs); // 地理 ← 試片

  const vSpec = dirToVector(p.dec, p.inc);
  const vBlock = matVec(bs, vSpec).map(clean);
  const vGeo = matVec(gb, vBlock).map(clean);

  const pack = (vec) => ({ vec, ...vectorToDir(vec) });
  return {
    specimen: pack(vSpec),
    block: pack(vBlock),
    geographic: pack(vGeo),
    rotations: { geoFromBlock: gb, blockFromSpec: bs, geoFromSpec: gs },
  };
}
