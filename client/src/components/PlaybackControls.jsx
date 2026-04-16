import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import {
    Play, Pause, SkipBack, SkipForward,
    Repeat, Repeat1, Shuffle, Volume2, VolumeX, Volume1,
    Gauge, Sliders, Zap
} from 'lucide-react';

const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
};

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const VolumeIcon = ({ v }) => {
    if (v === 0) return <VolumeX size={18} />;
    if (v < 40)  return <Volume1 size={18} />;
    return <Volume2 size={18} />;
};

/*────────────────────────────────────────────────────────
  SEEK BAR
────────────────────────────────────────────────────────*/
const SeekBar = ({ current, total, onSeek }) => {
    const barRef  = useRef(null);
    const [hover, setHover] = useState(false);
    const [hx, setHx]       = useState(0);

    const pct  = total ? Math.min((current / total) * 100, 100) : 0;
    const barW = () => barRef.current?.getBoundingClientRect().width || 1;

    const getT = (e) => {
        const r = barRef.current.getBoundingClientRect();
        return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * (total || 0);
    };

    return (
        <div
            ref={barRef}
            className="relative h-8 flex items-center cursor-pointer group select-none"
            onClick={e => onSeek(getT(e))}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseMove={e => { const r = barRef.current.getBoundingClientRect(); setHx(Math.max(0, Math.min(e.clientX - r.left, r.width))); }}
        >
            <div className="w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/10 overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-red-500 to-rose-600 rounded-full"
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 40, mass: 0.5 }}
                />
            </div>
            <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none"
                animate={{ left: `${pct}%`, scale: hover ? 1.4 : 1, opacity: hover ? 1 : 0 }}
                style={{ marginLeft: '-6px' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
            {hover && (
                <div
                    className="absolute bottom-6 text-[11px] bg-black/80 text-white px-2 py-1 rounded-lg pointer-events-none -translate-x-1/2 whitespace-nowrap"
                    style={{ left: hx }}
                >
                    {fmt(hx / barW() * total)}
                </div>
            )}
        </div>
    );
};

