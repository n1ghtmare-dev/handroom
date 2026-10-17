import { PADS } from './gestures.js';
export class AudioEngine {
  constructor() {this.ctx=null;this.volume=.72;this.reverb=.18;this.tone='warm';this.kit='electronic';this.voices=[];}
  async init() {
    if(!this.ctx) {
      this.ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
      const c=this.ctx;
      this.master=c.createGain();this.master.gain.value=this.volume;
      this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.ratio.value=8;
      this.analyser=c.createAnalyser();this.analyser.fftSize=256;
      this.master.connect(this.limiter);this.limiter.connect(this.analyser);this.analyser.connect(c.destination);
      this.delay=c.createDelay(.5);this.delay.delayTime.value=.21;
      this.wet=c.createGain();this.wet.gain.value=this.reverb;
      this.delay.connect(this.wet);this.wet.connect(this.master);
      this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const arr=this.noise.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=Math.random()*2-1;
    }
    if(this.ctx.state==='suspended') await this.ctx.resume();
  }
  setVolume(value){this.volume=value;if(this.ctx)this.master.gain.setTargetAtTime(value,this.ctx.currentTime,.02);}
  setReverb(value){this.reverb=value;if(this.ctx)this.wet.gain.setTargetAtTime(value*.6,this.ctx.currentTime,.03);}
  oscillator(freq,type,time,duration,volume=.5,endFreq=null) {
    const c=this.ctx,osc=c.createOscillator(),env=c.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,time);
    if(endFreq)osc.frequency.exponentialRampToValueAtTime(endFreq,time+duration*.75);
    env.gain.setValueAtTime(.001,time);env.gain.linearRampToValueAtTime(volume,time+.004);env.gain.exponentialRampToValueAtTime(.001,time+duration);
    osc.connect(env);env.connect(this.master);env.connect(this.delay);osc.start(time);osc.stop(time+duration+.02);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  noiseHit(time,duration,frequency,type='highpass',volume=.3){
    const c=this.ctx,src=c.createBufferSource(),filter=c.createBiquadFilter(),env=c.createGain();
    src.buffer=this.noise;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.7;
    env.gain.setValueAtTime(volume,time);env.gain.exponentialRampToValueAtTime(.001,time+duration);
    src.connect(filter);filter.connect(env);env.connect(this.master);env.connect(this.delay);src.start(time);src.stop(time+duration+.02);
    src.onended=()=>{src.disconnect();filter.disconnect();env.disconnect();};
  }
  hit(index,mode='drums',time=this.ctx?.currentTime,velocity=.8) {
    if(!this.ctx||time===undefined)return;
    if(mode==='synth') {
      const f=PADS[index].frequency;
      const type=this.tone==='bright'?'sawtooth':this.tone==='soft'?'sine':'triangle';
      this.oscillator(f,type,time,.7,.25*velocity);this.oscillator(f*2,'sine',time,.45,.07*velocity);return;
    }
    const pitch=this.kit==='acoustic'?1.25:this.kit==='lofi'?.78:1;
    const decay=this.kit==='lofi'?1.35:this.kit==='acoustic'?.72:1;
    if(index===0)this.oscillator(155*pitch,'sine',time,.43*decay,.95*velocity,38*pitch);
    if(index===1){this.noiseHit(time,.18*decay,1600*pitch,'highpass',.55*velocity);this.oscillator(185*pitch,'triangle',time,.1,.3*velocity,80);}
    if(index===2)this.noiseHit(time,.055*decay,8000*pitch,'highpass',.32*velocity);
    if(index===3)this.noiseHit(time,.34*decay,7400*pitch,'highpass',.28*velocity);
    if(index===4){for(let i=0;i<3;i++)this.noiseHit(time+i*.016,.11,1500,'bandpass',.48*velocity);}
    if(index===5)this.oscillator(260*pitch,'sine',time,.34*decay,.7*velocity,85);
    if(index===6){this.oscillator(540,'square',time,.12,.09*velocity);this.oscillator(800,'square',time,.1,.07*velocity);}
    if(index===7){this.noiseHit(time,1.1,5500,'highpass',.33*velocity);this.oscillator(920,'triangle',time,.35,.04*velocity);}
  }
  theremin(hands) {
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    if(!this.thereminOsc){this.thereminOsc=this.ctx.createOscillator();this.thereminGain=this.ctx.createGain();this.thereminOsc.type='sine';this.thereminGain.gain.value=0;this.thereminOsc.connect(this.thereminGain);this.thereminGain.connect(this.master);this.thereminGain.connect(this.delay);this.thereminOsc.start();}
    const right=hands.find(h=>h.side==='Right'),left=hands.find(h=>h.side==='Left');
    const volume=right ? (left?Math.max(0,Math.min(.35,(1-left.points[0].y)*.5)):.16) : 0;
    this.thereminGain.gain.setTargetAtTime(volume,t,.04);
    if(right){const midi=48+(1-Math.max(0,Math.min(1,right.points[8].y)))*24;const f=440*2**((midi-69)/12);this.thereminOsc.frequency.setTargetAtTime(f,t,.035);return f;}
  }
  silenceTheremin(){if(this.thereminGain)this.thereminGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}
  click(time,accent=false){this.oscillator(accent?1300:950,'sine',time,.025,.13);}
  async startRecording(){
    await this.init();
    if(!window.MediaRecorder)throw new Error('Запись недоступна в этом браузере. Попробуйте Chrome или Edge.');
    this.destination=this.ctx.createMediaStreamDestination();this.limiter.connect(this.destination);
    const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    this.recorder=new MediaRecorder(this.destination.stream,type?{mimeType:type}:{});
    this.chunks=[];this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
    this.recorder.start(200);
  }
  stopRecording(){return new Promise((resolve,reject)=>{
    if(!this.recorder||this.recorder.state==='inactive'){reject(new Error('Нет активной записи'));return;}
    this.recorder.onerror=e=>reject(e.error||new Error('Ошибка записи'));
    this.recorder.onstop=()=>{this.limiter.disconnect(this.destination);this.destination.stream.getTracks().forEach(t=>t.stop());resolve(new Blob(this.chunks,{type:this.recorder.mimeType}));};this.recorder.stop();
  });}
}
