import React, { useEffect, useRef, useState, memo } from 'react';
import YouTube from 'react-youtube';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { Music2, WifiOff } from 'lucide-react';

const MusicPlayer = () => {
    const { 
        currentSong, isPlaying, 
        playbackTime, setPlaybackTime, 
        setDuration, volume, isPro
    } = useRoom();
    
    const socket = useSocket();
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [showVideo, setShowVideo] = useState(false);

    // ── 1. Critical Initialization Fixes ──
    const opts = {
        height: '0',
        width: '0',
        playerVars: {
            autoplay: 1,
            controls: isPro ? 0 : 1, // Let non-pro users see controls to skip ads
            disablekb: 1,
            modestbranding: 1,
            enablejsapi: 1,
            // Ensure origin is strictly defined without trailing slash for API stability
            origin: window.location.origin.replace(/\/$/, ''), 
            rel: 0,
            iv_load_policy: 3,
            widget_referrer: window.location.origin,
            host: 'https://www.youtube.com' // Explicitly set host to fix postMessage errors
        },
    };

    // ── 2. Handle Socket Sync (External -> Player) ──
    useEffect(() => {
        if (!socket || !isPlayerReady || !playerRef.current) return;

        const handlePlaybackUpdate = (data) => {
            const player = playerRef.current;
            try {
                if (data.action === 'play') player.playVideo();
                if (data.action === 'pause') player.pauseVideo();
                if (data.action === 'seek') player.seekTo(parseFloat(data.value), true);
            } catch (err) {
                console.warn("Socket sync failed: Player might be blocked by extension.");
            }
        };

        socket.on('playback_update', handlePlaybackUpdate);
        return () => socket.off('playback_update');
    }, [socket, isPlayerReady]);

    // ── 3. Handle Local State Sync (RoomContext -> Player) ──
    useEffect(() => {
        if (!isPlayerReady || !playerRef.current) return;
        const player = playerRef.current;
        
        // Sync Volume
        player.setVolume(volume);

        // Sync Play/Pause
        const state = player.getPlayerState();
        if (isPlaying && state !== 1) player.playVideo();
        if (!isPlaying && state === 1) player.pauseVideo();
        
        // Sync Time (with 2s drift protection)
        const currentSeconds = player.getCurrentTime();
        if (Math.abs(currentSeconds - playbackTime) > 2.5) {
            player.seekTo(playbackTime, true);
        }
    }, [isPlaying, playbackTime, isPlayerReady, volume]);

    // ── 4. YouTube Event Handlers ──
    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
        setHasError(false);
        setDuration(event.target.getDuration());
        
        // Final check: browser autoplay policy
        if (isPlaying) {
            const promise = event.target.playVideo();
            if (promise && promise.catch) {
                promise.catch(() => console.log("Autoplay blocked: Waiting for user interaction."));
            }
        }
    };

    const onStateChange = (event) => {
        // Handle Auto-Next on End
        if (event.data === (window.YT?.PlayerState?.ENDED || 0)) {
            socket?.emit('playback_control', { 
                room_id: currentSong?.room_id || window.location.pathname.split('/').pop(), 
                action: 'next' 
            });
        }
    };

    const onError = (e) => {
        console.error("YouTube Player Error:", e.data);
        // Error constants: 101 or 150 mean embedding is restricted
        if (e.data === 150 || e.data === 101) setHasError(true);
    };

    if (!currentSong) return (
        <div className="flex flex-col items-center justify-center p-20 text-white/10">
            <Music2 size={64} className="animate-pulse mb-4" />
            <p>Ready to Sync</p>
        </div>
    );

    return (
        <div className="w-full flex flex-col items-center gap-8">
            {/* Visualizer & Album Art */}
            <div className="relative">
                {isPlaying && (
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 bg-blue-500 blur-[100px] rounded-full"
                    />
                )}
                <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-white/5 shadow-2xl z-10 p-1 bg-white/5 backdrop-blur-md">
                    <img src={currentSong.thumbnail} alt="" className={`w-full h-full object-cover rounded-full transition-all duration-700 ${showVideo ? 'scale-150 blur-3xl opacity-20' : 'scale-100 opacity-100'}`} />
                    <AnimatePresence>
                        {isPlaying && !showVideo && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                onClick={() => setShowVideo(true)}
                                className="absolute inset-0 m-auto w-16 h-16 bg-blue-500/80 hover:bg-blue-500 text-white rounded-full flex items-center justify-center backdrop-blur-md shadow-2xl transition-all hover:scale-110 active:scale-95 group z-20"
                            >
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77.42-1.56.42-4.81.42-4.81s0-3.25-.42-4.81zM10 15V9l5.2 3L10 15z"/>
                                </svg>
                            </motion.button>
                        )}
                        {hasError && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-4">
                                <WifiOff className="text-red-500 mb-2" />
                                <p className="text-xs text-white font-bold">Video Restricted<br/>Try another track</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="text-center">
                <h2 className="text-3xl font-black text-white line-clamp-1">{currentSong.title}</h2>
                <p className="text-blue-400 font-bold tracking-widest uppercase text-xs mt-2">{currentSong.artist}</p>
            </div>

            {/* THE ENGINE */}
            <div className={`transition-all duration-500 rounded-lg overflow-hidden border border-white/10 ${
                (isPro && !showVideo)
                ? "opacity-0 pointer-events-none absolute left-[-9999px] w-0 h-0" 
                : "opacity-100 w-full max-w-[560px] aspect-video bg-black shadow-2xl mt-4 relative"
            }`}>
                {(!isPro || showVideo) && (
                    <div className="bg-blue-500/20 text-[10px] text-blue-400 px-2 py-1 flex items-center justify-between absolute top-0 left-0 right-0 z-10 backdrop-blur-md">
                        <span className="font-bold">{isPro ? 'PRO VIDEO MODE' : 'FREE VERSION - ADS SUPPORTED'}</span>
                        <button onClick={() => setShowVideo(false)} className="opacity-50 hover:opacity-100 italic">Hide Video</button>
                    </div>
                )}
                <YouTube 
                    videoId={currentSong.source_id} 
                    opts={{...opts, width: '100%', height: '100%'}} 
                    className="w-full h-full"
                    onReady={onReady}
                    onStateChange={onStateChange}
                    onError={onError}
                />
            </div>
        </div>
    );
};

export default memo(MusicPlayer);
