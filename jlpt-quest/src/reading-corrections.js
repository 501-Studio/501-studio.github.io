// These exact legacy IDs are retained so a pronunciation repair cannot erase progress.
// No general permission to bypass stable-ID or pack validation is granted.
export const READING_CORRECTIONS=Object.freeze({
 'N5-cgfly3':Object.freeze({level:'N5',word:'十',oldReading:'じゅう とお',reading:'じゅう',alternatives:['とお']}),
 'N3-1b97nrt':Object.freeze({level:'N3',word:'とん',oldReading:'(1000',reading:'とん',alternatives:[]}),
 'N3-1d6ofkx':Object.freeze({level:'N3',word:'賛成',oldReading:'Uӣ[い',reading:'さんせい',alternatives:[]})
});
export function applyReadingCorrection(word){
 const c=READING_CORRECTIONS[word?.id];
 if(!c)return word;
 if(word.level!==c.level||word.word!==c.word||![c.oldReading,c.reading].includes(word.reading))throw new Error('읽기 교정 대상이 일치하지 않습니다.');
 return {...word,reading:c.reading,sourceReading:c.oldReading,alternateReadings:[...c.alternatives],readingRevision:1};
}
export function isCorrectedStableId(word){
 const c=READING_CORRECTIONS[word?.id];
 return !!c&&word.level===c.level&&word.word===c.word&&word.reading===c.reading&&word.sourceReading===c.oldReading&&word.readingRevision===1;
}
