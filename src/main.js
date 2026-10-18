import { createScene } from './scene.js';
import { createInputs, renderResults } from './ui.js';

const scene = createScene(document.getElementById('view'));
const tbody = document.getElementById('result-rows');
const viewButtons = document.querySelectorAll('#views button');

let result = null;

function showResults() {
  renderResults(tbody, result, scene.getView());
}

function update(params) {
  result = scene.setParams(params);
  showResults();
}

function selectView(view) {
  scene.setView(view);
  viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  if (result) showResults();
}

// 初期値（走向・傾斜の例）
const INITIAL = { dec: 30, inc: 40, blockStrike: 30, blockDip: 40, specStrike: 60, specDip: 25 };
createInputs(document.getElementById('inputs'), INITIAL, update);
update(INITIAL);

viewButtons.forEach((b) => b.addEventListener('click', () => selectView(b.dataset.view)));
selectView('geo');

window.pmagScene = scene; // デバッグ用
