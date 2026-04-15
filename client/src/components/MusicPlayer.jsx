import React, { useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { Music2 } from 'lucide-react';

const MusicPlayer = () => {
    const { 
        currentSong, isPlaying, setIsPlaying, 
        playbackTime, setPlaybackTime, 
        duration, setDuration,
        volume, playbackRate 
    } = useRoom();
    
    const socket = useSocket();
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);

    // YouTube Options
    const opts = {
        height: '0',
        width: '0',
        playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            origin: window.location.origin,
            rel: 0
        },
    };

    // ── Sync Socket Changes ──
    useEffect(() => {
        if (!socket || !isPlayerReady || !playerRef.current) return;

        const handlePlaybackUpdate = (data) => {
            const player = playerRef.current;
            if (data.action === 'play') player.playVideo();
            if (data.action === 'pause') player.pauseVideo();
            if (data.action === 'seek') player.seekTo(parseFloat(data.value));
        };

        socket.on('playback_update', handlePlaybackUpdate);
        return () => socket.off('playback_update');
    }, [socket, isPlayerReady]);

    // ── Internal State Sync ──
    useEffect(() => {
        if (!isPlayerReady || !playerRef.current) return;
        const player = playerRef.current;
        
        // Sync Status
        if (isPlaying) player.playVideo();
        else player.pauseVideo();
        
        // Sync Time (Allow 2s drift)
        const currentSeconds = player.getCurrentTime();
        if (Math.abs(currentSeconds - playbackTime) > 2) {
            player.seekTo(playbackTime);
        }
    }, [isPlaying, playbackTime, isPlayerReady]);

    // ── Volume & Speed Sync ──
    useEffect(() => {
        if (isPlayerReady && playerRef.current) {
            playerRef.current.setVolume(volume);
            playerRef.current.setPlaybackRate(playbackRate);
        }
    }, [volume, playbackRate, isPlayerReady]);

    // ── Player Handlers ──
    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
        setDuration(event.target.getDuration());
        if (isPlaying) event.target.playVideo();
    };

    const onError = (e) => {
        console.error("YouTube Player Error:", e.data);
        setIsBuffering(false);
    };

    const onStateChange = (event) => {
        // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: cued
        setIsBuffering(event.data === 3);
        
        if (event.data === 0) { // ENDED
            if (socket) {
                socket.emit('playback_control', { 
                    room_id: currentSong?.room_id || window.location.pathname.split('/').pop(), 
                    action: 'next' 
                });
            }
        }
    };

    // Tracking Loop
    useEffect(() => {
        const interval = setInterval(() => {
            if (isPlayerReady && playerRef.current && isPlaying) {
                setPlaybackTime(playerRef.current.getCurrentTime());
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isPlayerReady, isPlaying]);

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

            {/* Hidden Player Engine */}
            <div className="hidden pointer-events-none opacity-0 overflow-hidden w-0 h-0">
                <YouTube 
                    key={currentSong.source_id}
                    videoId={currentSong.source_id} 
                    opts={opts} 
                    onReady={onReady}
                    onStateChange={onStateChange}
                    onError={onError}
                />
            </div>
        </div>
    );
};

export default MusicPlayer;
