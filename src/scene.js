// 3D シーン（three.js）。座標計算は geometry.js に任せ、ここでは描画と視点切替だけを行う。
//
// シーン内の座標はすべて地理座標 (N, E, D) で記述し、最上位の NED_TO_THREE で
// three.js の座標系（Y 上・右手系）へ変換する。
//   three.x = E, three.y = -D, three.z = -N
// カメラは南側から北を向くので、北が奥、東が右になる。
//
// 「視点」= 選択した座標系 F の XY 面が水平（Z が下）になるよう、シーン全体を
// 原点（方位面上の試片の中心）まわりに F の逆回転で回す。

import * as THREE from './vendor/three.module.min.js';
import { convertDirection, transpose } from './geometry.js';

const NED_TO_THREE = new THREE.Matrix4().set(
  0, 1, 0, 0,
  0, 0, -1, 0,
  -1, 0, 0, 0,
  0, 0, 0, 1,
);

// 形状の大きさ（任意単位）
const BLOCK = { x: 3.0, y: 2.0, z: 1.6 }; // Xb, Yb, Zb 方向の寸法。方位面は Zb=0 の面
const CORE = { radius: 0.38, length: 1.1 };
const PLATE = { n: 5, e: 7, t: 0.12 };
const ARROW_LENGTH = 2.2;

const COLORS = {
  plate: 0xe3e6ea,
  block: 0x5b8fb0,
  blockEdge: 0x0f2a3a,
  core: 0xb03040,
  arrow: 0xff8c1a,
  axes: ['#d62728', '#2ca02c', '#1f77b4'],
};

const VIEW_LABELS = {
  geo: ['Xg (北)', 'Yg (東)', 'Zg (下)'],
  block: ['Xb', 'Yb', 'Zb'],
  spec: ['Xs', 'Ys', 'Zs'],
};
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const FOV = 35;
const ELEVATION = (25 * Math.PI) / 180;
const TRANSITION_MS = 900;

const rotToMatrix4 = (r) =>
  new THREE.Matrix4().set(
    r[0][0], r[0][1], r[0][2], 0,
    r[1][0], r[1][1], r[1][2], 0,
    r[2][0], r[2][1], r[2][2], 0,
    0, 0, 0, 1,
  );

function setMatrixOnly(obj, m) {
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(m);
}

function makeLabel(text, color = '#222', size = 0.55) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.scale.set(size * 2, size, 1);
  sprite.renderOrder = 10;
  sprite.userData.set = (t) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = 'bold 56px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.strokeText(t, 128, 64);
    g.fillStyle = color;
    g.fillText(t, 128, 64);
    texture.needsUpdate = true;
  };
  sprite.userData.set(text);
  return sprite;
}

/** 原点から dir 方向へ伸びる矢印（軸＋円錐）。dir は局所座標でのベクトル */
function makeArrow(dir, length, color, radius = 0.04, { depthTest = true } = {}) {
  const group = new THREE.Group();
  const headLen = Math.min(length * 0.35, radius * 8);
  const headR = radius * 2.6;
  const shaftLen = length - headLen;
  const mat = new THREE.MeshBasicMaterial({ color, depthTest });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 12), mat);
  shaft.position.y = shaftLen / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 20), mat);
  head.position.y = shaftLen + headLen / 2;
  group.add(shaft, head);
  group.userData.setDir = (d) =>
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize());
  group.userData.setDir(dir);
  if (!depthTest) group.traverse((o) => (o.renderOrder = 5));
  return group;
}

