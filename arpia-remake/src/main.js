import Phaser from 'phaser';
import './style.css';

const WIDTH = 1280;
const HEIGHT = 720;

const ELEMENTS = {
  fire: {
    name: '불',
    color: 0xff655d,
    positive: '열정 · 용기 · 사랑의 열망',
    negative: '분노 · 증오 · 조급함',
    skill: '심화 — 타오르는 마음',
    description: '가까운 적에게 강한 범위 피해를 준다.',
  },
  water: {
    name: '물',
    color: 0x58b9ff,
    positive: '평온 · 자애 · 공감',
    negative: '슬픔 · 무기력 · 자책',
    skill: '심화 — 흘려보내기',
    description: '체력을 회복하고 주변 적을 밀어낸다.',
  },
  shadow: {
    name: '어둠',
    color: 0x9a7be8,
    positive: '성찰 · 신중함 · 안식',
    negative: '공포 · 고독 · 절망',
    skill: '심화 — 내면 잠행',
    description: '전방으로 순간이동하며 짧은 무적을 얻는다.',
  },
  lightning: {
    name: '번개',
    color: 0xffdc5d,
    positive: '영감 · 직관 · 각성',
    negative: '불안 · 충동 · 경악',
    skill: '심화 — 찰나의 깨달음',
    description: '가까운 적 셋을 연쇄 타격한다.',
  },
  wind: {
    name: '바람',
    color: 0x70e4bd,
    positive: '해방감 · 호기심 · 경쾌함',
    negative: '허무 · 냉담',
    skill: '심화 — 경계 너머',
    description: '여덟 방향으로 바람 칼날을 방출한다.',
  },
  light: {
    name: '빛',
    color: 0xfff3b0,
    positive: '희망 · 명료함 · 감사',
    negative: '오만 · 강박 · 완벽주의',
    skill: '심화 — 길을 밝히는 빛',
    description: '모든 적을 약하게 타격하고 보호막을 얻는다.',
  },
};

class PrologueScene extends Phaser.Scene {
  constructor() {
    super('Prologue');
    this.index = 0;
    this.transitioning = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#090b18');
    this.drawOfficeBackground();

    this.chapter = this.add.text(72, 62, 'CHAPTER 1', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#9ea8c8',
      letterSpacing: 4,
    });

    this.title = this.add.text(72, 104, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#f4f6ff',
    });

    this.body = this.add.text(72, 188, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      color: '#d7daea',
      lineSpacing: 12,
      wordWrap: { width: 790 },
    });

    this.prompt = this.add.text(72, 632, 'Space 또는 화면 클릭', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '17px',
      color: '#858eac',
    });

    this.story = [
      {
        title: '평범한 아침',
        body: '07:20. 알람이 울린다.\n\n“하… 또 출근이네.”\n\n붐비는 지하철, 출근 전부터 쌓이는 회사 메신저.\n오늘도 특별할 것 없는 하루가 시작된다.',
      },
      {
        title: '끝까지 처리하는 사람',
        body: '후임이 놓친 일도, 갑자기 떨어진 수정도 결국 주인공에게 모인다.\n\n“네. 알겠습니다.”\n\n거절해도 피곤한 건 결국 자신이라는 걸 알고 있다.',
      },
      {
        title: '금요일',
        body: '“오늘만 버티면 주말이다.”\n\n작은 희망은 회사에 도착하자마자 무너진다.\n방향 변경, 재수정, 사라진 후임. 그리고 오후 5시 57분.',
      },
      {
        title: '정전',
        body: '화면이 꺼진다.\n\n저장을 안 했다.\n\n상사는 말한다. “나 오늘 약속 있어서 먼저 간다. 문서는 오늘 안에 보내줘.”',
      },
      {
        title: '23:50',
        body: '문서를 다시 완성하고 옥상으로 올라간다.\n상사는 읽고도 답이 없다.\nSNS 속 후임은 이미 퇴사했고, 친구들과 웃고 있다.',
      },
      {
        title: '끊어진 것',
        body: '분노. 억울함. 허무.\n깨진 휴대폰. 남은 할부금.\n\n“이 회사 4년째… 정말 그만두고 싶다.”\n“근데 그만둘 수 없다.”',
      },
      {
        title: '세계가 무너진다',
        body: '주인공은 차가운 옥상 벽에 머리를 기대듯 부딪힌다.\n\n순간, 소리가 멀어진다.\n빛이 접히고 어둠이 갈라진다.\n\n그리고 낯선 목소리가 들린다.\n\n“네가 외면해 온 감정을 선택해.”',
      },
    ];

    this.renderPage();
    this.input.keyboard.on('keydown-SPACE', () => this.advance());
    this.input.on('pointerdown', () => this.advance());
  }

  drawOfficeBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x111527, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x171d33, 1);
    g.fillRect(910, 0, 370, HEIGHT);
    g.fillStyle(0x2a3150, 0.75);
    g.fillRect(970, 98, 236, 390);
    g.lineStyle(2, 0x505a7d, 0.45);
    for (let x = 995; x < 1195; x += 48) g.lineBetween(x, 120, x, 462);
    for (let y = 142; y < 462; y += 56) g.lineBetween(982, y, 1194, y);
    g.fillStyle(0x0b0e18, 0.72);
    g.fillRoundedRect(885, 510, 330, 130, 14);
    g.fillStyle(0x343c62, 1);
    g.fillRoundedRect(920, 535, 260, 16, 8);
    g.fillStyle(0x252b48, 1);
    g.fillRoundedRect(920, 569, 210, 14, 7);
    g.fillRoundedRect(920, 600, 245, 14, 7);
  }

  renderPage() {
    const page = this.story[this.index];
    this.title.setText(page.title);
    this.body.setText(page.body);
    this.chapter.setText(`CHAPTER 1  ·  ${String(this.index + 1).padStart(2, '0')} / ${String(this.story.length).padStart(2, '0')}`);
  }

  advance() {
    if (this.transitioning) return;
    if (this.index < this.story.length - 1) {
      this.index += 1;
      this.tweens.add({
        targets: [this.title, this.body],
        alpha: 0,
        duration: 100,
        yoyo: true,
        onYoyo: () => this.renderPage(),
      });
      return;
    }

    this.transitioning = true;
    this.cameras.main.fadeOut(650, 8, 8, 18);
    this.time.delayedCall(680, () => this.scene.start('Awakening'));
  }
}

