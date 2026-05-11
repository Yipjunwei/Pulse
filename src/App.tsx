import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, Camera, LogIn, Disc, Info } from 'lucide-react';
import WebcamFeed from './components/WebcamFeed';
import SpotifyPlayer from './components/SpotifyPlayer';
import { EmotionResult, getMoodDescription } from './lib/emotion';
import { getAiDjMessage } from './lib/aiDj';
import { playRawAudio } from './lib/audioUtils';
import { GoogleGenAI, Modality } from "@google/genai";
import axios from 'axios';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<EmotionResult | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestedMood, setLastRequestedMood] = useState<string | null>(null);
  
  // AI DJ States
  const [aiDjMessage, setAiDjMessage] = useState<string | null>(null);
  const [isDjTalking, setIsDjTalking] = useState(false);
  
  // New States for refined logic
  const [playedHistory, setPlayedHistory] = useState<string[]>([]);
  const [pendingMood, setPendingMood] = useState<string | null>(null);
  const [stabilityStartTime, setStabilityStartTime] = useState<number | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitTotalCooldown, setRateLimitTotalCooldown] = useState(0);

  const lastFetchTimeRef = React.useRef<number>(0);

  // Handle OAuth Success
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { accessToken, refreshToken: newRefreshToken } = event.data.tokens;
        setToken(accessToken);
        setRefreshToken(newRefreshToken);
        localStorage.setItem('spotify_token', accessToken);
        if (newRefreshToken) localStorage.setItem('spotify_refresh_token', newRefreshToken);
      }
    };
    window.addEventListener('message', handleMessage);
    
    const savedToken = localStorage.getItem('spotify_token');
    const savedRefreshToken = localStorage.getItem('spotify_refresh_token');
    if (savedToken && savedToken.length > 50) setToken(savedToken);
    if (savedRefreshToken) setRefreshToken(savedRefreshToken);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSpotifyConnect = async () => {
    try {
      const { data } = await axios.get('/api/auth/url');
      window.open(data.url, 'spotify_login', 'width=600,height=700');
    } catch (err) {
      console.error('Failed to get auth URL', err);
    }
  };

  const refreshTokenFn = useCallback(async () => {
    if (!refreshToken) return null;
    try {
      const { data } = await axios.get(`/api/auth/refresh?refreshToken=${refreshToken}`);
      const newAccessToken = data.accessToken;
      setToken(newAccessToken);
      localStorage.setItem('spotify_token', newAccessToken);
      return newAccessToken;
    } catch (err) {
      console.error('Failed to refresh token', err);
      setToken(null);
      setRefreshToken(null);
      localStorage.removeItem('spotify_token');
      localStorage.removeItem('spotify_refresh_token');
      return null;
    }
  }, [refreshToken]);

  const playAiDjTts = useCallback(async (message: string) => {
    try {
      setIsDjTalking(true);
      const ai = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say naturally but with a slightly robotic, cool DJ persona: ${message}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await playRawAudio(base64Audio);
      }
    } catch (err) {
      console.error('AI DJ TTS Error:', err);
    } finally {
      // Keep message visible for a bit
      setTimeout(() => {
        setIsDjTalking(false);
      }, 5000);
    }
  }, []);

  const fetchRecommendations = useCallback(async (mood: string, retryWithRefresh = true) => {
    if (!token || isRateLimited) return;
    
    const now = Date.now();
    // Safety check: 15 second cooldown between any requests to Spotify
    // Using Ref ensures that concurrent frames don't bypass this before state updates
    if (now - lastFetchTimeRef.current < 15000) return;

    lastFetchTimeRef.current = now;
    setLastFetchTime(now); 
    setLoading(true);
    setError(null);
    
    try {
      // Pass history to server to avoid repeats
      const excludeParam = playedHistory.slice(-20).join(',');
      const { data } = await axios.get(`/api/recommendations?mood=${mood}&excludeIds=${excludeParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.tracks && data.tracks.length > 0) {
        setTracks(data.tracks);
        setLastRequestedMood(mood);
        
        // AI DJ Message Generation
        const message = getAiDjMessage(mood);
        setAiDjMessage(message);
        playAiDjTts(message);
        
        // Add new tracks to history (limit to last 50)
        const newIds = data.tracks.map((t: any) => t.id);
        setPlayedHistory(prev => {
          const combined = [...prev, ...newIds];
          return combined.slice(-50);
        });
      } else {
        setError('No tracks found for this mood.');
      }
    } catch (err: any) {
      console.error('Failed to fetch tracks', err);
      
      if (err.response?.status === 429) {
        setIsRateLimited(true);
        setRateLimitTotalCooldown(90); // 90s backoff (increased)
        setError('Spotify rate limit reached. Backing off for 90s.');
        
        const countdown = setInterval(() => {
          setRateLimitTotalCooldown(prev => {
            if (prev <= 1) {
              clearInterval(countdown);
              setIsRateLimited(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (err.response?.status === 401 && retryWithRefresh && refreshToken) {
        console.log('Token expired, attempting refresh...');
        const newToken = await refreshTokenFn();
        if (newToken) {
          try {
            const { data } = await axios.get(`/api/recommendations?mood=${mood}`, {
              headers: { Authorization: `Bearer ${newToken}` }
            });
            if (data.tracks && data.tracks.length > 0) {
              setTracks(data.tracks);
              setLastRequestedMood(mood);
              setLastFetchTime(Date.now());
              setLoading(false);
              return;
            }
          } catch (retryErr) {
            console.error('Retry failed after refresh', retryErr);
          }
        }
      }

      const msg = err.response?.data?.error || err.message || 'Unknown error';
      setError(`Failed to fetch tracks: ${msg}`);
      if (err.response?.status === 401 && !refreshToken) {
        setToken(null);
        localStorage.removeItem('spotify_token');
      }
    } finally {
      setLoading(false);
    }
  }, [token, lastRequestedMood, refreshToken, refreshTokenFn, lastFetchTime, playedHistory]);

  const handleEmotionDetect = useCallback((result: EmotionResult) => {
    setEmotion(result);
    
    // Only process if confidence > 60%
    if (result.confidence > 0.6) {
      const now = Date.now();
      
      if (result.emotion === pendingMood) {
        if (stabilityStartTime) {
          const elapsed = now - stabilityStartTime;
          // Progress toward 3 seconds
          const progress = Math.min(100, (elapsed / 3000) * 100);
          setStabilityProgress(progress);
          
          // Conditions met: 
          // 1. Dominant for 3s (elapsed >= 3000)
          // 2. Last song change > 15s ago (now - lastFetchTimeRef.current >= 15000)
          if (elapsed >= 3000 && (now - lastFetchTimeRef.current >= 15000)) {
            // Only fetch if it's a different mood or we just haven't updated in a while
            if (result.emotion !== lastRequestedMood) {
              fetchRecommendations(result.emotion);
              // Reset timer after fetch to prevent double hits
              setStabilityStartTime(now); 
              setStabilityProgress(0);
            }
          }
        } else {
          setStabilityStartTime(now);
          setStabilityProgress(0);
        }
      } else {
        // Mood changed, reset stability timer
        setPendingMood(result.emotion);
        setStabilityStartTime(now);
        setStabilityProgress(0);
      }
    } else {
      // Low confidence, reset progress but keep pending mood as "potential"
      setStabilityProgress(0);
      setStabilityStartTime(null);
    }
  }, [fetchRecommendations, pendingMood, stabilityStartTime, lastFetchTime, lastRequestedMood]);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white selection:text-black">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-white/5 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-white text-black rounded-lg">
                <Disc className="w-6 h-6 animate-spin-slow" />
              </div>
              <h1 className="text-4xl font-bold tracking-tighter uppercase italic">Pulse</h1>
            </div>
            <p className="text-white/40 text-lg max-w-md font-light leading-relaxed">
              Your emotions, translated into sound. AI-driven music curation based on real-time facial expression mapping.
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {!token ? (
              <button
                onClick={handleSpotifyConnect}
                className="flex items-center space-x-3 px-6 py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-[#1DB954]/20"
              >
                <LogIn className="w-5 h-5" />
                <span>Connect Spotify</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <div className="w-2 h-2 rounded-full bg-[#1DB954]" />
                <span className="text-xs font-mono tracking-widest uppercase text-white/60">Spotify Connected</span>
              </div>
            )}
          </div>
        </header>

        <main className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Column: Webcam and Mood */}
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Visual Analysis
                </h2>
                <div className="flex items-center gap-4">
                  {isRateLimited ? (
                    <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
                        Rate Limit: {rateLimitTotalCooldown}s
                      </span>
                    </div>
                  ) : emotion && (
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                      Conf: {(emotion.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-[#1DB954] animate-pulse' : 'bg-white/10'}`} />
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                      {loading ? 'Resonating' : 'Listening'}
                    </span>
                  </div>
                </div>
              </div>
              <WebcamFeed onEmotionDetect={handleEmotionDetect} />
              
              {/* Stability Progress Bar */}
              {stabilityProgress > 0 && stabilityProgress < 100 && (
                <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stabilityProgress}%` }}
                    className="h-full bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                  />
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {emotion && (
                <motion.div
                  key={emotion.emotion}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="p-8 bg-white/5 rounded-3xl border border-white/10 relative overflow-hidden group transition-all duration-500 hover:bg-white/[0.07]"
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10">
                        <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest">Live Feed</span>
                      </div>
                      {stabilityProgress >= 100 && (
                        <div className="px-2 py-0.5 rounded-md bg-[#1DB954]/20 border border-[#1DB954]/30">
                          <span className="text-[10px] font-mono text-[#1DB954] uppercase tracking-widest">Locked</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-7xl font-bold tracking-tighter capitalize mb-4 leading-none">{emotion.emotion}</h3>
                    <p className="text-white/60 font-light text-xl italic max-w-sm">{getMoodDescription(emotion.emotion)}</p>
                    
                    {/* AI DJ Message Box */}
                    <AnimatePresence>
                      {aiDjMessage && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="mt-8 p-4 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isDjTalking ? 'bg-[#1DB954] animate-pulse' : 'bg-white/20'}`} />
                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">AI DJ Persona</span>
                          </div>
                          <p className="text-sm font-medium text-white/80 leading-relaxed italic">
                            "{aiDjMessage}"
                          </p>
                          {isDjTalking && (
                            <div className="absolute bottom-0 left-0 h-0.5 bg-[#1DB954]/40 w-full animate-pulse-slow" />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="absolute -right-8 -bottom-8 text-white/5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                    <Music className="w-56 h-56" />
                  </div>
                  
                  {/* Subtle noise pattern */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
                </motion.div>
              )}
            </AnimatePresence>

            {!token && (
              <div className="p-6 bg-[#1DB954]/5 border border-[#1DB954]/20 rounded-2xl flex items-start space-x-4">
                <Info className="w-6 h-6 text-[#1DB954] flex-shrink-0 mt-1" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#1DB954]">Spotify Required</p>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Pulse needs your Spotify connection to recommend tracks based on your mood. Please connect your account to start the experience.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Right Column: Recommendations */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                <Disc className="w-4 h-4" /> Acoustic Profile
              </h2>
              {tracks.length > 0 && (
                <button 
                  onClick={() => fetchRecommendations(emotion?.emotion || 'neutral')}
                  className="text-[10px] font-mono tracking-widest uppercase text-white/30 hover:text-white transition-colors"
                >
                  Refresh Feed
                </button>
              )}
            </div>
            
            <SpotifyPlayer tracks={tracks} isLoading={loading} emotion={emotion} token={token} />
            
            {error && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-mono"
              >
                {error}
              </motion.div>
            )}
          </section>
        </main>

        <footer className="mt-32 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-white/20 text-[10px] font-mono uppercase tracking-widest">
            Pulse © 2026 / Emotion Analysis by face-api.js
          </p>
          <div className="flex space-x-8">
            <span className="text-white/20 text-[10px] font-mono uppercase tracking-widest">Latency: ~2ms</span>
            <span className="text-white/20 text-[10px] font-mono uppercase tracking-widest">Model: TinyFaceV2</span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes slow-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: slow-spin 8s linear infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; width: 0%; }
          50% { opacity: 1; width: 100%; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