function addEdges(mesh, color, opacity = 1) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 40),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  mesh.add(edges);
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // ---- メインシーン -------------------------------------------------
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-3, 6, 5);
  scene.add(sun);

  const ned = new THREE.Group(); // 以下の子は地理座標 (N, E, D)
  setMatrixOnly(ned, NED_TO_THREE);
  scene.add(ned);

  const viewGroup = new THREE.Group(); // 視点切替で回転する
  viewGroup.matrixAutoUpdate = false;
  ned.add(viewGroup);

  // 平板（地理座標の水平面）。上面が D = h
  const plate = new THREE.Group();
  const plateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(PLATE.n, PLATE.e, PLATE.t).translate(0, 0, PLATE.t / 2),
    new THREE.MeshLambertMaterial({ color: COLORS.plate }),
  );
  addEdges(plateMesh, 0x555b63);
  plate.add(plateMesh);
  const northArrow = makeArrow([1, 0, 0], 1.6, 0x333a42, 0.035);
  northArrow.position.set(-1.6, -2.9, -0.04);
  const eastArrow = makeArrow([0, 1, 0], 1.6, 0x333a42, 0.035);
  eastArrow.position.set(-1.6, -2.9, -0.04);
  const northLabel = makeLabel('北 (Xg)', '#333a42', 0.8);
  northLabel.position.set(0.5, -2.9, -0.35);
  const eastLabel = makeLabel('東 (Yg)', '#333a42', 0.8);
  eastLabel.position.set(-1.6, -0.9, -0.35);
  plate.add(northArrow, eastArrow, northLabel, eastLabel);
  viewGroup.add(plate);

  // ブロック試料（方位面 Zb=0 の中心が原点、Zb>0 側に広がる）
  const blockGroup = new THREE.Group();
  const blockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK.x, BLOCK.y, BLOCK.z).translate(0, 0, BLOCK.z / 2),
    new THREE.MeshLambertMaterial({
      color: COLORS.block,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  addEdges(blockMesh, COLORS.blockEdge);
  blockGroup.add(blockMesh);
  viewGroup.add(blockGroup);

  // 試片（コア面の中心が原点、Zs 方向へドリルが進む）
  const specGroup = new THREE.Group();
  const coreMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(CORE.radius, CORE.radius, CORE.length, 32)
      .rotateX(Math.PI / 2) // 軸を Y → Z へ
      .translate(0, 0, CORE.length / 2),
    new THREE.MeshLambertMaterial({ color: COLORS.core }),
  );
  addEdges(coreMesh, 0x3a0d14, 0.5);
  specGroup.add(coreMesh);
  const dirArrow = makeArrow([1, 0, 0], ARROW_LENGTH, COLORS.arrow, 0.05);
  specGroup.add(dirArrow);
  blockGroup.add(specGroup);

  // ---- ガイド矢印（選択中の座標系の x, y, z。右下の別ビューポートに描く）------
  const gizmoScene = new THREE.Scene();
  const gizmoNed = new THREE.Group();
  setMatrixOnly(gizmoNed, NED_TO_THREE);
  gizmoScene.add(gizmoNed);
  const gizmoLabels = [];
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((d, i) => {
    gizmoNed.add(makeArrow(d, 1.5, new THREE.Color(COLORS.axes[i]), 0.055, { depthTest: false }));
    const label = makeLabel('', COLORS.axes[i], 1.0);
    label.position.set(d[0] * 2.0, d[1] * 2.0, d[2] * 2.0);
    gizmoNed.add(label);
    gizmoLabels.push(label);
  });

  // ---- カメラ ------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  const gizmoCamera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const target = new THREE.Vector3(0, -0.8, 0);
  let azimuth = 0; // 画面の鉛直軸（選択中の Z 軸）まわりの回転
  let size = { w: 1, h: 1 };

  function placeCamera(cam, dist) {
    cam.position.set(
      target.x + dist * Math.cos(ELEVATION) * Math.sin(azimuth),
      target.y + dist * Math.sin(ELEVATION),
      target.z + dist * Math.cos(ELEVATION) * Math.cos(azimuth),
    );
    cam.lookAt(target);
  }

  // ---- 状態と更新 ---------------------------------------------------
  let rotations = null;
  let view = 'geo';
  let displayed = new THREE.Quaternion();
  let anim = null; // { from: Quaternion, t0: number }
  let dirty = true;
  let rafId = 0;

  const targetQuat = () => {
    const R = { geo: IDENTITY, block: rotations.geoFromBlock, spec: rotations.geoFromSpec }[view];
    return new THREE.Quaternion().setFromRotationMatrix(rotToMatrix4(transpose(R)));
  };

  function setParams(p) {
    const res = convertDirection(p);
    rotations = res.rotations;
    setMatrixOnly(blockGroup, rotToMatrix4(rotations.geoFromBlock));
    setMatrixOnly(specGroup, rotToMatrix4(rotations.blockFromSpec));
    dirArrow.userData.setDir(res.specimen.vec);

    // ブロックの一番低い頂点に平板の上面が接するようにする
    const gb = rotations.geoFromBlock;
    let h = -Infinity;
    for (const x of [-BLOCK.x / 2, BLOCK.x / 2])
      for (const y of [-BLOCK.y / 2, BLOCK.y / 2])
        for (const z of [0, BLOCK.z])
          h = Math.max(h, gb[2][0] * x + gb[2][1] * y + gb[2][2] * z);
    plate.position.set(0, 0, h);

    dirty = true;
    return res;
  }

  function setView(next, animate = true) {
    if (!VIEW_LABELS[next]) throw new Error(`unknown view: ${next}`);
    if (animate && rotations) anim = { from: displayed.clone(), t0: performance.now() };
    view = next;
    VIEW_LABELS[next].forEach((t, i) => gizmoLabels[i].userData.set(t));
    dirty = true;
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!rotations) return;
    const goal = targetQuat();
    let moving = false;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / TRANSITION_MS);
      displayed.copy(anim.from).slerp(goal, ease(t));
      if (t >= 1) anim = null;
      moving = true;
    } else if (!displayed.equals(goal)) {
      displayed.copy(goal);
      moving = true;
    }
    if (!moving && !dirty) return;
    dirty = false;
    setMatrixOnly(viewGroup, new THREE.Matrix4().makeRotationFromQuaternion(displayed));
    render();
  }

  function render() {
    const aspect = size.w / size.h;
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    const dist = Math.max(14, 5.2 / (halfTan * aspect));
    placeCamera(camera, dist);
    placeCamera(gizmoCamera, 9.5);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    const g = Math.floor(Math.min(160, Math.min(size.w, size.h) * 0.3));
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, g, g);
    renderer.setViewport(0, 0, g, g);
    renderer.setClearColor(0xffffff, 0.75);
    renderer.clear();
    renderer.render(gizmoScene, gizmoCamera);
    renderer.setScissorTest(false);
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gizmoCamera.aspect = 1;
    gizmoCamera.updateProjectionMatrix();
    dirty = true;
  }

  // ---- 操作：横ドラッグで画面の鉛直軸まわりに回転 ----------------------
  let dragging = null;
  canvas.style.touchAction = 'pan-y'; // 縦スクロールはページに任せる
  canvas.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    azimuth -= (e.clientX - dragging.x) * 0.01;
    dragging.x = e.clientX;
    dirty = true;
  });
  const endDrag = () => (dragging = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => {
    azimuth = 0;
    dirty = true;
  });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  setView('geo', false);
  rafId = requestAnimationFrame(frame);

  return {
    setParams,
    setView,
    getView: () => view,
    setAzimuthDeg: (deg) => {
      azimuth = (deg * Math.PI) / 180;
      dirty = true;
    },
    resize,
    dispose() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
    },
  };
}
