import { safeReferrer } from '../core.mjs';
import { LOCALES, BY_SLUG, RESULT_KEYS, PAIR_KEYS } from '../definitions.mjs';
export const EVENTS=Object.freeze(['homepage_view','quiz_card_click','quiz_start','question_answer','quiz_complete','result_view','result_share','result_image_save','copy_link','two_player_invite','two_player_complete','next_quiz_click','random_quiz_click','locale_change']);
let adapter=null;
// No provider, cookies, identifiers, storage or network calls are enabled here.
// A future operator must explicitly connect a reviewed adapter and handle consent.
export function configureAnalytics(fn){if(fn!==null&&typeof fn!=='function')throw new TypeError('Expected an adapter function or null');adapter=fn;}
export function track(name,fields={}){
 if(!EVENTS.includes(name))return false;
 const detail={event:name};
 if(LOCALES.some(l=>l.code===fields.locale))detail.locale=fields.locale;
 if(BY_SLUG[fields.quizSlug])detail.quizSlug=fields.quizSlug;
 if([...RESULT_KEYS,...PAIR_KEYS].includes(fields.resultType))detail.resultType=fields.resultType;
 const origin=safeReferrer(fields.referrer||'');if(origin)detail.referrer=origin;
 const payload=Object.freeze(detail);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('simsim:analytics',{detail:payload}));
 if(adapter){try{adapter(payload);}catch{/* Analytics must never interrupt the test. */}}
 return true;
}
