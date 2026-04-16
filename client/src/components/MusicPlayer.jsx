import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import YouTube from 'react-youtube';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { BASE_URL } from '../services/api';
import { Music2, WifiOff, Tv2, X, Volume2 } from 'lucide-react';

/**
 * MusicPlayer — Hybrid Player
 * Handles YouTube (via IFrame API) and Native Audio/Video (Direct links, Uploads).
 * Web Audio EQ applies ONLY to Native sources due to browser security (CORS).
 */
const MusicPlayer = () => {
    const {
        currentSong, isPlaying, setIsPlaying,
        playbackTime, setPlaybackTime,
        setDuration, volume, isPro,
        setYtPlayer,
        eqBands, normalizeVolume,
        resumeAudio,
    } = useRoom();

    const socket = useSocket();
    
    // Players
    const ytRef = useRef(null);
    const nativeRef = useRef(null);
    
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [songMeta, setSongMeta] = useState(null);
    const pollInterval = useRef(null);

    const isYoutube = currentSong?.source === 'youtube';

    // ── Static Metadata (YouTube oEmbed) ───────────────────
    useEffect(() => {
        if (!currentSong?.source_id || !isYoutube) {
            setSongMeta(null);
            return;
        }
        if (currentSong.title && currentSong.title !== 'YouTube Video') {
            setSongMeta({ title: currentSong.title, artist: currentSong.artist, thumbnail: currentSong.thumbnail });
            return;
        }
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${currentSong.source_id}&format=json`)
            .then(r => r.json())
            .then(data => {
                setSongMeta({
                    title: data.title || currentSong.title,
                    artist: data.author_name || currentSong.artist,
                    thumbnail: data.thumbnail_url || currentSong.thumbnail,
                });
            })
            .catch(() => setSongMeta(null));
    }, [currentSong?.source_id, isYoutube]);

    // ── Playback Polling ──────────────────────────────────
    useEffect(() => {
        if (isPlaying && isReady) {
            pollInterval.current = setInterval(() => {
                try {
                    let t = 0;
                    if (isYoutube && ytRef.current) {
                        t = ytRef.current.getCurrentTime();
                    } else if (nativeRef.current) {
                        t = nativeRef.current.currentTime;
                    }
                    if (t) setPlaybackTime(t);
                } catch (_) {}
            }, 1000);
        } else {
            clearInterval(pollInterval.current);
        }
        return () => clearInterval(pollInterval.current);
    }, [isPlaying, isReady, isYoutube]);

    // ── Socket Sync ──────────────────────────────────────
    useEffect(() => {
        if (!socket || !isReady) return;

        const handleUpdate = (data) => {
            try {
                if (isYoutube && ytRef.current) {
                    const p = ytRef.current;
                    if (data.action === 'play')  { p.playVideo(); setIsPlaying(true); }
                    if (data.action === 'pause') { p.pauseVideo(); setIsPlaying(false); }
                    if (data.action === 'seek')  { p.seekTo(parseFloat(data.value), true); setPlaybackTime(data.value); }
                } else if (nativeRef.current) {
                    const p = nativeRef.current;
                    if (data.action === 'play')  { p.play().catch(()=>{}); setIsPlaying(true); }
                    if (data.action === 'pause') { p.pause(); setIsPlaying(false); }
                    if (data.action === 'seek')  { p.currentTime = parseFloat(data.value); setPlaybackTime(data.value); }
                }
            } catch (err) {
                console.warn('Sync failed:', err);
            }
        };

        socket.on('playback_update', handleUpdate);
        return () => socket.off('playback_update', handleUpdate);
    }, [socket, isReady, isYoutube]);

    // ── Drift Alignment ──────────────────────────────────
    // If local time differs from server time by > 3s, force a seek.
    useEffect(() => {
        if (!isReady || !isPlaying) return;
        
        const player = isYoutube ? ytRef.current : nativeRef.current;
        if (!player) return;

        const currentPos = isYoutube ? player.getCurrentTime() : player.currentTime;
        const diff = Math.abs(currentPos - playbackTime);
        
        if (diff > 3.0) { 
             console.log('[Sync] Drift detected, aligning:', diff.toFixed(2), 's');
             if (isYoutube) player.seekTo(playbackTime, true);
             else player.currentTime = playbackTime;
        }
    }, [playbackTime, isReady, isPlaying, isYoutube]);

    // ── Native Audio Volume Sync ──────────────────────────
    // Note: EQ and Normalize (Compressor) are already applied via Web Audio 
    // for native elements because useAudioEngine connects them.
    useEffect(() => {
        if (!isYoutube && nativeRef.current) {
            nativeRef.current.volume = volume / 100;
        }
    }, [volume, isYoutube]);

    // ── YouTube Volume Sync (Custom Normalize) ───────────
    useEffect(() => {
        if (isYoutube && ytRef.current) {
            const ytVol = normalizeVolume ? Math.min(volume, 80) : volume;
            ytRef.current.setVolume(ytVol);
        }
    }, [volume, normalizeVolume, isYoutube, isReady]);

    // ── Handlers: YouTube ────────────────────────────────
    const onYtReady = (e) => {
        ytRef.current = e.target;
        setIsReady(true);
        setHasError(false);
        setYtPlayer(e.target);
        setDuration(e.target.getDuration());
        e.target.setVolume(volume);
        resumeAudio();
        if (isPlaying) {
            if (playbackTime > 0) e.target.seekTo(playbackTime, true);
            e.target.playVideo();
        }
    };

    const onYtStateChange = (e) => {
        const YT = window.YT?.PlayerState;
        if (!YT) return;
        if (e.data === YT.ENDED) socket?.emit('playback_control', { room_id: room.id, action: 'next' });
        if (e.data === YT.PLAYING) { setIsPlaying(true); setDuration(e.target.getDuration()); }
        if (e.data === YT.PAUSED) setIsPlaying(false);
    };

    // ── Handlers: Native ────────────────────────────────
    const onNativeLoaded = (e) => {
        setIsReady(true);
        setHasError(false);
        setDuration(e.target.duration);
        resumeAudio(); // This trigger scan() in useAudioEngine which connects this <video/audio> to EQ
        if (isPlaying) {
            e.target.currentTime = playbackTime;
            e.target.play().catch(()=>{});
        }
    };

    const onNativeEnded = () => {
        const roomId = window.location.pathname.split('/').pop();
        socket?.emit('playback_control', { room_id: roomId, action: 'next' });
    };

    // ── Reset ───────────────────────────────────────────
    useEffect(() => {
        setIsReady(false);
        setHasError(false);
        if (setYtPlayer) setYtPlayer(null);
    }, [currentSong?.id]);

    if (!currentSong) return (
        <div className="flex flex-col items-center justify-center p-20 text-white/10">
            <Music2 size={64} className="animate-pulse mb-4" />
            <p className="font-bold tracking-widest uppercase text-xs">Awaiting Track</p>
        </div>
    );

    const displayTitle = songMeta?.title || currentSong.title;
    const displayArtist = songMeta?.artist || currentSong.artist;
    const displayThumb = songMeta?.thumbnail || currentSong.thumbnail;

    // Resolve source URL
    let sourceUrl = currentSong.source_id;
    if (currentSong.source === 'upload') {
        sourceUrl = `${BASE_URL}/api/uploads/${currentSong.source_id}`;
    }

    return (
        <div className="w-full flex flex-col items-center gap-7">
            <div className="relative">
                {/* Background Glow */}
                {isPlaying && (
                    <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-x-0 -bottom-10 h-40 bg-blue-500 blur-[120px] rounded-full -z-10"
                    />
                )}

                <AnimatePresence mode="wait">
                    {/* ─── NATIVE PLAYER (Direct/Upload) ─── */}
                    {!isYoutube ? (
                        <motion.div
                             key="native" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                             className="relative w-64 h-64 md:w-80 md:h-80 rounded-[40px] overflow-hidden border border-white/10 shadow-2xl bg-black group"
                        >
                            <img src={displayThumb || '/placeholder.png'} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt="" />
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-gradient-to-t from-black via-transparent to-transparent">
                                <div className="p-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                                    <Music2 size={32} className="text-blue-400 mx-auto mb-2" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Native Playback</p>
                                </div>
                            </div>

                            {/* Actual Media Element */}
                            <video
                                ref={nativeRef}
                                src={sourceUrl}
                                crossOrigin="anonymous"
                                playsInline
                                onLoadedMetadata={onNativeLoaded}
                                onEnded={onNativeEnded}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                className="hidden"
                            />

                            {/* Status Overlay */}
                            <AnimatePresence>
                                {eqBands.some(v => v !== 0) && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 bg-violet-600 rounded-full shadow-lg">
                                        <div className="flex gap-0.5 items-end h-2.5">
                                            {[1,2,3].map(i => <motion.div key={i} animate={{ height: [4, 10, 4] }} transition={{ duration: 0.5, repeat: Infinity, delay: i*0.1 }} className="w-0.5 bg-white" />)}
                                        </div>
                                        <span className="text-[8px] font-black uppercase">EQ Active</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        /* ─── YOUTUBE PLAYER ─── */
                        <motion.div key="yt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {showVideo ? (
                                <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/10" style={{ width: 560, maxWidth: '90vw', aspectRatio: '16/9' }}>
                                    <YouTube videoId={currentSong.source_id} opts={{ playerVars: { autoplay: 1, controls: 1, origin: window.location.origin, playsinline: 1 } }} onReady={onYtReady} onStateChange={onYtStateChange} onError={() => setHasError(true)} className="w-full h-full" iframeClassName="w-full h-full" />
                                    <button onClick={() => setShowVideo(false)} className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-sm z-20"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-white/5 shadow-2xl p-1 bg-white/5 backdrop-blur-md group">
                                    <img src={displayThumb} className="w-full h-full object-cover rounded-full" alt="" />
                                    <motion.button onClick={() => setShowVideo(true)} whileHover={{ opacity: 1 }} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 rounded-full transition-all backdrop-blur-sm opacity-0 group-hover:opacity-100 z-20">
                                        <Tv2 size={28} className="text-white" />
                                        <span className="text-[11px] font-bold text-white/80">Watch Video</span>
                                    </motion.button>
                                    
                                    {/* Real Hidden YouTube IFrame */}
                                    <div className="hidden">
                                        <YouTube videoId={currentSong.source_id} opts={{ playerVars: { autoplay: 1, controls: 1, origin: window.location.origin, playsinline: 1 } }} onReady={onYtReady} onStateChange={onYtStateChange} />
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Song Info */}
            <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-white line-clamp-1 tracking-tight">{displayTitle}</h2>
                <div className="flex items-center justify-center gap-2 text-blue-400 font-black tracking-[0.2em] text-[10px] uppercase">
                    <span>{displayArtist}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>{currentSong.source}</span>
                </div>
            </div>
        </div>
    );
};

export default memo(MusicPlayer);
