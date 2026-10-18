# pmag-conversion-demo

古地磁気の測定結果（試片座標の偏角・伏角）を、ブロック試料座標・地理座標へ変換する過程を、初学者向けに三次元表示するデモ。

## Directory structure

```text
  index.html – エントリーページ（レイアウトの骨組み）
  src/ – Application source code
    geometry.js – 座標計算
    scene.js – three.js による 3D 描画・視点切替
    ui.js – 入力パネル（数値入力とスライダーの連動）・変換結果の表
    style.css – スタイル（PC は 2 カラム、幅 800px 以下はスマホ向けの縦並び）
    main.js – 起動処理（入力 → scene.setParams → 結果表示）
    vendor/ – 同梱した three.js (r170, MIT)
  scripts/serve.mjs – 開発用の簡易サーバー
  start.bat – Windows 用の起動ショートカット（サーバー起動 + ブラウザを開く）
  tests/ – Unit tests (Node.js built-in test runner)
  docs/ – All documentation (座標系の図、UI 案など)
```

## 動かし方

ES モジュールを使うため `index.html` を直接開く（file://）ことはできません（開いても入力欄や 3D 表示が出ません）。簡易サーバーを起動してください。Windows では `start.bat` をダブルクリックすると、サーバー起動とブラウザ表示が一度にできます（Node.js が必要）。

```bash
node scripts/serve.mjs
```

その後 http://localhost:8080/ を開きます（GitHub Pages などの静的ホスティングでも動作します）。

## 座標系の規約

- 地理座標 (Xg, Yg, Zg): 北, 東, 鉛直下向き（右手系）
- ブロック座標 (Xb, Yb, Zb): 方位面の走向方向 / 傾斜方向 / 面の法線（下向き）
- 試片座標 (Xs, Ys, Zs): コア面の走向方向 / 傾斜方向 / ドリル進入方向
- 走向は親座標系の X から Y 側へ測った角（0〜360°）、傾斜は 0〜90°（逆転層は扱わない）。ブロックの走向・傾斜は地理座標基準、試片のものはブロック座標基準
- 偏角は X から Y 側、伏角は +Z（下）向きを正とする

## src/geometry.js（座標計算）

DOM や three.js に依存しない純粋な計算モジュール。

- `frameFromStrikeDip(strike, dip)` – 走向・傾斜から回転行列（軸を列に持つ）を作る
- `dirToVector(dec, inc)` / `vectorToDir(v)` – 偏角・伏角と単位ベクトルの相互変換
- `convertDirection({dec, inc, blockStrike, blockDip, specStrike, specDip})` – 試片座標の測定結果を、試片・ブロック・地理の各座標系の `{vec, dec, inc}` と回転行列で返す

## src/ui.js（入力と結果表示）

- `createInputs(root, initial, onChange)` – 偏角・伏角・ブロックの走向/傾斜・試片の走向/傾斜の 6 項目について、スライダーと数値入力を連動させる。変更のたびに `onChange(state)` を呼ぶ（リアルタイム更新）
- 数値入力は測定値をそのまま入力できる（小数可）。偏角・走向は 360° で巡回（例: 400 → 40）、伏角・傾斜は範囲外なら端に丸める（欄が赤くなる）
- `renderResults(tbody, result, view)` – 試片・ブロック・地理の各座標系での偏角・伏角と単位ベクトルの表を描く。現在の視点に対応する行を強調する

## src/scene.js（3D シーン）

`createScene(canvas)` が `{ setParams, setView, getView, setAzimuthDeg, resize, dispose }` を返す。

- `setParams({dec, inc, blockStrike, blockDip, specStrike, specDip})` – 形状と矢印を更新（入力変更のたびに呼べる）
- `setView('geo' | 'block' | 'spec')` – 選択した座標系の XY 面が水平になるようシーン全体を回転（アニメーション付き）
- 描画物: 平板（青灰色・北/東の矢印）、ブロック試料（半透明の青）、試片（赤）、古地磁気方向の矢印（オレンジ。試片のコア面中心から出る）
- 左下のガイド矢印は、選択中の座標系の x（赤）・y（緑）・z（青）
- 横ドラッグで画面の鉛直軸（選択中の Z 軸）まわりに回転、ダブルクリックでリセット。縦方向のドラッグはページのスクロールに使われる

### テスト

```bash
node --test tests/geometry.test.mjs
```
