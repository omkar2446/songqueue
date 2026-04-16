import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import YouTube from 'react-youtube';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { Music2, WifiOff, Tv2, X } from 'lucide-react';

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
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [songMeta, setSongMeta] = useState(null); // real metadata from oEmbed
    const progressIntervalRef = useRef(null);

    // ── Fetch real YouTube metadata via oEmbed (free, no API key) ──
    useEffect(() => {
        if (!currentSong?.source_id || currentSong.source !== 'youtube') {
            setSongMeta(null);
            return;
        }
        // Only fetch if title is generic
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
                    thumbnail: currentSong.thumbnail || `https://img.youtube.com/vi/${currentSong.source_id}/hqdefault.jpg`,
                });
            })
            .catch(() => {
                setSongMeta({
                    title: currentSong.title,
                    artist: currentSong.artist,
                    thumbnail: currentSong.thumbnail,
                });
            });
    }, [currentSong?.source_id]);

    // ── Poll playback time while playing ──
    useEffect(() => {
        if (isPlaying && isPlayerReady && playerRef.current) {
            progressIntervalRef.current = setInterval(() => {
                try {
                    const t = playerRef.current.getCurrentTime();
                    setPlaybackTime(t);
                } catch (_) {}
            }, 1000);
        } else {
            clearInterval(progressIntervalRef.current);
        }
        return () => clearInterval(progressIntervalRef.current);
    }, [isPlaying, isPlayerReady]);

    // ── Socket sync: commands from other clients ──
    useEffect(() => {
        if (!socket || !isPlayerReady || !playerRef.current) return;

        const handlePlaybackUpdate = (data) => {
            const player = playerRef.current;
            if (!player) return;
            try {
                if (data.action === 'play')  { player.playVideo();  setIsPlaying(true); }
                if (data.action === 'pause') { player.pauseVideo(); setIsPlaying(false); }
                if (data.action === 'seek')  { player.seekTo(parseFloat(data.value), true); setPlaybackTime(data.value); }
                if (data.action === 'stop')  { player.stopVideo(); setIsPlaying(false); }
            } catch (err) {
                console.warn('Socket sync failed:', err.message);
            }
        };

        socket.on('playback_update', handlePlaybackUpdate);
        return () => socket.off('playback_update', handlePlaybackUpdate);
    }, [socket, isPlayerReady]);

    // ── Volume + Normalize sync → YouTube player ──
    // For YouTube (cross-origin iframe), we control loudness via setVolume().
    // When Normalize is ON: cap at 80 to prevent excessive peaks.
    // The Web Audio compressor handles non-YT audio, but for YT we use this.
    useEffect(() => {
        if (!isPlayerReady || !playerRef.current) return;
        try {
            const ytVol = normalizeVolume ? Math.min(volume, 80) : volume;
            playerRef.current.setVolume(ytVol);
        } catch (_) {}
    }, [volume, normalizeVolume, isPlayerReady]);

    // ── YouTube Event Handlers ──
    const onReady = useCallback((event) => {
        const player = event.target;
        playerRef.current = player;
        setIsPlayerReady(true);
        setHasError(false);

        // Register player in context so PlaybackControls can call it directly
        if (setYtPlayer) setYtPlayer(player);

        // Get duration
        const dur = player.getDuration();
        if (dur) setDuration(dur);

        // Set volume
        player.setVolume(volume);

        // Activate Web Audio Engine (requires user gesture — fires after first click)
        resumeAudio();

        // If already playing (e.g. rejoining room mid-song), seek + play
        if (isPlaying) {
            if (playbackTime > 0) player.seekTo(playbackTime, true);
            player.playVideo();
        }
    }, [isPlaying, playbackTime, volume, setYtPlayer, resumeAudio]);

    const onStateChange = useCallback((event) => {
        const YT = window.YT?.PlayerState;
        if (!YT) return;

        if (event.data === YT.ENDED) {
            // Auto-advance to next song
            const roomId = window.location.pathname.split('/').pop();
            socket?.emit('playback_control', { room_id: roomId, action: 'next' });
        }

        if (event.data === YT.PLAYING) {
            const dur = event.target.getDuration();
            if (dur) setDuration(dur);
            setIsPlaying(true);
        }

        if (event.data === YT.PAUSED) {
            setIsPlaying(false);
        }
    }, [socket]);

    const onError = useCallback((e) => {
        console.error('YouTube Player Error:', e.data);
        // 2 = invalid video ID, 5 = HTML5 error, 100 = not found, 101/150 = embed restricted
        if ([2, 100, 101, 150].includes(e.data)) setHasError(true);
    }, []);

    // ── Reset on song change ──
    useEffect(() => {
        setIsPlayerReady(false);
        setHasError(false);
        if (setYtPlayer) setYtPlayer(null);
    }, [currentSong?.source_id]);

    if (!currentSong) return (
        <div className="flex flex-col items-center justify-center p-20 text-white/10">
            <Music2 size={64} className="animate-pulse mb-4" />
            <p>Ready to Sync</p>
        </div>
    );

    const displayTitle = songMeta?.title || currentSong.title;
    const displayArtist = songMeta?.artist || currentSong.artist;
    const displayThumb = songMeta?.thumbnail || currentSong.thumbnail;

    // Player config — CORRECT setup
    const playerOpts = {
        width: '560',
        height: '315',
        playerVars: {
            autoplay: 1,
            controls: 1,          // Always show controls — required for play to work on mobile
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,       // Required for iOS inline playback
            iv_load_policy: 3,
        },
    };

    return (
        <div className="w-full flex flex-col items-center gap-6">

            {/* Album Art / Video Toggle */}
            <div className="relative">
                {isPlaying && (
                    <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 bg-blue-500 blur-[100px] rounded-full"
                    />
                )}

                <AnimatePresence mode="wait">
                    {showVideo ? (
                        /* ── VIDEO VIEW ── */
                        <motion.div
                            key="video"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                            style={{ width: 560, maxWidth: '90vw', aspectRatio: '16/9' }}
                        >
                            <YouTube
                                videoId={currentSong.source_id}
                                opts={playerOpts}
                                onReady={onReady}
                                onStateChange={onStateChange}
                                onError={onError}
                                className="w-full h-full"
                                iframeClassName="w-full h-full rounded-2xl"
                            />
                            <button
                                onClick={() => setShowVideo(false)}
                                className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-20 transition-all hover:scale-110"
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    ) : (
                        /* ── ALBUM ART VIEW ── */
                        <motion.div
                            key="art"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-white/5 shadow-2xl z-10 p-1 bg-white/5 backdrop-blur-md"
                        >
                            <img
                                src={displayThumb}
                                alt=""
                                className="w-full h-full object-cover rounded-full"
                            />

                            {/* Watch Video button — appears on hover */}
                            <motion.button
                                onClick={() => setShowVideo(true)}
                                initial={{ opacity: 0 }}
                                whileHover={{ opacity: 1 }}
                                className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 rounded-full transition-all backdrop-blur-sm opacity-0 hover:opacity-100 z-20"
                            >
                                <Tv2 size={28} className="text-white" />
                                <span className="text-[11px] font-bold text-white/80">Watch Video</span>
                            </motion.button>

                            <AnimatePresence>
                                {hasError && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-4 rounded-full z-30">
                                        <WifiOff className="text-red-500 mb-2" />
                                        <p className="text-xs text-white font-bold">Video Restricted<br />Try another track</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Hidden player (audio-only when not showing video) — must have real dimensions */}
                {!showVideo && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            width: 1,
                            height: 1,
                            overflow: 'hidden',
                            opacity: 0,
                            pointerEvents: 'none',
                            top: 0,
                            left: 0,
                        }}
                    >
                        <YouTube
                            videoId={currentSong.source_id}
                            opts={playerOpts}
                            onReady={onReady}
                            onStateChange={onStateChange}
                            onError={onError}
                        />
                    </div>
                )}
            </div>

            {/* Song Info */}
            <div className="text-center">
                <h2 className="text-3xl font-black text-white line-clamp-1">{displayTitle}</h2>
                <p className="text-blue-400 font-bold tracking-widest uppercase text-xs mt-2">{displayArtist}</p>
            </div>
        </div>
    );
};

export default memo(MusicPlayer);
