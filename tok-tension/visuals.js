/* TokTension v1.3 visual analytics enhancement.
 * Local-only aggregate charts. No network, storage, or raw-message export. */
(()=>{'use strict';
const D=window.TokDetailEngine;
if(!D||typeof D.analyze!=='function')return;
const originalAnalyze=D.analyze.bind(D);
const clamp=n=>Math.max(0,Math.min(100,Number.isFinite(n)?n:0));
const ratio=(a,b)=>b?100*a/b:0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:1});
const duration=n=>D.timeText(n);
let activeReport=null, raf=0;

function selectedMessages(parsed,me,other,options){
  const all=(parsed?.messages||[]).filter(m=>m.name===me||m.name===other);
  const limit=[100,300].includes(Number(options?.limit))?Number(options.limit):0;
  return limit?all.slice(-limit):all;
}
function buildHeatmap(parsed,me,other,options){
  const messages=selectedMessages(parsed,me,other,options),heat=Array.from({length:7},()=>Array.from({length:8},()=>({counts:[0,0],total:0})));
  const zone=typeof options?.timeZone==='string'?options.timeZone:'Asia/Seoul';
  let fmt=null;
  try{fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});}catch{}
  let total=0;
  for(const m of messages){
    const side=m.name===me?0:m.name===other?1:-1;if(side<0)continue;
    let hour=null,weekday=null;
    if(parsed.source==='instagram'&&Number.isFinite(m.stamp)&&fmt){
      const parts=Object.fromEntries(fmt.formatToParts(new Date(m.stamp*60000)).map(x=>[x.type,x.value]));
      const y=Number(parts.year),mo=Number(parts.month),d=Number(parts.day);
      hour=Number(parts.hour);
      if(Number.isFinite(y)&&Number.isFinite(mo)&&Number.isFinite(d))weekday=new Date(Date.UTC(y,mo-1,d)).getUTCDay();
    }else{
      if(Number.isFinite(m.minute))hour=Math.floor(m.minute/60)%24;
      if(Number.isFinite(m.day))weekday=new Date(m.day*60000).getUTCDay();
    }
    if(!Number.isFinite(hour)||weekday===null||weekday===undefined)continue;
    const row=(weekday+6)%7, col=Math.max(0,Math.min(7,Math.floor(hour/3)));
    heat[row][col].counts[side]++;heat[row][col].total++;total++;
  }
  return{cells:heat,total};
}
function normalizePair(a,b){
  const max=Math.max(a,b);return max>0?[Math.round(a/max*100),Math.round(b/max*100)]:[0,0];
}
function buildRadar(d){
  const p=d.people,i=d.interaction,a=d.intervals;
  const q=normalizePair(ratio(p[0].counts.question,p[0].n),ratio(p[1].counts.question,p[1].n));
  const react=normalizePair(
    ratio(p[0].counts.laugh+p[0].counts.emoji+p[0].counts.exclaim,p[0].n),
    ratio(p[1].counts.laugh+p[1].counts.emoji+p[1].counts.exclaim,p[1].n)
  );
  const speedRaw=a.map(x=>Number.isFinite(x.median)?1/(x.median+1):0);
  const speed=normalizePair(speedRaw[0],speedRaw[1]);
  const length=normalizePair(p[0].meanChars||0,p[1].meanChars||0);
  const turns=normalizePair(i[0].turns||0,i[1].turns||0);
  return{
    labels:['질문','리액션','답장 리듬','말풍선 길이','대화 차례'],
    mine:[q[0],react[0],speed[0],length[0],turns[0]],
    other:[q[1],react[1],speed[1],length[1],turns[1]]
  };
}
function buildVisuals(parsed,me,other,options,d){
  return{heatmap:buildHeatmap(parsed,me,other,options),radar:buildRadar(d)};
}
D.analyze=function(parsed,me,other,options={}){
  const d=originalAnalyze(parsed,me,other,options);
  d.visuals=buildVisuals(parsed,me,other,options,d);
  activeReport=d;
  schedule();
  return d;
};

