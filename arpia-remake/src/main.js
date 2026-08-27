import Phaser from 'phaser';
import './style.css';

const W = 1280, H = 720;
const ELEMENTS = {
  fire: { name:'불', color:0xff655d, pos:'열정 · 용기', neg:'분노 · 조급함', skill:'타오르는 마음' },
  water: { name:'물', color:0x58b9ff, pos:'평온 · 공감', neg:'슬픔 · 무기력', skill:'흘려보내기' },
  shadow: { name:'어둠', color:0x9a7be8, pos:'성찰 · 안식', neg:'공포 · 고독', skill:'내면 잠행' },
  lightning: { name:'번개', color:0xffdc5d, pos:'영감 · 각성', neg:'불안 · 충동', skill:'찰나의 깨달음' },
  wind: { name:'바람', color:0x70e4bd, pos:'해방 · 호기심', neg:'허무 · 냉담', skill:'경계 너머' },
  light: { name:'빛', color:0xfff3b0, pos:'희망 · 명료함', neg:'오만 · 완벽주의', skill:'길을 밝히는 빛' },
};
const STORY = [
  { title:'평범한 아침', body:'07:20. 알람이 울린다.\n\n“하… 또 출근이네.”\n\n붐비는 지하철. 출근 전부터 회사 메신저가 울린다.' },
  { title:'출근도 안 했는데', body:'팀장: “어제 파일 수정된 거 확인했어?”\n팀장: “오늘 오전에 보고 가능?”', choices:[
    ['“아침부터 왜 이래.” 속에서 열이 오른다.','fire'],
    ['답장보다 먼저 상황을 계산한다.','lightning'],
    ['완벽하게 끝내놓으면 말은 안 나오겠지.','light'],
  ]},
  { title:'끝까지 처리하는 사람', body:'후임이 놓친 일도 결국 내 자리로 돌아온다.\n\n“네. 알겠습니다.”', choices:[
    ['후임도 사정이 있겠지. 그냥 내가 마무리한다.','water'],
    ['말을 삼키고 조용히 내 일에 집중한다.','shadow'],
    ['이런 곳에서 그냥 멀리 떠나고 싶다.','wind'],
  ]},
  { title:'금요일 17:57', body:'거의 끝났다. 저장만 하면 된다.\n\n그 순간 회사 전체가 정전된다.\n저장을 안 했다.', choices:[
    ['주먹을 꽉 쥔다. 화가 머리끝까지 치민다.','fire'],
    ['허탈해서 아무 말도 나오지 않는다.','water'],
    ['처음부터 다시. 실수 없이 다시 만들자.','light'],
  ]},
  { title:'23:50 · 옥상', body:'상사는 읽고도 답이 없다.\nSNS 속 후임은 이미 퇴사했고 친구들과 웃고 있다.\n\n“정말 그만두고 싶다. 근데 그만둘 수 없다.”', choices:[
    ['나는 도대체 무엇을 위해 버텨온 걸까.','shadow'],
    ['딱 한 번만이라도 아무 데로나 사라지고 싶다.','wind'],
    ['갑자기 모든 감각이 날카로워진다.','lightning'],
  ]},
  { title:'세계가 무너진다', body:'차가운 벽에 머리를 기대는 순간, 소리가 멀어진다.\n\n빛이 접히고 어둠이 갈라진다.\n\n“선택한 게 아니야. 네 안에 이미 있던 거야.”' },
];

const blankScores = () => Object.fromEntries(Object.keys(ELEMENTS).map(k => [k,0]));
function dominant(scores, history){
  const max = Math.max(...Object.values(scores));
  const tied = Object.keys(scores).filter(k => scores[k] === max);
  for(let i=history.length-1;i>=0;i--) if(tied.includes(history[i])) return history[i];
  return tied[0] || 'fire';
}