class AwakeningScene extends Phaser.Scene {
  constructor() {
    super('Awakening');
  }

  create() {
    this.cameras.main.setBackgroundColor('#080915');
    const g = this.add.graphics();
    g.fillStyle(0x111429, 1);
    g.fillCircle(640, 365, 430);
    g.lineStyle(2, 0x394267, 0.35);
    for (let r = 140; r <= 420; r += 70) g.strokeCircle(640, 365, r);

    this.add.text(640, 54, '첫 번째 감정을 선택하세요', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#f5f6ff',
    }).setOrigin(0.5);

    this.add.text(640, 102, '원소는 감정이 세계 밖으로 번역된 형태다.  숫자 1–6 또는 카드를 클릭.', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#aeb5ce',
    }).setOrigin(0.5);

    const entries = Object.entries(ELEMENTS);
    entries.forEach(([key, element], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 290 + col * 350;
      const y = 260 + row * 245;
      this.createElementCard(x, y, key, element, i + 1);
    });

    this.add.text(640, 664, '감정을 지우는 것이 아니라 이해할수록 마법은 더 깊어진다.', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#7983a4',
    }).setOrigin(0.5);

    entries.forEach(([key], i) => {
      this.input.keyboard.on(`keydown-${i + 1}`, () => this.choose(key));
    });
  }

  createElementCard(x, y, key, element, index) {
    const card = this.add.rectangle(x, y, 306, 194, 0x161a30, 0.94)
      .setStrokeStyle(2, element.color, 0.7)
      .setInteractive({ useHandCursor: true });

    const orb = this.add.circle(x - 112, y - 58, 14, element.color, 1);
    const number = this.add.text(x + 118, y - 73, String(index), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#717b9b',
    }).setOrigin(1, 0);

    const name = this.add.text(x - 84, y - 76, element.name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '27px',
      fontStyle: 'bold',
      color: '#f4f5ff',
    });

    const positive = this.add.text(x - 122, y - 26, element.positive, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#c8ccda',
      wordWrap: { width: 245 },
    });

    const negative = this.add.text(x - 122, y + 18, element.negative, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#8e97b5',
      wordWrap: { width: 245 },
    });

    const skill = this.add.text(x - 122, y + 62, element.skill, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(element.color).rgba,
    });

    const cardParts = [card, orb, number, name, positive, negative, skill];
    card.on('pointerover', () => {
      card.setFillStyle(0x222843, 1);
      this.tweens.add({ targets: cardParts, scaleX: 1.025, scaleY: 1.025, duration: 110 });
    });
    card.on('pointerout', () => {
      card.setFillStyle(0x161a30, 0.94);
      this.tweens.add({ targets: cardParts, scaleX: 1, scaleY: 1, duration: 110 });
    });
    card.on('pointerdown', () => this.choose(key));
  }

  choose(key) {
    if (!ELEMENTS[key]) return;
    this.registry.set('element', key);
    this.cameras.main.flash(220, 255, 255, 255);
    this.time.delayedCall(180, () => this.scene.start('Battle'));
  }
}

