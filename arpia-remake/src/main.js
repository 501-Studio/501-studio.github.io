import Phaser from 'phaser';
import './style.css';
import { BootScene, TitleScene, PrologueScene, MistForestScene } from './scenes-a.js';
import { VillageScene, ForestQuestScene, BossScene, EndScene } from './scenes-b.js';
new Phaser.Game({ type: Phaser.AUTO, width: 1280, height: 720, parent: 'game', backgroundColor: '#050b12', physics: { default: 'arcade', arcade: { debug: false } }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 }, render: { antialias: true, pixelArt: false, roundPixels: false }, scene: [BootScene, TitleScene, PrologueScene, MistForestScene, VillageScene, ForestQuestScene, BossScene, EndScene] });
