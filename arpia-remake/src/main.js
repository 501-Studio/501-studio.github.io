import Phaser from 'phaser';
import './style.css';

const W = 1280;
const H = 720;
const SAVE_KEY = 'arpia-remake-v04';

const UI = {
  font: 'Pretendard, Noto Sans KR, system-ui, sans-serif',
  title: 'Georgia, Times New Roman, serif',
  panel: 0x07111b,
  panel2: 0x0c1a27,
  line: 0x456177,
  lineGold: 0xb99a5b,
  text: '#eaf4fb',
  muted: '#93a9b8',
  blue: 0x4ea8df,
  gold: 0xd8a84b,
  green: 0x63c76a,
  red: 0xe35b66,
  purple: 0x9d67db,
};

const ELEMENTS = {
  fire: { name: '불', color: 0xff6b38, bright: '#ff9a55', emotion: '열정·용기 ↔ 분노·조급함', skill: '화염 베기' },
  water: { name: '물', color: 0x4aa9ff, bright: '#8ad0ff', emotion: '평온·공감 ↔ 슬픔·무기력', skill: '흘려보내기' },
  wind: { name: '바람', color: 0x61d8a5, bright: '#a2f5d0', emotion: '해방·호기심 ↔ 허무·냉담', skill: '경계 너머' },
  shadow: { name: '어둠', color: 0x9a62d8, bright: '#d5a8ff', emotion: '성찰·안식 ↔ 공포·고독', skill: '내면 잠행' },
  lightning: { name: '번개', color: 0xffd75a, bright: '#fff0a4', emotion: '영감·각성 ↔ 불안·충동', skill: '찰나의 깨달음' },
  light: { name: '빛', color: 0xfff1ac, bright: '#fff9dd', emotion: '희망·명료함 ↔ 오만·완벽주의', skill: '길을 밝히는 빛' },
};
const ELEMENT_ORDER = ['fire', 'water', 'wind', 'shadow', 'lightning', 'light'];

const MAIN_STAGES = [
  { title: '평범한 아침', objective: '현실의 하루를 버틴다' },
  { title: '낯선 안개숲', objective: '희미한 목소리를 따라간다' },
  { title: '첫 번째 공명', objective: '뒤엉킨 감정의 잔재를 정화한다' },
  { title: '루메르의 불빛', objective: '루메르 변두리 마을로 이동한다' },
  { title: '안개숲의 잔향', objective: '공명 조각 3개를 회수한다' },
  { title: '뒤엉킨 잔향', objective: '숲 깊은 곳의 근원을 정화한다' },
  { title: '돌아갈 장소', objective: '루메르 장로에게 보고한다' },
  { title: '새로운 시작', objective: '챕터 1 완료' },
];
const SIDE_QUESTS = {
  petals: { title: '모아의 부탁', objective: '별빛 꽃잎 모으기', target: 3, reward: { gold: 350, petExp: 120 } },
  traces: { title: '수상한 흔적', objective: '오염 흔적 조사하기', target: 5, reward: { gold: 500, skillPoints: 1 } },
};
const SHOP_ITEMS = [
  { id: 'redPotion', name: '회복 물약', desc: 'HP 120 회복', price: 180, icon: '◆' },
  { id: 'bluePotion', name: '마나 물약', desc: 'MP 70 회복', price: 220, icon: '◇' },
  { id: 'petSnack', name: '별사탕', desc: '모아 경험치 +80', price: 300, icon: '✦' },
  { id: 'echoCrystal', name: '초급 강화석', desc: '스킬 포인트 +1', price: 900, icon: '◈' },
  { id: 'resetScroll', name: '기억 변경권', desc: '스킬트리 초기화', price: 650, icon: '▤' },
];

const PROLOGUE = [
  { title: '평범한 아침', body: '07:20. 알람이 울린다.\n\n“하… 또 출근이네.”\n\n붐비는 지하철. 출근 전부터 회사 메신저가 울린다.' },
  { title: '출근도 안 했는데', body: '팀장에게 또 업무 요청이 왔다.\n나는 어떻게 반응할까?', choices: [
    ['화를 참는다', 'fire'], ['어떻게 해결할지 생각한다', 'lightning'], ['완벽하게 끝내놓는다', 'light'],
  ] },
  { title: '끝까지 처리하는 사람', body: '후임이 놓친 일도 결국 내 자리로 돌아온다.\n\n“네. 알겠습니다.”', choices: [
    ['그냥 내가 마무리한다', 'water'], ['말을 삼키고 조용히 버틴다', 'shadow'], ['여기서 멀리 떠나고 싶다', 'wind'],
  ] },
  { title: '금요일 17:57', body: '거의 끝났다. 저장만 하면 된다.\n\n그 순간 회사 전체가 정전된다.\n저장을 안 했다.', choices: [
    ['분노가 머리끝까지 치민다', 'fire'], ['허탈해서 아무 말도 나오지 않는다', 'water'], ['처음부터 완벽하게 다시 만든다', 'light'],
  ] },
  { title: '23:50 · 옥상', body: '상사는 읽고도 답이 없다.\nSNS 속 후임은 이미 퇴사했고 친구들과 웃고 있다.', choices: [
    ['나는 무엇을 위해 버텨왔을까', 'shadow'], ['딱 한 번만이라도 사라지고 싶다', 'wind'], ['모든 감각이 날카로워진다', 'lightning'],
  ] },
  { title: '세계가 무너진다', body: '차가운 벽에 머리를 기대는 순간, 소리가 멀어진다.\n\n빛이 접히고 어둠이 갈라진다.\n\n“선택한 게 아니야. 네 안에 이미 있던 거야.”' },
];

function makeDefaultSkills() {
  return Object.fromEntries(ELEMENT_ORDER.map((key) => [key, { basic: 0, core: 0, mastery: 0 }]));
}
function defaultSave() {
  return {
    version: 4,
    player: { level: 3, exp: 62, hp: 312, maxHp: 312, mp: 96, maxMp: 120, attack: 32, defense: 14, gold: 1250, crystals: 120, skillPoints: 2 },
    story: { mainStage: 0, area: 'mist', logs: ['평범한 금요일이었다.'] },
    element: null,
    emotionScores: Object.fromEntries(ELEMENT_ORDER.map((key) => [key, 0])),
    emotionHistory: [],
    inventory: { redPotion: 3, bluePotion: 2, petSnack: 1, echoCrystal: 0, resetScroll: 0 },
    sideQuests: {
      petals: { accepted: false, progress: 0, completed: false, claimed: false },
      traces: { accepted: false, progress: 0, completed: false, claimed: false },
    },
    mainProgress: { echoes: 0, fragments: 0 },
    pet: { id: 'moa', name: '모아', level: 5, exp: 350, nextExp: 800, summoned: true, bond: 1 },
    skills: makeDefaultSkills(),
    settings: { sound: true, shake: true, reducedMotion: false },
  };
}
function mergeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    player: { ...base.player, ...(raw.player || {}) },
    story: { ...base.story, ...(raw.story || {}) },
    emotionScores: { ...base.emotionScores, ...(raw.emotionScores || {}) },
    inventory: { ...base.inventory, ...(raw.inventory || {}) },
    sideQuests: {
      petals: { ...base.sideQuests.petals, ...(raw.sideQuests?.petals || {}) },
      traces: { ...base.sideQuests.traces, ...(raw.sideQuests?.traces || {}) },
    },
    mainProgress: { ...base.mainProgress, ...(raw.mainProgress || {}) },
    pet: { ...base.pet, ...(raw.pet || {}) },
    skills: { ...base.skills, ...(raw.skills || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
  };
}
function loadSave() {
  try { return mergeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { return defaultSave(); }
}
function saveGame(next) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  return next;
}
function clearSave() { localStorage.removeItem(SAVE_KEY); }
function dominantElement(scores, history) {
  const max = Math.max(...Object.values(scores));
  const tied = ELEMENT_ORDER.filter((key) => scores[key] === max);
  for (let i = history.length - 1; i >= 0; i -= 1) if (tied.includes(history[i])) return history[i];
  return tied[0] || 'fire';
}
function objectiveText(save) {
  const stage = Math.min(MAIN_STAGES.length - 1, save.story.mainStage);
  if (stage === 2) return `감정의 잔재 정화 ${save.mainProgress.echoes} / 5`;
  if (stage === 4) return `공명 조각 회수 ${save.mainProgress.fragments} / 3`;
  return MAIN_STAGES[stage].objective;
}

class AudioEngine {
  constructor() { this.ctx = null; }
  tone(freq = 440, duration = 0.08, volume = 0.035, type = 'sine') {
    const settings = loadSave().settings;
    if (!settings.sound) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + duration);
    } catch { /* audio is optional */ }
  }
}
const audio = new AudioEngine();

