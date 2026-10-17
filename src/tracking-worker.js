import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let detector;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const vision=await FilesetResolver.forVisionTasks(data.base+'mediapipe/wasm',true);
      const options={baseOptions:{modelAssetPath:data.base+'mediapipe/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.5};
      try { detector=await HandLandmarker.createFromOptions(vision,options); }
      catch { options.baseOptions.delegate='CPU';detector=await HandLandmarker.createFromOptions(vision,options); }
      self.postMessage({type:'ready'});
    } catch(error) {self.postMessage({type:'error',message:error.message});}
  }
  if(data.type==='frame') {
    try {
      const result=detector.detectForVideo(data.frame,data.time);
      self.postMessage({type:'result',time:data.time,hands:result.landmarks.map((points,i)=>({points,side:result.handedness[i]?.[0]?.categoryName||'Right',confidence:result.handedness[i]?.[0]?.score||0}))});
    }catch(error){self.postMessage({type:'error',message:error.message});}
    finally {data.frame.close();}
  }
};
