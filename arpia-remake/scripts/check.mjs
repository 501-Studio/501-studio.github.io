import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = ['src/main.js', 'src/style.css', 'index.html', 'package.json', 'vite.config.js'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}
execFileSync(process.execPath, ['--check', 'src/main.js'], { stdio: 'inherit' });
const source = fs.readFileSync('src/main.js', 'utf8');
const featureMarkers = [
  'SIDE_QUESTS', 'SHOP_ITEMS', 'renderSkills', 'renderPet', 'renderShop',
  'smooth', 'bossDefeated', 'localStorage', '모아의 부탁', '수상한 흔적',
];
for (const marker of featureMarkers) {
  if (!source.includes(marker)) throw new Error(`Feature marker missing: ${marker}`);
}
console.log('Arpia v0.4 static feature check passed.');
