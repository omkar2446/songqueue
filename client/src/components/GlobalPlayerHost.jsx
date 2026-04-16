import React, { useEffect, useRef, useState, memo } from 'react';
import YouTube from 'react-youtube';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import { BASE_URL } from '../services/api';

/**
 * GlobalPlayerHost — Handles the actual media playback.
 * Stays mounted in App.jsx so music doesn't stop on navigation.
 */
const GlobalPlayerHost = () => {
    const {
        currentSong, isPlaying, setIsPlaying,
        playbackTime, setPlaybackTime,
        setDuration, volume, 
        setYtPlayer,
        normalizeVolume,
        resumeAudio,
        showVideo, setShowVideo,
        setPlaybackError
    } = useRoom();

    const socket = useSocket();
    const ytRef = useRef(null);
    const nativeRef = useRef(null);
    const [isInternalReady, setIsInternalReady] = useState(false);
    const pollInterval = useRef(null);

    const isYoutube = currentSong?.source === 'youtube';

    // ── Playback Polling ──────────────────────────────────
    useEffect(() => {
        if (isPlaying && isInternalReady) {
            pollInterval.current = setInterval(() => {
                try {
                    let t = 0;
                    if (isYoutube && showVideo && ytRef.current) {
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
    }, [isPlaying, isInternalReady, isYoutube, showVideo]);

    // ── Socket Sync ──────────────────────────────────────
    useEffect(() => {
        if (!socket || !isInternalReady) return;

        const handleUpdate = (data) => {
            try {
                if (isYoutube && showVideo && ytRef.current) {
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
    }, [socket, isInternalReady, isYoutube, showVideo]);

    // ── Drift Alignment ──────────────────────────────────
    useEffect(() => {
        if (!isInternalReady || !isPlaying) return;
        const player = (isYoutube && showVideo) ? ytRef.current : nativeRef.current;
        if (!player) return;

        const currentPos = (isYoutube && showVideo) ? player.getCurrentTime() : player.currentTime;
        const diff = Math.abs(currentPos - playbackTime);
        
        if (diff > 4.0) { 
             if (isYoutube && showVideo) player.seekTo(playbackTime, true);
             else player.currentTime = playbackTime;
        }
    }, [playbackTime, isInternalReady, isPlaying, isYoutube, showVideo]);

    // ── Volume Sync ──────────────────────────────────────
    useEffect(() => {
        if (isYoutube && showVideo && ytRef.current) {
            const ytVol = normalizeVolume ? Math.min(volume, 80) : volume;
            ytRef.current.setVolume(ytVol);
        } else if (nativeRef.current) {
            nativeRef.current.volume = volume / 100;
        }
    }, [volume, normalizeVolume, isYoutube, showVideo, isInternalReady]);

    // ── Handlers ───────────────────────────────────────
    const onYtReady = (e) => {
        ytRef.current = e.target;
        setIsInternalReady(true);
        setPlaybackError(false);
        setYtPlayer(e.target);
        setDuration(e.target.getDuration());
        resumeAudio();
        if (isPlaying) e.target.playVideo();
    };

    const onNativeLoaded = (e) => {
        setIsInternalReady(true);
        setPlaybackError(false);
        setDuration(e.target.duration);
        resumeAudio(); 
        if (isPlaying) e.target.play().catch(()=>{});
    };

    useEffect(() => {
        setIsInternalReady(false);
        setPlaybackError(false);
    }, [currentSong?.id, showVideo]);

    if (!currentSong) return null;

    let sourceUrl = currentSong.source_id;
    if (currentSong.source === 'upload') {
        sourceUrl = `${BASE_URL}/api/uploads/${currentSong.source_id}`;
    } else if (currentSong.source === 'youtube' && !showVideo) {
        sourceUrl = `${BASE_URL}/api/yt/stream/${currentSong.source_id}`;
    }

    return (
        <>
            {/* Global Media Elements (Hidden by default) */}
            <div className="fixed -left-[9999px] -top-[9999px] w-1 h-1 overflow-hidden opacity-0 pointer-events-none z-[-1]">
                {!showVideo && isYoutube && (
                    <video key="v-none" /> /* placeholder */
                )}
                {!showVideo || !isYoutube ? (
                    <video
                        key={`${currentSong.id}-${currentSong.source}`}
                        ref={nativeRef}
                        src={sourceUrl}
                        crossOrigin="anonymous"
                        playsInline
                        onLoadedMetadata={onNativeLoaded}
                        onEnded={() => socket?.emit('playback_control', { room_id: currentSong.room_id, action: 'next' })}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onError={() => { if (sourceUrl) setPlaybackError(true); }}
                    />
                ) : null}
            </div>

            {/* YouTube IFrame — Positioned via CSS 'teleport' from MusicPlayer */}
            {isYoutube && showVideo && (
                <div id="global-yt-portal-target" className="fixed pointer-events-none opacity-0 invisible -z-50 overflow-hidden rounded-3xl">
                     <YouTube 
                        videoId={currentSong.source_id} 
                        opts={{ playerVars: { autoplay: 1, controls: 1, origin: window.location.origin, playsinline: 1 } }} 
                        onReady={onYtReady} 
                        onStateChange={(e) => {
                            const YT = window.YT?.PlayerState;
                            if (e.data === YT.ENDED) socket?.emit('playback_control', { room_id: currentSong.room_id, action: 'next' });
                            if (e.data === YT.PLAYING) setIsPlaying(true);
                            if (e.data === YT.PAUSED) setIsPlaying(false);
                        }} 
                        onError={() => setPlaybackError(true)} 
                        className="w-full h-full"
                        iframeClassName="w-full h-full"
                    />
                </div>
            )}
        </>
    );
};

export default memo(GlobalPlayerHost);