function addPanel(scene, x, y, width, height, depth = 100, alpha = 0.94, gold = false) {
  const bg = scene.add.rectangle(x, y, width, height, UI.panel, alpha).setOrigin(0).setDepth(depth).setScrollFactor(0);
  bg.setStrokeStyle(1.5, gold ? UI.lineGold : UI.line, 0.95);
  const top = scene.add.rectangle(x + 1, y + 1, width - 2, 3, gold ? UI.gold : UI.blue, 0.55).setOrigin(0).setDepth(depth + 1).setScrollFactor(0);
  return { bg, top };
}
function addText(scene, x, y, value, size = 16, color = UI.text, depth = 110, options = {}) {
  return scene.add.text(x, y, value, {
    fontFamily: options.title ? UI.title : UI.font,
    fontSize: `${size}px`,
    fontStyle: options.bold ? 'bold' : 'normal',
    color,
    align: options.align || 'left',
    lineSpacing: options.lineSpacing ?? 5,
    wordWrap: options.wrap ? { width: options.wrap } : undefined,
  }).setDepth(depth).setScrollFactor(options.world ? 1 : 0).setOrigin(options.originX ?? 0, options.originY ?? 0);
}
function addButton(scene, x, y, width, height, label, callback, options = {}) {
  const depth = options.depth ?? 120;
  const fill = options.fill ?? 0x102536;
  const over = options.over ?? 0x1d4664;
  const rect = scene.add.rectangle(x, y, width, height, fill, options.alpha ?? 0.95)
    .setDepth(depth).setScrollFactor(0).setStrokeStyle(1.4, options.gold ? UI.lineGold : UI.line, 0.95)
    .setInteractive({ useHandCursor: true });
  const text = addText(scene, x, y, label, options.size ?? 16, options.color ?? UI.text, depth + 1, { bold: options.bold, originX: 0.5, originY: 0.5 });
  rect.on('pointerover', () => { rect.setFillStyle(over, 1); scene.tweens.add({ targets: [rect, text], scaleX: 1.025, scaleY: 1.025, duration: 90 }); });
  rect.on('pointerout', () => { rect.setFillStyle(fill, options.alpha ?? 0.95); scene.tweens.add({ targets: [rect, text], scaleX: 1, scaleY: 1, duration: 90 }); });
  rect.on('pointerdown', () => { audio.tone(620, 0.05, 0.025); callback?.(); });
  return { rect, text, destroy() { rect.destroy(); text.destroy(); } };
}
function toast(scene, message, color = UI.blue) {
  const box = scene.add.rectangle(W / 2, 92, 560, 48, UI.panel, 0.97).setDepth(500).setScrollFactor(0).setStrokeStyle(1.5, color, 1);
  const label = addText(scene, W / 2, 92, message, 16, UI.text, 501, { bold: true, originX: 0.5, originY: 0.5 });
  box.y -= 18; label.y -= 18; box.alpha = 0; label.alpha = 0;
  scene.tweens.add({ targets: [box, label], y: '+=18', alpha: 1, duration: 180, hold: 1250, yoyo: true, onComplete: () => { box.destroy(); label.destroy(); } });
}
function showDialogue(scene, pages, done) {
  let index = 0;
  const depth = 600;
  const shade = scene.add.rectangle(0, 0, W, H, 0x02060a, 0.24).setOrigin(0).setDepth(depth).setScrollFactor(0).setInteractive();
  const panel = addPanel(scene, 54, 500, W - 108, 170, depth + 1, 0.97, true);
  const speaker = addText(scene, 82, 516, '', 18, '#f4d887', depth + 3, { bold: true });
  const body = addText(scene, 82, 550, '', 20, UI.text, depth + 3, { wrap: W - 190, lineSpacing: 8 });
  const prompt = addText(scene, W - 86, 646, '▼', 18, UI.muted, depth + 3, { originX: 1, originY: 1 });
  const render = () => {
    const page = pages[index];
    speaker.setText(page.speaker || '');
    body.setText(page.text || String(page));
  };
  const next = () => {
    audio.tone(480, 0.035, 0.018);
    if (index < pages.length - 1) { index += 1; render(); return; }
    [shade, panel.bg, panel.top, speaker, body, prompt].forEach((obj) => obj.destroy());
    done?.();
  };
  shade.on('pointerdown', next);
  const key = scene.input.keyboard.on('keydown-SPACE', next);
  const cleanup = () => scene.input.keyboard.off('keydown-SPACE', next);
  const originalDone = done;
  done = () => { cleanup(); originalDone?.(); };
  render();
}

