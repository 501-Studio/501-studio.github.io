import { tests, flagshipSlugs } from './catalog.mjs';
import { getPack } from './locales.mjs';

const themedNames = {
  en: {
    'zombie-survival':['Bunker Strategist','Rooftop Runner','Squad Medic','Chaos Scavenger','Silent Survivor'],
    'rpg-class':['Shadow Mage','Meteor Knight','Party Bard','Wild Ranger','Balance Alchemist'],
    'dating-style':['Slow-Burn Analyst','Straight-Line Flirt','Warm Signal','Plot-Twist Romantic','My-Pace Lover'],
    'friendship-compatibility':['Parallel-Universe Twins','Chaos Soulmates','Suspiciously Compatible','Opposites With Potential','Plot-Twist Duo'],
    'past-life':['Royal Archivist','Roadside Explorer','Town Storyteller','Wandering Trickster','Mountain Sage'],
    'superpower':['Future Peek','Instant Warp','Heart Subtitles','Reality Remix','Time-Out Master'],
    'villain-type':['Mastermind','Theme-Song Villain','Fanclub Boss','Chaos Trickster','Retired Final Boss'],
    'isekai-character':['Strategy Sage','Frontline Hero','Guild Heart','Wildcard Summoner','Isekai Café Owner']
  },
  ko: {
    'zombie-survival':['벙커 전략가','옥상 질주러','파티 생존 힐러','혼돈의 파밍러','조용한 생존 고수'],
    'rpg-class':['그림자 마법사','메테오 기사','파티 바드','야생 레인저','밸런스 연금술사'],
    'dating-style':['슬로번 분석가','직진 플러터','따뜻한 시그널러','플롯 트위스트 로맨서','마이페이스 러버'],
    'friendship-compatibility':['평행세계 쌍둥이','혼돈의 소울메이트','수상할 만큼 잘 맞음','반대라서 더 재밌는 조합','플롯 트위스트 듀오'],
    'past-life':['왕실 기록관','길 위의 탐험가','마을 이야기꾼','떠돌이 장난꾼','산속 낮잠 도사'],
    'superpower':['미래 미리보기','출근길 순간이동','마음 자막 생성','현실 리믹스','시간정지 휴식러'],
    'villain-type':['복선 회수형 흑막','테마곡 빌런','팬클럽 있는 보스','혼돈의 트릭스터','은퇴 직전 최종보스'],
    'isekai-character':['전략 현자','전열 용사','길드의 심장','변수 많은 소환사','이세계 카페 사장']
  }
};

function fill(str, vars){ return str.replace(/\{(\w+)\}/g,(_,k)=>vars[k] ?? ''); }
function recommend(test){
  const same=tests.filter(t=>t.slug!==test.slug && !t.duo && t.category===test.category).map(t=>t.slug);
  const flagship=tests.filter(t=>t.flagship && t.slug!==test.slug).map(t=>t.slug);
  return [...same,...flagship].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4);
}
export function getLocalizedTest(locale, slug){
  const p=getPack(locale); const i=tests.findIndex(t=>t.slug===slug); if(i<0) return null;
  const base=tests[i]; const title=p.titles[i];
  const questions=p.prompts.map((prompt,qi)=>({
    question:fill(prompt,{topic:title}),
    answers:p.answers.map((a,ai)=> `${a}${qi===7 && ai===3 ? ' ✦' : ''}`)
  }));
  const metrics=p.metrics[base.category] || p.metrics.two;
  if(base.duo){
    const results=p.duoTiers.map((name,ri)=>({
      name,emoji:['🪞','🔥','✨','🧩','🎭'][ri],
      tagline:p.ui.short,
      description:`${p.ui.long} ${p.ui.forFun}`
    }));
    return {...base,title,shortDescription:p.ui.short,longDescription:p.ui.long,questions,results,metrics,shareText:fill(p.ui.sendLine,{title}),seo:{title:`${title} | SimsimLAB`,description:`${p.ui.short} ${p.ui.forFun}`},recommended:recommend(base)};
  }
  const override=themedNames[locale]?.[slug] || themedNames.en[slug] || null;
  const results=p.styleNames.map((name,ri)=>({
    name:override?.[ri] || name,
    emoji:['🧠','⚡','🫶','🌀','🌙'][ri],
    tagline:p.styleLines[ri],
    description:`${p.styleLines[ri]} ${p.styleLines[(ri+2)%5]} ${p.styleLines[(ri+4)%5]}`,
    strength:p.styleLines[ri],
    quirk:p.quirks[ri],
    match:override?.[(ri+2)%5] || p.styleNames[(ri+2)%5],
    share:fill(p.ui.shareLine,{title,result:override?.[ri] || name})
  }));
  return {...base,title,shortDescription:p.ui.short,longDescription:p.ui.long,questions,results,metrics,shareText:fill(p.ui.shareLine,{title,result:'{result}'}),seo:{title:`${title} | SimsimLAB`,description:`${p.ui.short} ${p.ui.forFun}`},recommended:recommend(base)};
}
export function getHomeCards(locale){ const p=getPack(locale); return tests.map((t,i)=>({...t,title:p.titles[i],shortDescription:p.ui.short})); }
export { flagshipSlugs };