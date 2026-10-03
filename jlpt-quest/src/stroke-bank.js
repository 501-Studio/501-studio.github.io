/** Only an APK-local asset is read. There is deliberately no remote fallback. */
let loaded=null;
export async function loadStrokeBank(){
 if(loaded)return loaded;
 const url=new URL('../data/strokes.json',import.meta.url);
 const response=await fetch(url,{credentials:'omit'});
 if(!response.ok)throw new Error('내장 획 데이터를 읽지 못했습니다. 앱을 다시 설치하기 전에 기록을 백업해 주세요.');
 const pack=await response.json();
 if(pack.version!==1||!pack.characters||typeof pack.characters!=='object')throw new Error('내장 획 데이터 형식이 맞지 않습니다.');
 for(const [char,strokes]of Object.entries(pack.characters)){
  if([...char].length!==1||!Array.isArray(strokes)||!strokes.length||strokes.length>60||strokes.some(path=>!Array.isArray(path)||path.length<2||path.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))))throw new Error('손상된 내장 획 데이터입니다.');
 }
 loaded=pack;return loaded;
}
export function characterStrokes(char){return loaded?.characters[char]||null;}
export function requireStrokes(chars){const missing=chars.filter(c=>!characterStrokes(c));if(missing.length)throw new Error(`내장 획 데이터가 없는 글자: ${missing.join(' ')}`);}
