import { CONNECTIONS, TIPS } from './gestures.js';
const demoLeft = [[.25,.80],[.30,.70],[.36,.63],[.40,.57],[.44,.51],[.30,.55],[.31,.42],[.32,.32],[.32,.23],[.25,.53],[.25,.37],[.25,.26],[.25,.16],[.20,.55],[.19,.41],[.18,.31],[.17,.23],[.15,.60],[.12,.49],[.11,.41],[.10,.34]];
export function sampleHands() {
  return [{side:'Left',points:demoLeft.map(([x,y])=>({x,y,z:0}))},{side:'Right',points:demoLeft.map(([x,y])=>({x:1-x,y,z:0}))}];
}
export class HandCamera {
  constructor(video,canvas,onResult,onStatus) {
    this.video=video;this.canvas=canvas;this.onResult=onResult;this.onStatus=onStatus;
    this.status='idle';this.hands=[];this.showPoints=true;this.showVideo=true;this.generation=0;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    this.resize();
  }
  resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.draw();}
  setStatus(status,message=''){this.status=status;this.onStatus(status,message);this.draw();}
  async start(){
    if(['requesting','loading','ready'].includes(this.status))return;
    const token=++this.generation;
    this.setStatus('requesting');
    try{
      if(!window.isSecureContext)throw new Error('Для камеры нужен HTTPS или localhost.');
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Браузер не поддерживает камеру. Откройте студию в Chrome или Edge.');
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user',frameRate:{ideal:30,max:30}},audio:false});
      if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(token!==this.generation)return;
      stream.getVideoTracks()[0].onended=()=>this.stop();
      this.setStatus('loading');
      this.worker=new Worker(new URL('./tracking-worker.js',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{
        if(token!==this.generation)return;
        if(data.type==='ready'){clearTimeout(this.timeout);this.setStatus('ready');this.loop(token);}
        if(data.type==='result'){this.busy=false;this.hands=data.hands;this.onResult(data.hands,data.time);this.draw();}
        if(data.type==='error'){if(import.meta.env.DEV)console.warn('Hand tracking:',data.message);this.fail(new Error('Не удалось запустить распознавание. Попробуйте снова или используйте клавиши.'));}
      };
      this.worker.onerror=()=>this.fail(new Error('Модуль распознавания не загрузился. Обновите страницу и попробуйте ещё раз.'));
      this.worker.postMessage({type:'init',base:new URL(import.meta.env.BASE_URL,location.origin).href});
      this.timeout=setTimeout(()=>{if(this.status==='loading')this.fail(new Error('Загрузка модели заняла слишком много времени. Проверьте соединение и повторите.'));},45000);
    }catch(error){if(token!==this.generation)return;this.fail(error);}
  }
  fail(error){
    this.cleanup();
    const messages={NotAllowedError:'Доступ к камере закрыт. Разрешите его в настройках браузера и попробуйте снова.',NotFoundError:'Камера не найдена. Подключите её или играйте с клавиатуры.',NotReadableError:'Камера занята другим приложением. Закройте его и повторите.'};
    this.setStatus('error',messages[error.name]||error.message);
  }
  cleanup(){this.generation++;cancelAnimationFrame(this.raf);clearTimeout(this.timeout);this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.srcObject=null;this.hands=[];this.busy=false;this.lastVideo=-1;this.onResult([],performance.now());}
  stop(){this.cleanup();this.setStatus('idle');}
  loop(token){
    if(token!==this.generation||this.status!=='ready')return;
    const now=performance.now();
    if(!document.hidden&&!this.busy&&this.video.readyState>=2&&this.video.currentTime!==this.lastVideo&&now-(this.lastFrame||0)>40){
      this.busy=true;this.lastFrame=now;this.lastVideo=this.video.currentTime;
      createImageBitmap(this.video).then(frame=>{if(token!==this.generation){frame.close();return;}this.worker?.postMessage({type:'frame',frame,time:now},[frame]);}).catch(()=>{this.busy=false;});
    }
    this.raf=requestAnimationFrame(()=>this.loop(token));
  }
  draw(){
    const c=this.canvas,ctx=c.getContext('2d'),w=c.width,h=c.height;
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);
    let crop={sx:0,sy:0,sw:1,sh:1};
    const live=this.status==='ready';
    if(live&&this.video.videoWidth){
      const vw=this.video.videoWidth,vh=this.video.videoHeight,scale=Math.max(w/vw,h/vh);
      crop={sx:(vw-w/scale)/2/vw,sy:(vh-h/scale)/2/vh,sw:w/scale/vw,sh:h/scale/vh};
      if(this.showVideo){ctx.save();ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(this.video,crop.sx*vw,crop.sy*vh,crop.sw*vw,crop.sh*vh,0,0,w,h);ctx.restore();ctx.fillStyle='rgba(10,18,15,.22)';ctx.fillRect(0,0,w,h);}
    }
    const hands=live?this.hands:sampleHands();
    if(!this.showPoints)return;
    for(const hand of hands){
      const points=hand.points.map(p=>({x:live?(1-(p.x-crop.sx)/crop.sw)*w:p.x*w,y:live?(p.y-crop.sy)/crop.sh*h:p.y*h}));
      const color=hand.side==='Left'?'#b4e8cb':'#d8e5df';
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.3,w/650);ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=live?.85:.5;
      for(const [a,b]of CONNECTIONS){ctx.beginPath();ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);ctx.stroke();}
      for(let i=0;i<points.length;i++){
        const p=points[i],tip=TIPS.includes(i)||i===4;
        if(tip){ctx.beginPath();ctx.arc(p.x,p.y,w*.010,0,Math.PI*2);ctx.strokeStyle=color;ctx.globalAlpha=.2;ctx.stroke();}
        ctx.beginPath();ctx.arc(p.x,p.y,w*(tip?.0038:.0025),0,Math.PI*2);ctx.fillStyle=color;ctx.globalAlpha=tip?1:.75;ctx.fill();
      }
      ctx.globalAlpha=1;
    }
  }
}
