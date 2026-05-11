import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, ExternalLink, Disc, SkipForward, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_urls: { spotify: string };
  preview_url: string | null;
}

interface SpotifyPlayerProps {
  tracks: Track[];
  isLoading: boolean;
  emotion: { emotion: string } | null;
  token: string | null;
}

export default function SpotifyPlayer({ tracks, isLoading, emotion, token }: SpotifyPlayerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('pulse_auto_sync') === 'true');
  
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const audioA = useRef<HTMLAudioElement | null>(null);
  const audioB = useRef<HTMLAudioElement | null>(null);
  const [activeAudio, setActiveAudio] = useState<'A' | 'B' | null>(null);
  
  const playbackTimer = useRef<NodeJS.Timeout | null>(null);
  const transitionRef = useRef(false);
  const lastOpenedTrackId = useRef<string | null>(null);

  // Constants from user request
  const CROSSFADE_DURATION = 3; // 2-4 sec
  const MIN_SONG_LENGTH = 20; // 20-40 sec
  const MAX_SONG_LENGTH = 40;

  useEffect(() => {
    localStorage.setItem('pulse_auto_sync', autoSync.toString());
  }, [autoSync]);

  // Handle auto-syncing Spotify (Remote Control)
  useEffect(() => {
    const syncToDevice = async () => {
      if (autoSync && token && tracks.length > 0 && tracks[0].id !== lastOpenedTrackId.current) {
        lastOpenedTrackId.current = tracks[0].id;
        
        try {
          await axios.put('/api/spotify/play', 
            { uri: `spotify:track:${tracks[0].id}` },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSyncError(null);
        } catch (err: any) {
          console.error('[Spotify Sync Error] ', err);
          if (err.response?.status === 404) {
             setSyncError("Device not found. Open Spotify on your phone/PC to sync playback.");
          } else {
             setSyncError("Sync failed. Check your connection.");
          }
          // Hide error after 8 seconds
          setTimeout(() => setSyncError(null), 8000);
        }
      }
    };

    syncToDevice();
  }, [tracks, autoSync, token]);

  const playTrack = (startIndex: number, isInitial = false) => {
    if (transitionRef.current || tracks.length === 0) return;
    
    // Find the next available track with a preview_url starting from startIndex
    let targetIdx = -1;
    for (let i = 0; i < tracks.length; i++) {
      const checkIdx = (startIndex + i) % tracks.length;
      if (tracks[checkIdx]?.preview_url) {
        targetIdx = checkIdx;
        break;
      }
    }

    if (targetIdx === -1) {
      console.warn("No tracks with preview_url found among", tracks.length, "tracks");
      // Still update UI to show metadata of the requested track
      setCurrentIdx(startIndex % tracks.length);
      setIsPlaying(false);
      // Only show the informative overlay if we haven't acknowledged the "no sound" state
      setNeedsInteraction(false); 
      transitionRef.current = false;
      return;
    }

    const track = tracks[targetIdx];
    transitionRef.current = true;
    
    // Setup next audio element
    const nextActive = activeAudio === 'A' ? 'B' : 'A';
    const nextAudioEl = nextActive === 'A' ? audioA.current : audioB.current;
    const currentAudioEl = activeAudio === 'A' ? audioA.current : audioB.current;

    if (nextAudioEl) {
      nextAudioEl.src = track.preview_url!;
      nextAudioEl.volume = 0;
      nextAudioEl.load(); // Force load
      
      const startPlayback = () => {
        const playPromise = nextAudioEl.play();
        
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsPlaying(true);
            setCurrentIdx(targetIdx);
            setNeedsInteraction(false);
            
            if (isInitial || !currentAudioEl || currentAudioEl.paused) {
              nextAudioEl.volume = 1;
              setActiveAudio(nextActive);
              transitionRef.current = false;
              if (currentAudioEl && currentAudioEl !== nextAudioEl) {
                currentAudioEl.pause();
              }
            } else {
              // Crossfade logic
              let step = 0;
              const steps = CROSSFADE_DURATION * 10;
              const fadeInterval = setInterval(() => {
                step++;
                const progress = step / steps;
                nextAudioEl.volume = progress;
                if (currentAudioEl) {
                  currentAudioEl.volume = Math.max(0, 1 - progress);
                }
                
                if (step >= steps) {
                  clearInterval(fadeInterval);
                  currentAudioEl?.pause();
                  setActiveAudio(nextActive);
                  transitionRef.current = false;
                }
              }, 100);
            }
          }).catch(err => {
            console.error("Autoplay/Play prevented:", err);
            transitionRef.current = false;
            setNeedsInteraction(true);
            setIsPlaying(false);
            setCurrentIdx(targetIdx);
          });
        }
      };

      startPlayback();
    }

    // Schedule next transition (User request: Demo length 20-40 sec)
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    const duration = Math.random() * (MAX_SONG_LENGTH - MIN_SONG_LENGTH) + MIN_SONG_LENGTH;
    playbackTimer.current = setTimeout(() => {
      const nextIndex = (targetIdx + 1) % tracks.length;
      playTrack(nextIndex);
    }, duration * 1000);
  };

  useEffect(() => {
    if (tracks.length > 0) {
      // Small delay to ensure refs are ready
      const timer = setTimeout(() => {
        // Force a transition to the first track of the new mood
        transitionRef.current = false; 
        playTrack(0, activeAudio === null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tracks]);

  useEffect(() => {
    return () => {
      if (playbackTimer.current) clearTimeout(playbackTimer.current);
    };
  }, []);

  const handleManualStart = () => {
    playTrack(currentIdx, activeAudio === null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-20 text-white/20 space-y-4">
          <Disc className="w-12 h-12 animate-spin-slow" />
          <p className="text-sm font-mono uppercase tracking-widest">Searching for perfectly tuned vibes...</p>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  const togglePlayback = () => {
    const el = activeAudio === 'A' ? audioA.current : audioB.current;
    if (el && el.src) {
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        el.play().then(() => {
          setIsPlaying(true);
          setNeedsInteraction(false);
        }).catch(() => setNeedsInteraction(true));
      }
    } else {
      playTrack(currentIdx, true);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header with Auto-Sync Toggle */}
      <div className="flex items-center justify-between px-2">
        <div className="flex flex-col">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">Active Vibe</h3>
          <p className="text-[8px] font-mono text-white/10 uppercase tracking-widest mt-0.5">Spotify Remote Connect</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button 
            onClick={() => setAutoSync(!autoSync)}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
              autoSync 
                ? 'bg-[#1DB954]/10 border-[#1DB954]/30 text-[#1DB954] shadow-[0_0_15px_rgba(29,185,84,0.1)]' 
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${autoSync ? 'bg-[#1DB954] animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {autoSync ? 'Device Sync ON' : 'Sync OFF'}
            </span>
          </button>
          <span className="text-[8px] font-mono text-white/10 uppercase tracking-tighter">Controls your active Spotify device</span>
        </div>
      </div>

      {/* Sync Status/Error Warning */}
      <AnimatePresence>
        {syncError && autoSync && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 animate-pulse" />
              <div className="flex-grow">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Synchronization Issue</p>
                <p className="text-[9px] text-amber-500/60 leading-tight mt-1">{syncError}</p>
              </div>
              <button onClick={() => setSyncError(null)} className="text-amber-500/40 hover:text-amber-500 p-1">
                <span className="text-xs">×</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio ref={audioA} preload="auto" playsInline crossOrigin="anonymous" onEnded={() => playTrack((currentIdx + 1) % tracks.length)} />
      <audio ref={audioB} preload="auto" playsInline crossOrigin="anonymous" onEnded={() => playTrack((currentIdx + 1) % tracks.length)} />

      {/* Autoplay Unlock Overlay */}
      <AnimatePresence>
        {needsInteraction && tracks.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 -top-4 -bottom-4 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl rounded-3xl border border-white/10 p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-6"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-[#1DB954] blur-2xl opacity-20 animate-pulse" />
                <button 
                  onClick={handleManualStart}
                  className="relative p-8 bg-[#1DB954] text-black rounded-full shadow-2xl transition-all duration-500 hover:scale-110 active:scale-95 group"
                >
                  <Play className="w-10 h-10 fill-current group-hover:scale-110 transition-transform" />
                </button>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-xl font-bold tracking-tight">Ready to sync?</h4>
                <p className="text-white/40 text-sm max-w-[280px] mx-auto font-light leading-relaxed">
                  {tracks.every(t => !t.preview_url) 
                    ? "Spotify previews are currently unavailable for these tracks in your region." 
                    : "Tap to activate the synchronized Pulse experience."}
                </p>
              </div>
              
              {tracks.some(t => !!t.preview_url) ? (
                <button 
                  onClick={handleManualStart}
                  className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#1DB954] hover:text-white transition-colors pt-4"
                >
                  Unmute Pulse Engine
                </button>
              ) : (
                <div className="flex flex-col gap-4 items-center">
                  <a 
                    href={tracks[currentIdx]?.external_urls.spotify}
                    target="_blank"
                    rel="no-referrer"
                    className="p-4 px-6 bg-[#1DB954] text-black rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open on Spotify
                  </a>
                  <button 
                    onClick={() => setNeedsInteraction(false)}
                    className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 hover:text-white transition-colors"
                  >
                    Continue without sound
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Track Card */}
      <AnimatePresence mode="wait">
        {tracks[currentIdx] && (
          <motion.div
            key={tracks[currentIdx].id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="p-6 bg-gradient-to-br from-white/10 to-transparent rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Disc className="w-24 h-24 animate-spin-slow" />
            </div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
              <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-xl ring-1 ring-white/20">
                <img 
                  src={tracks[currentIdx].album.images[0]?.url} 
                  alt={tracks[currentIdx].name} 
                  className="w-full h-full object-cover" 
                />
              </div>
              
              <div className="text-center md:text-left space-y-2 flex-grow">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  {tracks[currentIdx].preview_url ? (
                    <div className="flex space-x-1 items-end h-3">
                      {[...Array(4)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: isPlaying ? [4, 12, 4] : 4 }}
                          transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                          className="w-1 bg-[#1DB954] rounded-full"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-0.5 rounded-full bg-white/10 text-[8px] font-mono text-white/40 uppercase tracking-tighter">no preview available</div>
                  )}
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#1DB954]">
                    {tracks[currentIdx].preview_url ? (isPlaying ? 'Now Playing' : 'Paused') : 'Track Signal'}
                  </span>
                </div>
                <h4 className="text-2xl font-bold tracking-tight">{tracks[currentIdx].name}</h4>
                <p className="text-white/60 font-light">{tracks[currentIdx].artists.map(a => a.name).join(', ')}</p>
                
                <div className="flex items-center justify-center md:justify-start gap-4 pt-4">
                  {tracks[currentIdx].preview_url ? (
                    <button 
                      onClick={togglePlayback}
                      className="p-3 bg-white text-black rounded-full hover:scale-105 transition-transform"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>
                  ) : (
                    <a 
                      href={tracks[currentIdx].external_urls.spotify}
                      target="_blank"
                      rel="no-referrer"
                      className="p-3 bg-[#1DB954] text-black rounded-full hover:scale-105 transition-transform flex items-center gap-2 px-5"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span className="text-[10px] font-bold uppercase">Open Spotify</span>
                    </a>
                  )}
                  <button 
                    onClick={() => playTrack((currentIdx + 1) % tracks.length)}
                    className="p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2 text-white/30 ml-auto">
                    <Volume2 className="w-4 h-4" />
                    <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1 }}
                        className="h-full bg-white/40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-2">
        <AnimatePresence mode="popLayout">
          {tracks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-white/30 space-y-4"
            >
              <Music className="w-12 h-12" />
              <p className="text-sm font-mono uppercase tracking-widest text-center px-8">
                {isLoading ? "Fetching your rhythm..." : "Scanning for synchronization..."}<br/>
                <span className="text-[10px] opacity-50 uppercase mt-4 block leading-relaxed">
                  {tracks.length === 0 && !isLoading ? (
                    <>
                      Align your face to calibrate...<br/>
                      Detecting: <span className="text-white/80">{emotion?.emotion || "Searching..."}</span>
                    </>
                  ) : (
                    "Tuning into your frequency..."
                  )}
                </span>
              </p>
            </motion.div>
          ) : (
            tracks.slice(0, 8).map((track, i) => (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => playTrack(i)}
                className={`group flex items-center p-3 cursor-pointer rounded-xl border transition-all duration-300 backdrop-blur-sm ${
                  currentIdx === i && isPlaying 
                  ? 'bg-white/15 border-white/20' 
                  : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={track.album.images[0]?.url} alt={track.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${currentIdx === i && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Play className="w-4 h-4 text-white fill-current" />
                  </div>
                </div>
                
                <div className="ml-4 flex-grow min-w-0">
                  <h4 className={`text-sm font-medium truncate leading-tight ${currentIdx === i && isPlaying ? 'text-[#1DB954]' : 'text-white'}`}>{track.name}</h4>
                  <p className="text-white/40 text-[10px] truncate mt-0.5">{track.artists.map(a => a.name).join(', ')}</p>
                </div>

                <a
                  href={track.external_urls.spotify}
                  target="_blank"
                  rel="no-referrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-4 p-2 text-white/10 hover:text-[#1DB954] transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