class Prologue extends Phaser.Scene {
  constructor(){ super('Prologue'); this.i=0; this.buttons=[]; this.locked=false; }
  create(){
    this.registry.set('emotionScores',blankScores()); this.registry.set('emotionHistory',[]);
    this.cameras.main.setBackgroundColor('#090b18'); this.office();
    this.meta=this.add.text(70,54,'',{fontFamily:'system-ui',fontSize:17,color:'#9ea8c8'});
    this.title=this.add.text(70,96,'',{fontFamily:'system-ui',fontSize:42,fontStyle:'bold',color:'#f5f6ff'});
    this.body=this.add.text(70,178,'',{fontFamily:'system-ui',fontSize:25,color:'#d7daea',lineSpacing:12,wordWrap:{width:820}});
    this.hint=this.add.text(70,650,'',{fontFamily:'system-ui',fontSize:16,color:'#858eac'});
    this.input.keyboard.on('keydown-SPACE',()=>this.next());
    ['ONE','TWO','THREE'].forEach((k,n)=>this.input.keyboard.on(`keydown-${k}`,()=>this.choose(n)));
    this.input.on('pointerdown',(_p,targets)=>{ if(!targets?.length) this.next(); });
    this.render();
  }
  office(){
    const g=this.add.graphics(); g.fillStyle(0x111527).fillRect(0,0,W,H); g.fillStyle(0x171d33).fillRect(930,0,350,H);
    g.fillStyle(0x29314d).fillRect(985,95,228,390); g.fillStyle(0x0b0e18,.8).fillRoundedRect(900,520,320,120,14);
    for(let y=145;y<470;y+=55){ g.lineStyle(2,0x4d5877,.35).lineBetween(995,y,1200,y); }
  }
  render(){
    this.buttons.forEach(o=>o.destroy()); this.buttons=[]; const p=STORY[this.i];
    this.meta.setText(`CHAPTER 1  ·  ${this.i+1} / ${STORY.length}`); this.title.setText(p.title); this.body.setText(p.body);
    if(!p.choices){ this.hint.setText('Space 또는 빈 화면 클릭'); return; }
    this.hint.setText('지금의 마음에 가장 가까운 반응을 고르세요.');
    p.choices.forEach((c,n)=>{ const y=405+n*72;
      const box=this.add.rectangle(70,y,820,54,0x171c32,.96).setOrigin(0,.5).setStrokeStyle(1,0x3b456d).setInteractive({useHandCursor:true});
      const text=this.add.text(94,y,`${n+1}. ${c[0]}`,{fontFamily:'system-ui',fontSize:18,color:'#e5e8f4'}).setOrigin(0,.5);
      box.on('pointerdown',()=>this.choose(n)); box.on('pointerover',()=>box.setFillStyle(0x252c49)); box.on('pointerout',()=>box.setFillStyle(0x171c32));
      this.buttons.push(box,text);
    });
  }
  choose(n){
    if(this.locked) return; const p=STORY[this.i], c=p.choices?.[n]; if(!c) return; this.locked=true;
    const scores=this.registry.get('emotionScores'), hist=this.registry.get('emotionHistory'); scores[c[1]]++; hist.push(c[1]);
    this.registry.set('emotionScores',scores); this.registry.set('emotionHistory',hist);
    this.time.delayedCall(120,()=>{ this.locked=false; this.i++; this.render(); });
  }
  next(){
    if(this.locked || STORY[this.i].choices) return;
    if(this.i<STORY.length-1){ this.i++; this.render(); return; }
    this.locked=true; this.cameras.main.fadeOut(600,8,8,18); this.time.delayedCall(620,()=>this.scene.start('Awakening'));
  }
}

