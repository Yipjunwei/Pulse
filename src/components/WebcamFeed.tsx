import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCcw } from 'lucide-react';
import { loadModels, detectEmotion, EmotionResult } from '../lib/emotion';

interface WebcamFeedProps {
  onEmotionDetect: (result: EmotionResult) => void;
}

export default function WebcamFeed({ onEmotionDetect }: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsLoaded(true);
      } catch (err) {
        console.error('Webcam/Model Error:', err);
        setError('Failed to access camera or load AI models. Please ensure camera permissions are granted.');
      }
    };
    init();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const interval = setInterval(async () => {
      if (videoRef.current) {
        const result = await detectEmotion(videoRef.current);
        if (result && result.confidence > 0.5) {
          onEmotionDetect(result);
        }
      }
    }, 1000); // Detect every second for real-time pulse

    return () => clearInterval(interval);
  }, [isLoaded, onEmotionDetect]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 group shadow-2xl">
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 space-y-4">
          <RefreshCcw className="w-8 h-8 animate-spin" />
          <p className="text-sm font-mono tracking-widest uppercase">Initializing Pulse AI...</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-8 text-center space-y-4">
          <Camera className="w-12 h-12 opacity-50" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
      
      {isLoaded && (
        <div className="absolute top-4 left-4 flex items-center space-x-2 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-tighter text-white">Live Monitoring</span>
        </div>
      )}
    </div>
  );
}
