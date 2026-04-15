import React, { useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { Music2 } from 'lucide-react';
import { BASE_URL } from '../services/api';

// EQ frequency centres matching EqualizerPanel
const EQ_FREQS = [60, 250, 1000, 4000, 16000];

const MusicPlayer = () => {
    const {
        currentSong, queue, isPlaying, setIsPlaying,
        playbackTime, setPlaybackTime, duration, setDuration,
        volume, playbackRate,
        eqBands, normalizeVolume, crossfadeDuration
    } = useRoom();
    const socket = useSocket();

    const [isBuffering, setIsBuffering] = useState(false);

    const audioRef = useRef(null);
    const nextAudio = useRef(null); 
    const audioCtx = useRef(null);
    const sourceNode = useRef(null);
    const eqNodes = useRef([]);
    const compressor = useRef(null);
    const gainNode = useRef(null);

    /* ── Build / rebuild Web Audio chain ─────────────────── */
    const buildAudioChain = () => {
        if (!audioRef.current) return;
        
        // Ensure AudioContext exists
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const ctx = audioCtx.current;

        // CRITICAL FIX: Only create MediaElementSourceNode ONCE for each audio element.
        // If we already have a sourceNode, and it's connected to this EXACT element, skip creation.
        // However, since the <audio> tag has a 'key', it is destroyed and recreated on song change.
        // So we usually need a new sourceNode when the element changes.
        // We use a custom property on the element to track if it's already "sourced".
        if (audioRef.current._hasSourceNode && sourceNode.current) {
            console.log("Audio element already has a source node, skipping recreation.");
        } else {
            if (sourceNode.current) {
                try { sourceNode.current.disconnect(); } catch(e){}
            }
            sourceNode.current = ctx.createMediaElementSource(audioRef.current);
            audioRef.current._hasSourceNode = true;
        }

        // Always rebuild the rest of the chain (filters, compressor, etc.)
        // because eqBands or normalizeVolume might have changed.
        
        // Cleanup old chain
        eqNodes.current.forEach(f => { try { f.disconnect(); } catch(e){} });
        if (compressor.current) { try { compressor.current.disconnect(); } catch(e){} }
        if (gainNode.current) { try { gainNode.current.disconnect(); } catch(e){} }

        // Create Filters
        eqNodes.current = EQ_FREQS.map((freq, i) => {
            const f = ctx.createBiquadFilter();
            f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
            f.frequency.value = freq;
            f.gain.value = eqBands[i] || 0;
            return f;
        });

        // Create Compressor for Volume Normalization
        compressor.current = ctx.createDynamicsCompressor();
        compressor.current.threshold.value = -24;
        compressor.current.knee.value = 30;
        compressor.current.ratio.value = 4;
        compressor.current.attack.value = 0.003;
        compressor.current.release.value = 0.25;

        // Create Main Gain
        gainNode.current = ctx.createGain();
        gainNode.current.gain.value = 1;

        // Wire it up: Source -> EQ[0] -> ... -> EQ[n] -> (Compressor) -> Gain -> Destination
        let node = sourceNode.current;
        eqNodes.current.forEach(f => { 
            node.connect(f); 
            node = f; 
        });

        const lastNode = normalizeVolume ? compressor.current : gainNode.current;
        node.connect(lastNode);
        
        if (normalizeVolume) {
            compressor.current.connect(gainNode.current);
        }
        
        gainNode.current.connect(ctx.destination);
    };

    useEffect(() => {
        eqNodes.current.forEach((f, i) => {
            if (f) f.gain.value = eqBands[i] || 0;
        });
    }, [eqBands]);

    useEffect(() => {
        const sourcesWithAudio = ['file', 'youtube', 'direct'];
        if (sourcesWithAudio.includes(currentSong?.source) && audioCtx.current) {
            const ctx = audioCtx.current;
            if (sourceNode.current) {
                sourceNode.current.disconnect();
                eqNodes.current.forEach(f => f.disconnect());
                compressor.current.disconnect();
                gainNode.current.disconnect();
                
                let node = sourceNode.current;
                eqNodes.current.forEach(f => { node.connect(f); node = f; });
                node.connect(normalizeVolume ? compressor.current : gainNode.current);
                if (normalizeVolume) compressor.current.connect(gainNode.current);
                gainNode.current.connect(ctx.destination);
            }
        }
    }, [normalizeVolume]);


    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        buildAudioChain();
        
        if (isPlaying) {
            if (audioCtx.current?.state === 'suspended') {
                audioCtx.current.resume();
            }
            
            // Handle play promise to avoid AbortError when interrupted by pause
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.warn('Autoplay blocked:', error);
                    }
                });
            }
        } else {
            audio.pause();
        }
    }, [isPlaying, currentSong?.id]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (Math.abs(audio.currentTime - playbackTime) > 3) {
            audio.currentTime = playbackTime;
        }
    }, [playbackTime]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
            audioRef.current.playbackRate = playbackRate;
        }
    }, [volume, playbackRate]);

    const { room, user } = useRoom();
    const lastSyncTime = useRef(0);

    const onEnd = () => {
        if (socket && room?.id) {
            socket.emit('playback_control', { room_id: room.id, action: 'next' });
        }
    };

    if (!currentSong) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-white/20 select-none">
                <div className="w-24 h-24 border-2 border-dashed border-white/5 rounded-[32px] flex items-center justify-center mb-6">
                    <Music2 size={32} />
                </div>
                <h3 className="font-bold text-lg mb-2 text-white/40 font-display">Queue is empty</h3>
                <p className="text-xs max-w-[180px] text-center leading-relaxed">Add tracks to start the session. Music will sync across all devices.</p>
            </div>
        );
    }

    const renderVisualizer = () => {
        const sourceColor = currentSong.source === 'youtube' ? 'from-red-600 to-orange-600' : 
                           currentSong.source === 'file' ? 'from-blue-600 to-violet-600' :
                           'from-violet-600 to-pink-600';
        
        const glowColor = currentSong.source === 'youtube' ? 'shadow-red-500/20' : 
                         currentSong.source === 'file' ? 'shadow-blue-500/20' :
                         'shadow-violet-500/20';

        return (
            <div className="relative group p-8">
                {/* Glow Aura */}
                <motion.div 
                    animate={isPlaying && !isBuffering ? { 
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.15, 1] 
                    } : { opacity: 0.1 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className={`absolute inset-0 blur-[100px] rounded-full bg-gradient-to-br ${sourceColor} opacity-50`}
                />

                {/* Main Cover */}
                <motion.div
                    animate={isPlaying && !isBuffering ? { rotate: 360 } : {}}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className={`relative w-48 h-48 md:w-72 md:h-72 rounded-full p-1.5 bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl ${glowColor} flex items-center justify-center overflow-hidden z-10 transition-transform duration-500 hover:scale-105`}
                >
                    <div className="absolute inset-0 bg-black/40 z-10" />
                    {currentSong.thumbnail ? (
                        <img 
                            src={currentSong.thumbnail} 
                            alt="" 
                            className="absolute inset-0 w-full h-full object-cover grayscale-[10%] brightness-75 scale-110" 
                        />
                    ) : (
                        <div className={`absolute inset-0 bg-gradient-to-br ${sourceColor} opacity-80`} />
                    )}

                    {/* Vinyl Center Hole Decor */}
                    <div className="w-14 h-14 bg-black rounded-full border-[10px] border-white/10 z-20 flex items-center justify-center shadow-inner">
                        <div className="w-3 h-3 bg-white/20 rounded-full" />
                    </div>

                    {/* Buffer Overlay */}
                    <AnimatePresence>
                        {isBuffering && (
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center gap-3"
                            >
                                <motion.div 
                                    animate={{ rotate: 360 }} 
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    className="w-16 h-16 border-4 border-white/10 border-t-white rounded-full" 
                                />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Exploring</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Source Badge */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 px-5 py-2 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-full flex items-center gap-2.5 shadow-2xl">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${currentSong.source === 'youtube' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-blue-500 shadow-[0_0_10px_#3b82f6]'}`} />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/90">{currentSong.source}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-10 transition-all duration-700">
            {renderVisualizer()}

            <div className="text-center space-y-3 z-10">
                <motion.h2 
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                    key={currentSong.id}
                    className="text-3xl md:text-5xl font-black tracking-tighter text-white max-w-xl mx-auto line-clamp-2 px-4 leading-[0.9]"
                >
                    {currentSong.title}
                </motion.h2>
                <motion.p 
                    initial={{ opacity: 0 }} animate={{ opacity: 0.6 }}
                    className="text-gray-400 text-base md:text-lg font-bold tracking-tight"
                >
                    {currentSong.artist}
                </motion.p>
                {currentSong.added_by && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}
                        className="text-[10px] uppercase tracking-[0.3em] font-black text-gray-400 pt-4"
                    >
                        CURATED BY {currentSong.added_by}
                    </motion.div>
                )}
            </div>

            <audio
                key={currentSong.id}
                ref={audioRef}
                crossOrigin="anonymous"
                src={currentSong.source === 'youtube' 
                    ? `${BASE_URL}/api/yt/stream/${currentSong.source_id}`
                    : currentSong.source === 'file'
                    ? `${BASE_URL}/uploads/${currentSong.source_id}`
                    : currentSong.source_id}
                onLoadedMetadata={e => { setDuration?.(e.target.duration); setIsBuffering(false); }}
                onTimeUpdate={e => setPlaybackTime(e.target.currentTime)}
                onEnded={onEnd}
                onWaiting={() => setIsBuffering(true)}
                onCanPlay={() => setIsBuffering(false)}
                onPlaying={() => setIsBuffering(false)}
                onError={(e) => {
                    console.error("Audio error details:", e.target.error);
                    setIsBuffering(false);
                    // If it's a 403 or 500, we might want to try to skip or alert
                }}
            />
        </div>
    );
};

export default MusicPlayer;
