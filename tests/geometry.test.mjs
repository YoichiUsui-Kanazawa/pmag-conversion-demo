import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frameFromStrikeDip,
  dirToVector,
  vectorToDir,
  matMul,
  transpose,
  convertDirection,
  normalizeDeg,
} from '../src/geometry.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);
const nearVec = (a, b) => a.forEach((x, i) => near(x, b[i]));
const col = (m, j) => [m[0][j], m[1][j], m[2][j]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

test('傾斜0・走向0 は恒等', () => {
  const R = frameFromStrikeDip(0, 0);
  nearVec(col(R, 0), [1, 0, 0]);
  nearVec(col(R, 1), [0, 1, 0]);
  nearVec(col(R, 2), [0, 0, 1]);
});

test('走向90・傾斜0: X=東, Y=南, Z=下', () => {
  const R = frameFromStrikeDip(90, 0);
  nearVec(col(R, 0), [0, 1, 0]);
  nearVec(col(R, 1), [-1, 0, 0]);
  nearVec(col(R, 2), [0, 0, 1]);
});

test('走向0・傾斜90: X=北, Y=下, Z=西', () => {
  const R = frameFromStrikeDip(0, 90);
  nearVec(col(R, 0), [1, 0, 0]);
  nearVec(col(R, 1), [0, 0, 1]);
  nearVec(col(R, 2), [0, -1, 0]);
});

test('走向0・傾斜30: 傾斜方向は東へ下る', () => {
  const R = frameFromStrikeDip(0, 30);
  const y = col(R, 1);
  assert.ok(y[1] > 0 && y[2] > 0);
  near(Math.hypot(...y), 1);
});

test('任意の走向・傾斜で正規直交・右手系・Z は下向き', () => {
  for (let s = 0; s < 360; s += 37) {
    for (let d = 0; d <= 90; d += 15) {
      const R = frameFromStrikeDip(s, d);
      const I = matMul(transpose(R), R);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(I[i][j], i === j ? 1 : 0);
      nearVec(cross(col(R, 0), col(R, 1)), col(R, 2));
      assert.ok(col(R, 2)[2] >= -1e-12);
    }
  }
});

test('偏角・伏角 ⇄ ベクトルの往復', () => {
  for (const [D, I] of [[0, 0], [90, 0], [270, 45], [123.4, -67.8], [359, 89]]) {
    const r = vectorToDir(dirToVector(D, I));
    near(r.dec, D, 1e-7);
    near(r.inc, I, 1e-7);
  }
  assert.equal(vectorToDir([0, 0, 1]).inc, 90);
  assert.equal(vectorToDir([0, 0, 1]).dec, 0);
});

test('normalizeDeg', () => {
  assert.equal(normalizeDeg(-90), 270);
  assert.equal(normalizeDeg(360), 0);
  assert.equal(normalizeDeg(725), 5);
});

const base = { blockStrike: 0, blockDip: 0, specStrike: 0, specDip: 0 };

test('すべて傾斜0・走向0 なら各座標系で同じ値', () => {
  const r = convertDirection({ ...base, dec: 40, inc: 25 });
  for (const k of ['specimen', 'block', 'geographic']) {
    near(r[k].dec, 40, 1e-7);
    near(r[k].inc, 25, 1e-7);
  }
});

test('ブロック走向0・傾斜90: 試片の Ys は鉛直下向き', () => {
  const r = convertDirection({ ...base, blockDip: 90, dec: 90, inc: 0 });
  near(r.geographic.inc, 90);
  const r2 = convertDirection({ ...base, blockDip: 90, dec: 0, inc: 0 });
  near(r2.geographic.dec, 0);
  near(r2.geographic.inc, 0);
});

test('ブロック走向90・傾斜0: 偏角は走向分だけ回る', () => {
  const r = convertDirection({ ...base, blockStrike: 90, dec: 0, inc: 0 });
  near(r.geographic.dec, 90);
  near(r.geographic.inc, 0);
});

test('試片座標の Zs 方向（伏角90）は試片傾斜のぶんブロック座標で傾く', () => {
  const r = convertDirection({ ...base, specStrike: 0, specDip: 20, dec: 0, inc: 90 });
  // Zs = (sinα sinδ, -cosα sinδ, cosδ) with α=0, δ=20°
  nearVec(r.block.vec, [0, -Math.sin((20 * Math.PI) / 180), Math.cos((20 * Math.PI) / 180)]);
  near(r.block.inc, 70, 1e-7);
  near(r.block.dec, 270, 1e-7);
});

test('回転は長さを保つ・合成が一致', () => {
  const p = { dec: 213, inc: -35, blockStrike: 71, blockDip: 48, specStrike: 133, specDip: 27 };
  const r = convertDirection(p);
  for (const k of ['specimen', 'block', 'geographic']) near(Math.hypot(...r[k].vec), 1);
  const direct = r.rotations.geoFromSpec;
  const v = r.specimen.vec;
  const viaMat = [0, 1, 2].map((i) => direct[i][0] * v[0] + direct[i][1] * v[1] + direct[i][2] * v[2]);
  nearVec(viaMat, r.geographic.vec);
});
