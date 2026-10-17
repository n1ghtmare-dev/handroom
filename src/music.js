// Musical scenes: every melody pool is a pentatonic subset of the current chord's key.
// Bass, chord voicings, tuned percussion and tempo effects share the same scene.
export const VOICES = [
  {id:'keys',name:'Бархатные клавиши',description:'Мягкая атака и тёплые обертоны'},
  {id:'mallet',name:'Деревянная маримба',description:'Короткие округлые ноты'},
  {id:'pad',name:'Воздушный пэд',description:'Плавные, протяжённые ноты'},
];
const chord=(name,root,voicing,leadRoot,minor=false)=>({name,root,voicing,leadRoot,minor});
export const SCENES = [
  {id:'velvet',name:'Тёплый грув',key:'Ля минор',bpm:86,swing:.14,voice:'keys',kit:'velvet',space:.22,
    description:'Бархатные клавиши, упругий бас и мягкий бит.',
    chords:[chord('Am7',45,[55,60,64,67],69,true),chord('Fmaj7',41,[52,57,60,65],65),chord('Cmaj7',48,[55,59,64,67],67),chord('G6',43,[55,59,62,64],67)],
    pattern:[[0,7,8,14],[4,12],[0,2,4,6,8,10,12,14],[12]],
    bass:[{step:0,offset:0,length:4.5,velocity:.75},{step:6,offset:7,length:1.5,velocity:.52},{step:8,offset:0,length:4.5,velocity:.68},{step:14,offset:12,length:1.4,velocity:.48}]},
  {id:'daylight',name:'Светлый день',key:'До мажор',bpm:104,swing:.05,voice:'mallet',kit:'organic',space:.16,
    description:'Деревянная маримба, лёгкие аккорды и живой ритм.',
    chords:[chord('Cmaj7',48,[55,59,64,67],72),chord('Am7',45,[55,60,64,69],69,true),chord('Fmaj7',41,[52,57,60,65],65),chord('Gsus2',43,[55,57,62,67],67)],
    pattern:[[0,6,8,11],[4,12],[0,2,4,6,8,10,12,14],[4,12]],
    bass:[{step:0,offset:0,length:3,velocity:.7},{step:4,offset:12,length:2,velocity:.43},{step:8,offset:0,length:3,velocity:.63},{step:12,offset:7,length:2.4,velocity:.48}]},
  {id:'drift',name:'Ночной воздух',key:'Ре минор',bpm:72,swing:.02,voice:'pad',kit:'air',space:.38,
    description:'Воздушные пэды, глубокий бас и редкая перкуссия.',
    chords:[chord('Dm7',38,[57,60,65,69],69,true),chord('B♭maj7',46,[53,57,62,65],70),chord('Fmaj7',41,[52,57,60,65],65),chord('Csus2',48,[55,60,62,67],67)],
    pattern:[[0,10],[8],[2,6,10,14],[]],
    bass:[{step:0,offset:0,length:6.8,velocity:.62},{step:10,offset:7,length:4.5,velocity:.45}]},
];
export const DEFAULT_MIX = {drums:.76,bass:.65,chords:.52,melody:.8};
export function getScene(id){return SCENES.find(scene=>scene.id===id)||SCENES[0];}
export function scenePattern(scene){return scene.pattern.map(indices=>Array.from({length:16},(_,step)=>indices.includes(step)));}
export function chordAt(scene,bar=0){return scene.chords[((bar%scene.chords.length)+scene.chords.length)%scene.chords.length];}
export function melodyNotes(scene,bar=0,count=8){
  const c=chordAt(scene,bar),intervals=c.minor?[0,3,5,7,10]:[0,2,4,7,9];
  // Cmaj7 and Csus2 voicings use C major, not the bass fifth G.
  const root=c.name.startsWith('C')?72:c.leadRoot;
  return Array.from({length:count},(_,i)=>root+intervals[i%5]+12*Math.floor(i/5));
}
export function midiHz(midi){return 440*2**((midi-69)/12);}
export function noteName(midi){return ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][((Math.round(midi)%12)+12)%12]+(Math.floor(midi/12)-1);}
export function stepDuration(step,bpm,swing=0){return 60/bpm/4*(step%2===0?1+swing:1-swing);}
export function gridTime(step,bpm,swing=0){return 60/bpm/4*(step+(step%2?swing:0));}
export function assistedTime(now,origin,bpm,swing=0,maxDelay=.045){
  if(now<origin)return origin-now<=maxDelay?origin:now;
  const base=60/bpm/4,estimate=Math.floor((now-origin)/base);
  for(let i=Math.max(0,estimate-1);i<=estimate+2;i++){
    const time=origin+gridTime(i,bpm,swing);
    if(time>=now-1e-6)return time-now<=maxDelay?Math.max(now,time):now;
  }
  return now;
}
export function quantizedHandIndex(height,previous,count=12){
  const value=Math.max(0,Math.min(.999999,1-height)),candidate=Math.floor(value*count);
  if(previous!==null&&previous!==undefined&&candidate!==previous){
    const low=(previous-.1)/count,high=(previous+1.1)/count;
    if(value>=low&&value<=high)return previous;
  }
  return candidate;
}
// Strong beats are firmer; offbeats are quieter. Deterministic variation avoids machine-gun hats.
export function grooveVelocity(track,step,bar=0){
  const base=track===2?(step%4===0?.52:.34):track===0?.82:track===1?.62:.33;
  return base*(.95+.05*Math.sin(step*2.3+bar*.9+track));
}