class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create() {
    this.elementKey = this.registry.get('element') || 'fire';
    this.element = ELEMENTS[this.elementKey];
    this.maxHp = 100;
    this.hp = 100;
    this.emotion = 50;
    this.shield = 0;
    this.score = 0;
    this.lastDir = new Phaser.Math.Vector2(1, 0);
    this.invulnerableUntil = 0;
    this.lastSkillAt = -9999;
    this.lastDashAt = -9999;
    this.skillCooldown = 4200;
    this.isCleared = false;

    this.physics.world.setBounds(34, 70, WIDTH - 68, HEIGHT - 190);
    this.drawArena();
    this.makeTextures();

    this.player = this.physics.add.sprite(640, 360, 'arpia-player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setSize(38, 44).setOffset(13, 14);

    this.projectiles = this.physics.add.group({ maxSize: 40 });
    this.enemies = this.physics.add.group({ maxSize: 12 });

    this.physics.add.overlap(this.projectiles, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, undefined, this);

    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D',
      attack: 'SPACE', attackAlt: 'J', skill: 'Q', dash: 'SHIFT',
    });

    this.createHud();
    this.spawnEnemy();
    this.spawner = this.time.addEvent({
      delay: 1150,
      loop: true,
      callback: () => {
        if (!this.isCleared && this.enemies.countActive(true) < 6) this.spawnEnemy();
      },
    });
  }

  drawArena() {
    this.cameras.main.setBackgroundColor('#0a1114');
    const g = this.add.graphics();
    g.fillStyle(0x112529, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x173438, 1);
    g.fillEllipse(640, 352, 1150, 510);
    g.fillStyle(0x0b191d, 1);
    g.fillEllipse(130, 188, 430, 230);
    g.fillEllipse(1130, 176, 470, 250);
    g.fillStyle(0x24474a, 0.7);
    for (let i = 0; i < 16; i += 1) {
      const x = 60 + ((i * 83) % 1170);
      const y = 115 + ((i * 127) % 430);
      g.fillEllipse(x, y, 46 + (i % 3) * 14, 16 + (i % 2) * 10);
    }
    g.lineStyle(3, 0x3a6061, 0.32);
    g.beginPath();
    g.moveTo(160, 470);
    g.lineTo(390, 380);
    g.lineTo(560, 438);
    g.lineTo(820, 308);
    g.lineTo(1110, 390);
    g.strokePath();
  }

  makeTextures() {
    if (this.textures.exists('arpia-player')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0x20243b, 1);
    g.fillEllipse(32, 58, 52, 14);
    g.fillStyle(this.element.color, 1);
    g.fillRoundedRect(13, 20, 38, 34, 13);
    g.fillStyle(0xf4d2be, 1);
    g.fillCircle(32, 19, 15);
    g.fillStyle(0x342d42, 1);
    g.fillCircle(26, 18, 2.5);
    g.fillCircle(38, 18, 2.5);
    g.fillStyle(this.element.color, 0.9);
    g.fillTriangle(14, 15, 22, 2, 25, 16);
    g.fillTriangle(50, 15, 42, 2, 39, 16);
    g.generateTexture('arpia-player', 64, 64);
    g.clear();

    g.fillStyle(0xcfd8b5, 1);
    g.fillEllipse(30, 35, 52, 34);
    g.fillStyle(0x53694f, 1);
    g.fillEllipse(28, 27, 46, 28);
    g.fillStyle(0x0a1114, 1);
    for (let x = 18; x <= 42; x += 8) g.fillCircle(x, 38, 2.3);
    g.fillStyle(0x9db07d, 1);
    g.fillCircle(14, 50, 5);
    g.fillCircle(28, 52, 5);
    g.fillCircle(44, 49, 5);
    g.generateTexture('arpia-enemy', 60, 60);
    g.clear();

    g.fillStyle(this.element.color, 1);
    g.fillCircle(10, 10, 8);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(8, 8, 3);
    g.generateTexture('arpia-projectile', 20, 20);
    g.destroy();
  }

  createHud() {
    const panel = this.add.rectangle(0, 596, WIDTH, 124, 0x0a0d1b, 0.95).setOrigin(0).setDepth(40);
    panel.setStrokeStyle(2, 0x313b60, 0.8);

    this.add.circle(66, 658, 39, this.element.color, 0.22).setStrokeStyle(3, this.element.color, 0.8).setDepth(41);
    this.add.text(66, 657, this.element.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(42);

    this.hpText = this.add.text(126, 617, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#f3f4ff',
    }).setDepth(42);
    this.add.rectangle(126, 648, 252, 13, 0x2a2f45, 1).setOrigin(0, 0.5).setDepth(41);
    this.hpBar = this.add.rectangle(126, 648, 252, 13, 0xe96f74, 1).setOrigin(0, 0.5).setDepth(42);
    this.add.rectangle(126, 676, 252, 10, 0x2a2f45, 1).setOrigin(0, 0.5).setDepth(41);
    this.emotionBar = this.add.rectangle(126, 676, 126, 10, this.element.color, 1).setOrigin(0, 0.5).setDepth(42);

    this.skillText = this.add.text(420, 617, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#d9dcef', lineSpacing: 7,
    }).setDepth(42);

    this.questText = this.add.text(34, 28, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#eef1ff',
      backgroundColor: '#111629cc', padding: { x: 14, y: 10 },
    }).setDepth(50);

    this.hintText = this.add.text(1245, 634, 'WASD 이동\nSpace/J 공격\nQ 원소 스킬\nShift 대시', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#9da6c3', align: 'right', lineSpacing: 4,
    }).setOrigin(1, 0).setDepth(42);

    this.updateHud();
  }

  update(time) {
    if (this.isCleared) return;

    const velocity = new Phaser.Math.Vector2(0, 0);
    if (this.keys.left.isDown) velocity.x -= 1;
    if (this.keys.right.isDown) velocity.x += 1;
    if (this.keys.up.isDown) velocity.y -= 1;
    if (this.keys.down.isDown) velocity.y += 1;

    if (velocity.lengthSq() > 0) {
      velocity.normalize();
      this.lastDir.copy(velocity);
    }
    this.player.setVelocity(velocity.x * 220, velocity.y * 220);

    if (Phaser.Input.Keyboard.JustDown(this.keys.attack) || Phaser.Input.Keyboard.JustDown(this.keys.attackAlt)) {
      this.basicAttack();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.skill)) this.castElementSkill(time);
    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.dash(time);

    this.enemies.children.iterate((enemy) => {
      if (!enemy?.active) return;
      this.physics.moveToObject(enemy, this.player, 72 + Math.min(46, this.score * 4));
    });

    this.updateHud(time);
  }

  basicAttack() {
    const projectile = this.projectiles.get(this.player.x, this.player.y, 'arpia-projectile');
    if (!projectile) return;
    projectile.setActive(true).setVisible(true).setDepth(12);
    projectile.damage = 14;
    projectile.body.enable = true;
    projectile.setVelocity(this.lastDir.x * 530, this.lastDir.y * 530);
    this.time.delayedCall(900, () => {
      if (projectile.active) {
        projectile.setActive(false).setVisible(false);
        projectile.body.enable = false;
      }
    });
  }

  castElementSkill(time) {
    if (time - this.lastSkillAt < this.skillCooldown || this.emotion < 30) return;
    this.lastSkillAt = time;
    this.emotion = Math.max(0, this.emotion - 30);

    if (this.elementKey === 'fire') this.skillFire();
    if (this.elementKey === 'water') this.skillWater();
    if (this.elementKey === 'shadow') this.skillShadow(time);
    if (this.elementKey === 'lightning') this.skillLightning();
    if (this.elementKey === 'wind') this.skillWind();
    if (this.elementKey === 'light') this.skillLight();
  }

  skillFire() {
    const ring = this.add.circle(this.player.x, this.player.y, 18, this.element.color, 0.35).setDepth(9);
    this.tweens.add({ targets: ring, radius: 165, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    this.enemies.children.iterate((enemy) => {
      if (enemy?.active && Phaser.Math.Distance.BetweenPoints(this.player, enemy) < 175) this.damageEnemy(enemy, 42);
    });
  }

  skillWater() {
    this.hp = Math.min(this.maxHp, this.hp + 24);
    const ring = this.add.circle(this.player.x, this.player.y, 20, this.element.color, 0.25).setDepth(9);
    this.tweens.add({ targets: ring, radius: 190, alpha: 0, duration: 460, onComplete: () => ring.destroy() });
    this.enemies.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const distance = Phaser.Math.Distance.BetweenPoints(this.player, enemy);
      if (distance < 190) {
        this.damageEnemy(enemy, 18);
        const push = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y).normalize().scale(240);
        enemy.setVelocity(push.x, push.y);
      }
    });
  }

  skillShadow(time) {
    this.invulnerableUntil = time + 700;
    const oldX = this.player.x;
    const oldY = this.player.y;
    const newX = Phaser.Math.Clamp(oldX + this.lastDir.x * 150, 48, WIDTH - 48);
    const newY = Phaser.Math.Clamp(oldY + this.lastDir.y * 150, 82, HEIGHT - 142);
    const trail = this.add.line(0, 0, oldX, oldY, newX, newY, this.element.color, 0.75).setOrigin(0).setLineWidth(16).setDepth(8);
    this.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
    this.player.setPosition(newX, newY);
    this.enemies.children.iterate((enemy) => {
      if (enemy?.active && Phaser.Math.Distance.Between(newX, newY, enemy.x, enemy.y) < 115) this.damageEnemy(enemy, 30);
    });
  }

  skillLightning() {
    const targets = this.enemies.getChildren()
      .filter((enemy) => enemy.active)
      .sort((a, b) => Phaser.Math.Distance.BetweenPoints(this.player, a) - Phaser.Math.Distance.BetweenPoints(this.player, b))
      .slice(0, 3);

    let from = this.player;
    targets.forEach((enemy, index) => {
      const bolt = this.add.line(0, 0, from.x, from.y, enemy.x, enemy.y, this.element.color, 0.9)
        .setOrigin(0).setLineWidth(4).setDepth(14);
      this.tweens.add({ targets: bolt, alpha: 0, duration: 170 + index * 45, onComplete: () => bolt.destroy() });
      this.damageEnemy(enemy, 28);
      from = enemy;
    });
  }

  skillWind() {
    for (let i = 0; i < 8; i += 1) {
      const angle = Phaser.Math.DegToRad(i * 45);
      const projectile = this.projectiles.get(this.player.x, this.player.y, 'arpia-projectile');
      if (!projectile) continue;
      projectile.setActive(true).setVisible(true).setDepth(12);
      projectile.damage = 19;
      projectile.body.enable = true;
      projectile.setVelocity(Math.cos(angle) * 430, Math.sin(angle) * 430);
      this.time.delayedCall(850, () => {
        if (projectile.active) {
          projectile.setActive(false).setVisible(false);
          projectile.body.enable = false;
        }
      });
    }
  }

  skillLight() {
    this.shield = Math.min(40, this.shield + 24);
    const flash = this.add.rectangle(0, 0, WIDTH, HEIGHT - 124, this.element.color, 0.12).setOrigin(0).setDepth(18);
    this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    this.enemies.children.iterate((enemy) => {
      if (enemy?.active) this.damageEnemy(enemy, 17);
    });
  }

  dash(time) {
    if (time - this.lastDashAt < 1200) return;
    this.lastDashAt = time;
    this.invulnerableUntil = time + 280;
    this.player.setPosition(
      Phaser.Math.Clamp(this.player.x + this.lastDir.x * 90, 48, WIDTH - 48),
      Phaser.Math.Clamp(this.player.y + this.lastDir.y * 90, 82, HEIGHT - 142),
    );
  }

  spawnEnemy() {
    const side = Phaser.Math.Between(0, 3);
    let x = 60;
    let y = 100;
    if (side === 0) { x = Phaser.Math.Between(70, WIDTH - 70); y = 92; }
    if (side === 1) { x = WIDTH - 70; y = Phaser.Math.Between(100, HEIGHT - 160); }
    if (side === 2) { x = Phaser.Math.Between(70, WIDTH - 70); y = HEIGHT - 155; }
    if (side === 3) { x = 70; y = Phaser.Math.Between(100, HEIGHT - 160); }

    const enemy = this.enemies.get(x, y, 'arpia-enemy');
    if (!enemy) return;
    enemy.setActive(true).setVisible(true).setDepth(8);
    enemy.body.enable = true;
    enemy.hp = 34 + Math.min(28, this.score * 3);
    enemy.setScale(0.92 + Math.random() * 0.16);
  }

  hitEnemy(projectile, enemy) {
    if (!projectile.active || !enemy.active) return;
    this.damageEnemy(enemy, projectile.damage || 12);
    projectile.setActive(false).setVisible(false);
    projectile.body.enable = false;
  }

  damageEnemy(enemy, amount) {
    if (!enemy?.active) return;
    enemy.hp -= amount;
    this.emotion = Math.min(100, this.emotion + 8);
    enemy.setTint(0xffffff);
    this.time.delayedCall(80, () => enemy?.active && enemy.clearTint());
    if (enemy.hp > 0) return;

    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    this.score += 1;
    this.emotion = Math.min(100, this.emotion + 14);
    if (this.score >= 7) this.clearBattle();
  }

  hitPlayer(_player, enemy) {
    const now = this.time.now;
    if (now < this.invulnerableUntil || !enemy.active || this.isCleared) return;
    this.invulnerableUntil = now + 650;
    let damage = 14;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, damage);
      this.shield -= absorbed;
      damage -= absorbed;
    }
    this.hp = Math.max(0, this.hp - damage);
    this.cameras.main.shake(110, 0.007);
    if (this.hp <= 0) this.gameOver();
  }

  gameOver() {
    this.physics.pause();
    this.isCleared = true;
    this.spawner?.remove(false);
    const veil = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x070813, 0.78).setOrigin(0).setDepth(80);
    const title = this.add.text(640, 310, '감정에 휩쓸렸다', {
      fontFamily: 'system-ui, sans-serif', fontSize: '42px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(81);
    const body = this.add.text(640, 372, 'Enter — 다시 감정을 마주한다', {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: '#adb5cf',
    }).setOrigin(0.5).setDepth(81);
    this.input.keyboard.once('keydown-ENTER', () => this.scene.restart());
  }

  clearBattle() {
    this.isCleared = true;
    this.spawner?.remove(false);
    this.enemies.children.iterate((enemy) => enemy?.active && enemy.setVelocity(0, 0));
    const veil = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x070813, 0.7).setOrigin(0).setDepth(80);
    const title = this.add.text(640, 276, `${this.element.name}의 감정을 처음 이해했다`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(81);
    const body = this.add.text(640, 348, `${this.element.positive}\n그리고 ${this.element.negative}\n\n둘 중 하나를 없애는 것이 아니라, 방향을 정하는 것이 첫 번째 수련이다.`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#c6cad9', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setDepth(81);
    const prompt = this.add.text(640, 468, 'Enter — 다시 전투  ·  Esc — 원소 선택', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#8e98b7',
    }).setOrigin(0.5).setDepth(81);
    this.input.keyboard.once('keydown-ENTER', () => this.scene.restart());
    this.input.keyboard.once('keydown-ESC', () => this.scene.start('Awakening'));
  }

  updateHud(time = this.time.now) {
    if (!this.hpText) return;
    this.hpText.setText(`HP ${Math.ceil(this.hp)} / ${this.maxHp}${this.shield > 0 ? `   보호막 ${Math.ceil(this.shield)}` : ''}`);
    this.hpBar.displayWidth = 252 * (this.hp / this.maxHp);
    this.emotionBar.displayWidth = 252 * (this.emotion / 100);
    const cd = Math.max(0, this.skillCooldown - (time - this.lastSkillAt));
    const skillState = cd <= 0 ? 'READY' : `${(cd / 1000).toFixed(1)}s`;
    this.skillText.setText(`${this.element.skill}  [Q]  ${skillState}\n${this.element.description}\n감정 게이지 ${Math.floor(this.emotion)} / 100  ·  스킬 소모 30`);
    this.questText.setText(`균열 동굴  ·  첫 원소 수련\n감정의 잔재 정화 ${this.score} / 7`);
  }
}

const config = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: 'game',
  backgroundColor: '#090b18',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WIDTH,
    height: HEIGHT,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: [PrologueScene, AwakeningScene, BattleScene],
};

new Phaser.Game(config);
