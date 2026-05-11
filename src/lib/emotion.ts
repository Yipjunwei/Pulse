import * as faceapi from 'face-api.js';

export type Emotion = 'happy' | 'sad' | 'angry' | 'neutral' | 'surprised' | 'fearful' | 'disgusted';

export interface EmotionResult {
  emotion: Emotion;
  confidence: number;
}

export const loadModels = async () => {
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
};

export const detectEmotion = async (video: HTMLVideoElement): Promise<EmotionResult | null> => {
  const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
  
  if (!detection) return null;

  const expressions = detection.expressions;
  let maxEmotion: Emotion = 'neutral';
  let maxConfidence = 0;

  (Object.keys(expressions) as Array<keyof typeof expressions>).forEach((key) => {
    const val = expressions[key];
    if (typeof val === 'number' && val > maxConfidence) {
      maxConfidence = val;
      maxEmotion = key as Emotion;
    }
  });

  return {
    emotion: maxEmotion,
    confidence: maxConfidence
  };
};

export const getMoodDescription = (emotion: Emotion) => {
  const descriptions: Record<Emotion, string> = {
    happy: 'Feeling joyful and energetic!',
    sad: 'A bit down? Let’s find some comfort.',
    angry: 'Time to cool off with some calm tunes.',
    neutral: 'In the zone. Let’s keep it steady.',
    surprised: 'Something new? Let’s explore!',
    fearful: 'Finding peace in the chaos.',
    disgusted: 'Refreshing your vibe right now.'
  };
  return descriptions[emotion];
};
