import '@fontsource-variable/manrope';
import '@phosphor-icons/web/regular';
import './style.css';
import { AudioEngine } from './audio.js';
import { HandCamera } from './vision.js';
import { GestureInterpreter, PADS, NOTE_NAMES, defaultPattern, encodeWav } from './gestures.js';
import { recordings,saveSettings,loadSettings } from './storage.js';
const $=selector=>document.querySelector(selector);
const icon=(name,extra='')=>`<i class="ph ph-${name} ${extra}" aria-hidden="true"></i>`;
const saved=loadSettings();
const state={mode:'drums',bpm:112,volume:72,reverb:18,sensitivity:55,pattern:defaultPattern(),playing:false,recording:false,metronome:false,kit:'electronic'};
if(saved){for(const k of ['bpm','volume','reverb','sensitivity'])if(Number.isFinite(saved[k]))state[k]=Math.max(k==='bpm'?40:0,Math.min(k==='bpm'?220:100,saved[k]));if(Array.isArray(saved.pattern)&&saved.pattern.length===4&&saved.pattern.every(r=>Array.isArray(r)&&r.length===16))state.pattern=saved.pattern.map(r=>r.map(Boolean));}
const engine=new AudioEngine(),gestures=new GestureInterpreter();
const app=$('#app');
app.innerHTML=`<div class="performance" id="camera-stage">
  <video id="camera-video" muted playsinline aria-hidden="true"></video>
  <canvas id="hand-canvas" aria-label="Видео с точками рук и номерами пальцев"></canvas>
  <div class="video-shade" aria-hidden="true"></div>
  <header class="stage-toolbar overlay">
    <a class="brand" href="#" aria-label="Handroom, главная"><span class="brand-mark"><b></b><b></b><b></b></span><span>handroom.</span></a>
    <div class="instrument-tabs" role="tablist" aria-label="Инструмент"><button role="tab" aria-selected="true" class="active" data-mode="drums">${icon('metronome')}<span>Барабаны</span></button><button role="tab" aria-selected="false" data-mode="synth">${icon('piano-keys')}<span>Синтезатор</span></button><button role="tab" aria-selected="false" data-mode="theremin">${icon('wave-sine')}<span>Терменвокс</span></button></div>
    <div class="toolbar-actions"><button class="button record-button" id="record-button"><span class="record-dot"></span><span>Начать запись</span></button><button class="icon-button" id="recordings-nav" aria-label="Мои записи" title="Мои записи">${icon('vinyl-record')}<span id="record-count">0</span></button><button class="icon-button" id="help-button" aria-label="Как играть" title="Как играть">${icon('question')}</button><button class="icon-button" id="settings-button" aria-label="Настройки" title="Настройки">${icon('gear-six')}</button><button class="icon-button" id="theme-button" aria-label="Переключить тему" title="Переключить тему">${icon('sun')}</button><button class="icon-button" id="fullscreen-button" aria-label="Развернуть всю студию" title="Развернуть всю студию">${icon('corners-out')}</button></div>
  </header>
  <div class="tracking-banner"><span class="status-dot"></span><span id="camera-badge">КАМЕРА ВЫКЛЮЧЕНА</span><span class="banner-separator">·</span><span id="tracking-status">Пример расположения рук</span></div>
  <div class="camera-start" id="camera-start"><div class="start-icon">${icon('hand-tap')}</div><h1 id="camera-title">Ваши руки — инструмент</h1><p id="camera-description">Коснитесь большим пальцем любого другого.<br>Звук для каждого пальца указан по краям экрана.</p><button class="button mint" id="camera-button">${icon('video-camera')}<span>Включить камеру</span>${icon('arrow-right')}</button><span id="camera-hint">Покажите обе ладони. Видео остаётся на вашем устройстве.</span></div>
  <div class="instrument-number" hidden>01 / 03</div>
  <div class="hand-instruments" id="pad-grid">
    ${['Левая','Правая'].map((name,hand)=>`<section class="hand-instrument overlay ${hand?'right-instrument':'left-instrument'}" aria-label="${name} рука, инструменты"><div class="hand-heading"><div><span class="eyebrow">${hand?'ПРАВАЯ':'ЛЕВАЯ'} РУКА</span><h2>Большой палец +</h2></div><span class="hand-status" id="${hand?'right':'left'}-status"><span class="status-dot neutral"></span><span>Не в кадре</span></span></div><div class="finger-pads">${PADS.slice(hand*4,hand*4+4).map((p,finger)=>{const i=hand*4+finger;return `<button class="sound-pad" data-pad="${i}" title="Большой + ${p.finger.split(' · ')[0].toLowerCase()}: ${p.name}" aria-label="${p.name}, клавиша ${p.key}"><span class="finger-number">${finger+1}</span><span class="pad-text"><span class="finger-name">${p.finger.split(' · ')[0]}</span><strong>${p.name}</strong><span class="pad-caption" hidden>${p.en}</span></span><kbd>${p.key}</kbd><span class="pad-hit-dot" aria-hidden="true"></span></button>`}).join('')}</div><div class="hand-caption">Коснитесь → звук · разведите → ещё раз</div></section>`).join('')}
  </div>
  <div id="theremin-info" class="theremin-info" hidden><section class="theremin-card overlay"><span class="eyebrow">ЛЕВАЯ РУКА</span>${icon('speaker-high')}<h2>Громкость</h2><p>Выше — громче<br>Ниже — тише</p></section><section class="theremin-card overlay"><span class="eyebrow">ПРАВАЯ РУКА</span>${icon('wave-sine')}<h2>Высота ноты</h2><p>Выше — выше нота<br>Уберите руку — тишина</p><span id="theremin-note">Покажите руки камере</span><button class="button secondary" id="theremin-preview">${icon('play')} Послушать</button></section></div>
  <div class="gesture-feedback" aria-live="polite" aria-atomic="true"><span id="last-sound">Начните с указательного пальца</span><span id="last-gesture">Большой + указательный левой руки → Бочка</span></div>
  <div class="live-actions" id="live-actions" hidden><button class="stage-button" id="points-button" aria-pressed="true">${icon('intersect')} Точки и номера</button><button class="stage-button" id="video-button" aria-pressed="true">${icon('eye')} Видео</button><button class="stage-button" id="stop-camera">${icon('video-camera-slash')} Выключить камеру</button></div>
  <footer class="performance-dock overlay"><div class="dock-instrument"><span id="active-instrument">Барабаны</span><div class="preset-row"><label class="sr-only" for="preset">Набор звуков</label><select id="preset"><option value="electronic">Electronic kit</option><option value="acoustic">Acoustic kit</option><option value="lofi">Lo-fi kit</option></select></div></div><div class="transport"><button class="play-button" id="play-button">${icon('play')}<span>Играть</span></button><div class="bpm-control"><button id="bpm-down" aria-label="Уменьшить темп">−</button><label><input id="bpm" type="number" min="40" max="220" value="${state.bpm}" aria-label="Темп, ударов в минуту"><span>BPM</span></label><button id="bpm-up" aria-label="Увеличить темп">+</button></div><button class="icon-button" id="metronome" aria-label="Включить метроном" aria-pressed="false" title="Метроном">${icon('metronome')}</button><button class="button secondary" id="sequencer-toggle" aria-expanded="false" aria-controls="sequencer-panel">${icon('squares-four')}<span>Ритм</span></button></div><div class="master-volume">${icon('speaker-high')}<label class="sr-only" for="master-volume">Громкость</label><input id="master-volume" aria-label="Громкость" type="range" min="0" max="100" value="${state.volume}"><output id="volume-value">${state.volume}%</output><canvas id="waveform" width="200" height="32" aria-label="Уровень выходного звука"></canvas></div></footer>
  <section class="sequencer overlay" id="sequencer-panel" aria-labelledby="sequence-title" hidden><div class="sequence-header"><div><h2 id="sequence-title">Ваш ритм</h2><p>Нажимайте на шаги. Играйте руками поверх бита.</p></div><div class="sequence-actions"><button class="text-link" id="restore-pattern">Загрузить пример ${icon('arrow-counter-clockwise')}</button><button class="icon-button" id="clear-pattern" aria-label="Очистить ритм" title="Очистить ритм">${icon('eraser')}</button><button class="icon-button" id="close-sequencer" aria-label="Закрыть секвенсор">${icon('x')}</button></div></div><div class="sequencer-scroll"><div class="sequence-grid" id="sequence-grid"><div></div>${Array.from({length:16},(_,i)=>`<span class="step-number ${i%4===0?'beat-number':''}" data-number="${i}">${i+1}</span>`).join('')}${[0,1,2,4].map((p,row)=>`<div class="sequence-name">${PADS[p].name}<button class="track-preview" data-preview="${p}" aria-label="Послушать ${PADS[p].name}">${icon('speaker-high')}</button></div>${Array.from({length:16},(_,step)=>`<button class="step step-row-${row} ${step%4===0?'bar-start':''} ${state.pattern[row][step]?'on':''}" data-row="${row}" data-step="${step}" aria-label="${PADS[p].name}, шаг ${step+1}" aria-pressed="${state.pattern[row][step]}"></button>`).join('')}`).join('')}</div></div><p class="sequence-footer">1 такт · 16 шагов · 4/4</p></section>
  <span class="instrument-footer sr-only">Клавиши A S D F · J K L ;</span>
</div>
<dialog id="modal"><div class="modal-heading"><h2 id="modal-title"></h2><button class="icon-button" id="close-modal" aria-label="Закрыть">${icon('x')}</button></div><div id="modal-content"></div></dialog><div class="toast" id="toast" role="status" aria-live="polite"></div>
`;
const camera=new HandCamera($('#camera-video'),$('#hand-canvas'),onHands,onCameraStatus);
engine.volume=state.volume/100;engine.reverb=state.reverb/100;
function persist(){saveSettings({bpm:state.bpm,volume:state.volume,reverb:state.reverb,sensitivity:state.sensitivity,pattern:state.pattern});}
let toastTimeout;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
async function ready(){try{await engine.init();return true;}catch{toast('Не удалось включить звук. Попробуйте Chrome или Edge.');return false;}}
let lastHitTime=0;
function flash(index){
  const pad=$(`[data-pad="${index}"]`);
  pad?.classList.remove('hit'); void pad?.offsetWidth; pad?.classList.add('hit');
  clearTimeout(pad?._timer); if(pad)pad._timer=setTimeout(()=>pad.classList.remove('hit'),230);
  lastHitTime=performance.now();
  const name=state.mode==='drums'?PADS[index].name:NOTE_NAMES[index];
  $('#last-sound').textContent=name;
  $('#last-gesture').textContent=`Большой + ${PADS[index].finger.split(' · ')[0].toLowerCase()} ${index<4?'левой':'правой'} руки`;
  $('.gesture-feedback').classList.add('sounding');
  clearTimeout(flash.timer); flash.timer=setTimeout(()=>$('.gesture-feedback').classList.remove('sounding'),650);
}
async function trigger(index,mode=state.mode){
  if(mode==='theremin')mode='synth'; if(!await ready())return;
  engine.hit(index,mode,engine.ctx.currentTime,state.kit==='lofi'?.6:state.kit==='acoustic'?.9:.8); flash(index);
}
function onHands(hands,time){
  if(document.hidden){gestures.reset();engine.silenceTheremin();return;}
  if(!hands.length){gestures.reset();engine.silenceTheremin();}
  const {hits,active}=gestures.update(hands,time,state.sensitivity);
  camera.activePads=active;
  document.querySelectorAll('.sound-pad').forEach((p,i)=>p.classList.toggle('pinched',active.has(i)));
  for(const side of ['Left','Right']){const el=$(side==='Left'?'#left-status':'#right-status'),found=hands.some(h=>h.side===side);el.innerHTML=`<span class="status-dot ${found?'':'neutral'}"></span><span>${found?'В кадре':'Не в кадре'}</span>`;}
  if(camera?.status==='ready')$('#tracking-status').textContent=hands.length?`${hands.length*21} точек · ${hands.length} ${hands.length===1?'рука':'руки'}`:'Покажите ладони';
  if(state.mode==='theremin'){const freq=engine.theremin(hands);$('#theremin-note').textContent=freq?`${Math.round(freq)} Hz`:'Покажите руки камере';}
  else for(const hit of hits)void trigger(hit);
}
function onCameraStatus(status,message){
  const loading=status==='requesting'||status==='loading',live=status==='ready';
  $('#camera-badge').textContent=live?'КАМЕРА ВКЛЮЧЕНА':loading?'ПОДКЛЮЧЕНИЕ':'КАМЕРА ВЫКЛЮЧЕНА';
  $('#camera-badge').classList.toggle('is-live',live);$('#camera-stage').classList.toggle('is-live',live);
  $('#camera-start').hidden=live;$('#live-actions').hidden=!live;
  $('#camera-button').disabled=loading;$('#camera-button span').textContent=status==='requesting'?'Разрешите доступ…':status==='loading'?'Загружаем модель…':status==='error'?'Попробовать снова':'Включить камеру';
  $('#camera-hint').textContent=message|| (status==='loading'?'Первый запуск может занять несколько секунд':'Покажите обе ладони. Видео остаётся на вашем устройстве.');
  $('#camera-hint').classList.toggle('error',status==='error');$('#tracking-status').textContent=loading?'Подключение…':live?'Покажите ладони':'Ожидание камеры';
  $('#camera-description').textContent='Коснитесь большим пальцем любого другого. Звук для каждого пальца указан по краям экрана.';
  if(!live){camera.activePads=new Set();document.querySelectorAll('.sound-pad').forEach(p=>p.classList.remove('pinched'));}
}
$('#camera-button').onclick=async()=>{if(await ready())void camera.start();};
$('#stop-camera').onclick=()=>camera.stop();
$('#points-button').onclick=e=>{camera.showPoints=!camera.showPoints;e.currentTarget.setAttribute('aria-pressed',String(camera.showPoints));camera.draw();};
$('#video-button').onclick=e=>{camera.showVideo=!camera.showVideo;e.currentTarget.setAttribute('aria-pressed',String(camera.showVideo));camera.draw();};
// Fullscreen the complete studio, including overlays, controls, and dialogs.
$('#fullscreen-button').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen();}
  catch{toast('Студия уже занимает всё окно. Браузер не поддерживает дополнительный полный экран.');}
};
document.addEventListener('fullscreenchange',()=>{
  const expanded=!!document.fullscreenElement,button=$('#fullscreen-button');
  const label=expanded?'Выйти из полного экрана':'Развернуть всю студию';
  button.innerHTML=icon(expanded?'corners-in':'corners-out');button.setAttribute('aria-label',label);button.title=label;
  camera.resize();
});
function showSequencer(open){
  $('#sequencer-panel').hidden=!open;
  $('#sequencer-toggle').setAttribute('aria-expanded',String(open));
  $('#camera-stage').classList.toggle('sequence-open',open);
}
$('#sequencer-toggle').onclick=()=>showSequencer($('#sequencer-panel').hidden);
$('#close-sequencer').onclick=()=>showSequencer(false);
document.querySelectorAll('[data-pad]').forEach(p=>p.addEventListener('pointerdown',e=>{e.preventDefault();void trigger(Number(p.dataset.pad));}));
// Keyboard activation also keeps every pad accessible without a pointer.
document.querySelectorAll('[data-pad]').forEach(p=>p.addEventListener('click',e=>{if(e.detail===0)void trigger(Number(p.dataset.pad));}));
function setMode(mode){
  state.mode=mode; engine.silenceTheremin();gestures.reset();camera.activePads=new Set();
  if(mode==='synth')engine.tone='warm';else if(mode==='drums'){state.kit='electronic';engine.kit='electronic';}
  document.querySelectorAll('[data-mode]').forEach(t=>{t.classList.toggle('active',t.dataset.mode===mode);t.setAttribute('aria-selected',String(t.dataset.mode===mode));});
  $('#camera-stage').dataset.mode=mode;
  $('#active-instrument').textContent=mode==='drums'?'Барабаны':mode==='synth'?'Синтезатор':'Терменвокс';
  $('#pad-grid').hidden=mode==='theremin';$('#theremin-info').hidden=mode!=='theremin';$('.preset-row').hidden=mode==='theremin';
  $('#preset').innerHTML=mode==='synth'?'<option value="warm">Тёплый аналоговый</option><option value="bright">Яркий пилообразный</option><option value="soft">Мягкий синус</option>':'<option value="electronic">Electronic kit</option><option value="acoustic">Acoustic kit</option><option value="lofi">Lo-fi kit</option>';
  document.querySelectorAll('[data-pad]').forEach((p,i)=>{
    const name=mode==='synth'?NOTE_NAMES[i]:PADS[i].name;
    p.querySelector('strong').textContent=name;p.classList.remove('pinched','hit');
    p.setAttribute('aria-label',`${name}, клавиша ${PADS[i].key}`);
    p.title=`Большой + ${PADS[i].finger.split(' · ')[0].toLowerCase()}: ${name}`;
  });
  camera.padNames=mode==='drums'?PADS.map(p=>p.name):NOTE_NAMES;
  camera.theremin=mode==='theremin'; camera.draw();
  $('#last-sound').textContent=mode==='theremin'?'Двигайте руками вверх и вниз':'Начните с указательного пальца';
  $('#last-gesture').textContent=mode==='theremin'?'Правая — высота ноты · левая — громкость':`Большой + указательный левой руки → ${mode==='synth'?'C3':'Бочка'}`;
}
document.querySelectorAll('[data-mode]').forEach(t=>t.onclick=()=>setMode(t.dataset.mode));
$('#preset').onchange=e=>{if(state.mode==='synth')engine.tone=e.target.value;else {state.kit=e.target.value;engine.kit=e.target.value;}toast('Набор звуков изменён');};
$('#theremin-preview').onclick=async()=>{if(await ready()){for(let i=0;i<5;i++)engine.oscillator(220*2**(i/12),'sine',engine.ctx.currentTime+i*.18,.35,.16);}};
let scheduler,nextTime=0,currentStep=0,visualTimers=[];
function schedule(){while(state.playing&&nextTime<engine.ctx.currentTime+.09){const step=currentStep,time=nextTime;state.pattern.forEach((r,i)=>{if(r[step])engine.hit([0,1,2,4][i],'drums',time,.7);});if(state.metronome&&step%4===0)engine.click(time,step===0);const id=setTimeout(()=>{if(!state.playing)return;document.querySelectorAll('.current').forEach(e=>e.classList.remove('current'));document.querySelectorAll(`[data-step="${step}"],[data-number="${step}"]`).forEach(e=>e.classList.add('current'));},Math.max(0,(time-engine.ctx.currentTime)*1000));visualTimers.push(id);if(visualTimers.length>32)visualTimers=visualTimers.slice(-32);nextTime+=60/state.bpm/4;currentStep=(currentStep+1)%16;}}
async function togglePlay(){if(state.playing){stopTransport();return;}if(!await ready())return;state.playing=true;nextTime=engine.ctx.currentTime+.04;currentStep=0;$('#play-button').innerHTML=icon('pause')+'<span>Пауза</span>';$('#play-button').classList.add('playing');schedule();scheduler=setInterval(schedule,25);}
function stopTransport(){state.playing=false;clearInterval(scheduler);visualTimers.forEach(clearTimeout);visualTimers=[];$('#play-button').innerHTML=icon('play')+'<span>Играть</span>';$('#play-button').classList.remove('playing');document.querySelectorAll('.current').forEach(e=>e.classList.remove('current'));}
$('#play-button').onclick=togglePlay;
$('#sequence-grid').onclick=e=>{const s=e.target.closest('[data-step]');if(s){const row=Number(s.dataset.row),step=Number(s.dataset.step);state.pattern[row][step]=!state.pattern[row][step];s.classList.toggle('on',state.pattern[row][step]);s.setAttribute('aria-pressed',String(state.pattern[row][step]));persist();}const p=e.target.closest('[data-preview]');if(p)void trigger(Number(p.dataset.preview),'drums');};
function redrawPattern(){document.querySelectorAll('[data-step]').forEach(el=>{const on=state.pattern[el.dataset.row][el.dataset.step];el.classList.toggle('on',on);el.setAttribute('aria-pressed',String(on));});persist();}
$('#clear-pattern').onclick=()=>{state.pattern=Array.from({length:4},()=>Array(16).fill(false));redrawPattern();toast('Ритм очищен');};
$('#restore-pattern').onclick=()=>{state.pattern=defaultPattern();redrawPattern();toast('Пример ритма загружен');};
function setBpm(value){state.bpm=Math.round(Math.max(40,Math.min(220,Number(value)||112)));$('#bpm').value=state.bpm;persist();}
$('#bpm').onchange=e=>setBpm(e.target.value);$('#bpm-down').onclick=()=>setBpm(state.bpm-1);$('#bpm-up').onclick=()=>setBpm(state.bpm+1);
$('#metronome').onclick=e=>{state.metronome=!state.metronome;e.currentTarget.setAttribute('aria-pressed',String(state.metronome));toast(state.metronome?'Метроном включён при воспроизведении':'Метроном выключен');};
$('#master-volume').oninput=e=>{state.volume=Number(e.target.value);$('#volume-value').value=state.volume+'%';engine.setVolume(state.volume/100);persist();};
let recordStarted,recordTimer;
function setRecordUI(on){state.recording=on;$('#record-button').classList.toggle('recording',on);if(on){recordStarted=Date.now();updateRecordTimer();recordTimer=setInterval(updateRecordTimer,1000);}else{clearInterval(recordTimer);$('#record-button').innerHTML='<span class="record-dot"></span><span>Начать запись</span>';}}
function updateRecordTimer(){const sec=Math.floor((Date.now()-recordStarted)/1000);$('#record-button').innerHTML=`<span class="record-dot"></span><span>Стоп · ${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}</span>`;}
$('#record-button').onclick=async()=>{
  const btn=$('#record-button');btn.disabled=true;
  try{
    if(!state.recording){if(!await ready())return;await engine.startRecording();setRecordUI(true);toast('Запись идёт. Играйте жестами, пэдами или включите ритм.');}
    else{
      const duration=(Date.now()-recordStarted)/1000;const raw=await engine.stopRecording();setRecordUI(false);
      let blob=raw,ext=raw.type.includes('mp4')?'m4a':'webm';
      try{const decoded=await engine.ctx.decodeAudioData(await raw.arrayBuffer());blob=new Blob([encodeWav(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate)],{type:'audio/wav'});ext='wav';}catch{}
      const item={id:crypto.randomUUID(),name:`Импровизация ${new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`,blob,ext,duration,created:Date.now()};
      try{await recordings('save',item);toast('Запись сохранена на этом устройстве');}catch{toast('Запись готова. Скачайте её: браузер не смог сохранить файл.');}
      await showRecordings(item);void updateRecordCount();
    }
  }catch(error){setRecordUI(false);toast(error.message||'Не удалось записать аудио.');}finally{btn.disabled=false;}
};
let modalURLs=[];
function openModal(title,content){$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();modalURLs.forEach(URL.revokeObjectURL);modalURLs=[];}
$('#close-modal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target===$('#modal'))closeModal();};$('#modal').addEventListener('close',()=>{modalURLs.forEach(URL.revokeObjectURL);modalURLs=[];});
function showGuide(){openModal('Ваш первый звук',`<p class="modal-lead">Разрешите доступ к камере и держите ладони перед собой. Хорошее освещение помогает распознавать пальцы.</p><div class="guide-steps"><div><span>01</span><section><h3>Покажите обе руки</h3><p>Отойдите на 50–100 см от камеры, чтобы обе ладони полностью попадали в кадр.</p></section></div><div><span>02</span><section><h3>Соединяйте кончики пальцев</h3><p>Коснитесь большим пальцем указательного, среднего, безымянного или мизинца. Разведите пальцы перед следующим звуком.</p></section></div><div><span>03</span><section><h3>Соберите свою музыку</h3><p>Включите ритм, выберите инструмент и импровизируйте. «Начать запись» сохранит звук без доступа к микрофону.</p></section></div></div><div class="gesture-map">${PADS.map(p=>`<div><kbd>${p.key}</kbd><span>${p.finger}</span><strong>${p.name}</strong></div>`).join('')}</div><p class="guide-note">Пробел — играть / пауза. A S D F и J K L ; — звуки. Клавиши работают и в русской раскладке. В режиме «Термен» высота правой руки меняет ноту, левой — громкость.</p>`);}
$('#help-button').onclick=showGuide;
async function updateRecordCount(){try{$('#record-count').textContent=(await recordings('list')).length;}catch{}}
async function showRecordings(fallback){
  let items=[];try{items=await recordings('list');}catch{}
  if(fallback&&!items.some(i=>i.id===fallback.id))items.push(fallback);
  items.sort((a,b)=>b.created-a.created);
  openModal('Мои записи',items.length?`<p class="modal-lead">Ваши импровизации хранятся в этом браузере. Скачайте любимые, чтобы сохранить их отдельно.</p><div class="record-list"></div>`:`<div class="empty-state">${icon('vinyl-record')}<h3>Здесь будет ваша музыка</h3><p>Нажмите «Начать запись», сыграйте что-нибудь и остановите запись. Она появится здесь.</p><button class="button mint" id="empty-close">Вернуться в студию</button></div>`);
  if(!items.length){$('#empty-close').onclick=closeModal;return;}
  for(const item of items){
    const url=URL.createObjectURL(item.blob);modalURLs.push(url);
    const el=document.createElement('div');el.className='record-item';
    const title=document.createElement('strong');title.textContent=item.name;el.append(title);
    const meta=document.createElement('span');meta.textContent=`${Math.round(item.duration)} сек · ${item.ext.toUpperCase()}`;el.append(meta);
    const audio=document.createElement('audio');audio.controls=true;audio.src=url;el.append(audio);
    const actions=document.createElement('div');actions.className='record-actions';
    const link=document.createElement('a');link.className='button secondary';link.href=url;link.download=`handroom-${item.created}.${item.ext}`;link.innerHTML=icon('download-simple')+' Скачать';actions.append(link);
    const remove=document.createElement('button');remove.className='icon-button';remove.setAttribute('aria-label','Удалить запись');remove.innerHTML=icon('trash');remove.onclick=async()=>{try{await recordings('delete',item.id);el.remove();void updateRecordCount();if(!$('.record-item'))void showRecordings();}catch{toast('Не удалось удалить запись');}};actions.append(remove);el.append(actions);$('.record-list').append(el);
  }
}
$('#recordings-nav').onclick=()=>showRecordings();
$('#settings-button').onclick=()=>{openModal('Настройки студии',`<div class="setting"><div><label for="sensitivity">Чувствительность жестов</label><p>Выше — пальцы можно соединять менее плотно.</p></div><input type="range" id="sensitivity" min="10" max="100" value="${state.sensitivity}"><output id="sensitivity-value">${state.sensitivity}%</output></div><div class="setting"><div><label for="reverb">Эхо</label><p>Добавьте пространству немного объёма.</p></div><input type="range" id="reverb" min="0" max="100" value="${state.reverb}"><output id="reverb-value">${state.reverb}%</output></div><p class="guide-note">Камера и распознавание работают только на вашем устройстве. Видео не записывается и не отправляется на сервер. Для звука микрофон не используется.</p>`);$('#sensitivity').oninput=e=>{state.sensitivity=Number(e.target.value);$('#sensitivity-value').value=state.sensitivity+'%';persist();};$('#reverb').oninput=e=>{state.reverb=Number(e.target.value);engine.setReverb(state.reverb/100);$('#reverb-value').value=state.reverb+'%';persist();};};
let storedTheme;try{storedTheme=localStorage.getItem('handroom-theme');}catch{}
const preferredTheme=storedTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=preferredTheme;
function themeIcon(){$('#theme-button').innerHTML=icon(document.documentElement.dataset.theme==='dark'?'sun':'moon');}themeIcon();
$('#theme-button').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('handroom-theme',document.documentElement.dataset.theme);}catch{}themeIcon();};
const keyMap={KeyA:0,KeyS:1,KeyD:2,KeyF:3,KeyJ:4,KeyK:5,KeyL:6,Semicolon:7};
document.addEventListener('keydown',e=>{if($('#modal').open||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;if(e.code==='Space'&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();void togglePlay();}if(keyMap[e.code]!==undefined){e.preventDefault();void trigger(keyMap[e.code]);}});
// Pause the transport in background tabs so audio scheduling cannot accumulate stale notes.
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTransport();engine.silenceTheremin();}});
window.addEventListener('pagehide',()=>{camera.stop();stopTransport();});
let lastWave=0;const waveCtx=$('#waveform').getContext('2d'),waveData=new Uint8Array(128);
function drawOutput(time){if(time-lastWave>60){lastWave=time;const w=200,h=32;waveCtx.clearRect(0,0,w,h);if(engine.analyser)engine.analyser.getByteTimeDomainData(waveData);waveCtx.beginPath();for(let i=0;i<100;i++){const value=engine.analyser?(waveData[i]-128)/128:0;const y=h/2+value*35;if(i===0)waveCtx.moveTo(i*2,y);else waveCtx.lineTo(i*2,y);}waveCtx.strokeStyle=document.documentElement.dataset.theme==='light'?'#337855':'#99cfaf';waveCtx.lineWidth=1.5;waveCtx.stroke();}requestAnimationFrame(drawOutput);}requestAnimationFrame(drawOutput);void updateRecordCount();