class Awakening extends Phaser.Scene {
  constructor(){ super('Awakening'); this.i=0; }
  create(){
    const scores=this.registry.get('emotionScores')||blankScores(), hist=this.registry.get('emotionHistory')||[];
    this.key=dominant(scores,hist); this.el=ELEMENTS[this.key]; this.registry.set('element',this.key); this.forest();
    this.add.text(60,46,'안개숲',{fontFamily:'system-ui',fontSize:18,fontStyle:'bold',color:'#a8bcb8'});
    const spirit=this.add.circle(875,250,18,0xe8fff8,.9).setStrokeStyle(3,this.el.color,.9); this.tweens.add({targets:spirit,y:270,duration:1000,yoyo:true,repeat:-1});
    this.title=this.add.text(70,425,'',{fontFamily:'system-ui',fontSize:36,fontStyle:'bold',color:'#f4f8f7'});
    this.body=this.add.text(70,482,'',{fontFamily:'system-ui',fontSize:21,color:'#d0ddda',lineSpacing:9,wordWrap:{width:930}});
    this.hint=this.add.text(70,652,'Space 또는 클릭',{fontFamily:'system-ui',fontSize:16,color:'#91a5a0'});
    this.pages=[
      ['차갑고 조용하다','젖은 흙 냄새. 낯선 나무. 멀리서 흐르는 물소리.\n\n회사도, 옥상도 없다.\n\n“...나 죽은 건가?”'],
      ['작은 정령','희미한 빛 하나가 안개 사이에서 다가온다.\n\n“이상해. 너한테서 한 가지 감정이 너무 크게 들려.”'],
      [`${this.el.name}의 흔적`,`${this.el.pos}\n그리고 ${this.el.neg}\n\n“좋고 나쁜 게 아니야. 네가 가장 오래 붙들고 있던 마음이야.”`],
      ['숲이 먼저 반응한다','검은 안개가 나무 사이로 번진다. 감정의 잔재가 짐승 같은 형태로 뭉친다.\n\n“설명은 나중이야. 지금은 그 마음을 밖으로 꺼내!”'],
    ];
    this.render(); this.input.keyboard.on('keydown-SPACE',()=>this.next()); this.input.on('pointerdown',()=>this.next());
  }
  forest(){
    const g=this.add.graphics(); g.fillStyle(0x102223).fillRect(0,0,W,H); g.fillStyle(0x173333).fillEllipse(640,360,1180,500);
    for(let i=0;i<18;i++){ const x=20+(i*79)%1240,h=150+(i*53)%190; g.fillStyle(0x0d1b1c,.9).fillRect(x,80,30+(i%3)*8,h); g.fillStyle(0x1b3a38,.8).fillCircle(x+10,100,55+(i%3)*12); }
  }
  render(){ this.title.setText(this.pages[this.i][0]); this.body.setText(this.pages[this.i][1]); this.hint.setText(this.i===this.pages.length-1?'Space — 첫 원소 각성':'Space 또는 클릭'); }
  next(){ if(this.i<this.pages.length-1){ this.i++; this.render(); } else { this.cameras.main.flash(250,255,255,255); this.time.delayedCall(200,()=>this.scene.start('Battle')); } }
}

