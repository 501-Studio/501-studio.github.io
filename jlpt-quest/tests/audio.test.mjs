import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('../data/audio-manifest.json',import.meta.url),'utf8'));
const packs=['N5','N4','N3','N2','N1'].map(l=>JSON.parse(fs.readFileSync(new URL(`../data/${l}.json`,import.meta.url))).words).flat();
test('offline audio manifest covers every installed N1-N5 word',()=>{
 assert.equal(manifest.complete,true);assert.equal(manifest.words,packs.length);assert.equal(Object.keys(manifest.clips).length,packs.length);
 for(const w of packs)assert.ok(manifest.clips[w.id],w.id);
});
test('every referenced audio file is bundled, non-empty Ogg Opus',()=>{
 const unique=new Set(Object.values(manifest.clips));assert.equal(unique.size,manifest.uniqueClips);
 for(const name of unique){const p=new URL('../data/audio/'+name,import.meta.url);const b=fs.readFileSync(p);assert.ok(b.length>300,name);assert.equal(b.subarray(0,4).toString(),'OggS',name);}
});
test('installed Android app has no Internet permission or TTS dependency',()=>{
 const manifestXml=fs.readFileSync(new URL('../../kotoba-android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 const main=fs.readFileSync(new URL('../../kotoba-android/app/src/main/java/com/studio501/kotoba/MainActivity.java',import.meta.url),'utf8');
 assert.doesNotMatch(manifestXml,/android\.permission\.INTERNET|TTS_SERVICE/);
 assert.doesNotMatch(main,/TextToSpeech|speech\.tts|case "speak"|stopSpeech/);
 assert.match(main,/setMediaPlaybackRequiresUserGesture\(false\)/);
});
test('web audio runtime uses only bundled files, not speech synthesis or network TTS',()=>{
 const audio=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');
 assert.doesNotMatch(audio,/speechSynthesis|SpeechSynthesisUtterance|callNative\(['"]speak/);
 assert.match(audio,/audio-manifest\.json/);assert.match(audio,/data\/audio/);
});
test('audio attribution is recorded for commercial redistribution',()=>{
 assert.equal(manifest.voiceLicense,'CC BY 3.0');assert.match(manifest.voice,/NIT ATR503 M001/);assert.match(manifest.attribution,/Nagoya Institute of Technology/);
});