function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>enhance(activeReport));}
function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
function radarSvg(r){
  const cx=150,cy=142,R=98,n=r.labels.length,angle=i=>-Math.PI/2+i*2*Math.PI/n;
  const point=(i,v)=>[cx+Math.cos(angle(i))*R*v/100,cy+Math.sin(angle(i))*R*v/100];
  const points=vals=>vals.map((v,i)=>point(i,v).map(x=>x.toFixed(1)).join(',')).join(' ');
  let grid='',axes='',labels='',dots='';
  for(const lv of [25,50,75,100])grid+=`<polygon class="grid" points="${points(Array(n).fill(lv))}"></polygon>`;
  r.labels.forEach((label,i)=>{
    const [x,y]=point(i,100),[lx,ly]=point(i,122);
    axes+=`<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    const anchor=lx<cx-8?'end':lx>cx+8?'start':'middle';
    labels+=`<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>`;
  });
  r.mine.forEach((v,i)=>{const [x,y]=point(i,v);dots+=`<circle class="mine-dot" cx="${x}" cy="${y}" r="3.2"></circle>`;});
  r.other.forEach((v,i)=>{const [x,y]=point(i,v);dots+=`<circle class="other-dot" cx="${x}" cy="${y}" r="3.2"></circle>`;});
  return `<svg class="viz-radar" viewBox="0 0 300 285" role="img" aria-label="나와 상대방의 대화 스타일 상대 비교 레이더 그래프">${grid}${axes}<polygon class="mine" points="${points(r.mine)}"></polygon><polygon class="other" points="${points(r.other)}"></polygon>${dots}${labels}</svg>`;
}
function balanceCard(d){
  const mine=clamp(d.shares.message??ratio(d.people[0].n,d.quality.n)),other=100-mine;
  const chars=clamp(d.shares.chars??ratio(d.people[0].chars,d.people[0].chars+d.people[1].chars));
  const turns=ratio(d.interaction[0].turns,d.interaction[0].turns+d.interaction[1].turns);
  return `<article class="viz-card viz-soft-green" data-viz="balance">
    <div class="viz-title-row"><div><h4>💬 대화 밸런스</h4><p class="viz-desc">누가 더 좋다는 점수가 아니라, 이번 기록의 참여 분량이에요.</p></div></div>
    <div class="viz-balance">
      <div class="viz-donut" style="background:conic-gradient(var(--viz-mine) 0 ${mine}%,var(--viz-other) ${mine}% 100%)" role="img" aria-label="메시지 비율 나 ${num(mine)}%, 상대방 ${num(other)}%"><strong>${num(mine)}%</strong><small>내 메시지</small></div>
      <div class="viz-balance-list">
        ${balanceRow('메시지',mine,`${num(mine)}%`)}
        ${balanceRow('글자 수',chars,`${num(chars)}%`)}
        ${balanceRow('대화 차례',turns,`${num(turns)}%`)}
      </div>
    </div>
    <p class="viz-desc" style="margin:14px 0 0">보라색은 상대방 몫입니다. 분량은 관심이나 관계의 우열을 의미하지 않아요.</p>
  </article>`;
}
function balanceRow(label,value,text){return `<div class="viz-balance-row"><span>${esc(label)}</span><div class="viz-track"><i style="width:${clamp(value)}%"></i></div><b>${esc(text)}</b></div>`;}
function radarCard(d){
  return `<article class="viz-card viz-soft-purple" data-viz="radar"><div class="viz-title-row"><div><h4>📊 대화 스타일 비교</h4><p class="viz-desc">각 항목에서 두 사람 중 큰 값을 100으로 둔 표본 내 상대 비교예요.</p></div><div class="deep-legend"><span>나</span><span>상대방</span></div></div><div class="viz-radar-wrap">${radarSvg(d.visuals.radar)}<div class="viz-radar-key"><div><b><i></i>나</b>초록 면적</div><div><b><i></i>상대방</b>보라 면적</div></div></div><p class="viz-desc" style="margin:8px 0 0">성격 점수가 아닙니다. 질문·표현·답장 간격·말풍선 길이·대화 차례의 상대적인 모양만 보여줘요.</p></article>`;
}
function heatmapCard(d){
  const h=d.visuals.heatmap,labels=['월','화','수','목','금','토','일'],hours=['0','3','6','9','12','15','18','21'];
  if(!h.total)return `<article class="viz-card" data-viz="heat"><h4>🕒 대화 활발 시간대</h4><p class="viz-desc">날짜와 시각 정보가 모두 있어야 요일×시간 히트맵을 만들 수 있어요.</p><div class="deep-empty">요일별 시간대 분포를 계산할 날짜 정보가 부족해요.</div></article>`;
  const max=Math.max(1,...h.cells.flat().map(c=>c.total));
  const head=`<span></span>${hours.map(x=>`<span class="viz-heat-head">${x}시</span>`).join('')}`;
  const cells=h.cells.map((row,ri)=>`<span class="viz-heat-day">${labels[ri]}</span>`+row.map((c,ci)=>{const lv=c.total?Math.max(1,Math.ceil(c.total/max*5)):0;return `<i class="viz-cell" data-level="${lv}" title="${labels[ri]}요일 ${hours[ci]}~${Number(hours[ci])+3}시 · 나 ${c.counts[0]}개 / 상대방 ${c.counts[1]}개"></i>`;}).join('')).join('');
  return `<article class="viz-card viz-soft-green" data-viz="heat"><div class="viz-title-row"><div><h4>🕒 대화 활발 시간대</h4><p class="viz-desc">요일 × 3시간 구간 · 두 사람 메시지를 합친 활동량</p></div><span class="viz-chip">${num(h.total)}개 시각 표본</span></div><div class="viz-heat-layout" role="img" aria-label="요일과 시간대별 대화량 히트맵">${head}${cells}</div><div class="viz-heat-scale"><span>적음</span><i></i><i></i><i></i><i></i><span>많음</span></div></article>`;
}
function timelineCard(d){
  const days=d.daily.slice(-14);
  if(!days.length)return `<article class="viz-card" data-viz="timeline"><h4>📈 대화 흐름</h4><p class="viz-desc">날짜가 있는 기록에서 최근 흐름을 보여줘요.</p><div class="deep-empty">날짜별 메시지 흐름을 계산할 정보가 부족해요.</div></article>`;
  const max=Math.max(1,...days.map(x=>x.counts[0]+x.counts[1]));
  const bars=days.map((x,i)=>{const total=x.counts[0]+x.counts[1],mh=x.counts[0]/max*100,oh=x.counts[1]/max*100,label=x.date.slice(5).replace('-','/');return `<div class="viz-daybar" title="${esc(x.date)} · 나 ${x.counts[0]}개 / 상대방 ${x.counts[1]}개"><div class="viz-daystack" aria-hidden="true"><i class="mine" style="height:${mh}%"></i><i class="other" style="height:${oh}%"></i></div><label>${i===0||i===days.length-1||i%3===0?esc(label):''}</label></div>`;}).join('');
  return `<article class="viz-card viz-soft-purple" data-viz="timeline"><div class="viz-title-row"><div><h4>📈 대화 흐름</h4><p class="viz-desc">날짜가 있는 최근 최대 14일 · 쌓은 막대</p></div><div class="deep-legend"><span>나</span><span>상대방</span></div></div><div class="viz-timeline" role="img" aria-label="최근 날짜별 나와 상대방 메시지 수 쌓은 막대그래프">${bars}</div></article>`;
}
function intervalCard(d){
  const a=d.intervals,max=Math.max(1,...a.map(x=>Number.isFinite(x.p90)?x.p90:0));
  const row=(x,label,other=false)=>{
    if(!x.n)return `<div class="viz-box-row ${other?'other':''}"><strong>${label}</strong><div class="viz-box-track"></div><span class="viz-box-value">정보 부족</span></div>`;
    const p=v=>clamp((Number(v)||0)/max*100),left=p(x.p25),right=p(x.p75),median=p(x.median),p90=p(x.p90);
    return `<div class="viz-box-row ${other?'other':''}"><strong>${label}</strong><div class="viz-box-track" title="중앙값 ${duration(x.median)} · 중간 50% ${duration(x.p25)}~${duration(x.p75)} · 90백분위 ${duration(x.p90)}"><i class="viz-box-line" style="left:0;width:${p90}%"></i><i class="viz-box-range" style="left:${left}%;width:${Math.max(1,right-left)}%"></i><i class="viz-box-dot" style="left:${median}%"></i></div><span class="viz-box-value">${esc(duration(x.median))}</span></div>`;
  };
  return `<section class="viz-card viz-soft-green viz-section" data-viz="interval"><div class="viz-title-row"><div><h4>⏱️ 답장 분포 한눈에</h4><p class="viz-desc">점 = 중앙값 · 진한 선 = 90백분위까지 · 옅은 띠 = 중간 50%</p></div><span class="viz-chip">최대축 ${esc(duration(max))}</span></div><div class="viz-interval">${row(a[0],'나')}${row(a[1],'상대방',true)}</div></section>`;
}
function compareCard(title,desc,rows){
  const body=rows.map(r=>{const max=Math.max(1,r.values[0],r.values[1]);return `<div class="viz-compare-row"><span>${esc(r.label)}</span><div class="viz-pairtrack" aria-hidden="true"><div><i style="width:${100*r.values[0]/max}%"></i></div><div><i style="width:${100*r.values[1]/max}%"></i></div></div><b>${num(r.values[0])} / ${num(r.values[1])}</b></div>`;}).join('');
  return `<section class="viz-card viz-section" data-viz="compare"><div class="viz-title-row"><div><h4>${title}</h4><p class="viz-desc">${desc}</p></div><div class="deep-legend"><span>나</span><span>상대방</span></div></div><div class="viz-compare">${body}</div></section>`;
}
function qualityCard(d){
  const time=clamp(d.quality.timeCoverage||0),reply=clamp(ratio(d.quality.replySamples,Math.max(1,d.quality.switches))),date=clamp(ratio(d.quality.fullDate,d.quality.n));
  return `<section class="viz-card viz-soft-green viz-section" data-viz="quality"><h4>🔎 입력 데이터 상태</h4><p class="viz-desc">그래프를 해석하기 전에 시간·날짜 정보가 얼마나 있는지 확인하세요.</p><div class="viz-quality-meter"><div class="viz-ring" style="background:conic-gradient(var(--viz-mine) 0 ${time}%,#edf2ed ${time}% 100%)"><strong>${num(time)}%</strong><small>시각 보유</small></div><div class="viz-quality-bars">${balanceRow('날짜+시각',date,num(date)+'%')}${balanceRow('답장 전환',reply,num(reply)+'%')}${balanceRow('분석 범위',ratio(d.quality.n,d.quality.total),num(ratio(d.quality.n,d.quality.total))+'%')}</div></div></section>`;
}
function mountOverview(d){
  const p=document.getElementById('deepPanel-overview');if(!p||p.querySelector('[data-viz="radar"]'))return;
  const k=p.querySelector('.deep-kpis');if(!k)return;
  const grid=el(`<section class="viz-grid" data-viz="overview-grid">${radarCard(d)}${balanceCard(d)}</section>`);
  k.insertAdjacentElement('afterend',grid);
}
function mountFlow(d){
  const p=document.getElementById('deepPanel-flow');if(!p||p.querySelector('[data-viz="heat"]'))return;
  const lead=p.querySelector('.lead'),grid=el(`<section class="viz-grid" data-viz="flow-grid">${heatmapCard(d)}${timelineCard(d)}</section>`);
  if(lead)lead.insertAdjacentElement('afterend',grid);else p.prepend(grid);
}
function mountPace(d){
  const p=document.getElementById('deepPanel-pace');if(!p||p.querySelector('[data-viz="interval"]'))return;
  const lead=p.querySelector('.lead'),card=el(intervalCard(d));if(lead)lead.insertAdjacentElement('afterend',card);else p.prepend(card);
}
function mountExchange(d){
  const p=document.getElementById('deepPanel-exchange');if(!p||p.querySelector('[data-viz="compare"]'))return;
  const rows=[
    {label:'메시지 수',values:d.people.map(x=>x.n)},
    {label:'글자 수',values:d.people.map(x=>x.chars)},
    {label:'대화 차례',values:d.interaction.map(x=>x.turns)},
    {label:'질문 차례',values:d.interaction.map(x=>x.questionTurns)}
  ];
  const lead=p.querySelector('.lead'),card=el(compareCard('↔️ 주고받기 비교','항목마다 큰 쪽을 가득 채워 상대적인 차이를 보여줘요.',rows));if(lead)lead.insertAdjacentElement('afterend',card);else p.prepend(card);
}
function mountLanguage(d){
  const p=document.getElementById('deepPanel-language');if(!p||p.querySelector('[data-viz="compare"]'))return;
  const rows=d.rules.slice(0,7).map(r=>({label:r.label,values:d.people.map(x=>x.counts[r.key]||0)}));
  const lead=p.querySelector('.lead'),card=el(compareCard('✨ 표현 패턴 비교','물음표·웃음·감사·배려·일정·이모지·느낌표가 들어간 메시지 수예요.',rows));if(lead)lead.insertAdjacentElement('afterend',card);else p.prepend(card);
}
function mountMethod(d){
  const p=document.getElementById('deepPanel-method');if(!p||p.querySelector('[data-viz="quality"]'))return;
  const lead=p.querySelector('.lead'),card=el(qualityCard(d));if(lead)lead.insertAdjacentElement('afterend',card);else p.prepend(card);
}
function enhance(d){
  if(!d||!document.getElementById('deepReport'))return;
  mountOverview(d);mountFlow(d);mountPace(d);mountExchange(d);mountLanguage(d);mountMethod(d);
}
const observer=new MutationObserver(()=>schedule());
observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest('[data-deep-tab],#extraBtn'))schedule();},true);
})();