/*────────────────────────────────────────────────────────
  CROSSFADE POPUP
────────────────────────────────────────────────────────*/
const CrossfadePopup = ({ value, onChange, onClose }) => (
    <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute bottom-full mb-3 right-0 bg-[#1a1827] border border-white/10 rounded-2xl p-4 shadow-2xl w-64 z-50"
    >
        <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Crossfade</p>
        <div className="flex items-center gap-3">
            <input
                type="range" min="0" max="12" step="0.5"
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="flex-1 accent-red-500 cursor-pointer"
            />
            <span className="text-sm font-mono text-red-500 w-10">{value}s</span>
        </div>
        <p className="text-[11px] text-gray-600 mt-2">Smooth blend between songs (0 = instant)</p>
    </motion.div>
);

/*────────────────────────────────────────────────────────
  MAIN COMPONENT
────────────────────────────────────────────────────────*/
const PlaybackControls = ({ onOpenEQ }) => {
    const {
        currentSong, queue, isPlaying, setIsPlaying,
        playbackTime, setPlaybackTime, duration,
        volume, setVolume,
        playbackRate, setPlaybackRate,
        repeatMode, setRepeatMode,
        shuffleMode, setShuffleMode,
        crossfadeDuration, setCrossfadeDuration,
        normalizeVolume, setNormalizeVolume,
        eqBands,
        hasInteracted, setHasInteracted,
        room, user, fetchRoomState,
        isPro, setIsPro,
        ytPlayer,
        resumeAudio,
    } = useRoom();
    const socket = useSocket();

    const [showSpeed,     setShowSpeed]     = useState(false);
    const [showCrossfade, setShowCrossfade] = useState(false);
    const [showProModal,  setShowProModal]  = useState(false);
    const [proPass,       setProPass]       = useState('');
    const [prevVol,       setPrevVol]       = useState(80);
    const lastPrevTap = useRef(0);

    const emit = (action, value) => {
        if (!socket || !room?.id) return;
        socket.emit('playback_control', { room_id: room.id, action, value });
    };

    const handlePlayPause = () => {
        setHasInteracted(true);
        const next = !isPlaying;
        setIsPlaying(next);
        // Resume AudioContext inside user gesture (required by browser autoplay policy)
        resumeAudio();
        // Call YouTube player DIRECTLY in user gesture context
        try {
            if (ytPlayer) {
                if (next) ytPlayer.playVideo();
                else       ytPlayer.pauseVideo();
            }
        } catch (_) {}
        emit(next ? 'play' : 'pause');
    };

    const handleSeek = (t) => {
        setHasInteracted(true);
        setPlaybackTime(t);
        try { if (ytPlayer) ytPlayer.seekTo(t, true); } catch (_) {}
        emit('seek', t);
    };

    const handleNext = () => {
        setHasInteracted(true);
        emit('next');
    };

    const handlePrev = () => {
        setHasInteracted(true);
        const now = Date.now();
        if (now - lastPrevTap.current < 400) {
            handleSeek(0);
        } else if (playbackTime > 3) {
            handleSeek(0);
        } else {
            emit('prev');
        }
        lastPrevTap.current = now;
    };

    const cycleRepeat = () => {
        const next = (repeatMode + 1) % 3;
        setRepeatMode(next);
        emit('set_repeat', next);
    };

    const toggleShuffle = () => {
        const next = !shuffleMode;
        setShuffleMode(next);
        emit('set_shuffle', next);
    };

    const handleVolume = (v) => {
        setVolume(v);
        if (v > 0) setPrevVol(v);
    };
    const toggleMute = () => handleVolume(volume === 0 ? prevVol : 0);

    const togglePro = () => {
        if (isPro) {
            // Turning it off doesn't need a password
            handleProActivation(false);
        } else {
            setShowProModal(true);
        }
    };

    const handleProActivation = async (status) => {
        setIsPro(status);
        try {
            await api.post('/auth/update_pro', { is_pro: status });
            const storedUser = JSON.parse(localStorage.getItem('user'));
            if (storedUser) {
                storedUser.is_pro = status;
                localStorage.setItem('user', JSON.stringify(storedUser));
            }
        } catch (err) {
            console.error('Failed to sync PRO status', err);
        }
    };

    const submitProPass = (e) => {
        e.preventDefault();
        if (proPass === 'myloveS') {
            handleProActivation(true);
            setShowProModal(false);
            setProPass('');
        } else {
            alert("Incorrect access key.");
        }
    };

    const RepeatIcon = repeatMode === 2 ? Repeat1 : Repeat;
    const repeatLabel = ['Off', 'All', 'One'][repeatMode];

    return (
        <div className="w-full px-6 py-4 flex flex-col gap-4 select-none">

            {/* ─── Song Info ─── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentSong?.id || 'empty'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-4"
                >
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg bg-white/5">
                        {currentSong?.thumbnail
                            ? <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
                        }
                        {isPlaying && currentSong && (
                            <div className="absolute inset-0 bg-black/40 flex items-end justify-center pb-1 gap-px">
                                {[1,2,3,4].map(i => (
                                    <motion.div key={`bar-${i}`}
                                        className="w-0.5 bg-white rounded-full"
                                        animate={{ height: ['4px','12px','4px'] }}
                                        transition={{ duration: 0.5 + i*0.1, repeat: Infinity, delay: i*0.1 }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{currentSong?.title || 'No song playing'}</p>
                        <p className="text-xs text-gray-500 truncate">{currentSong?.artist || (currentSong ? 'Unknown Artist' : 'Add a song to get started')}</p>
                    </div>

                    {/* Speed */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowSpeed(v => !v); setShowCrossfade(false); }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${playbackRate !== 1 ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                        >
                            <Gauge size={11} />{playbackRate}×
                        </button>
                        <AnimatePresence>
                            {showSpeed && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="absolute bottom-full right-0 mb-2 bg-[#1a1827] border border-white/10 rounded-2xl p-1 shadow-2xl w-24 z-50"
                                >
                                    {SPEEDS.map(s => (
                                        <button key={s}
                                            onClick={() => { setPlaybackRate(s); emit('speed', s); setShowSpeed(false); }}
                                            className={`w-full text-center py-1.5 rounded-xl text-xs font-bold transition-colors ${playbackRate === s ? 'bg-red-500/30 text-red-300' : 'hover:bg-white/5 text-gray-400'}`}
                                        >{s}×</button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* ─── Seek Bar ─── */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-600 w-8">{fmt(playbackTime)}</span>
                <div className="flex-1">
                    <SeekBar current={playbackTime} total={duration} onSeek={handleSeek} />
                </div>
                <span className="text-[11px] font-mono text-gray-600 w-8 text-right">{fmt(duration)}</span>
            </div>

            {/* ─── Transport Row ─── */}
            <div className="flex items-center justify-between">
                {/* Left: Shuffle + Repeat */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleShuffle}
                        title="Shuffle"
                        className={`p-2 rounded-xl transition-all ${shuffleMode ? 'text-red-500 bg-red-500/10' : 'text-gray-600 hover:text-white hover:bg-white/5'}`}
                    >
                        <Shuffle size={16} />
                    </button>
                    <button
                        onClick={cycleRepeat}
                        title={`Repeat: ${repeatLabel}`}
                        className={`relative p-2 rounded-xl transition-all ${repeatMode > 0 ? 'text-red-500 bg-red-500/10' : 'text-gray-600 hover:text-white hover:bg-white/5'}`}
                    >
                        <RepeatIcon size={16} />
                        {repeatMode > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold bg-red-500 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center">
                                {repeatMode === 1 ? '∞' : '1'}
                            </span>
                        )}
                    </button>
                </div>

                {/* Center: Prev / Play / Next */}
                <div className="flex items-center gap-5">
                    <button onClick={handlePrev} className="text-gray-400 hover:text-white transition-colors hover:scale-110 active:scale-90">
                        <SkipBack size={22} fill="currentColor" />
                    </button>
                    <motion.button
                        onClick={handlePlayPause}
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.2)] hover:shadow-[0_0_32px_rgba(255,255,255,0.4)] transition-shadow"
                    >
                        <AnimatePresence mode="wait">
                            {isPlaying
                                ? <motion.div key="p" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}>
                                    <Pause size={26} fill="black" />
                                  </motion.div>
                                : <motion.div key="pl" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}>
                                    <Play size={26} fill="black" className="ml-0.5" />
                                  </motion.div>
                            }
                        </AnimatePresence>
                    </motion.button>
                    <button onClick={handleNext} className="text-gray-400 hover:text-white transition-colors hover:scale-110 active:scale-90">
                        <SkipForward size={22} fill="currentColor" />
                    </button>
                </div>

                {/* Right: Volume */}
                <div className="flex items-center gap-2 group/vol">
                    <button onClick={toggleMute} className="p-2 text-gray-600 hover:text-white transition-colors">
                        <VolumeIcon v={volume} />
                    </button>
                    <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                        <input type="range" min="0" max="100" value={volume}
                            onChange={e => handleVolume(+e.target.value)}
                            className="w-20 h-1 accent-red-500 cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* ─── Advanced Row ─── */}
            <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2 pt-2 border-t border-white/5">
                {/* Normalize */}
                <button
                    onClick={() => setNormalizeVolume(v => !v)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${normalizeVolume ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                >
                    <Zap size={12} /> <span className="truncate">Normalize</span>
                </button>

                {/* EQ */}
                <button
                    onClick={onOpenEQ}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 rounded-xl text-[10px] sm:text-xs font-bold text-gray-500 hover:text-white transition-all"
                >
                    <Sliders size={12} /> <span className="truncate">Equalizer</span>
                </button>

                {/* Crossfade */}
                <div className="relative col-span-1">
                    <button
                        onClick={() => { setShowCrossfade(v => !v); setShowSpeed(false); }}
                        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${crossfadeDuration > 0 ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                    >
                        ⌁ Crossfade {crossfadeDuration > 0 ? `${crossfadeDuration}s` : ''}
                    </button>
                    <AnimatePresence>
                        {showCrossfade && (
                            <CrossfadePopup
                                value={crossfadeDuration}
                                onChange={setCrossfadeDuration}
                                onClose={() => setShowCrossfade(false)}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* PRO Toggle */}
                <button
                    onClick={togglePro}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                        isPro 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/10' 
                            : 'bg-white/5 text-gray-500 hover:text-white'
                    }`}
                >
                    <Zap size={12} className={isPro ? "fill-amber-400" : ""} />
                    <span className="truncate">{isPro ? 'PRO' : 'GO PRO'}</span>
                </button>
            </div>

            {/* PRO Password Modal */}
            <AnimatePresence>
                {showProModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm glass-card p-8 border-white/10"
                        >
                            <div className="flex flex-col items-center gap-4 text-center">
                                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-2xl">
                                    <Zap size={32} className="text-amber-500 fill-amber-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-white italic tracking-tight">Unlock PRO Access</h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Authorized Personnel Only</p>
                                </div>
                                
                                <form onSubmit={submitProPass} className="w-full space-y-4 mt-4">
                                    <input 
                                        type="password"
                                        autoFocus
                                        value={proPass}
                                        onChange={e => setProPass(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white placeholder:text-white/10 focus:border-amber-500/50 outline-none transition-all"
                                    />
                                    <div className="flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setShowProModal(false)}
                                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit"
                                            className="flex-[2] py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            Activate
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PlaybackControls;
