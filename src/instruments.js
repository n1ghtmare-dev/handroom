// All positions use the same mirrored, letterboxed stage coordinates as the video.
export const WHITE_NOTES=[60,62,64,65,67,69,71,72];
export const BLACK_KEYS=[{midi:61,after:0},{midi:63,after:1},{midi:66,after:3},{midi:68,after:4},{midi:70,after:5}];
export const KEY_CODES={KeyA:60,KeyS:62,KeyD:64,KeyF:65,KeyJ:67,KeyK:69,KeyL:71,Semicolon:72,KeyW:61,KeyE:63,KeyT:66,KeyY:68,KeyU:70};
export const SOLFEGE=['До','До♯','Ре','Ре♯','Ми','Фа','Фа♯','Соль','Соль♯','Ля','Ля♯','Си'];
export function pianoKeys(bounds,octave=0){
  const w=bounds.width/8;
  return [
    ...WHITE_NOTES.map((midi,i)=>({id:`key-${midi}`,midi:midi+octave*12,black:false,x:bounds.x+i*w,y:bounds.y,width:w,height:bounds.height,line:bounds.y+bounds.height*.70})),
    ...BLACK_KEYS.map(({midi,after})=>({id:`key-${midi}`,midi:midi+octave*12,black:true,x:bounds.x+(after+.69)*w,y:bounds.y,width:w*.62,height:bounds.height*.59,line:bounds.y+bounds.height*.32})),
  ];
}
export function drumZones(bounds){
  return Array.from({length:8},(_,i)=>({id:`drum-${i}`,index:i,x:bounds.x+i*bounds.width/8,y:bounds.y,width:bounds.width/8,height:bounds.height,line:bounds.y+bounds.height*.48}));
}
function inX(point,key,margin=0){return point.x>=key.x-margin&&point.x<key.x+key.width+margin;}
export class InstrumentInterpreter{
  constructor(){this.states=new Map();}
  reset(){const off=[...this.states.values()].filter(s=>s.active).map(s=>({id:s.active.id,token:s.token}));this.states.clear();return off;}
  update(hands,now,keys,{drums=false,fingers=2}={}){
    const on=[],off=[],cursors=[],seen=new Set();
    for(const hand of hands){
      if(hand.points.length!==21)continue;
      for(const [finger,tip]of [8,12,16,20].slice(0,fingers).entries()){
        const p=hand.points[tip];if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
        const token=`${hand.side}-${tip}`;seen.add(token);
        let s=this.states.get(token);
        // A newly detected finger inside the instrument is silent until it is lifted.
        if(!s||now-s.time>180){if(s?.active)off.push({id:s.active.id,token});s={x:p.x,y:p.y,time:now,active:null,armed:new Set(),last:-Infinity};}
        const dt=Math.max(8,now-s.time),y=s.y+(p.y-s.y)*.72,x=s.x+(p.x-s.x)*.8;
        const point={x,y},travel=y-s.y,speed=travel/(dt/1000);
        if(s.active){
          const key=s.active;
          if(y<key.line-.022||!inX(point,key,.035)||y>key.y+key.height+.07){off.push({id:key.id,token});s.active=null;s.armed.clear();}
        }
        for(const key of keys)if(y<key.line-.025)s.armed.add(key.id);
        if(!s.active&&now-s.last>110&&travel>.0015&&speed>.045){
          const crossed=keys.filter(key=>s.armed.has(key.id)&&inX(point,key)&&s.y<key.line&&y>=key.line);
          // Black keys have their own, higher strike line and take precedence at a crossing.
          crossed.sort((a,b)=>a.line-b.line||Number(b.black)-Number(a.black));
          const key=crossed[0];
          if(key){
            const velocity=Math.max(.3,Math.min(.95,.33+speed*.44));
            on.push({id:key.id,midi:key.midi,index:key.index,token,velocity});
            s.active=key;s.armed.clear();s.last=now;
          }
        }
        cursors.push({x,y,side:hand.side,finger,active:s.active?.id||null});
        s.x=x;s.y=y;s.time=now;this.states.set(token,s);
      }
    }
    for(const [token,s]of this.states)if(!seen.has(token)){if(s.active)off.push({id:s.active.id,token});this.states.delete(token);}
    return {on,off,cursors,active:new Set([...this.states.values()].filter(s=>s.active).map(s=>s.active.id))};
  }
}
