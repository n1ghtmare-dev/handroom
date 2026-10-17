import { getScene, chordAt, melodyNotes, midiHz, noteName, DEFAULT_MIX, quantizedHandIndex } from './music.js';

export class AudioEngine {
  constructor(context=null){
    this.ctx=context;this.built=false;this.volume=.72;this.reverb=.22;
    this.scene=getScene('velvet');this.tone=this.scene.voice;this.kit=this.scene.kit;
    this.bpm=this.scene.bpm;this.mix={...DEFAULT_MIX};this.voices=new Set();this.sends=new Map();
    this.harmony=[{time:-Infinity,bar:0}];this.seed=1731;
  }
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  async init(){
    if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
    if(!this.built)this.build();
    if(this.ctx.state==='suspended'&&typeof this.ctx.startRendering!=='function'&&typeof this.ctx.resume==='function')await this.ctx.resume();
  }
  build(){
    const c=this.ctx;this.built=true;
    this.master=c.createGain();this.master.gain.value=this.volume;
    const highpass=c.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=27;highpass.Q.value=.5;
    const lowpass=c.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=14500;lowpass.Q.value=.5;
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-8;this.limiter.knee.value=5;
    this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.16;
    // A smooth final guard stays linear below its knee and catches dense accidental clusters.
    this.safety=c.createWaveShaper();const curve=new Float32Array(4097);
    for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1,a=Math.abs(x);curve[i]=a<=.75?x:Math.sign(x)*(.75+.2*(1-Math.exp(-(a-.75)/.2)));}
    this.safety.curve=curve;this.safety.oversample='2x';
    this.output=c.createGain();this.output.gain.value=.88;
    this.analyser=c.createAnalyser();this.analyser.fftSize=256;
    this.master.connect(highpass);highpass.connect(lowpass);lowpass.connect(this.limiter);
    this.limiter.connect(this.safety);this.safety.connect(this.output);this.output.connect(this.analyser);this.analyser.connect(c.destination);
    this.buses={};
    // Separate musical registers and effects sends keep the bass and kick dry and focused.
    const cutoffs={drums:[36,13000],bass:[30,1400],chords:[210,5100],melody:[160,7800]};
    for(const name of Object.keys(DEFAULT_MIX)){
      const gain=c.createGain(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter();
      gain.gain.value=this.mix[name];hp.type='highpass';hp.frequency.value=cutoffs[name][0];hp.Q.value=.6;
      lp.type='lowpass';lp.frequency.value=cutoffs[name][1];lp.Q.value=.55;
      gain.connect(hp);hp.connect(lp);lp.connect(this.master);this.buses[name]=gain;
    }
    this.room=c.createConvolver();this.room.buffer=this.impulse(1.65);this.room.normalize=true;
    this.roomTone=c.createBiquadFilter();this.roomTone.type='lowpass';this.roomTone.frequency.value=5600;
    this.wet=c.createGain();this.wet.gain.value=this.reverb*.38;
    this.room.connect(this.roomTone);this.roomTone.connect(this.wet);this.wet.connect(this.master);
    this.delay=c.createDelay(2);this.delay.delayTime.value=60/this.bpm*.75;
    const echoTone=c.createBiquadFilter();echoTone.type='lowpass';echoTone.frequency.value=2600;
    this.feedback=c.createGain();this.feedback.gain.value=.17;
    this.delayWet=c.createGain();this.delayWet.gain.value=this.reverb*.35;
    this.delay.connect(echoTone);echoTone.connect(this.feedback);this.feedback.connect(this.delay);
    echoTone.connect(this.delayWet);this.delayWet.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
    const noise=this.noise.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=this.random()*2-1;
  }
  impulse(seconds){
    const c=this.ctx,b=c.createBuffer(2,Math.floor(c.sampleRate*seconds),c.sampleRate);
    for(let ch=0;ch<2;ch++){const data=b.getChannelData(ch);for(let i=0;i<data.length;i++){const t=i/c.sampleRate;data[i]=(this.random()*2-1)*Math.exp(-t*4.6)*(t<.012?t/.012:1);}}
    return b;
  }
  setScene(scene){
    this.scene=scene;this.kit=scene.kit;this.tone=scene.voice;this.harmony=[{time:-Infinity,bar:0}];
    this.setTempo(scene.bpm);this.setReverb(scene.space);this.silenceTheremin();this.thereminIndex=null;
  }
  setTempo(value){this.bpm=value;if(this.built)this.delay.delayTime.setTargetAtTime(60/value*.75,this.ctx.currentTime,.06);}
  setVolume(value){this.volume=value;if(this.built)this.master.gain.setTargetAtTime(value,this.ctx.currentTime,.025);}
  setReverb(value){this.reverb=value;if(this.built){this.wet.gain.setTargetAtTime(value*.38,this.ctx.currentTime,.05);this.delayWet.gain.setTargetAtTime(value*.35,this.ctx.currentTime,.05);}}
  setMix(name,value){if(!(name in DEFAULT_MIX))return;this.mix[name]=Math.max(0,Math.min(1,value));if(this.built){this.buses[name].gain.cancelScheduledValues(this.ctx.currentTime);this.buses[name].gain.setTargetAtTime(this.mix[name],this.ctx.currentTime,.025);for(const [send,meta]of this.sends)if(meta.bus===name)send.gain.setTargetAtTime(meta.amount*this.mix[name],this.ctx.currentTime,.025);}}
  setHarmony(bar,time){this.harmony.push({bar,time});if(this.harmony.length>32)this.harmony=this.harmony.slice(-24);}
  barAt(time=this.ctx?.currentTime||0){for(let i=this.harmony.length-1;i>=0;i--)if(this.harmony[i].time<=time+1e-6)return this.harmony[i].bar;return 0;}
  notes(time=this.ctx?.currentTime||0,count=8){return melodyNotes(this.scene,this.barAt(time),count);}
  noteNames(time=this.ctx?.currentTime||0){return this.notes(time).map(noteName);}
  envelope(time,duration,level,attack=.007,release=.08){
    const gain=this.ctx.createGain();gain.gain.value=0;
    gain.gain.setValueAtTime(.00001,time);gain.gain.linearRampToValueAtTime(level,time+attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(.00003,level*.36),time+Math.max(attack+.01,duration*.55));
    gain.gain.exponentialRampToValueAtTime(.00001,time+duration+release);
    return gain;
  }
  route(envelope,bus,space=0,echo=0,pan=0){
    const nodes=[];let output=envelope;
    if(pan&&this.ctx.createStereoPanner){const panner=this.ctx.createStereoPanner();panner.pan.value=pan;output.connect(panner);output=panner;nodes.push(panner);}
    output.connect(this.buses[bus]);
    if(space){const send=this.ctx.createGain();send.gain.value=space*this.mix[bus];this.sends.set(send,{bus,amount:space});output.connect(send);send.connect(this.room);nodes.push(send);}
    if(echo){const send=this.ctx.createGain();send.gain.value=echo*this.mix[bus];this.sends.set(send,{bus,amount:echo});output.connect(send);send.connect(this.delay);nodes.push(send);}
    return nodes;
  }
  track(sources,envelope,nodes,time,end,tag='live',group=''){
    const voice={sources,envelope,nodes,time,end,tag,group};this.voices.add(voice);
    const concurrent=[...this.voices].filter(v=>v.time<=time&&v.end>time);
    if(concurrent.length>64){const oldest=concurrent.find(v=>v!==voice&&v.tag==='live');if(oldest)this.releaseVoice(oldest,time,.035);}
    let remaining=sources.length;
    for(const source of sources){source.onended=()=>{if(--remaining===0){sources.forEach(n=>n.disconnect());envelope.disconnect();nodes.forEach(n=>{n.disconnect();this.sends.delete(n);});this.voices.delete(voice);}};source.start(time);source.stop(end);}
    return voice;
  }
  releaseVoice(voice,time=this.ctx.currentTime,release=.035){
    if(voice.end<=time)return;
    voice.envelope.gain.cancelScheduledValues(time);
    // A cancellation may precede a scheduled attack; such a voice must remain silent.
    voice.envelope.gain.setValueAtTime(voice.time>time?.00001:Math.max(.00001,voice.envelope.gain.value),time);
    voice.envelope.gain.exponentialRampToValueAtTime(.00001,time+release);
    voice.sources.forEach(s=>{try{s.stop(time+release+.005);}catch{}});voice.end=time+release+.005;
  }
  stopBacking(){if(!this.built)return;for(const voice of this.voices)if(voice.tag==='backing')this.releaseVoice(voice);this.silenceTheremin();}
  panic(){if(!this.built)return;for(const voice of this.voices)this.releaseVoice(voice);this.silenceTheremin();}
  oscillator(freq,type,time,duration,volume=.2,endFreq=null,bus='melody',tag='live',space=.25){
    const c=this.ctx,osc=c.createOscillator(),env=this.envelope(time,duration,volume,.004,.025);
    osc.type=type;osc.frequency.setValueAtTime(freq,time);
    if(endFreq)osc.frequency.exponentialRampToValueAtTime(endFreq,time+duration*.7);
    osc.connect(env);const nodes=this.route(env,bus,space,0);
    return this.track([osc],env,nodes,time,time+duration+.04,tag);
  }
  noiseHit(time,duration,frequency,type='highpass',volume=.1,tag='live',group='',space=.1){
    const c=this.ctx,src=c.createBufferSource(),filter=c.createBiquadFilter(),env=this.envelope(time,duration,volume,.002,.012);
    src.buffer=this.noise;filter.type=type;filter.frequency.value=Math.min(frequency,c.sampleRate*.44);filter.Q.value=.65;
    src.connect(filter);filter.connect(env);const nodes=[filter,...this.route(env,'drums',space,0)];
    return this.track([src],env,nodes,time,time+duration+.025,tag,group);
  }
  hit(index,mode='drums',time=this.ctx?.currentTime,velocity=.72,options={}){
    if(!this.built||!Number.isFinite(time))return;
    if(mode==='synth'){this.melody(this.notes(time)[index],'melody',time,velocity,this.tone,options.tag||'live');return;}
    const tag=options.tag||'live',v=Math.max(.12,Math.min(1,velocity));
    const organic=this.kit==='organic',air=this.kit==='air';
    if(index===0){
      const tail=midiHz(24+(chordAt(this.scene,0).root%12));
      this.oscillator(organic?145:165,'sine',time,air?.48:.32,.66*v,tail,'drums',tag,0);
      this.oscillator(tail*2,'sine',time,.13,.14*v,tail*1.65,'drums',tag,0);
      this.noiseHit(time,.014,1800,'lowpass',.075*v,tag,'',0);
      // Leave room for the bass underneath each kick without pumping the melody.
      const gain=this.buses.bass.gain;gain.setValueAtTime(this.mix.bass*.58,time);gain.setTargetAtTime(this.mix.bass,time+.025,.055);
    }
    if(index===1){this.noiseHit(time,organic?.13:.17,organic?1900:2300,'bandpass',.30*v,tag,'',.12);this.oscillator(185,'triangle',time,.075,.12*v,112,'drums',tag,.04);}
    if(index===2){
      // Closed hats choke the open hat, like the same physical cymbal.
      for(const voice of this.voices)if(voice.group==='hat-open'&&voice.time<=time)this.releaseVoice(voice,time,.012);
      this.noiseHit(time,.045,organic?6500:7800,'highpass',.105*v,tag,'hat-closed',.025);
    }
    if(index===3)this.noiseHit(time,air?.42:.23,organic?5900:6900,'highpass',.12*v,tag,'hat-open',.1);
    if(index===4){for(let i=0;i<3;i++)this.noiseHit(time+i*.012,.065,1250,'bandpass',.11*v,tag,'',.2);}
    if(index===5){const root=chordAt(this.scene,this.barAt(time)).root;this.oscillator(midiHz(root+12)*1.7,'sine',time,.24,.32*v,midiHz(root+12),'drums',tag,.06);}
    if(index===6){const f=midiHz(chordAt(this.scene,this.barAt(time)).root+24);this.oscillator(f,'triangle',time,.065,.13*v,null,'drums',tag,.12);this.noiseHit(time,.022,2100,'bandpass',.07*v,tag,'',.04);}
    if(index===7){this.noiseHit(time,air?1.1:.75,6100,'highpass',.095*v,tag,'',.22);this.oscillator(1050,'sine',time,.28,.013*v,null,'drums',tag,.15);}
  }
  melody(midi,bus,time,velocity=.7,voice='keys',tag='live',gate=null,pan=0){
    const c=this.ctx,f=midiHz(midi),sources=[],partialGains=[],filter=c.createBiquadFilter();
    const isPad=voice==='pad',isMallet=voice==='mallet';
    const duration=gate??(isPad?1.5:isMallet?.48:.85),attack=isPad?.14:.006,release=isPad?.6:.13;
    const level=(bus==='chords'?.065:isPad?.13:isMallet?.24:.19)*velocity;
    const env=this.envelope(time,duration,level,attack,release);
    filter.type='lowpass';filter.frequency.setValueAtTime(isPad?1800:isMallet?5200:3900,time);
    filter.frequency.exponentialRampToValueAtTime(isPad?1100:1700,time+duration);filter.Q.value=.45;
    const partials=isMallet?[[1,1],[2,.24],[3.98,.07]]:isPad?[[1,.65],[1.003,.35],[2,.13]]:[[1,1],[2,.26],[3,.075]];
    for(const [ratio,weight]of partials){const osc=c.createOscillator(),gain=c.createGain();osc.type='sine';osc.frequency.value=f*ratio;gain.gain.value=weight;osc.connect(gain);gain.connect(filter);sources.push(osc);partialGains.push(gain);}
    filter.connect(env);const nodes=[filter,...partialGains,...this.route(env,bus,isPad?.65:.28,bus==='melody'?.24:0,pan)];
    // Oscillator partial gains are disconnected with the voice as well.
    return this.track(sources,env,nodes,time,time+duration+release+.02,tag);
  }
  noteOn(midi,velocity=.7){
    if(!this.built)return null;
    const c=this.ctx,time=c.currentTime+.004,f=midiHz(midi),sources=[],nodes=[],env=c.createGain(),filter=c.createBiquadFilter();
    const pad=this.tone==='pad',mallet=this.tone==='mallet',level=(pad?.15:mallet?.22:.18)*Math.max(.15,Math.min(1,velocity));
    env.gain.setValueAtTime(.00001,time);env.gain.linearRampToValueAtTime(level,time+(pad?.12:.008));
    env.gain.exponentialRampToValueAtTime(level*(mallet?.10:.58),time+(mallet?.65:.4));
    filter.type='lowpass';filter.Q.value=.45;filter.frequency.setValueAtTime(pad?1900:mallet?5000:3800,time);
    filter.frequency.exponentialRampToValueAtTime(pad?1400:1800,time+.7);
    const partials=mallet?[[1,1],[2,.22],[3.98,.065]]:pad?[[1,.65],[1.003,.35],[2,.13]]:[[1,1],[2,.26],[3,.075]];
    for(const [ratio,weight]of partials){const osc=c.createOscillator(),gain=c.createGain();osc.type='sine';osc.frequency.value=f*ratio;gain.gain.value=weight;osc.connect(gain);gain.connect(filter);sources.push(osc);nodes.push(gain);}
    filter.connect(env);nodes.push(filter,...this.route(env,'melody',pad?.65:.28,.16));
    // Safety timeout is also used if a device disconnects before note-off arrives.
    return this.track(sources,env,nodes,time,time+120,'instrument');
  }
  noteOff(voice){if(voice&&this.built)this.releaseVoice(voice,this.ctx.currentTime,this.tone==='pad'?.28:.10);}
  bass(midi,time,duration,velocity=.65){
    const c=this.ctx,osc=c.createOscillator(),sub=c.createOscillator(),subGain=c.createGain(),filter=c.createBiquadFilter();
    const env=this.envelope(time,duration,.32*velocity,.015,.08);
    osc.type='triangle';osc.frequency.value=midiHz(midi);sub.type='sine';sub.frequency.value=midiHz(midi);subGain.gain.value=.35;
    filter.type='lowpass';filter.frequency.value=550;filter.Q.value=.5;
    osc.connect(filter);sub.connect(subGain);subGain.connect(filter);filter.connect(env);
    return this.track([osc,sub],env,[subGain,filter,...this.route(env,'bass',0,0)],time,time+duration+.10,'backing');
  }
  backing(step,bar,time,bpm=this.bpm){
    const c=chordAt(this.scene,bar),quarter=60/bpm,unit=quarter/4;
    if(step===0){
      this.setHarmony(bar,time);
      c.voicing.forEach((midi,i)=>this.melody(midi,'chords',time+i*.008,.8,this.scene.id==='drift'?'pad':'keys','backing',quarter*3.1,(i-1.5)*.16));
    }
    for(const event of this.scene.bass)if(event.step===step)this.bass(c.root+event.offset,time,event.length*unit,event.velocity);
  }
  theremin(hands){
    if(!this.built)return;const time=this.ctx.currentTime;
    if(!this.thereminOsc){
      this.thereminOsc=this.ctx.createOscillator();this.thereminOsc.type='sine';
      this.thereminGain=this.ctx.createGain();this.thereminGain.gain.value=0;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2400;
      this.thereminOsc.connect(filter);filter.connect(this.thereminGain);this.route(this.thereminGain,'melody',.45,.16);this.thereminOsc.start();
    }
    const right=hands.find(h=>h.side==='Right'),left=hands.find(h=>h.side==='Left');
    const volume=right?(left?Math.max(0,Math.min(.14,(1-left.points[0].y)*.2)):.085):0;
    this.thereminGain.gain.setTargetAtTime(volume,time,.035);
    if(right){this.thereminIndex=quantizedHandIndex(right.points[8].y,this.thereminIndex,10);const midi=this.notes(time,10)[this.thereminIndex];this.thereminOsc.frequency.setTargetAtTime(midiHz(midi),time,.025);this.lastThereminNote=noteName(midi);return midiHz(midi);}
    this.thereminIndex=null;
  }
  silenceTheremin(){if(this.thereminGain)this.thereminGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);this.thereminIndex=null;}
  click(time,accent=false){this.oscillator(accent?1200:900,'sine',time,.022,.055,null,'drums','backing',0);}
  async startRecording(){
    await this.init();if(!window.MediaRecorder)throw new Error('Запись недоступна в этом браузере. Попробуйте Chrome или Edge.');
    this.destination=this.ctx.createMediaStreamDestination();this.output.connect(this.destination);
    const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    this.recorder=new MediaRecorder(this.destination.stream,type?{mimeType:type}:{});
    this.chunks=[];this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};this.recorder.start(200);
  }
  stopRecording(){return new Promise((resolve,reject)=>{
    if(!this.recorder||this.recorder.state==='inactive'){reject(new Error('Нет активной записи'));return;}
    this.recorder.onerror=e=>reject(e.error||new Error('Ошибка записи'));
    this.recorder.onstop=()=>{this.output.disconnect(this.destination);this.destination.stream.getTracks().forEach(t=>t.stop());resolve(new Blob(this.chunks,{type:this.recorder.mimeType}));};this.recorder.stop();
  });}
}
