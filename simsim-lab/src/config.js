export const VERSION='2.0.0';
export const LOCALES=[['en','English','ltr'],['ko','한국어','ltr'],['es','Español','ltr'],['pt-BR','Português do Brasil','ltr'],['ja','日本語','ltr'],['id','Bahasa Indonesia','ltr'],['hi','हिन्दी','ltr'],['de','Deutsch','ltr'],['fr','Français','ltr'],['ar','العربية','rtl'],['vi','Tiếng Việt','ltr'],['th','ไทย','ltr'],['tr','Türkçe','ltr'],['zh-CN','简体中文','ltr']];
const rows=[
 ['human-battery','daily','🔋'],['procrastination','daily','⏳'],['monday-survival','daily','☕'],['clock-out-instinct','daily','🧳'],['shopping-shield','daily','🛍️'],['midnight-snack','daily','🍜'],['alarm-battle','daily','⏰'],['trip-planner','daily','🗺️'],['cafe-order','daily','🧋'],['homebody','daily','🛋️'],
 ['dating-style','love','💘'],['crush-character','love','💌'],['texting-style','love','💬'],['first-date','love','🌷'],['group-chat','love','📱'],['friend-group-role','love','🫶'],['travel-mate','love','🎒'],['night-out','love','🥤'],['flirting-style','love','✨'],['making-plans','love','📅'],
 ['rpg-class','fantasy','⚔️'],['superpower','fantasy','⚡'],['villain-type','fantasy','😈'],['fantasy-species','fantasy','🧝'],['kingdom-role','fantasy','👑'],['life-boss','fantasy','🐲'],['zombie-survival','fantasy','🧟'],['island-survival','fantasy','🏝️'],['magic-element','fantasy','🔮'],['life-difficulty','fantasy','🎮'],
 ['past-life','chaos','🌙'],['food-personality','chaos','🍙'],['dessert-personality','chaos','🍮'],['animal-character','chaos','🐾'],['weather-personality','chaos','🌤️'],['human-color','chaos','🎨'],['emoji-trio','chaos','🫠'],['movie-genre','chaos','🎬'],['meme-personality','chaos','🪿'],['brain-character','chaos','🧠'],
 ['billionaire-route','whatif','💎'],['lottery-life','whatif','🎟️'],['future-job','whatif','🚀'],['travel-city','whatif','🌍'],['isekai-character','whatif','🌌'],
 ['friend-compatibility','duo','🤝'],['couple-tastes','duo','💕'],['travel-compatibility','duo','✈️'],['balance-game','duo','⚖️'],['rpg-party','duo','🛡️']
];
export const TESTS=rows.map(([slug,category,emoji],index)=>({slug,category,emoji,index,duo:category==='duo',version:1,questionCount:8}));
export const CATEGORIES=['daily','love','fantasy','chaos','whatif','duo'];
export const FLAGSHIPS=['zombie-survival','rpg-class','dating-style','friend-compatibility','past-life','superpower','villain-type','isekai-character'];
// Populate only after real, consent-appropriate locale-level measurements exist.
export const featuredTestsByLocale=Object.freeze({});
export const featuredFor=locale=>featuredTestsByLocale[locale]||FLAGSHIPS;
// Roles: planner, starter, connector, restorer, maker, explorer.
export const QUESTION_ROLES=[[0,1,2,3],[4,5,0,2],[1,3,4,5],[2,0,5,1],[3,4,2,0],[5,1,3,4],[0,2,4,5],[1,3,5,2]];
export const PROFILE_METRICS=[[95,45,40,25],[35,95,50,80],[50,60,95,35],[55,25,50,15],[80,60,40,65],[30,75,60,95]];
export const COLORS={daily:['#fff1a8','#f5b938'],love:['#ffd8eb','#f56f9a'],fantasy:['#e2d9ff','#9a7bff'],chaos:['#d6faad','#a3d851'],whatif:['#c7ecff','#6ec8ec'],duo:['#f5d2ff','#d589e9']};
export const findTest=slug=>TESTS.find(t=>t.slug===slug);
export function normalizeLocale(value){const v=String(value||'').toLowerCase();if(v.startsWith('pt'))return 'pt-BR';if(v.startsWith('zh'))return 'zh-CN';return LOCALES.find(([code])=>code.toLowerCase()===v.split('-')[0])?.[0]||'en';}
export const LEGACY={rpg:'rpg-class',grad:'monday-survival',work:'clock-out-instinct',love:'dating-style',power:'superpower',zombie:'zombie-survival',villain:'villain-type',past:'past-life',life:'life-difficulty',marry:'friend-compatibility'};
