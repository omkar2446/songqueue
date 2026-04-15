import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { Music2 } from 'lucide-react';
import api, { BASE_URL } from '../services/api';

// EQ frequency centres matching EqualizerPanel
const EQ_FREQS = [60, 250, 1000, 4000, 16000];

const MusicPlayer = () => {
    const {
        currentSong, queue, isPlaying, setIsPlaying,
        playbackTime, setPlaybackTime, duration, setDuration,
        volume, playbackRate,
        eqBands, normalizeVolume
    } = useRoom();
    
    const socket = useSocket();
    const [isBuffering, setIsBuffering] = useState(false);
    
    // Core references
    const audioRef = useRef(null);
    const audioCtx = useRef(null);
    const sourceNode = useRef(null);
    const eqNodes = useRef([]);
    const compressor = useRef(null);
    const gainNode = useRef(null);
    const lastSongId = useRef(null);

    /* ── Audio Graph Setup ─────────────────── */
    const initAudioGraph = useCallback(() => {
        if (!audioRef.current) return;
        
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const ctx = audioCtx.current;

        // Ensure single source node per audio element
        if (!sourceNode.current) {
            sourceNode.current = ctx.createMediaElementSource(audioRef.current);
        }

        // Cleanup old nodes
        eqNodes.current.forEach(f => { try { f.disconnect(); } catch(e){} });
        if (compressor.current) { try { compressor.current.disconnect(); } catch(e){} }
        if (gainNode.current) { try { gainNode.current.disconnect(); } catch(e){} }

        // Filters
        eqNodes.current = EQ_FREQS.map((freq, i) => {
            const f = ctx.createBiquadFilter();
            f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
            f.frequency.value = freq;
            f.gain.value = eqBands[i] || 0;
            return f;
        });

        // Limiter/Normalize
        compressor.current = ctx.createDynamicsCompressor();
        compressor.current.threshold.value = -24;
        compressor.current.knee.value = 30;
        compressor.current.ratio.value = 4;
        compressor.current.attack.value = 0.003;
        compressor.current.release.value = 0.25;

        // Master Gain
        gainNode.current = ctx.createGain();
        gainNode.current.gain.value = volume / 100;

        // Wiring
        let node = sourceNode.current;
        eqNodes.current.forEach(f => { node.connect(f); node = f; });
        
        if (normalizeVolume) {
            node.connect(compressor.current);
            compressor.current.connect(gainNode.current);
        } else {
            node.connect(gainNode.current);
        }
        
        gainNode.current.connect(ctx.destination);
    }, [eqBands, normalizeVolume, volume]);

    /* ── Load Song URL Logic ─────────────────── */
    const loadSong = async () => {
        if (!currentSong || !audioRef.current) return;
        
        const audio = audioRef.current;
        setIsBuffering(true);

        try {
            let finalSrc = "";
            if (currentSong.source === 'youtube') {
                const res = await api.get(`/yt/stream/${currentSong.source_id}`);
                if (res.data.success && res.data.audio_url) {
                    finalSrc = res.data.audio_url;
                } else {
                    throw new Error("Could not get stream URL");
                }
            } else if (currentSong.source === 'file') {
                finalSrc = `${BASE_URL}/uploads/${currentSong.source_id}`;
            } else {
                finalSrc = currentSong.source_id;
            }

            // Set source and verify graph
            if (audio.src !== finalSrc) {
                audio.src = finalSrc;
                lastSongId.current = currentSong.id;
                initAudioGraph(); // Ensure graph is connected after src change
                audio.load();
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            console.error("Failed to load song src:", msg);
            setIsBuffering(false);
        }
    };

    /* ── Effects ─────────────────────────────── */

    // Sync volume/rate without re-init
    useEffect(() => {
        if (gainNode.current) gainNode.current.gain.value = volume / 100;
        if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [volume, playbackRate]);

    // Handle Song Change
    useEffect(() => {
        if (currentSong?.id !== lastSongId.current) {
            loadSong();
        }
    }, [currentSong?.id]);

    // Handle Play/Pause
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        if (isPlaying) {
            if (audioCtx.current?.state === 'suspended') audioCtx.current.resume();
            const p = audio.play();
            if (p) p.catch(e => console.warn("Play blocked:", e));
        } else {
            audio.pause();
        }
    }, [isPlaying]);

    // Sync Time
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (Math.abs(audio.currentTime - playbackTime) > 3) {
            audio.currentTime = playbackTime;
        }
    }, [playbackTime]);

    const onEnd = () => {
        const room_id = currentSong?.room_id; // Added fallback
        if (socket && room_id) {
            socket.emit('playback_control', { room_id, action: 'next' });
        }
    };

    if (!currentSong) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-white/20">
                <Music2 size={48} className="mb-4 opacity-10" />
                <p className="font-bold text-sm">Add a song to start</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-10">
            {/* Visualizer Area */}
            <div className="relative group p-8">
                <motion.div 
                    animate={isPlaying && !isBuffering ? { opacity: [0.2, 0.4, 0.2], scale: [1, 1.1, 1] } : { opacity: 0.1 }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute inset-0 blur-[100px] rounded-full bg-blue-500/30"
                />
                <motion.div
                    animate={isPlaying && !isBuffering ? { rotate: 360 } : {}}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    className="relative w-64 h-64 md:w-80 md:h-80 rounded-full border border-white/10 shadow-2xl overflow-hidden z-10 p-1 bg-white/5 backdrop-blur-md"
                >
                    <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover rounded-full opacity-60" />
                    <AnimatePresence>
                        {isBuffering && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            <div className="text-center px-4 max-w-2xl">
                <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter line-clamp-2">{currentSong.title}</h2>
                <p className="text-gray-400 mt-2 font-bold">{currentSong.artist}</p>
            </div>

            <audio
                ref={audioRef}
                onLoadedMetadata={e => { setDuration?.(e.target.duration); setIsBuffering(false); }}
                onTimeUpdate={e => setPlaybackTime(e.target.currentTime)}
                onEnded={onEnd}
                onWaiting={() => setIsBuffering(true)}
                onCanPlay={() => setIsBuffering(false)}
                onPlaying={() => setIsBuffering(false)}
                onError={(e) => {
                    console.error("Audio error:", e.target.error);
                    setIsBuffering(false);
                }}
            />
        </div>
    );
};

export default MusicPlayer;
