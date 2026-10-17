import test from 'node:test';
import assert from 'node:assert/strict';
import {InstrumentInterpreter,pianoKeys,drumZones} from '../src/instruments.js';
const bounds={x:.1,y:.4,width:.8,height:.3},keys=pianoKeys(bounds);
function hand(x,y,side='Left'){return {side,points:Array.from({length:21},()=>({x,y,z:0}))};}
function player(options={}){const interpreter=new InstrumentInterpreter();let time=0;return {step:(hands,dt=40)=>interpreter.update(hands,time+=dt,keys,{fingers:1,...options}),interpreter};}
function press(p,x=.15){p.step([hand(x,.52)]);p.step([hand(x,.56)]);return p.step([hand(x,.66)]);}
test('piano layout has 13 chromatic notes with separate black/white strike lines',()=>{
 assert.deepEqual(keys.map(k=>k.midi).sort((a,b)=>a-b),Array.from({length:13},(_,i)=>i+60));
 assert.equal(keys.filter(k=>k.black).length,5);assert.equal(pianoKeys(bounds,1)[0].midi,72);
});
test('a downward crossing starts one note, holding does not repeat, lifting releases and rearms',()=>{
 const p=player();assert.equal(press(p).on[0]?.midi,60);
 for(let i=0;i<5;i++)assert.equal(p.step([hand(.15,.66)]).on.length,0);
 assert.equal(p.step([hand(.15,.5)]).off.length,1);
 assert.equal(p.step([hand(.15,.66)]).on.length,1);
});
test('new detection inside keys, stationary jitter and sideways motion are silent',()=>{
 const p=player();for(const [x,y]of [[.15,.66],[.15,.661],[.15,.659],[.2,.66],[.3,.66]])assert.equal(p.step([hand(x,y)]).on.length,0);
});
test('independent hands support a chord and missing hands release every voice',()=>{
 const p=player();p.step([hand(.15,.5),hand(.35,.5,'Right')]);
 const chord=p.step([hand(.15,.67),hand(.35,.67,'Right')]);assert.equal(chord.on.length,2);assert.equal(new Set(chord.on.map(x=>x.token)).size,2);
 assert.equal(p.step([]).off.length,2);assert.equal(p.step([hand(.15,.67)]).on.length,0);
});
test('tracking gaps release old voices and do not retrigger from a stale position',()=>{
 const p=player();press(p);const result=p.step([hand(.15,.68)],240);assert.equal(result.off.length,1);assert.equal(result.on.length,0);
});
test('black key locks its note on descent and a lateral exit releases it',()=>{
 const p=player();p.step([hand(.2,.42)]);const down=p.step([hand(.2,.57)]);assert.equal(down.on[0]?.midi,61);
 assert.equal(p.step([hand(.2,.69)]).on.length,0);assert.equal(p.step([hand(.8,.69)]).off.length,1);
});
test('faster downward strikes have greater velocity and drum hold does not retrigger',()=>{
 const slow=player(),fast=player();slow.step([hand(.15,.56)]);fast.step([hand(.15,.49)]);
 const a=slow.step([hand(.15,.64)],120),b=fast.step([hand(.15,.70)]);assert.ok(b.on[0].velocity>a.on[0].velocity);
 const drums=new InstrumentInterpreter(),zones=drumZones(bounds);drums.update([hand(.15,.45)],0,zones,{fingers:1});
 assert.equal(drums.update([hand(.15,.65)],40,zones,{fingers:1}).on[0]?.index,0);
 assert.equal(drums.update([hand(.15,.65)],80,zones,{fingers:1}).on.length,0);
 assert.equal(drums.reset().length,1);
});
