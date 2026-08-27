import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const requiredScenes = [
  'BootScene', 'TitleScene', 'PrologueScene', 'ForestScene', 'TutorialBattleScene',
  'VillageScene', 'QuestBattleScene', 'BossBattleScene', 'EndingScene',
];

for (const scene of requiredScenes) {
  if (!main.includes(`class ${scene}`)) throw new Error(`Missing scene: ${scene}`);
}

for (const token of ['localStorage', 'emotionScores', 'dominantElement', '뒤엉킨 잔향', '모아']) {
  if (!main.includes(token)) throw new Error(`Missing game token: ${token}`);
}

if (!html.includes('id="game"')) throw new Error('Missing Phaser mount element');
if (!html.includes('viewport-fit=cover')) throw new Error('Missing mobile viewport support');

console.log('Arpia structural checks passed.');
