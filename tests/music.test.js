import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCENES,getScene,scenePattern,melodyNotes,chordAt,midiHz,noteName,stepDuration,gridTime,assistedTime,quantizedHandIndex,grooveVelocity} from '../src/music.js';
test('every scene/chord has a playable, ascending, semitone-free melody pool',()=>{
  for(const scene of SCENES)for(let bar=0;bar<4;bar++){
    const notes=melodyNotes(scene,bar,10);assert.equal(notes.length,10);
    assert.ok(notes.every((n,i)=>n>=60&&n<=110&&(i===0||n>notes[i-1])));
    const pcs=[...new Set(notes.map(n=>n%12))];assert.equal(pcs.length,5);
    for(const a of pcs)for(const b of pcs)assert.notEqual((a-b+12)%12,1,`${scene.id} ${bar}: semitone cluster`);
    assert.ok(chordAt(scene,bar).root<Math.min(...chordAt(scene,bar).voicing));
  }
});
test('scene patterns are independent editable 4 x 16 arrays',()=>{for(const s of SCENES){const a=scenePattern(s),b=scenePattern(s);assert.equal(a.length,4);assert.ok(a.every(r=>r.length===16));a[0][0]=!a[0][0];assert.notDeepEqual(a,b);}});
test('swung bars keep their exact total duration over a long loop',()=>{for(const scene of SCENES){let time=0;for(let i=0;i<1600;i++){assert.ok(Math.abs(time-gridTime(i,scene.bpm,scene.swing))<1e-9);time+=stepDuration(i,scene.bpm,scene.swing);}assert.ok(Math.abs(time-400*60/scene.bpm)<1e-8);}});
test('rhythm assistance never plays early or adds more than 45ms latency',()=>{for(const scene of SCENES)for(let i=0;i<1000;i++){const now=.1+i*.0037,t=assistedTime(now,.1,scene.bpm,scene.swing);assert.ok(t>=now-1e-6&&t-now<=.045001);}});
test('theremin ignores jitter near a note boundary and clamps hand positions',()=>{assert.equal(quantizedHandIndex(.9,null,10),0);assert.equal(quantizedHandIndex(.89,0,10),0);assert.equal(quantizedHandIndex(.85,0,10),1);assert.equal(quantizedHandIndex(-3,null,10),9);assert.equal(quantizedHandIndex(3,null,10),0);});
test('scene fallbacks, tuning and note names are consistent',()=>{assert.equal(getScene('missing'),SCENES[0]);assert.equal(chordAt(SCENES[0],4),SCENES[0].chords[0]);assert.equal(noteName(69),'A4');assert.equal(midiHz(69),440);assert.ok(grooveVelocity(2,0)>grooveVelocity(2,2));});
