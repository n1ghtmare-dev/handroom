import { cp, mkdir, access, writeFile, rm } from 'node:fs/promises';
await mkdir('public/mediapipe', { recursive: true });
await rm('public/mediapipe/wasm',{recursive:true,force:true});
await mkdir('public/mediapipe/wasm',{recursive:true});
for(const name of ['vision_wasm_module_internal.js','vision_wasm_module_internal.wasm']) await cp('node_modules/@mediapipe/tasks-vision/wasm/'+name,'public/mediapipe/wasm/'+name);
try { await access('public/mediapipe/hand_landmarker.task'); }
catch {
  const result = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task');
  if (!result.ok) throw new Error(`Model download failed: ${result.status}`);
  await writeFile('public/mediapipe/hand_landmarker.task', Buffer.from(await result.arrayBuffer()));
}
console.log('Hand tracking assets ready (served locally).');