class Battle extends Phaser.Scene {
  constructor(){ super('Battle'); }
  create(){
    this.key=this.registry.get('element')||'fire'; this.el=ELEMENTS[this.key]; this.hp=100; this.emotion=45; this.shield=0; this.score=0; this.clear=false;
    this.dir=new Phaser.Math.Vector2(1,0); this.lastSkill=-9999; this.lastDash=-9999; this.invuln=0; this.cooldown=4200;
    this.physics.world.setBounds(34,70,W-68,H-190); this.arena(); this.texturesForBattle();
    this.player=this.physics.add.sprite(640,360,'player').setCollideWorldBounds(true).setDepth(10); this.player.setSize(38,44).setOffset(13,14);
    this.shots=this.physics.add.group({maxSize:40}); this.enemies=this.physics.add.group({maxSize:12});
    this.physics.add.overlap(this.shots,this.enemies,this.hitEnemy,undefined,this); this.physics.add.overlap(this.player,this.enemies,this.hitPlayer,undefined,this);
    this.keys=this.input.keyboard.addKeys({up:'W',down:'S',left:'A',right:'D',attack:'SPACE',alt:'J',skill:'Q',dash:'SHIFT'}); this.hud(); this.spawn();
    this.spawner=this.time.addEvent({delay:1150,loop:true,callback:()=>{ if(!this.clear&&this.enemies.countActive(true)<6) this.spawn(); }});
  }
  arena(){ const g=this.add.graphics(); g.fillStyle(0x112529).fillRect(0,0,W,H); g.fillStyle(0x173438).fillEllipse(640,350,1150,500); g.fillStyle(0x24474a,.7); for(let i=0;i<16;i++) g.fillEllipse(60+(i*83)%1170,115+(i*127)%430,50,20); }
  texturesForBattle(){
    ['player','enemy','shot'].forEach(k=>this.textures.exists(k)&&this.textures.remove(k)); const g=this.make.graphics({add:false});
    g.fillStyle(this.el.color).fillRoundedRect(13,20,38,34,13); g.fillStyle(0xf4d2be).fillCircle(32,19,15); g.generateTexture('player',64,64); g.clear();
    g.fillStyle(0x53694f).fillEllipse(30,34,52,34); g.fillStyle(0xcfd8b5).fillCircle(20,32,3).fillCircle(40,32,3); g.generateTexture('enemy',60,60); g.clear();
    g.fillStyle(this.el.color).fillCircle(10,10,8); g.fillStyle(0xffffff,.9).fillCircle(8,8,3); g.generateTexture('shot',20,20); g.destroy();
  }
  hud(){
    this.add.rectangle(0,596,W,124,0x0a0d1b,.96).setOrigin(0).setDepth(40); this.add.circle(66,658,39,this.el.color,.22).setStrokeStyle(3,this.el.color).setDepth(41);
    this.add.text(66,657,this.el.name,{fontFamily:'system-ui',fontSize:17,fontStyle:'bold',color:'#fff'}).setOrigin(.5).setDepth(42);
    this.hpText=this.add.text(126,617,'',{fontFamily:'system-ui',fontSize:17,fontStyle:'bold',color:'#fff'}).setDepth(42);
    this.add.rectangle(126,648,252,13,0x2a2f45).setOrigin(0,.5).setDepth(41); this.hpBar=this.add.rectangle(126,648,252,13,0xe96f74).setOrigin(0,.5).setDepth(42);
    this.add.rectangle(126,676,252,10,0x2a2f45).setOrigin(0,.5).setDepth(41); this.emBar=this.add.rectangle(126,676,113,10,this.el.color).setOrigin(0,.5).setDepth(42);
    this.skillText=this.add.text(420,617,'',{fontFamily:'system-ui',fontSize:16,color:'#d9dcef',lineSpacing:7}).setDepth(42);
    this.quest=this.add.text(34,28,'',{fontFamily:'system-ui',fontSize:18,fontStyle:'bold',color:'#eef1ff',backgroundColor:'#111629cc',padding:{x:14,y:10}}).setDepth(50);
    this.add.text(1245,634,'WASD 이동\nSpace/J 공격\nQ 원소 스킬\nShift 대시',{fontFamily:'system-ui',fontSize:14,color:'#9da6c3',align:'right'}).setOrigin(1,0).setDepth(42); this.updateHud();
  }
  update(t){
    if(this.clear) return; const v=new Phaser.Math.Vector2((this.keys.right.isDown?1:0)-(this.keys.left.isDown?1:0),(this.keys.down.isDown?1:0)-(this.keys.up.isDown?1:0));
    if(v.lengthSq()){v.normalize();this.dir.copy(v);} this.player.setVelocity(v.x*220,v.y*220);
    if(Phaser.Input.Keyboard.JustDown(this.keys.attack)||Phaser.Input.Keyboard.JustDown(this.keys.alt)) this.attack();
    if(Phaser.Input.Keyboard.JustDown(this.keys.skill)) this.skill(t); if(Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.dash(t);
    this.enemies.children.iterate(e=>e?.active&&this.physics.moveToObject(e,this.player,74+Math.min(45,this.score*4))); this.updateHud(t);
  }
  attack(){ const s=this.shots.get(this.player.x,this.player.y,'shot'); if(!s)return; s.setActive(true).setVisible(true);s.body.enable=true;s.damage=14;s.setVelocity(this.dir.x*530,this.dir.y*530);this.time.delayedCall(900,()=>this.offShot(s)); }
  offShot(s){ if(s?.active){s.setActive(false).setVisible(false);s.body.enable=false;} }
  skill(t){
    if(t-this.lastSkill<this.cooldown||this.emotion<30)return; this.lastSkill=t;this.emotion-=30;
    if(this.key==='fire'){ this.ring(170); this.enemies.children.iterate(e=>e?.active&&Phaser.Math.Distance.BetweenPoints(this.player,e)<175&&this.damage(e,42)); }
    if(this.key==='water'){ this.hp=Math.min(100,this.hp+24);this.ring(190);this.enemies.children.iterate(e=>e?.active&&Phaser.Math.Distance.BetweenPoints(this.player,e)<190&&this.damage(e,18)); }
    if(this.key==='shadow'){ this.invuln=t+700;this.player.setPosition(Phaser.Math.Clamp(this.player.x+this.dir.x*150,48,W-48),Phaser.Math.Clamp(this.player.y+this.dir.y*150,82,H-142));this.ring(110); }
    if(this.key==='lightning'){ this.enemies.getChildren().filter(e=>e.active).sort((a,b)=>Phaser.Math.Distance.BetweenPoints(this.player,a)-Phaser.Math.Distance.BetweenPoints(this.player,b)).slice(0,3).forEach(e=>this.damage(e,28)); }
    if(this.key==='wind'){ for(let i=0;i<8;i++){ const a=Phaser.Math.DegToRad(i*45),s=this.shots.get(this.player.x,this.player.y,'shot');if(!s)continue;s.setActive(true).setVisible(true);s.body.enable=true;s.damage=19;s.setVelocity(Math.cos(a)*430,Math.sin(a)*430);this.time.delayedCall(850,()=>this.offShot(s)); } }
    if(this.key==='light'){ this.shield=Math.min(40,this.shield+24);this.enemies.children.iterate(e=>e?.active&&this.damage(e,17));this.cameras.main.flash(160,255,255,210); }
  }
  ring(r){ const c=this.add.circle(this.player.x,this.player.y,18,this.el.color,.35);this.tweens.add({targets:c,radius:r,alpha:0,duration:350,onComplete:()=>c.destroy()}); }
  dash(t){ if(t-this.lastDash<1200)return;this.lastDash=t;this.invuln=t+280;this.player.setPosition(Phaser.Math.Clamp(this.player.x+this.dir.x*90,48,W-48),Phaser.Math.Clamp(this.player.y+this.dir.y*90,82,H-142)); }
  spawn(){ const a=Phaser.Math.FloatBetween(0,Math.PI*2),x=640+Math.cos(a)*520,y=330+Math.sin(a)*220,e=this.enemies.get(x,y,'enemy');if(!e)return;e.setActive(true).setVisible(true);e.body.enable=true;e.hp=34+Math.min(28,this.score*3); }
  hitEnemy(s,e){ if(!s.active||!e.active)return;this.damage(e,s.damage||12);this.offShot(s); }
  damage(e,n){ if(!e?.active)return;e.hp-=n;this.emotion=Math.min(100,this.emotion+8);if(e.hp>0)return;e.setActive(false).setVisible(false);e.body.enable=false;this.score++;this.emotion=Math.min(100,this.emotion+14);if(this.score>=7)this.win(); }
  hitPlayer(_p,e){ const t=this.time.now;if(t<this.invuln||!e.active||this.clear)return;this.invuln=t+650;let d=14;if(this.shield){const a=Math.min(this.shield,d);this.shield-=a;d-=a;}this.hp=Math.max(0,this.hp-d);this.cameras.main.shake(100,.007);if(!this.hp)this.lose(); }
  lose(){ this.physics.pause();this.clear=true;this.spawner?.remove(false);this.overlay('감정에 휩쓸렸다','Enter — 다시 감정을 마주한다');this.input.keyboard.once('keydown-ENTER',()=>this.scene.restart()); }
  win(){ this.clear=true;this.spawner?.remove(false);this.overlay(`${this.el.name}의 감정을 처음 이해했다`,`${this.el.pos}\n그리고 ${this.el.neg}\n\n첫 원소는 직업이 아니다. 지금의 네가 가장 잘 아는 감정일 뿐이다.\n다른 감정은 여행하며 새롭게 이해할 수 있다.\n\nEnter — 다시 전투  ·  Esc — 프롤로그부터 다시`);this.input.keyboard.once('keydown-ENTER',()=>this.scene.restart());this.input.keyboard.once('keydown-ESC',()=>this.scene.start('Prologue')); }
  overlay(title,body){ this.add.rectangle(0,0,W,H,0x070813,.78).setOrigin(0).setDepth(80);this.add.text(640,285,title,{fontFamily:'system-ui',fontSize:38,fontStyle:'bold',color:'#fff'}).setOrigin(.5).setDepth(81);this.add.text(640,375,body,{fontFamily:'system-ui',fontSize:19,color:'#c6cad9',align:'center',lineSpacing:8}).setOrigin(.5).setDepth(81); }
  updateHud(t=this.time.now){ if(!this.hpText)return;this.hpText.setText(`HP ${Math.ceil(this.hp)} / 100${this.shield?`   보호막 ${Math.ceil(this.shield)}`:''}`);this.hpBar.displayWidth=252*this.hp/100;this.emBar.displayWidth=252*this.emotion/100;const cd=Math.max(0,this.cooldown-(t-this.lastSkill));this.skillText.setText(`${this.el.skill} [Q] ${cd?`${(cd/1000).toFixed(1)}s`:'READY'}\n감정 게이지 ${Math.floor(this.emotion)} / 100 · 소모 30`);this.quest.setText(`안개숲 · 첫 원소 각성\n오염된 감정의 잔재 정화 ${this.score} / 7`); }
}

new Phaser.Game({type:Phaser.AUTO,width:W,height:H,parent:'game',backgroundColor:'#090b18',physics:{default:'arcade',arcade:{debug:false}},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:W,height:H},render:{antialias:true},scene:[Prologue,Awakening,Battle]});
