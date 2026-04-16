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
                    <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover rounded-full" />
                    <AnimatePresence>
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
                isPro 
                ? "opacity-0 pointer-events-none absolute left-[-9999px] w-0 h-0" 
                : "opacity-100 w-[300px] h-[169px] bg-black shadow-2xl mt-4"
            }`}>
                {!isPro && (
                    <div className="bg-blue-500/20 text-[10px] text-blue-400 px-2 py-1 flex items-center justify-between">
                        <span className="font-bold">FREE VERSION - ADS SUPPORTED</span>
                        <span className="opacity-50 italic">Go PRO to hide</span>
                    </div>
                )}
                <YouTube 
                    videoId={currentSong.source_id} 
                    opts={{...opts, width: isPro ? '0' : '300', height: isPro ? '0' : '169'}} 
                    onReady={onReady}
                    onStateChange={onStateChange}
                    onError={onError}
                />
            </div>
        </div>
    );
};

export default memo(MusicPlayer);
