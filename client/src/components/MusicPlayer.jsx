import React, { useEffect, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { Music2, WifiOff, Tv2, X, Sliders } from 'lucide-react';

/**
 * MusicPlayer — UI Component
 * Now purely visual, media elements are handled globally in App.jsx.
 */
const MusicPlayer = () => {
    const {
        currentSong, isPlaying, 
        playbackError, showVideo, setShowVideo,
        eqBands
    } = useRoom();

    const portalAnchorRef = useRef(null);
    const [songMeta, setSongMeta] = useState(null);
    
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

    // ── Teleport logic: Position the global IFrame over this container ───
    useEffect(() => {
        const portal = document.getElementById('global-yt-portal-target');
        if (!portal || !portalAnchorRef.current || !showVideo) {
            if (portal) {
                portal.style.opacity = '0';
                portal.style.visibility = 'hidden';
                portal.style.pointerEvents = 'none';
                portal.style.zIndex = '-50';
            }
            return;
        }

        const updatePos = () => {
             if (!portalAnchorRef.current) return;
             const rect = portalAnchorRef.current.getBoundingClientRect();
             portal.style.top = `${rect.top}px`;
             portal.style.left = `${rect.left}px`;
             portal.style.width = `${rect.width}px`;
             portal.style.height = `${rect.height}px`;
             portal.style.opacity = '1';
             portal.style.visibility = 'visible';
             portal.style.pointerEvents = 'auto';
             portal.style.zIndex = '40';
        };

        updatePos();
        window.addEventListener('resize', updatePos);
        const interval = setInterval(updatePos, 100); 

        return () => {
            window.removeEventListener('resize', updatePos);
            clearInterval(interval);
            portal.style.opacity = '0';
            portal.style.visibility = 'hidden';
            portal.style.pointerEvents = 'none';
            portal.style.zIndex = '-50';
        };
    }, [showVideo, currentSong?.id]);

    if (!currentSong) return (
        <div className="flex flex-col items-center justify-center p-20 text-white/10">
            <Music2 size={64} className="animate-pulse mb-4" />
            <p className="font-bold tracking-widest uppercase text-xs">Awaiting Track</p>
        </div>
    );

    const displayTitle = songMeta?.title || currentSong.title;
    const displayArtist = songMeta?.artist || currentSong.artist;
    const displayThumb = songMeta?.thumbnail || currentSong.thumbnail;

    return (
        <div className="w-full flex flex-col items-center gap-7">
            <div className="relative">
                {/* Background Glow */}
                {isPlaying && (
                    <motion.div
                        animate={{ opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-x-0 -bottom-10 h-40 bg-red-600 blur-[100px] rounded-full -z-10 sm:scale-125"
                    />
                )}

                <AnimatePresence mode="wait">
                    {/* ─── NATIVE VIEW (Audio Mode) ─── */}
                    {!showVideo || !isYoutube ? (
                        <motion.div
                             key="native-view" 
                             initial={{ opacity: 0, scale: 0.9 }} 
                             animate={{ opacity: 1, scale: 1 }} 
                             exit={{ opacity: 0, scale: 0.9 }}
                             className="relative w-64 h-64 md:w-80 md:h-80 rounded-[40px] overflow-hidden border border-white/10 shadow-2xl bg-black group"
                        >
                            <img src={displayThumb || '/placeholder.png'} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt="" />
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-gradient-to-t from-black via-transparent to-transparent">
                                <div className="p-5 bg-white/10 rounded-2xl border border-white/5 sm:backdrop-blur-md">
                                    {isYoutube ? <Sliders size={32} className="text-amber-400 mx-auto mb-2" /> : <Music2 size={32} className="text-red-400 mx-auto mb-2" />}
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                        {isYoutube ? 'EQ Processing Enabled' : 'Direct Playback'}
                                    </p>
                                </div>
                            </div>

                            {/* Watch Video button */}
                            {isYoutube && (
                                <motion.button 
                                    onClick={() => setShowVideo(true)} 
                                    whileHover={{ opacity: 1 }} 
                                    className="absolute inset-x-0 bottom-0 top-0 bg-black/60 flex flex-col items-center justify-center gap-2 transition-all opacity-0 group-hover:opacity-100 z-20 sm:backdrop-blur-sm"
                                >
                                    <Tv2 size={28} className="text-white" />
                                    <span className="text-[11px] font-bold text-white/80">Watch High-Res Video</span>
                                    <p className="text-[9px] text-amber-300 font-bold">(Audio EQ will disable)</p>
                                </motion.button>
                            )}

                            {/* EQ Indicator Overlay */}
                            <AnimatePresence>
                                {eqBands.some(v => v !== 0) && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 bg-red-600 rounded-full shadow-lg">
                                        <div className="flex gap-0.5 items-end h-2.5">
                                            {[1,2,3].map(i => <motion.div key={i} animate={{ height: [4, 10, 4] }} transition={{ duration: 0.5, repeat: Infinity, delay: i*0.1 }} className="w-0.5 bg-white" />)}
                                        </div>
                                        <span className="text-[8px] font-black uppercase">EQ Sync Active</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        /* ─── YOUTUBE IFRAME ANCHOR (Video Mode) ─── */
                        <motion.div key="iframe-view" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative">
                            <div 
                                ref={portalAnchorRef}
                                className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md" 
                                style={{ width: 560, maxWidth: '90vw', aspectRatio: '16/9' }}
                            >
                                <button onClick={() => setShowVideo(false)} className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-sm z-[50] transition-all active:scale-90" title="Switch to Audio EQ Mode"><X size={16} /></button>
                                
                                <div className="absolute top-3 left-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/5 pointer-events-none z-[50]">
                                    <p className="text-[10px] font-bold text-gray-400">HD Video Mode (No EQ)</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error State */}
                <AnimatePresence>
                    {playbackError && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-4 rounded-[40px] z-[60]">
                            <WifiOff className="text-red-500 mb-3" size={40} />
                            <h3 className="text-white font-bold">Playback Failed</h3>
                            {isYoutube ? (
                                <>
                                    <p className="text-xs text-gray-400 mt-1 px-4 leading-relaxed">YouTube blocked this stream proxy.<br/>Try switching to Video Mode.</p>
                                    <button onClick={() => setShowVideo(true)} className="mt-4 px-8 py-3 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black rounded-xl uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-500/20">Switch to Video</button>
                                </>
                            ) : (
                                <p className="text-xs text-gray-400 mt-1 px-4 leading-relaxed">This media could not be loaded.<br/>The file might be corrupted or inaccessible.</p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Song Info */}
            <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-white line-clamp-1 tracking-tight">{displayTitle}</h2>
                <div className="flex items-center justify-center gap-2 text-red-500 font-black tracking-[0.2em] text-[10px] uppercase">
                    <span>{displayArtist}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>{currentSong.source}</span>
                    {isYoutube && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/10 rounded-md text-[8px] font-black">
                            {showVideo ? 'HD' : 'PRO EQ'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(MusicPlayer);
