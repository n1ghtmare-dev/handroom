// MediaPipe Hand Landmarker architecture studied in Ekmand/gesture-synth.
// Independent gesture mapping for finger instruments, using scale-normalized pinch ratios.
export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const TIPS = [8,12,16,20];
export const PADS = [
  { name:'Бочка', en:'KICK', key:'A', finger:'Указательный · Л', note:48, frequency:130.81 },
  { name:'Малый', en:'SNARE', key:'S', finger:'Средний · Л', note:51, frequency:155.56 },
  { name:'Хай-хэт', en:'CLOSED HAT', key:'D', finger:'Безымянный · Л', note:53, frequency:174.61 },
  { name:'Открытый хэт', en:'OPEN HAT', key:'F', finger:'Мизинец · Л', note:55, frequency:196.00 },
  { name:'Хлопок', en:'CLAP', key:'J', finger:'Указательный · П', note:58, frequency:233.08 },
  { name:'Том', en:'TOM', key:'K', finger:'Средний · П', note:60, frequency:261.63 },
  { name:'Ковбелл', en:'COWBELL', key:'L', finger:'Безымянный · П', note:63, frequency:311.13 },
  { name:'Крэш', en:'CRASH', key:';', finger:'Мизинец · П', note:65, frequency:349.23 },
];
export const NOTE_NAMES = ['C3','E♭3','F3','G3','B♭3','C4','E♭4','F4'];
export function distance(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
export function pinchRatio(points, tip) {
  return distance(points[4], points[tip]) / Math.max(distance(points[0], points[9]), .025);
}
export class GestureInterpreter {
  constructor() { this.states = new Map(); }
  reset() { this.states.clear(); }
  update(hands, now, sensitivity = 55) {
    const hits = [], active = new Set(), seen = new Set();
    const close = .22 + sensitivity / 250;
    for (const hand of hands) {
      if (hand.points.length !== 21) continue;
      TIPS.forEach((tip, finger) => {
        const id = `${hand.side}-${finger}`;
        seen.add(id);
        const prev = this.states.get(id) || { pinched:false, last:-Infinity };
        const ratio = pinchRatio(hand.points,tip);
        const pinched = ratio < (prev.pinched ? close + .2 : close);
        const pad = (hand.side === 'Left' ? 0 : 4) + finger;
        if (pinched) active.add(pad);
        if (pinched && !prev.pinched && now-prev.last > 160) {
          hits.push(pad);
          prev.last = now;
        }
        this.states.set(id,{pinched,last:prev.last});
      });
    }
    for (const id of this.states.keys()) if (!seen.has(id)) this.states.delete(id);
    return { hits, active };
  }
}
export function defaultPattern() {
  return [ [0,6,8,10], [4,12], [0,2,4,6,8,10,12,14], [12] ]
    .map(indices=>Array.from({length:16},(_,i)=>indices.includes(i)));
}
export function encodeWav(channels, sampleRate) {
  const length=channels[0].length, count=channels.length;
  const buffer=new ArrayBuffer(44+length*count*2), view=new DataView(buffer);
  const str=(offset,s)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  str(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,count,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*count*2,true);
  view.setUint16(32,count*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*count*2,true);
  let offset=44;
  for(let i=0;i<length;i++) for(let c=0;c<count;c++) {
    const v=Math.max(-1,Math.min(1,channels[c][i]));view.setInt16(offset,v<0?v*32768:v*32767,true);offset+=2;
  }
  return buffer;
}