class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.drawLandscape();
    addText(this, 18, 14, 'v0.4.0', 13, '#d8e6ec', 10);
    addText(this, 18, 35, '● 루메르 서버', 12, '#8fb7c6', 10);
    addText(this, 480, 70, 'Arpia', 92, '#eefaff', 12, { title: true, bold: true, originX: 0.5 });
    addText(this, 480, 166, 'R E M A K E', 22, '#dcecf4', 12, { title: true, originX: 0.5 });
    addText(this, 480, 207, '감정이 만드는 마법의 세계', 18, '#d8e8ef', 12, { originX: 0.5 });
    this.drawHeroSilhouette();

    const hasSave = !!localStorage.getItem(SAVE_KEY);
    const menu = [
      ['새 게임', () => { clearSave(); saveGame(defaultSave()); this.scene.start('Prologue'); }],
      ['이어하기', () => this.continueGame(), !hasSave],
      ['설정', () => this.openSettings()],
      ['제작자', () => toast(this, '501 Studio · 아르피아 리메이크 프로젝트', UI.gold)],
    ];
    menu.forEach(([label, fn, disabled], index) => {
      const button = addButton(this, 480, 286 + index * 56, 260, 43, label, disabled ? () => toast(this, '저장 데이터가 없습니다.', UI.red) : fn, {
        fill: disabled ? 0x14202a : 0x15344a, over: 0x246087, gold: index === 0, alpha: disabled ? 0.65 : 0.9,
      });
      if (disabled) button.text.setColor('#6e7b83');
    });

    addPanel(this, 18, 300, 220, 166, 15, 0.84, true);
    addText(this, 34, 315, '메인 퀘스트', 14, '#f4d887', 17, { bold: true });
    addText(this, 34, 348, '✦  진실을 찾아서', 15, UI.text, 17, { bold: true });
    addText(this, 54, 375, '감정의 숲으로 이동', 13, UI.muted, 17);
    addText(this, 34, 407, '서브 퀘스트', 14, '#78d9c1', 17, { bold: true });
    addText(this, 34, 434, '◇  모아의 부탁\n◇  수상한 흔적', 13, UI.muted, 17, { lineSpacing: 5 });

    ['업적', '우편', '출석', '이벤트'].forEach((label, index) => addButton(this, 720 + index * 96, 650, 84, 42, label, () => toast(this, `${label} 기능은 데모에서 확인 가능합니다.`), { size: 13, fill: 0x0c1b27 }));
  }
  continueGame() {
    const save = loadSave();
    if (save.story.mainStage <= 0) this.scene.start('Prologue');
    else this.scene.start('World', { area: save.story.area || 'mist' });
  }
  drawLandscape() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0a4b88, 0x0a4b88, 0x8fd6f5, 0x8fd6f5, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(0xffffff, 0.82);
    for (let i = 0; i < 12; i += 1) g.fillEllipse(90 + i * 105, 105 + (i % 3) * 28, 150, 36);
    g.fillStyle(0x2a6172, 1); g.fillTriangle(0, 505, 260, 260, 520, 505); g.fillTriangle(340, 505, 660, 225, 960, 505); g.fillTriangle(760, 505, 1030, 275, 1280, 505);
    g.fillStyle(0x3f8763, 1); g.fillTriangle(0, 545, 310, 352, 590, 545); g.fillTriangle(500, 545, 810, 330, 1110, 545); g.fillTriangle(930, 545, 1160, 365, 1280, 545);
    g.fillStyle(0x6ea55e, 1); g.fillRect(0, 500, W, 220);
    g.fillStyle(0x183d2c, 1); g.fillRect(0, 0, 170, H); g.fillCircle(90, 95, 155); g.fillCircle(205, 40, 120);
    g.fillStyle(0x0a1f17, 0.5); g.fillEllipse(260, 675, 540, 84);
    for (let i = 0; i < 34; i += 1) { g.fillStyle(i % 2 ? 0xf5e7a6 : 0xeef7ff, 0.9); g.fillCircle(30 + i * 36, 570 + (i * 37) % 110, 2 + (i % 3)); }
  }
  drawHeroSilhouette() {
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(0x0b1720, 1); g.fillCircle(265, 370, 28); g.fillRoundedRect(236, 395, 60, 112, 22); g.fillRect(244, 493, 18, 72); g.fillRect(271, 493, 18, 72);
    g.fillStyle(0x101b24, 1); g.fillTriangle(232, 355, 247, 326, 257, 360); g.fillTriangle(297, 355, 284, 326, 276, 360);
    g.fillStyle(0xeaf9ff, 1); g.fillCircle(360, 330, 24); g.fillTriangle(338, 317, 326, 292, 354, 307); g.fillTriangle(382, 317, 394, 292, 366, 307);
    g.fillStyle(0x8edcff, 0.7); g.fillTriangle(342, 337, 315, 350, 345, 351); g.fillTriangle(378, 337, 405, 350, 375, 351);
    this.tweens.add({ targets: g, y: 8, duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  openSettings() {
    const save = loadSave();
    const shade = this.add.rectangle(0, 0, W, H, 0x02060a, 0.72).setOrigin(0).setDepth(200).setInteractive();
    const p = addPanel(this, 390, 190, 500, 330, 201, 0.98, true);
    addText(this, 430, 220, '설정', 28, UI.text, 203, { bold: true });
    const sound = addButton(this, 640, 310, 360, 48, `사운드  ${save.settings.sound ? 'ON' : 'OFF'}`, () => {
      save.settings.sound = !save.settings.sound; saveGame(save); this.scene.restart();
    });
    const motion = addButton(this, 640, 372, 360, 48, `모션 효과  ${save.settings.reducedMotion ? '간소화' : '부드럽게'}`, () => {
      save.settings.reducedMotion = !save.settings.reducedMotion; saveGame(save); this.scene.restart();
    });
    addButton(this, 640, 460, 180, 42, '닫기', () => this.scene.restart(), { gold: true });
    shade.on('pointerdown', () => this.scene.restart());
  }
}

class PrologueScene extends Phaser.Scene {
  constructor() { super('Prologue'); this.page = 0; this.choiceObjects = []; }
  create() {
    this.save = loadSave();
    this.drawOffice();
    addText(this, 28, 22, '프롤로그 : 평범한 아침', 19, UI.text, 20, { bold: true });
    addButton(this, 1190, 24, 100, 34, 'SKIP', () => this.finish(), { size: 13, fill: 0x070b0e, depth: 30 });
    this.drawCharacter();
    this.dialogPanel = addPanel(this, 690, 420, 540, 220, 25, 0.96, true);
    this.speaker = addText(this, 720, 440, '나', 18, '#f3d98a', 28, { bold: true });
    this.body = addText(this, 720, 478, '', 20, UI.text, 28, { wrap: 470, lineSpacing: 8 });
    this.prompt = addText(this, 1200, 615, '▼', 17, UI.muted, 28, { originX: 1, originY: 1 });
    this.input.keyboard.on('keydown-SPACE', () => this.advance());
    this.input.on('pointerdown', (_p, targets) => { if (!targets?.length) this.advance(); });
    this.render();
    this.drawStoryRail();
  }
  drawOffice() {
    const g = this.add.graphics(); g.fillStyle(0x111820, 1).fillRect(0, 0, W, H); g.fillStyle(0x1a2832, 1).fillRect(0, 70, W, H - 70);
    g.fillStyle(0x5c7885, 0.55).fillRect(40, 100, 340, 250); g.lineStyle(3, 0xaac4ce, 0.22);
    for (let x = 55; x < 380; x += 50) g.lineBetween(x, 100, x, 350);
    for (let y = 120; y < 350; y += 45) g.lineBetween(40, y, 380, y);
    g.fillStyle(0x0a0f14, 1);
    for (let i = 0; i < 7; i += 1) { const x = 390 + (i % 4) * 205; const y = 170 + Math.floor(i / 4) * 190; g.fillRect(x, y, 165, 92); g.fillStyle(0x253641, 1).fillRect(x + 10, y + 10, 145, 64); g.fillStyle(0x0a0f14, 1); }
    g.fillStyle(0x202c33, 0.85).fillRect(0, 0, W, H); g.fillStyle(0x071018, 0.42).fillRect(0, 0, W, H);
  }
  drawCharacter() {
    const g = this.add.graphics().setDepth(10); g.fillStyle(0x090d12, 1).fillCircle(510, 230, 56); g.fillRoundedRect(454, 280, 112, 205, 28); g.fillRect(466, 470, 36, 128); g.fillRect(520, 470, 36, 128);
    g.fillStyle(0x1b242d, 1).fillTriangle(452, 215, 480, 150, 496, 220); g.fillTriangle(566, 215, 538, 150, 525, 220);
    g.fillStyle(0xe4bea9, 1).fillCircle(510, 235, 42); g.fillStyle(0x22252c, 1).fillCircle(495, 240, 4).fillCircle(526, 240, 4);
    g.fillStyle(0xe8ecf0, 1).fillTriangle(510, 283, 490, 320, 530, 320); g.fillStyle(0x0d141c, 1).fillTriangle(510, 300, 499, 355, 521, 355);
  }
  drawStoryRail() {
    addPanel(this, 690, 652, 540, 50, 25, 0.92);
    const labels = ['프롤로그', '공명의 숲', '잃어버린 기억', '선택의 순간', '진실의 조각'];
    labels.forEach((label, i) => {
      addText(this, 720 + i * 100, 674, label, 11, i === 0 ? '#8fd8ff' : '#6e7f89', 28, { originX: 0.5, originY: 0.5 });
      if (i < labels.length - 1) this.add.line(0, 0, 766 + i * 100, 674, 774 + i * 100, 674, 0x6d7a80, 0.65).setOrigin(0).setDepth(27);
    });
  }
  render() {
    this.choiceObjects.forEach((o) => o.destroy()); this.choiceObjects = [];
    const page = PROLOGUE[this.page];
    this.body.setText(page.body);
    this.speaker.setText(this.page === PROLOGUE.length - 1 ? '???' : '나');
    if (!page.choices) return;
    const panel = addPanel(this, 690, 102, 540, 282, 25, 0.95, true);
    const question = addText(this, 720, 126, page.body.split('\n')[0] + '\n나는 어떻게 반응할까?', 18, UI.text, 28, { wrap: 480, lineSpacing: 7 });
    this.choiceObjects.push(panel.bg, panel.top, question);
    page.choices.forEach(([label, element], index) => {
      const el = ELEMENTS[element];
      const button = addButton(this, 960, 214 + index * 57, 450, 44, `${index + 1}  ${label}`, () => this.choose(element), {
        fill: index === 0 ? 0x174b80 : index === 1 ? 0x235d2c : 0x3a245c,
        over: 0x315d7a, depth: 30, color: '#ffffff',
      });
      this.choiceObjects.push(button.rect, button.text);
    });
    addText(this, 960, 365, '(선택은 당신의 감정을 기록합니다)', 13, UI.muted, 31, { originX: 0.5 });
  }
  choose(element) {
    this.save.emotionScores[element] += 1;
    this.save.emotionHistory.push(element);
    audio.tone(520 + this.save.emotionHistory.length * 60, 0.08, 0.03);
    this.page += 1; this.render();
  }
  advance() {
    if (PROLOGUE[this.page].choices) return;
    if (this.page < PROLOGUE.length - 1) { this.page += 1; this.render(); return; }
    this.finish();
  }
  finish() {
    if (!this.save.element) this.save.element = dominantElement(this.save.emotionScores, this.save.emotionHistory);
    this.save.story.mainStage = 1; this.save.story.area = 'mist'; this.save.story.logs.push(`${ELEMENTS[this.save.element].name}의 감정이 처음 반응했다.`);
    saveGame(this.save);
    this.cameras.main.fadeOut(600, 8, 12, 18);
    this.time.delayedCall(650, () => this.scene.start('World', { area: 'mist' }));
  }
}

class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }
  init(data) { this.requestedArea = data?.area; }
  create() {
    this.save = loadSave();
    this.area = this.requestedArea || this.save.story.area || 'mist';
    this.save.story.area = this.area; saveGame(this.save);
    this.worldW = 1800; this.worldH = 1000;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.makeTextures(); this.drawArea();
    this.enemies = this.physics.add.group(); this.shots = this.physics.add.group(); this.enemyShots = this.physics.add.group(); this.collectibles = this.physics.add.group();
    this.player = this.physics.add.sprite(360, 520, 'hero').setDepth(20).setCollideWorldBounds(true).setScale(0.92);
    this.player.body.setSize(54, 68).setOffset(37, 48);
    this.moa = this.add.sprite(285, 440, 'moa').setDepth(21).setScale(0.82);
    this.lastDir = new Phaser.Math.Vector2(1, 0); this.velocity = new Phaser.Math.Vector2();
    this.invulnerableUntil = 0; this.lastAttack = 0; this.cooldowns = { skill: 0, burst: 0, pet: 0, dash: 0 }; this.menuOpen = false; this.logLines = [];
    this.keys = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D', attack: 'SPACE', attackAlt: 'J', interact: 'E', skill: 'Q', one: 'ONE', two: 'TWO', three: 'THREE', four: 'FOUR', dash: 'SHIFT', menu: 'TAB', bag: 'B', quest: 'L' });
    this.physics.add.overlap(this.shots, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, null, this);
    this.physics.add.overlap(this.player, this.enemyShots, this.hitByShot, null, this);
    this.physics.add.overlap(this.player, this.collectibles, this.collectItem, null, this);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH).startFollow(this.player, true, 0.09, 0.09);
    this.setupArea(); this.createHud(); this.installMenuKeys(); this.installTouchControls();
    this.time.addEvent({ delay: 1150, loop: true, callback: () => this.petAssist() });
  }
  makeTextures() {
    const make = (key, width, height, draw) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ add: false }); draw(g); g.generateTexture(key, width, height); g.destroy();
    };
    make('hero', 128, 128, (g) => {
      g.fillStyle(0x071018, 0.55).fillEllipse(64, 112, 76, 18); g.fillStyle(0x101923, 1).fillRoundedRect(34, 48, 60, 64, 18); g.fillStyle(0xe4bea9, 1).fillCircle(64, 39, 27);
      g.fillStyle(0x11151c, 1).fillCircle(64, 26, 29).fillTriangle(32, 36, 45, 8, 53, 37).fillTriangle(96, 36, 82, 7, 76, 37);
      g.fillStyle(0xf4f6f7, 1).fillCircle(55, 42, 3).fillCircle(74, 42, 3); g.fillStyle(0x1d2b37, 1).fillRect(41, 82, 18, 38).fillRect(69, 82, 18, 38);
    });
    make('moa', 96, 96, (g) => {
      g.fillStyle(0xc9f4ff, 0.3).fillCircle(48, 48, 42); g.fillStyle(0xf4fbff, 1).fillEllipse(48, 52, 50, 44); g.fillTriangle(28, 40, 15, 14, 41, 33).fillTriangle(68, 40, 81, 14, 55, 33);
      g.fillStyle(0x79d8ff, 0.85).fillTriangle(28, 58, 6, 73, 34, 72).fillTriangle(68, 58, 90, 73, 62, 72); g.fillStyle(0x2a5d77, 1).fillCircle(39, 50, 4).fillCircle(58, 50, 4);
    });
    make('enemy', 108, 108, (g) => { g.fillStyle(0x120d1b, 0.5).fillEllipse(54, 92, 80, 17); g.fillStyle(0x38214d, 1).fillCircle(54, 55, 42); g.fillStyle(0x8e43cf, 0.75).fillCircle(54, 55, 28); g.fillStyle(0xffffff, 1).fillCircle(42, 50, 5).fillCircle(66, 50, 5); g.fillStyle(0x17101d, 1).fillTriangle(15, 52, 2, 32, 24, 42).fillTriangle(93, 52, 106, 32, 84, 42); });
    make('boss', 240, 240, (g) => { g.fillStyle(0x08050c, 0.55).fillEllipse(120, 210, 190, 35); g.fillStyle(0x1b1025, 1).fillCircle(120, 118, 92); g.fillStyle(0x6d269e, 0.88).fillCircle(120, 118, 62); g.fillStyle(0xd785ff, 0.7).fillCircle(120, 118, 34); g.fillStyle(0xffffff, 1).fillCircle(92, 95, 9).fillCircle(148, 95, 9); g.lineStyle(14, 0x6e2d94, 0.85).lineBetween(20, 200, 64, 155).lineBetween(220, 200, 176, 155).lineBetween(45, 45, 82, 72).lineBetween(195, 45, 158, 72); });
    make('shot', 32, 32, (g) => { const color = ELEMENTS[this.save.element || 'fire'].color; g.fillStyle(color, 0.25).fillCircle(16, 16, 15); g.fillStyle(color, 1).fillCircle(16, 16, 8); g.fillStyle(0xffffff, 0.85).fillCircle(13, 13, 3); });
    make('enemy-shot', 28, 28, (g) => { g.fillStyle(0x9b48d8, 0.35).fillCircle(14, 14, 13); g.fillStyle(0xde9cff, 1).fillCircle(14, 14, 7); });
    make('fragment', 52, 70, (g) => { g.fillStyle(0x8ee9ff, 0.28).fillCircle(26, 34, 25); g.fillStyle(0xbff7ff, 1).fillTriangle(26, 3, 47, 30, 26, 66).fillTriangle(26, 3, 5, 30, 26, 66); g.lineStyle(2, 0xffffff, 0.85).strokeTriangle(26, 3, 47, 30, 26, 66); });
    make('petal', 42, 42, (g) => { g.fillStyle(0xd9f4ff, 1).fillEllipse(21, 10, 12, 22).fillEllipse(32, 21, 22, 12).fillEllipse(21, 32, 12, 22).fillEllipse(10, 21, 22, 12); g.fillStyle(0x86d9ff, 1).fillCircle(21, 21, 6); });
    make('trace', 48, 48, (g) => { g.fillStyle(0x8e43cf, 0.35).fillCircle(24, 24, 22); g.lineStyle(6, 0xc57cff, 0.9).lineBetween(8, 30, 20, 12).lineBetween(20, 12, 31, 34).lineBetween(31, 34, 42, 15); });
    make('npc-elder', 96, 128, (g) => { g.fillStyle(0x1d1a22, 0.5).fillEllipse(48, 116, 60, 15); g.fillStyle(0x2d4d63, 1).fillRoundedRect(22, 48, 52, 65, 17); g.fillStyle(0xe4bea9, 1).fillCircle(48, 36, 24); g.fillStyle(0xe8edf0, 1).fillTriangle(25, 48, 48, 94, 71, 48); g.fillStyle(0xd9dce0, 1).fillCircle(48, 20, 25); });
    make('npc-merchant', 96, 128, (g) => { g.fillStyle(0x1d1a22, 0.5).fillEllipse(48, 116, 60, 15); g.fillStyle(0x6b4a2a, 1).fillRoundedRect(22, 50, 52, 62, 17); g.fillStyle(0xe6bd9f, 1).fillCircle(48, 37, 24); g.fillStyle(0x8a4a28, 1).fillRect(18, 20, 60, 13); g.fillStyle(0xe7d092, 1).fillCircle(48, 15, 7); });
    make('portal', 100, 130, (g) => { g.lineStyle(13, 0x81d9ff, 0.55).strokeEllipse(50, 68, 72, 112); g.lineStyle(4, 0xe5fbff, 0.92).strokeEllipse(50, 68, 58, 96); g.fillStyle(0x3a8bd0, 0.25).fillEllipse(50, 68, 50, 88); });
  }
  drawArea() {
    const g = this.add.graphics().setDepth(0); const area = this.area;
    if (area === 'village') {
      g.fillGradientStyle(0x91c8e8, 0x91c8e8, 0xe2d49d, 0xe2d49d, 1).fillRect(0, 0, this.worldW, this.worldH);
      g.fillStyle(0x4f8655, 1).fillRect(0, 440, this.worldW, 560); g.fillStyle(0xc5a675, 1).fillRoundedRect(130, 540, 1540, 260, 110);
      for (let i = 0; i < 8; i += 1) { const x = 120 + i * 210; g.fillStyle(0xe3c49b, 1).fillRect(x, 290 + (i % 2) * 30, 160, 170); g.fillStyle(0x8a4937, 1).fillTriangle(x - 15, 300 + (i % 2) * 30, x + 80, 220 + (i % 2) * 30, x + 175, 300 + (i % 2) * 30); g.fillStyle(0x76bdda, 1).fillRect(x + 28, 335 + (i % 2) * 30, 40, 42); }
      g.fillStyle(0x2d6243, 1); for (let i = 0; i < 15; i += 1) g.fillCircle(45 + i * 125, 410 + (i % 3) * 30, 55);
    } else {
      const boss = area === 'boss';
      g.fillGradientStyle(boss ? 0x12091d : 0x102d35, boss ? 0x12091d : 0x102d35, boss ? 0x241330 : 0x1f4947, boss ? 0x241330 : 0x1f4947, 1).fillRect(0, 0, this.worldW, this.worldH);
      g.fillStyle(boss ? 0x1b1026 : 0x214f48, 1).fillEllipse(900, 560, 1760, 760);
      for (let i = 0; i < 28; i += 1) { const x = 20 + (i * 137) % 1780; const h = 180 + (i * 73) % 320; g.fillStyle(boss ? 0x09060d : 0x102925, 0.95).fillRect(x, 0, 45 + (i % 3) * 15, h); g.fillCircle(x + 15, 90 + (i * 31) % 220, 70 + (i % 4) * 16); }
      g.fillStyle(boss ? 0x8137b3 : 0x80d9c0, 0.55); for (let i = 0; i < 65; i += 1) g.fillCircle(20 + (i * 71) % 1760, 190 + (i * 103) % 720, 2 + (i % 3));
    }
  }
  setupArea() {
    if (this.area === 'mist') this.setupMist();
    if (this.area === 'village') this.setupVillage();
    if (this.area === 'forest') this.setupForest();
    if (this.area === 'boss') this.setupBoss();
  }
  setupMist() {
    this.player.setPosition(420, 560); this.moa.setPosition(340, 460);
    if (this.save.story.mainStage <= 1) {
      showDialogue(this, [
        { speaker: '나', text: '차갑고 조용하다. 회사도, 옥상도 없다.\n\n“…나 죽은 건가?”' },
        { speaker: '모아', text: '정신이 들어? 여기는 루메르 대륙의 안개숲이야.\n그리고… 너한테서 이상한 감정이 느껴져!' },
        { speaker: '모아', text: `${ELEMENTS[this.save.element].emotion}\n\n좋고 나쁜 게 아니야. 네가 오래 붙들고 있던 마음이야.` },
        { speaker: '모아', text: '조심해! 감정이 왜곡되면 괴물이 되어 공격해올 거야.\n네 안의 감정을 마법으로 다뤄봐!' },
      ], () => { this.save.story.mainStage = 2; saveGame(this.save); this.spawnEchoes(5); this.log('시스템', `${ELEMENTS[this.save.element].skill} 스킬을 사용합니다.`); });
    } else if (this.save.story.mainStage === 2) this.spawnEchoes(Math.max(1, 5 - this.save.mainProgress.echoes));
    else this.createPortal(1450, 500, 'village', '루메르 마을');
  }
  setupVillage() {
    this.player.setPosition(350, 650); this.moa.setPosition(280, 575);
    this.elder = this.physics.add.staticSprite(650, 520, 'npc-elder').setDepth(12);
    this.merchant = this.physics.add.staticSprite(1040, 540, 'npc-merchant').setDepth(12);
    this.createNameplate(this.elder, '루메르 장로'); this.createNameplate(this.merchant, '잡화상인 루티');
    this.createPortal(1490, 580, 'forest', '안개숲');
    if (this.save.story.mainStage === 3) toast(this, '장로에게 다가가 E 키로 대화하세요.', UI.gold);
    if (this.save.story.mainStage >= 7) this.time.delayedCall(350, () => this.scene.start('End'));
  }
  setupForest() {
    this.player.setPosition(260, 610); this.moa.setPosition(190, 540);
    for (let i = 0; i < 7; i += 1) this.spawnEnemy(560 + (i * 173) % 980, 300 + (i * 127) % 480);
    if (!this.save.sideQuests.petals.completed) for (let i = this.save.sideQuests.petals.progress; i < 3; i += 1) this.spawnCollectible('petal', 460 + i * 390, 280 + (i % 2) * 370, 'petal');
    if (!this.save.sideQuests.traces.completed) for (let i = this.save.sideQuests.traces.progress; i < 5; i += 1) this.spawnCollectible('trace', 360 + i * 265, 210 + (i % 3) * 250, 'trace');
    for (let i = this.save.mainProgress.fragments; i < 3; i += 1) this.spawnCollectible('fragment', 690 + i * 370, 680 - (i % 2) * 330, 'fragment');
    if (this.save.mainProgress.fragments >= 3) this.createPortal(1570, 420, 'boss', '숲의 균열');
  }
  setupBoss() {
    this.player.setPosition(320, 620); this.moa.setPosition(245, 545);
    this.boss = this.spawnEnemy(1280, 470, true);
    this.boss.maxHp = 1450; this.boss.hp = 1450; this.boss.speed = 62; this.boss.nextPattern = 0;
    this.createBossBar();
    showDialogue(this, [
      { speaker: '모아', text: '저게 안개숲의 감정을 뒤엉키게 만든 잔향이야.' },
      { speaker: '나', text: '없애는 게 아니라… 방향을 되찾게 하는 거지.' },
      { speaker: '모아', text: '응. 네 감정을 믿어. 나도 옆에서 도울게!' },
    ], () => this.log('시스템', '보스전이 시작되었습니다.'));
  }
  createNameplate(target, label) { addText(this, target.x, target.y - 86, label, 14, '#f5e5b2', 30, { world: true, originX: 0.5, originY: 0.5, bold: true }); }
  createPortal(x, y, destination, label) {
    const portal = this.physics.add.staticSprite(x, y, 'portal').setDepth(10).setScale(1.15).setData('destination', destination).setData('label', label);
    this.portal = portal; this.createNameplate(portal, `[E] ${label}`);
    this.tweens.add({ targets: portal, angle: 360, duration: 7000, repeat: -1 });
  }
  spawnEnemy(x, y, boss = false) {
    const enemy = this.enemies.create(x, y, boss ? 'boss' : 'enemy').setDepth(15).setScale(boss ? 0.9 : Phaser.Math.FloatBetween(0.72, 0.88));
    enemy.hp = boss ? 1450 : 90; enemy.maxHp = enemy.hp; enemy.speed = boss ? 62 : Phaser.Math.Between(60, 88); enemy.damage = boss ? 24 : 11; enemy.boss = boss; enemy.nextAttack = 0;
    enemy.body.setCircle(boss ? 75 : 35, boss ? 45 : 19, boss ? 45 : 19);
    return enemy;
  }
  spawnEchoes(count) { for (let i = 0; i < count; i += 1) this.spawnEnemy(720 + i * 165, 320 + (i % 2) * 310); }
  spawnCollectible(texture, x, y, kind) {
    const item = this.collectibles.create(x, y, texture).setDepth(10).setData('kind', kind); item.body.setCircle(24);
    this.tweens.add({ targets: item, y: y - 16, duration: 900 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  createHud() {
    const element = ELEMENTS[this.save.element];
    addPanel(this, 14, 14, 260, 72, 90, 0.88);
    addText(this, 28, 25, `Lv.${this.save.player.level}  아르피아`, 15, UI.text, 95, { bold: true });
    addText(this, 28, 54, `${this.area === 'village' ? '루메르 변두리 마을' : this.area === 'boss' ? '안개숲 심부' : '안개숲'}`, 13, UI.muted, 95);

    addPanel(this, 958, 126, 304, 198, 90, 0.91, true);
    addText(this, 980, 143, '현재 목표', 14, '#f4d887', 95, { bold: true });
    this.questText = addText(this, 980, 174, '', 15, UI.text, 95, { wrap: 255, lineSpacing: 8 });
    this.drawMinimap();

    addPanel(this, 14, 586, 1252, 120, 90, 0.96);
    this.portrait = this.add.circle(76, 646, 39, 0x172533, 1).setDepth(95).setScrollFactor(0).setStrokeStyle(2, element.color, 1);
    addText(this, 76, 645, 'A', 27, element.bright, 96, { bold: true, originX: 0.5, originY: 0.5 });
    this.hpLabel = addText(this, 126, 604, '', 14, UI.text, 96, { bold: true });
    this.hpBg = this.add.rectangle(126, 630, 260, 14, 0x1c2b32, 1).setOrigin(0, 0.5).setDepth(95).setScrollFactor(0);
    this.hpBar = this.add.rectangle(126, 630, 260, 14, UI.green, 1).setOrigin(0, 0.5).setDepth(96).setScrollFactor(0);
    this.mpBg = this.add.rectangle(126, 654, 260, 11, 0x1c2b32, 1).setOrigin(0, 0.5).setDepth(95).setScrollFactor(0);
    this.mpBar = this.add.rectangle(126, 654, 208, 11, 0x4a9be8, 1).setOrigin(0, 0.5).setDepth(96).setScrollFactor(0);
    this.emotionBg = this.add.rectangle(126, 678, 260, 8, 0x1c2b32, 1).setOrigin(0, 0.5).setDepth(95).setScrollFactor(0);
    this.emotionBar = this.add.rectangle(126, 678, 182, 8, element.color, 1).setOrigin(0, 0.5).setDepth(96).setScrollFactor(0);

    const slots = [
      ['1', '기본 공격', UI.blue], ['2', element.skill, element.color], ['3', `${element.name}의 폭발`, element.color], ['4', '모아의 위로', 0x8edcff], ['Shift', '대시', 0x6c91ff],
    ];
    this.skillLabels = [];
    slots.forEach(([key, name, color], i) => {
      const x = 492 + i * 112; const rect = this.add.rectangle(x, 638, 84, 72, 0x0a1722, 1).setDepth(95).setScrollFactor(0).setStrokeStyle(2, color, 0.9);
      addText(this, x - 34, 604, key, key === 'Shift' ? 11 : 14, '#ffffff', 97, { bold: true });
      addText(this, x, 643, i === 0 ? '✧' : i === 1 ? '╱' : i === 2 ? '✹' : i === 3 ? '♡' : '➤', 28, Phaser.Display.Color.IntegerToColor(color).rgba, 97, { bold: true, originX: 0.5, originY: 0.5 });
      const cd = addText(this, x, 677, name, 10, UI.muted, 97, { originX: 0.5, originY: 0.5 }); this.skillLabels.push(cd);
      rect.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.useSlot(i + 1));
    });

    addPanel(this, 990, 586, 276, 120, 90, 0.96);
    this.logText = addText(this, 1008, 601, '', 12, '#b8c8d2', 96, { wrap: 238, lineSpacing: 3 });
    this.log('모아', '조심해! 감정이 왜곡되면 몬스터가 되어 공격해올 거야!');

    const tabs = [['상태', 'status'], ['가방', 'bag'], ['스킬', 'skills'], ['퀘스트', 'quests'], ['일지', 'journal'], ['도감', 'codex'], ['펫', 'pet'], ['상점', 'shop'], ['설정', 'settings']];
    tabs.forEach(([label, tab], i) => addButton(this, 58 + i * 91, 548, 82, 34, label, () => this.openMenu(tab), { size: 12, fill: 0x08141e, depth: 96, gold: tab === 'skills' }));
    addText(this, 1138, 548, 'E 상호작용 · Tab 메뉴', 12, UI.muted, 96, { originX: 0.5, originY: 0.5 });
    this.updateHud();
  }
  drawMinimap() {
    this.add.circle(1110, 76, 59, 0x06111a, 0.92).setDepth(94).setScrollFactor(0).setStrokeStyle(2, UI.line, 1);
    this.add.circle(1110, 76, 4, UI.blue, 1).setDepth(96).setScrollFactor(0);
    for (let i = 0; i < 10; i += 1) this.add.circle(1070 + (i * 37) % 82, 43 + (i * 29) % 68, 2, i % 3 ? 0x69af8d : 0xd27676, 0.9).setDepth(95).setScrollFactor(0);
    addText(this, 1172, 24, 'M', 12, UI.text, 96, { bold: true });
  }
  installMenuKeys() {
    this.input.keyboard.on('keydown-TAB', (event) => { event.preventDefault(); if (this.menuOpen) this.closeMenu(); else this.openMenu('status'); });
    this.input.keyboard.on('keydown-B', () => this.openMenu('bag'));
    this.input.keyboard.on('keydown-L', () => this.openMenu('quests'));
  }
  installTouchControls() {
    if (!this.sys.game.device.input.touch) return;
    const controls = [['▲', 110, 430, 'up'], ['▼', 110, 520, 'down'], ['◀', 62, 476, 'left'], ['▶', 158, 476, 'right']];
    controls.forEach(([label, x, y, key]) => {
      const circle = this.add.circle(x, y, 34, UI.panel, 0.45).setDepth(200).setScrollFactor(0).setStrokeStyle(1, UI.line, 0.7).setInteractive();
      addText(this, x, y, label, 16, '#ffffff', 201, { originX: 0.5, originY: 0.5 });
      circle.on('pointerdown', () => { this.touchKey = key; }).on('pointerup', () => { if (this.touchKey === key) this.touchKey = null; }).on('pointerout', () => { if (this.touchKey === key) this.touchKey = null; });
    });
  }
  update(time, delta) {
    if (this.menuOpen || !this.player?.active) return;
    const input = new Phaser.Math.Vector2(
      (this.keys.right.isDown || this.touchKey === 'right' ? 1 : 0) - (this.keys.left.isDown || this.touchKey === 'left' ? 1 : 0),
      (this.keys.down.isDown || this.touchKey === 'down' ? 1 : 0) - (this.keys.up.isDown || this.touchKey === 'up' ? 1 : 0),
    );
    if (input.lengthSq() > 0) { input.normalize(); this.lastDir.copy(input); }
    const targetSpeed = 235; const smoothing = 1 - Math.exp(-delta * 0.018);
    this.velocity.x = Phaser.Math.Linear(this.velocity.x, input.x * targetSpeed, smoothing);
    this.velocity.y = Phaser.Math.Linear(this.velocity.y, input.y * targetSpeed, smoothing);
    this.player.setVelocity(this.velocity.x, this.velocity.y);
    const moving = input.lengthSq() > 0;
    const reduced = this.save.settings.reducedMotion;
    this.player.rotation = reduced ? 0 : Phaser.Math.Linear(this.player.rotation, input.x * 0.045, 0.12);
    this.player.scaleY = reduced ? 0.92 : 0.92 + Math.sin(time * 0.012) * (moving ? 0.025 : 0.012);
    this.player.scaleX = reduced ? 0.92 : 0.92 - Math.sin(time * 0.012) * (moving ? 0.012 : 0.006);
    const moaTargetX = this.player.x - this.lastDir.x * 82 - 24; const moaTargetY = this.player.y - this.lastDir.y * 58 - 80;
    this.moa.x = Phaser.Math.Linear(this.moa.x, moaTargetX, 0.055); this.moa.y = Phaser.Math.Linear(this.moa.y, moaTargetY + (reduced ? 0 : Math.sin(time * 0.005) * 10), 0.07);

    if (Phaser.Input.Keyboard.JustDown(this.keys.attack) || Phaser.Input.Keyboard.JustDown(this.keys.attackAlt) || Phaser.Input.Keyboard.JustDown(this.keys.one)) this.basicAttack(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.skill) || Phaser.Input.Keyboard.JustDown(this.keys.two)) this.elementSkill(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.elementBurst(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.four)) this.petSkill(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.dash(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) this.interact();

    this.updateEnemies(time); this.updateBoss(time); this.updateHud(time);
  }
  useSlot(slot) { const now = this.time.now; if (slot === 1) this.basicAttack(now); if (slot === 2) this.elementSkill(now); if (slot === 3) this.elementBurst(now); if (slot === 4) this.petSkill(now); if (slot === 5) this.dash(now); }
  basicAttack(time) {
    if (time - this.lastAttack < 280) return; this.lastAttack = time; audio.tone(720, 0.045, 0.025, 'triangle');
    const shot = this.shots.create(this.player.x + this.lastDir.x * 30, this.player.y + this.lastDir.y * 30, 'shot').setDepth(18); shot.damage = 22 + this.save.skills[this.save.element].basic * 6; shot.setVelocity(this.lastDir.x * 620, this.lastDir.y * 620);
    this.time.delayedCall(850, () => shot?.active && shot.destroy()); this.slashEffect(this.player.x, this.player.y, this.lastDir, ELEMENTS[this.save.element].color);
  }
  elementSkill(time) {
    if (time < this.cooldowns.skill || this.save.player.mp < 18) return; this.cooldowns.skill = time + Math.max(1600, 3400 - this.save.skills[this.save.element].core * 280); this.save.player.mp -= 18;
    const el = ELEMENTS[this.save.element]; audio.tone(360, 0.15, 0.045, 'sawtooth'); this.slashEffect(this.player.x + this.lastDir.x * 80, this.player.y + this.lastDir.y * 60, this.lastDir, el.color, 1.55);
    this.enemies.getChildren().forEach((enemy) => { if (enemy.active && Phaser.Math.Distance.Between(this.player.x + this.lastDir.x * 80, this.player.y + this.lastDir.y * 60, enemy.x, enemy.y) < 150) this.damageEnemy(enemy, 58 + this.save.skills[this.save.element].core * 12, true); });
    this.log('시스템', `${el.skill} 스킬을 사용했습니다.`); saveGame(this.save);
  }
  elementBurst(time) {
    if (time < this.cooldowns.burst || this.save.player.mp < 34) return; this.cooldowns.burst = time + 7200; this.save.player.mp -= 34; const el = ELEMENTS[this.save.element];
    const ring = this.add.circle(this.player.x, this.player.y, 18, el.color, 0.28).setDepth(17); this.tweens.add({ targets: ring, radius: 230, alpha: 0, duration: 480, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    this.enemies.getChildren().forEach((enemy) => { if (enemy.active && Phaser.Math.Distance.BetweenPoints(this.player, enemy) < 240) this.damageEnemy(enemy, 92 + this.save.skills[this.save.element].mastery * 16, true); });
    if (this.save.settings.shake) this.cameras.main.shake(180, 0.006); audio.tone(190, 0.28, 0.05, 'sawtooth'); saveGame(this.save);
  }
  petSkill(time) {
    if (time < this.cooldowns.pet || this.save.player.mp < 24) return; this.cooldowns.pet = time + 9000; this.save.player.mp -= 24;
    this.save.player.hp = Math.min(this.save.player.maxHp, this.save.player.hp + 80 + this.save.pet.level * 7); this.invulnerableUntil = time + 800;
    const heart = addText(this, this.player.x, this.player.y - 100, '♡', 44, '#bff3ff', 80, { world: true, bold: true, originX: 0.5, originY: 0.5 }); this.tweens.add({ targets: heart, y: heart.y - 70, alpha: 0, duration: 900, onComplete: () => heart.destroy() });
    this.log('모아', '내가 옆에 있을게. 천천히 숨 쉬어!'); audio.tone(880, 0.25, 0.04, 'sine'); saveGame(this.save);
  }
  dash(time) {
    if (time < this.cooldowns.dash) return; this.cooldowns.dash = time + 1050; this.invulnerableUntil = time + 320;
    const oldX = this.player.x; const oldY = this.player.y;
    for (let i = 0; i < 4; i += 1) { const ghost = this.add.sprite(oldX - this.lastDir.x * i * 18, oldY - this.lastDir.y * i * 18, 'hero').setDepth(16).setAlpha(0.35 - i * 0.06).setScale(0.92); this.tweens.add({ targets: ghost, alpha: 0, duration: 300 + i * 55, onComplete: () => ghost.destroy() }); }
    this.player.setPosition(Phaser.Math.Clamp(oldX + this.lastDir.x * 150, 40, this.worldW - 40), Phaser.Math.Clamp(oldY + this.lastDir.y * 150, 40, this.worldH - 40));
    audio.tone(250, 0.08, 0.025, 'square');
  }
  slashEffect(x, y, dir, color, scale = 1) {
    const angle = Math.atan2(dir.y, dir.x); const arc = this.add.arc(x, y, 78 * scale, Phaser.Math.RadToDeg(angle) - 48, Phaser.Math.RadToDeg(angle) + 48, false, color, 0.18).setDepth(24).setStrokeStyle(13 * scale, color, 0.92);
    this.tweens.add({ targets: arc, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 230, ease: 'Cubic.out', onComplete: () => arc.destroy() });
  }
  updateEnemies(time) {
    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return; const distance = Phaser.Math.Distance.BetweenPoints(enemy, this.player);
      if (distance > (enemy.boss ? 135 : 72)) this.physics.moveToObject(enemy, this.player, enemy.speed);
      else enemy.setVelocity(0, 0);
      enemy.rotation = Math.sin(time * 0.006 + enemy.x) * 0.025;
      if (!enemy.boss && distance < 84 && time > enemy.nextAttack) { enemy.nextAttack = time + 1050; this.applyPlayerDamage(enemy.damage); }
    });
  }
  updateBoss(time) {
    if (!this.boss?.active) return;
    if (time > this.boss.nextPattern) {
      this.boss.nextPattern = time + 2100;
      const count = this.boss.hp < this.boss.maxHp * 0.5 ? 10 : 7;
      for (let i = 0; i < count; i += 1) { const angle = (Math.PI * 2 * i) / count; const shot = this.enemyShots.create(this.boss.x, this.boss.y, 'enemy-shot').setDepth(19); shot.damage = 17; shot.setVelocity(Math.cos(angle) * 230, Math.sin(angle) * 230); this.time.delayedCall(2500, () => shot?.active && shot.destroy()); }
      if (this.save.settings.shake) this.cameras.main.shake(100, 0.003);
    }
    if (this.bossBar) this.bossBar.displayWidth = 560 * Math.max(0, this.boss.hp / this.boss.maxHp);
  }
  hitEnemy(shot, enemy) { if (!shot.active || !enemy.active) return; const damage = shot.damage || 20; shot.destroy(); this.damageEnemy(enemy, damage, Math.random() < 0.18); }
  damageEnemy(enemy, amount, critical = false) {
    enemy.hp -= amount; enemy.setTint(0xffffff); this.time.delayedCall(70, () => enemy?.active && enemy.clearTint()); this.damageNumber(enemy.x, enemy.y - 55, amount, critical);
    if (enemy.hp > 0) return;
    const wasBoss = enemy.boss; enemy.destroy(); this.save.player.exp = Math.min(99, this.save.player.exp + (wasBoss ? 28 : 4)); this.save.player.gold += wasBoss ? 850 : 28;
    if (this.area === 'mist' && this.save.story.mainStage === 2) { this.save.mainProgress.echoes += 1; if (this.save.mainProgress.echoes >= 5) { this.save.story.mainStage = 3; this.save.story.area = 'mist'; this.createPortal(1450, 500, 'village', '루메르 마을'); toast(this, '첫 원소 수련 완료 · 마을의 불빛이 보입니다.', UI.gold); } }
    if (wasBoss) this.bossDefeated(); saveGame(this.save);
  }
  damageNumber(x, y, amount, critical) {
    const number = addText(this, x, y, `${Math.round(amount)}${critical ? '\nCRITICAL!' : ''}`, critical ? 26 : 20, critical ? '#ffb348' : '#ffffff', 80, { world: true, bold: true, align: 'center', originX: 0.5, originY: 0.5 });
    number.setStroke('#35170a', critical ? 5 : 3); this.tweens.add({ targets: number, y: y - 62, alpha: 0, scaleX: critical ? 1.35 : 1, scaleY: critical ? 1.35 : 1, duration: 720, ease: 'Cubic.out', onComplete: () => number.destroy() });
  }
  hitPlayer(_player, enemy) { if (!enemy.active) return; this.applyPlayerDamage(enemy.damage || 10); }
  hitByShot(_player, shot) { const damage = shot.damage || 14; shot.destroy(); this.applyPlayerDamage(damage); }
  applyPlayerDamage(amount) {
    const time = this.time.now; if (time < this.invulnerableUntil) return; this.invulnerableUntil = time + 650; this.save.player.hp = Math.max(0, this.save.player.hp - amount);
    this.player.setTint(0xff9c9c); this.time.delayedCall(110, () => this.player?.active && this.player.clearTint()); if (this.save.settings.shake) this.cameras.main.shake(120, 0.006);
    if (this.save.player.hp <= 0) this.gameOver(); saveGame(this.save);
  }
  gameOver() {
    this.physics.world.pause(); this.menuOpen = true;
    const shade = this.add.rectangle(0, 0, W, H, 0x02040a, 0.82).setOrigin(0).setDepth(800).setScrollFactor(0);
    addText(this, W / 2, 280, '감정에 휩쓸렸다', 42, '#ffffff', 802, { bold: true, originX: 0.5 });
    addText(this, W / 2, 345, '감정을 없애는 것이 아니라 다시 방향을 찾는다.', 18, UI.muted, 802, { originX: 0.5 });
    addButton(this, W / 2, 420, 220, 48, '체크포인트에서 재개', () => { const s = loadSave(); s.player.hp = s.player.maxHp; s.player.mp = s.player.maxMp; saveGame(s); this.scene.restart({ area: this.area === 'boss' ? 'forest' : this.area }); }, { depth: 803, gold: true });
  }
  collectItem(_player, item) {
    const kind = item.getData('kind'); item.destroy(); audio.tone(900, 0.1, 0.035);
    if (kind === 'fragment') { this.save.mainProgress.fragments += 1; toast(this, `공명 조각 ${this.save.mainProgress.fragments} / 3`, UI.blue); if (this.save.mainProgress.fragments >= 3) { this.save.story.mainStage = 5; this.createPortal(1570, 420, 'boss', '숲의 균열'); toast(this, '숲 심부로 향하는 균열이 열렸습니다.', UI.gold); } }
    if (kind === 'petal') this.progressSideQuest('petals');
    if (kind === 'trace') this.progressSideQuest('traces');
    saveGame(this.save);
  }
  progressSideQuest(id) {
    const state = this.save.sideQuests[id]; const quest = SIDE_QUESTS[id]; if (!state.accepted || state.completed) return;
    state.progress = Math.min(quest.target, state.progress + 1); if (state.progress >= quest.target) { state.completed = true; toast(this, `서브 퀘스트 완료: ${quest.title}`, UI.green); }
    else toast(this, `${quest.objective} ${state.progress} / ${quest.target}`, UI.green);
  }
  bossDefeated() {
    this.save.story.mainStage = 6; this.save.story.area = 'boss'; this.save.story.logs.push('뒤엉킨 잔향을 정화했다.'); saveGame(this.save);
    this.physics.world.pause();
    showDialogue(this, [
      { speaker: '모아', text: '사라진 게 아니야. 뒤엉킨 감정이 제자리로 돌아간 거야.' },
      { speaker: '나', text: '이 힘을 제대로 이해하려면… 더 많은 감정을 마주해야겠네.' },
      { speaker: '모아', text: '먼저 장로에게 돌아가자. 그리고 밥도 먹자! 정령도 배고파.' },
    ], () => { this.physics.world.resume(); this.createPortal(1040, 480, 'village', '루메르 마을'); });
  }
  createBossBar() {
    addPanel(this, 345, 18, 590, 64, 90, 0.93, true); addText(this, 640, 30, 'Lv.5  뒤엉킨 잔향', 16, UI.text, 95, { bold: true, originX: 0.5 });
    this.add.rectangle(360, 62, 560, 12, 0x1a2028, 1).setOrigin(0, 0.5).setDepth(95).setScrollFactor(0); this.bossBar = this.add.rectangle(360, 62, 560, 12, 0xb83b64, 1).setOrigin(0, 0.5).setDepth(96).setScrollFactor(0);
  }
  petAssist() {
    if (!this.save.pet.summoned || this.menuOpen || !this.enemies?.countActive(true)) return;
    const target = this.enemies.getChildren().filter((e) => e.active).sort((a, b) => Phaser.Math.Distance.BetweenPoints(this.moa, a) - Phaser.Math.Distance.BetweenPoints(this.moa, b))[0];
    if (!target || Phaser.Math.Distance.BetweenPoints(this.moa, target) > 560) return;
    const shot = this.shots.create(this.moa.x, this.moa.y, 'shot').setScale(0.65).setDepth(18); shot.damage = 12 + this.save.pet.level * 2; this.physics.moveToObject(shot, target, 470); this.time.delayedCall(1100, () => shot?.active && shot.destroy());
  }
  interact() {
    if (this.portal && Phaser.Math.Distance.BetweenPoints(this.player, this.portal) < 135) { const destination = this.portal.getData('destination'); this.changeArea(destination); return; }
    if (this.area !== 'village') return;
    if (this.elder && Phaser.Math.Distance.BetweenPoints(this.player, this.elder) < 125) this.talkElder();
    else if (this.merchant && Phaser.Math.Distance.BetweenPoints(this.player, this.merchant) < 125) this.openMenu('shop');
    else toast(this, '상호작용할 대상에 조금 더 가까이 가세요.');
  }
  talkElder() {
    const stage = this.save.story.mainStage;
    if (stage === 3) {
      showDialogue(this, [
        { speaker: '루메르 장로', text: '낯선 이여, 네 곁의 정령이 널 이곳까지 이끌었구나.' },
        { speaker: '루메르 장로', text: '안개숲의 감정이 불안정해지고 있다. 공명 조각 세 개를 찾아 근원을 확인해다오.' },
        { speaker: '모아', text: '마침 나도 부탁이 있어! 숲에 떨어진 별빛 꽃잎을 세 장만 찾아줘.' },
      ], () => {
        this.save.story.mainStage = 4; this.save.story.area = 'village'; this.save.sideQuests.petals.accepted = true; this.save.sideQuests.traces.accepted = true; this.save.story.logs.push('장로에게 안개숲 조사를 의뢰받았다.'); saveGame(this.save); toast(this, '메인 퀘스트와 서브 퀘스트가 등록되었습니다.', UI.gold); this.updateHud();
      });
    } else if (stage === 6) {
      showDialogue(this, [
        { speaker: '루메르 장로', text: '숲을 짓누르던 잔향이 잦아들었구나. 네가 감정을 파괴하지 않고 이해했기 때문이다.' },
        { speaker: '루메르 장로', text: '이 세계에는 아직 다섯 개의 감정 원소가 잠들어 있다. 네 여정은 이제 시작이다.' },
      ], () => { this.save.story.mainStage = 7; this.save.player.gold += 1500; this.save.player.skillPoints += 2; this.save.story.logs.push('루메르에서 새로운 삶을 시작하기로 했다.'); saveGame(this.save); this.scene.start('End'); });
    } else showDialogue(this, [{ speaker: '루메르 장로', text: objectiveText(this.save) }], () => {});
  }
  changeArea(destination) {
    if (destination === 'forest' && this.save.story.mainStage < 4) { toast(this, '먼저 장로와 대화하세요.', UI.red); return; }
    if (destination === 'boss' && this.save.mainProgress.fragments < 3) { toast(this, '공명 조각이 더 필요합니다.', UI.red); return; }
    this.save.story.area = destination; saveGame(this.save); this.cameras.main.fadeOut(260, 5, 12, 18); this.time.delayedCall(280, () => this.scene.restart({ area: destination }));
  }
  log(speaker, message) { this.logLines.push(`${speaker} : ${message}`); if (this.logLines.length > 5) this.logLines.shift(); if (this.logText) this.logText.setText(this.logLines.join('\n')); }
  updateHud(time = this.time.now) {
    if (!this.hpLabel) return; const p = this.save.player; this.hpLabel.setText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}   MP ${Math.ceil(p.mp)} / ${p.maxMp}`);
    this.hpBar.displayWidth = 260 * Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1); this.mpBar.displayWidth = 260 * Phaser.Math.Clamp(p.mp / p.maxMp, 0, 1); this.emotionBar.displayWidth = 260 * 0.72;
    const stage = Math.min(MAIN_STAGES.length - 1, this.save.story.mainStage); let side = '';
    Object.entries(SIDE_QUESTS).forEach(([id, quest]) => { const state = this.save.sideQuests[id]; if (state.accepted && !state.claimed) side += `\n\n${state.completed ? '✓' : '◇'} ${quest.title}\n${quest.objective} ${state.progress}/${quest.target}`; });
    this.questText.setText(`✦ ${MAIN_STAGES[stage].title}\n${objectiveText(this.save)}${side}`);
    const cds = [0, Math.max(0, this.cooldowns.skill - time), Math.max(0, this.cooldowns.burst - time), Math.max(0, this.cooldowns.pet - time), Math.max(0, this.cooldowns.dash - time)];
    this.skillLabels?.forEach((label, index) => { const base = index === 0 ? '기본 공격' : index === 1 ? ELEMENTS[this.save.element].skill : index === 2 ? `${ELEMENTS[this.save.element].name}의 폭발` : index === 3 ? '모아의 위로' : '대시'; label.setText(cds[index] > 0 ? `${(cds[index] / 1000).toFixed(1)}s` : base); });
    if (p.mp < p.maxMp) { p.mp = Math.min(p.maxMp, p.mp + 0.018); }
  }
  openMenu(tab = 'status') {
    if (this.menuOpen) this.closeMenu(); this.menuOpen = true; this.physics.world.pause();
    const depth = 700; this.menuObjects = [];
    const shade = this.add.rectangle(0, 0, W, H, 0x02060a, 0.84).setOrigin(0).setDepth(depth).setScrollFactor(0).setInteractive(); this.menuObjects.push(shade);
    const shell = addPanel(this, 34, 38, 1212, 620, depth + 1, 0.985, true); this.menuObjects.push(shell.bg, shell.top);
    addText(this, 70, 65, 'ARPIA  ·  모험 기록', 22, UI.text, depth + 3, { bold: true });
    addButton(this, 1194, 66, 58, 32, '×', () => this.closeMenu(), { depth: depth + 4, fill: 0x30141b, over: 0x6b2430 });
    const tabs = [['상태', 'status'], ['가방', 'bag'], ['스킬', 'skills'], ['퀘스트', 'quests'], ['일지', 'journal'], ['도감', 'codex'], ['펫', 'pet'], ['상점', 'shop'], ['설정', 'settings']];
    tabs.forEach(([label, id], index) => { const b = addButton(this, 96, 130 + index * 54, 106, 42, label, () => { this.closeMenu(); this.openMenu(id); }, { depth: depth + 4, fill: id === tab ? 0x24546f : 0x0b1a25, gold: id === tab, size: 14 }); this.menuObjects.push(b.rect, b.text); });
    const content = addPanel(this, 178, 112, 1025, 505, depth + 2, 0.94); this.menuObjects.push(content.bg, content.top);
    this.renderMenuTab(tab, depth + 5);
  }
  closeMenu() { this.menuObjects?.forEach((obj) => obj?.destroy()); this.menuObjects = []; this.menuOpen = false; this.physics.world.resume(); }
  menuText(x, y, value, size = 15, color = UI.text, depth = 710, options = {}) { const t = addText(this, x, y, value, size, color, depth, options); this.menuObjects.push(t); return t; }
  menuButton(x, y, w, h, label, callback, options = {}) { const b = addButton(this, x, y, w, h, label, callback, { ...options, depth: options.depth ?? 716 }); this.menuObjects.push(b.rect, b.text); return b; }
  renderMenuTab(tab, depth) {
    const titleMap = { status: '상태', bag: '가방', skills: '스킬트리', quests: '퀘스트', journal: '일지', codex: '원소 도감', pet: '펫', shop: '상점', settings: '설정' };
    this.menuText(210, 136, titleMap[tab], 24, '#f1d891', depth, { bold: true });
    if (tab === 'status') this.renderStatus(depth);
    if (tab === 'bag') this.renderBag(depth);
    if (tab === 'skills') this.renderSkills(depth);
    if (tab === 'quests') this.renderQuests(depth);
    if (tab === 'journal') this.renderJournal(depth);
    if (tab === 'codex') this.renderCodex(depth);
    if (tab === 'pet') this.renderPet(depth);
    if (tab === 'shop') this.renderShop(depth);
    if (tab === 'settings') this.renderSettings(depth);
  }
  renderStatus(depth) {
    const p = this.save.player; const el = ELEMENTS[this.save.element];
    this.menuText(230, 192, `Lv.${p.level}  아르피아`, 27, UI.text, depth, { bold: true });
    this.menuText(230, 238, `첫 공명 원소  ${el.name}\n${el.emotion}`, 16, el.bright, depth, { lineSpacing: 8 });
    this.menuText(230, 330, `HP             ${Math.ceil(p.hp)} / ${p.maxHp}\nMP             ${Math.ceil(p.mp)} / ${p.maxMp}\n공격력         ${p.attack + this.save.skills[this.save.element].basic * 4}\n방어력         ${p.defense}\n골드           ${p.gold.toLocaleString()}\n스킬 포인트    ${p.skillPoints}`, 17, UI.text, depth, { lineSpacing: 10 });
    this.menuText(655, 192, '감정 공명 분석', 19, '#f1d891', depth, { bold: true });
    ELEMENT_ORDER.forEach((key, i) => { const score = this.save.emotionScores[key]; const el2 = ELEMENTS[key]; this.menuText(655, 240 + i * 49, `${el2.name}`, 14, el2.bright, depth); const bg = this.add.rectangle(720, 250 + i * 49, 300, 11, 0x1a2a35, 1).setOrigin(0, 0.5).setDepth(depth).setScrollFactor(0); const bar = this.add.rectangle(720, 250 + i * 49, 45 + score * 65, 11, el2.color, 1).setOrigin(0, 0.5).setDepth(depth + 1).setScrollFactor(0); this.menuObjects.push(bg, bar); });
  }
  renderBag(depth) {
    this.menuText(230, 180, '아이템을 선택해 즉시 사용할 수 있습니다.', 14, UI.muted, depth);
    SHOP_ITEMS.forEach((item, index) => { const y = 232 + index * 68; this.menuText(242, y, `${item.icon}  ${item.name}`, 16, UI.text, depth, { bold: true }); this.menuText(520, y + 2, item.desc, 14, UI.muted, depth); this.menuText(870, y + 2, `보유 ${this.save.inventory[item.id] || 0}`, 14, '#f3d58c', depth); this.menuButton(1080, y + 7, 130, 34, '사용', () => this.useItem(item.id), { size: 13 }); });
  }
  useItem(id) {
    if ((this.save.inventory[id] || 0) <= 0) { toast(this, '보유 수량이 없습니다.', UI.red); return; }
    if (id === 'redPotion') this.save.player.hp = Math.min(this.save.player.maxHp, this.save.player.hp + 120);
    if (id === 'bluePotion') this.save.player.mp = Math.min(this.save.player.maxMp, this.save.player.mp + 70);
    if (id === 'petSnack') this.addPetExp(80);
    if (id === 'echoCrystal') this.save.player.skillPoints += 1;
    if (id === 'resetScroll') { this.save.skills = makeDefaultSkills(); this.save.player.skillPoints += 2; }
    this.save.inventory[id] -= 1; saveGame(this.save); toast(this, '아이템을 사용했습니다.', UI.green); this.closeMenu(); this.openMenu('bag');
  }
  renderSkills(depth) {
    const el = ELEMENTS[this.save.element]; const tree = this.save.skills[this.save.element];
    this.menuText(230, 180, `${el.name}의 공명`, 20, el.bright, depth, { bold: true }); this.menuText(990, 180, `스킬 포인트 ${this.save.player.skillPoints}`, 16, '#f3d58c', depth, { bold: true });
    const nodes = [
      ['basic', '기본 공명', '기본 공격 피해 증가', 5], ['core', el.skill, '핵심 스킬 피해·쿨다운 개선', 5], ['mastery', `${el.name}의 이해`, '궁극기 피해와 감정 게이지 효율 증가', 3],
    ];
    nodes.forEach(([id, name, desc, max], index) => { const x = 370 + index * 305; const y = 330; const level = tree[id]; const circle = this.add.circle(x, y, 66, level > 0 ? el.color : 0x172635, level > 0 ? 0.33 : 1).setDepth(depth).setScrollFactor(0).setStrokeStyle(3, level > 0 ? el.color : UI.line, 1); this.menuObjects.push(circle); this.menuText(x, y - 10, id === 'basic' ? '✧' : id === 'core' ? '╱' : '✹', 34, el.bright, depth + 1, { bold: true, originX: 0.5, originY: 0.5 }); this.menuText(x, y + 42, `${level}/${max}`, 13, UI.text, depth + 1, { originX: 0.5 }); this.menuText(x, 420, name, 17, UI.text, depth, { bold: true, originX: 0.5 }); this.menuText(x, 454, desc, 13, UI.muted, depth, { wrap: 240, align: 'center', originX: 0.5 }); this.menuButton(x, 535, 150, 38, level >= max ? '최대 레벨' : '레벨 업', () => this.upgradeSkill(id, max), { gold: level < max, size: 14 }); if (index < nodes.length - 1) { const line = this.add.line(0, 0, x + 70, y, x + 235, y, el.color, 0.55).setOrigin(0).setDepth(depth).setScrollFactor(0).setLineWidth(3); this.menuObjects.push(line); } });
  }
  upgradeSkill(id, max) {
    const tree = this.save.skills[this.save.element]; if (tree[id] >= max) return; if (this.save.player.skillPoints <= 0) { toast(this, '스킬 포인트가 부족합니다.', UI.red); return; }
    tree[id] += 1; this.save.player.skillPoints -= 1; saveGame(this.save); toast(this, '스킬이 강화되었습니다.', ELEMENTS[this.save.element].color); this.closeMenu(); this.openMenu('skills');
  }
  renderQuests(depth) {
    const stage = Math.min(MAIN_STAGES.length - 1, this.save.story.mainStage); this.menuText(230, 190, '메인 퀘스트', 18, '#f1d891', depth, { bold: true }); this.menuText(250, 232, `✦ ${MAIN_STAGES[stage].title}\n   ${objectiveText(this.save)}`, 17, UI.text, depth, { lineSpacing: 8 });
    this.menuText(230, 320, '서브 퀘스트', 18, '#78d9c1', depth, { bold: true });
    Object.entries(SIDE_QUESTS).forEach(([id, quest], index) => { const state = this.save.sideQuests[id]; const y = 370 + index * 100; this.menuText(250, y, `${state.completed ? '✓' : '◇'} ${quest.title}`, 17, state.completed ? '#7be79c' : UI.text, depth, { bold: true }); this.menuText(270, y + 34, `${quest.objective} ${state.progress}/${quest.target}`, 14, UI.muted, depth); if (state.completed && !state.claimed) this.menuButton(1040, y + 25, 160, 38, '보상 받기', () => this.claimQuest(id), { gold: true }); });
  }
  claimQuest(id) {
    const state = this.save.sideQuests[id]; const reward = SIDE_QUESTS[id].reward; if (!state.completed || state.claimed) return; state.claimed = true; this.save.player.gold += reward.gold || 0; this.save.player.skillPoints += reward.skillPoints || 0; if (reward.petExp) this.addPetExp(reward.petExp); saveGame(this.save); toast(this, '퀘스트 보상을 받았습니다.', UI.gold); this.closeMenu(); this.openMenu('quests');
  }
  renderJournal(depth) { this.menuText(230, 190, '지금까지의 기록', 18, '#f1d891', depth, { bold: true }); this.save.story.logs.forEach((line, i) => this.menuText(250, 235 + i * 48, `${i + 1}. ${line}`, 15, i === this.save.story.logs.length - 1 ? UI.text : UI.muted, depth)); }
  renderCodex(depth) { this.menuText(230, 180, '원소는 감정이 세계 밖으로 번역된 형태다.', 15, UI.muted, depth); ELEMENT_ORDER.forEach((key, index) => { const el = ELEMENTS[key]; const unlocked = key === this.save.element; const x = 270 + (index % 3) * 310; const y = 250 + Math.floor(index / 3) * 175; const box = this.add.rectangle(x, y, 255, 130, unlocked ? el.color : 0x111d26, unlocked ? 0.22 : 0.95).setDepth(depth).setScrollFactor(0).setStrokeStyle(2, unlocked ? el.color : UI.line, 0.9); this.menuObjects.push(box); this.menuText(x, y - 38, unlocked ? el.name : '???', 22, unlocked ? el.bright : '#596873', depth + 1, { bold: true, originX: 0.5 }); this.menuText(x, y + 8, unlocked ? el.emotion : '해당 감정을 이해하는 사건을 완료하면 해금', 13, unlocked ? UI.text : UI.muted, depth + 1, { wrap: 220, align: 'center', originX: 0.5 }); }); }
  renderPet(depth) {
    const pet = this.save.pet; this.menuText(245, 190, '모아', 28, '#d9f7ff', depth, { bold: true }); this.menuText(245, 235, `Lv.${pet.level}  ·  호기심 많은 정령\n경험치 ${pet.exp} / ${pet.nextExp}\n유대 단계 ${pet.bond}\n\n펫 효과\n• 감정 경험치 획득량 +15%\n• MP 회복량 +5%\n• 전투 중 자동 공명탄 발사`, 16, UI.text, depth, { lineSpacing: 9 });
    const moa = this.add.sprite(760, 310, 'moa').setDepth(depth).setScrollFactor(0).setScale(2.15); this.menuObjects.push(moa); this.tweens.add({ targets: moa, y: 326, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.menuButton(760, 490, 200, 42, pet.summoned ? '소환 해제' : '소환', () => { pet.summoned = !pet.summoned; saveGame(this.save); this.closeMenu(); this.openMenu('pet'); }, { gold: true });
    this.menuButton(990, 490, 200, 42, `별사탕 먹이기 (${this.save.inventory.petSnack || 0})`, () => { if ((this.save.inventory.petSnack || 0) <= 0) return toast(this, '별사탕이 없습니다.', UI.red); this.save.inventory.petSnack -= 1; this.addPetExp(80); saveGame(this.save); this.closeMenu(); this.openMenu('pet'); }, { size: 13 });
  }
  addPetExp(amount) { const pet = this.save.pet; pet.exp += amount; while (pet.exp >= pet.nextExp) { pet.exp -= pet.nextExp; pet.level += 1; pet.nextExp = Math.round(pet.nextExp * 1.24); pet.bond += pet.level % 3 === 0 ? 1 : 0; toast(this, `모아가 Lv.${pet.level}이 되었습니다!`, 0x8edcff); } }
  renderShop(depth) {
    this.menuText(230, 180, '루티의 잡화상점', 18, '#f1d891', depth, { bold: true }); this.menuText(930, 180, `보유 골드  ${this.save.player.gold.toLocaleString()}`, 16, '#f3d58c', depth, { bold: true });
    SHOP_ITEMS.forEach((item, index) => { const y = 230 + index * 68; this.menuText(245, y, `${item.icon}  ${item.name}`, 16, UI.text, depth, { bold: true }); this.menuText(505, y + 2, item.desc, 14, UI.muted, depth); this.menuText(830, y + 2, `${item.price.toLocaleString()} G`, 15, '#f3d58c', depth); this.menuButton(1070, y + 7, 150, 36, '구매', () => this.buyItem(item), { size: 13, gold: true }); });
  }
  buyItem(item) { if (this.save.player.gold < item.price) { toast(this, '골드가 부족합니다.', UI.red); return; } this.save.player.gold -= item.price; this.save.inventory[item.id] = (this.save.inventory[item.id] || 0) + 1; saveGame(this.save); toast(this, `${item.name}을 구매했습니다.`, UI.gold); this.closeMenu(); this.openMenu('shop'); }
  renderSettings(depth) {
    this.menuText(230, 190, '게임 설정', 18, '#f1d891', depth, { bold: true });
    this.menuButton(430, 260, 330, 46, `사운드  ${this.save.settings.sound ? 'ON' : 'OFF'}`, () => { this.save.settings.sound = !this.save.settings.sound; saveGame(this.save); this.closeMenu(); this.openMenu('settings'); });
    this.menuButton(430, 326, 330, 46, `카메라 흔들림  ${this.save.settings.shake ? 'ON' : 'OFF'}`, () => { this.save.settings.shake = !this.save.settings.shake; saveGame(this.save); this.closeMenu(); this.openMenu('settings'); });
    this.menuButton(430, 392, 330, 46, `모션  ${this.save.settings.reducedMotion ? '간소화' : '부드럽게'}`, () => { this.save.settings.reducedMotion = !this.save.settings.reducedMotion; saveGame(this.save); this.closeMenu(); this.openMenu('settings'); });
    this.menuButton(930, 526, 260, 42, '저장 데이터 초기화', () => { clearSave(); this.scene.start('Title'); }, { fill: 0x3c1720, over: 0x702533 });
  }
}

class EndScene extends Phaser.Scene {
  constructor() { super('End'); }
  create() {
    const save = loadSave(); const el = ELEMENTS[save.element];
    const g = this.add.graphics(); g.fillGradientStyle(0x07111c, 0x07111c, 0x17364a, 0x17364a, 1).fillRect(0, 0, W, H); g.fillStyle(el.color, 0.12).fillCircle(640, 340, 380);
    addText(this, 640, 120, 'CHAPTER 1 COMPLETE', 18, '#91bfd2', 10, { bold: true, originX: 0.5 });
    addText(this, 640, 180, '새로운 시작', 58, '#f4fbff', 10, { title: true, bold: true, originX: 0.5 });
    addText(this, 640, 274, `${el.name}의 감정을 처음 이해했다`, 24, el.bright, 10, { bold: true, originX: 0.5 });
    addText(this, 640, 326, `${el.emotion}\n\n감정을 없애는 것이 아니라 방향을 정하는 것이 첫 번째 수련이다.\n모아와 함께 루메르의 여섯 원소를 찾아가는 여행이 시작된다.`, 18, UI.text, 10, { align: 'center', lineSpacing: 10, originX: 0.5, wrap: 780 });
    addPanel(this, 420, 470, 440, 90, 9, 0.92, true); addText(this, 640, 490, `보상  ·  1,500 골드  ·  스킬 포인트 2\n현재 레벨 ${save.player.level}  ·  모아 Lv.${save.pet.level}`, 16, '#f0d492', 12, { align: 'center', originX: 0.5, lineSpacing: 8 });
    addButton(this, 520, 620, 210, 46, '타이틀로', () => this.scene.start('Title'), { gold: true });
    addButton(this, 760, 620, 210, 46, '마을에서 계속', () => { save.story.area = 'village'; saveGame(save); this.scene.start('World', { area: 'village' }); });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: '#07111b',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  scene: [TitleScene, PrologueScene, WorldScene, EndScene],
});
