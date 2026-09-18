export const VERSION = '2.0.0';
export const CONTENT_VERSION = 1;
export const LOCALES = [
 ['en','English','ltr'],['ko','한국어','ltr'],['es','Español','ltr'],['pt-BR','Português do Brasil','ltr'],
 ['ja','日本語','ltr'],['id','Bahasa Indonesia','ltr'],['hi','हिन्दी','ltr'],['de','Deutsch','ltr'],
 ['fr','Français','ltr'],['ar','العربية','rtl'],['vi','Tiếng Việt','ltr'],['th','ไทย','ltr'],['tr','Türkçe','ltr'],['zh-CN','简体中文','ltr']
].map(([code,name,dir])=>({code,name,dir}));
export const CATEGORY_IDS = ['daily','love','fantasy','chaos','whatif','duo'];
export const COLORS = {
 daily:{bg:'#fff0ad',ink:'#49351b',accent:'#f4ac31'},love:{bg:'#ffd8e9',ink:'#652345',accent:'#f761a6'},
 fantasy:{bg:'#e7dbff',ink:'#412373',accent:'#9471ed'},chaos:{bg:'#dafaac',ink:'#304e22',accent:'#83bc41'},
 whatif:{bg:'#cceeff',ink:'#184f6b',accent:'#57b9df'},duo:{bg:'#ffe0c8',ink:'#683517',accent:'#e99755'}
};
const definitions = [
 ['human-battery','daily','🔋'],['procrastination-level','daily','🦥'],['monday-survival','daily','☕'],['clock-out-instinct','daily','💼'],['shopping-defense','daily','🛍️'],
 ['midnight-snack','daily','🍜'],['alarm-battle','daily','⏰'],['trip-planner','daily','🧳'],['coffee-personality','daily','🧋'],['homebody','daily','🛋️'],
 ['dating-style','love','💘'],['crush-character','love','💌'],['texting-style','love','💬'],['first-date','love','🌷'],['group-chat','love','📱'],
 ['friend-group-role','love','🫶'],['travel-buddy','love','🚆'],['party-character','love','🎉'],['flirting-style','love','😉'],['making-plans','love','📅'],
 ['rpg-class','fantasy','⚔️'],['superpower','fantasy','⚡'],['villain-type','fantasy','😈'],['fantasy-species','fantasy','🧝'],['kingdom-role','fantasy','👑'],
 ['life-boss','fantasy','🐉'],['zombie-survival','fantasy','🧟'],['island-survival','fantasy','🏝️'],['magic-element','fantasy','✨'],['life-difficulty','fantasy','🎮'],
 ['past-life','chaos','🔮'],['food-personality','chaos','🍙'],['dessert-personality','chaos','🍰'],['animal-character','chaos','🦊'],['weather-personality','chaos','🌦️'],
 ['human-color','chaos','🎨'],['three-emoji','chaos','🪩'],['movie-genre','chaos','🎬'],['meme-personality','chaos','🫠'],['inner-character','chaos','🧠'],
 ['sudden-fortune','whatif','💸'],['jackpot-personality','whatif','🎟️'],['future-career','whatif','🛸'],['travel-city','whatif','🌍'],['isekai-character','whatif','🌌'],
 ['friend-compatibility','duo','🤝'],['couple-taste','duo','💕'],['travel-compatibility','duo','🗺️'],['balance-game','duo','⚖️'],['rpg-party','duo','🛡️']
];
export const FLAGSHIPS = ['zombie-survival','rpg-class','dating-style','friend-compatibility','past-life','superpower','villain-type','isekai-character'];
export const TESTS = definitions.map(([slug,category,emoji],index)=>Object.freeze({id:index,slug,category,emoji,featured:FLAGSHIPS.includes(slug),mode:index>=45?'duo':'solo',questionCount:8,resultCount:6,version:CONTENT_VERSION}));
export const BY_SLUG = Object.fromEntries(TESTS.map(t=>[t.slug,t]));
// Deliberately empty at launch: no assumptions about national preferences.
export const featuredTestsByLocale = Object.freeze({});
export function featuredFor(locale){return featuredTestsByLocale[locale] || FLAGSHIPS;}
export const RESULT_KEYS = ['strategist','spark','connector','cloud','pathfinder','harmonizer'];
export const PAIR_KEYS = ['parallel-worlds','plot-twist','mix-tape','co-pilots','same-frequency','mind-meld'];
export const RESULT_EMOJI = ['🧭','🔥','🫶','☁️','🚀','🎧'];
export const LEGACY = {rpg:'rpg-class',grad:'human-battery',work:'clock-out-instinct',love:'dating-style',power:'superpower',zombie:'zombie-survival',villain:'villain-type',past:'past-life',life:'life-difficulty',marry:'friend-compatibility'};
