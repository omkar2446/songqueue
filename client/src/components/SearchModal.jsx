import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import {
    X, Link2, Music2, Plus, CheckCircle2, AlertCircle, Loader2, Heart
} from 'lucide-react';
import PlaylistSelectorModal from './PlaylistSelectorModal';

/* ── URL parsers (no API key needed) ─────────────────────────── */
const parseYouTube = (url) => {
    const re = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
    const m = url.match(re);
    return m ? m[1] : null;
};

const parseSpotify = (url) => {
    // e.g. https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    const re = /open\.spotify\.com\/(track|album|playlist|episode)\/([\w]+)/;
    const m = url.match(re);
    return m ? { type: m[1], id: m[2] } : null;
};

const isDirectAudio = (url) => {
    return /\.(mp3|wav|ogg|flac|aac|m4a|opus|webm)(\?.*)?$/i.test(url);
};

const isDirectVideo = (url) => {
    return /\.(mp4|webm|ogv)(\?.*)?$/i.test(url);
};

/* ── Tab definitions ─────────────────────────────────────────── */
const TABS = [
    {
        id: 'youtube',
        label: 'YouTube',
        icon: '▶',
        color: 'text-red-400',
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
        activeBg: 'bg-red-500',
        placeholder: 'Paste a YouTube URL  (e.g. youtube.com/watch?v=...)',
        hint: 'Works with any public YouTube video — no API key needed',
    },
    {
        id: 'spotify',
        label: 'Spotify',
        icon: '♫',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/30',
        activeBg: 'bg-emerald-500',
        placeholder: 'Paste a Track, Album, or Playlist URL',
        hint: 'Auto-finds the best match on YouTube with EQ support',
    },
    {
        id: 'direct',
        label: 'Direct Link',
        icon: '🔗',
        color: 'text-blue-400',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
        activeBg: 'bg-blue-500',
        placeholder: 'Paste a direct URL to an MP3, WAV, or video file',
        hint: 'Any public audio/video URL — served from any CDN or server',
    },
];

/* ── Main component ──────────────────────────────────────────── */
const SearchModal = ({ isOpen, onClose, defaultTab = 'youtube', onSelect }) => {
    const { room, user, setHasInteracted } = useRoom();
    const socket = useSocket();
    const [tab, setTab] = useState('youtube');
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
    const [preview, setPreview] = useState(null);
    const [errMsg, setErrMsg] = useState('');
    const [playlistSong, setPlaylistSong] = useState(null);
    const inputRef = useRef(null);

    // Sync tab when modal opens with a specific defaultTab
    React.useEffect(() => {
        if (isOpen && defaultTab) {
            setTab(defaultTab);
            reset();
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, defaultTab]);

    const currentTab = TABS.find(t => t.id === tab);

    const reset = () => { setUrl(''); setStatus(null); setPreview(null); setErrMsg(''); };
    const switchTab = (id) => { setTab(id); reset(); setTimeout(() => inputRef.current?.focus(), 50); };
    const handleClose = () => { reset(); onClose(); };

    /* ── Resolve Spotify → YouTube via backend ──────────── */
    const resolveSpotify = async (spotifyUrl) => {
        try {
            const res = await api.post('/spotify/resolve', {
                url: spotifyUrl
            });
            const data = res.data;
            if (data.success && data.youtube_id) {
                setPreview({
                    source: 'youtube',
                    source_id: data.youtube_id,
                    title: data.title || data.spotify_title,
                    artist: data.artist || 'YouTube',
                    thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.youtube_id}/hqdefault.jpg`,
                    duration: data.duration,
                    _fromSpotify: true,
                    _is_collection: data._is_collection
                });
                setStatus('ok');
            } else {
                setStatus('error');
                setErrMsg(data.error || 'Could not find this song on YouTube');
            }
        } catch (err) {
            console.error('Spotify resolve error:', err);
            setStatus('error');
            setErrMsg(err.response?.data?.error || 'Failed to resolve Spotify track. Try pasting a YouTube link instead.');
        }
    };

    /* ── Parse the pasted URL ─────────────────────────────── */
    const handleUrlChange = (val) => {
        setUrl(val);
        setStatus(null);
        setPreview(null);
        setErrMsg('');

        if (!val.trim()) return;

        if (tab === 'youtube') {
            const id = parseYouTube(val);
            if (id) {
                setPreview({
                    source: 'youtube',
                    source_id: id,
                    title: 'YouTube Video',
                    artist: 'Pasted Link',
                    thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                });
                setStatus('ok');
            } else {
                setStatus('error');
                setErrMsg('Not a valid YouTube URL. Try a link like: youtube.com/watch?v=...');
            }
        }

        if (tab === 'spotify') {
            const sp = parseSpotify(val);
            if (sp) {
                // Show loading while we resolve Spotify -> YouTube
                setStatus('loading');
                setPreview(null);
                resolveSpotify(val);
            } else {
                setStatus('error');
                setErrMsg('Not a valid Spotify URL. Try: open.spotify.com/track/...');
            }
        }

        if (tab === 'direct') {
            try {
                new URL(val); // validate it's a URL
                setPreview({
                    source: 'direct',
                    source_id: val,
                    title: val.split('/').pop().split('?')[0] || 'Direct Audio',
                    artist: new URL(val).hostname,
                    thumbnail: '',
                });
                setStatus('ok');
            } catch {
                setStatus('error');
                setErrMsg('Not a valid URL. Make sure to include https://');
            }
        }
    };

    /* ── Add to queue ─────────────────────────────────────── */
    const handleAdd = () => {
        if (!preview) return;

        if (onSelect) {
            onSelect(preview);
            setStatus('added');
            setTimeout(() => {
                setStatus('ok');
                handleClose();
            }, 800);
            return;
        }

        if (!socket || !room?.id) return;
        setHasInteracted(true);
        setStatus('loading');
        socket.emit('add_to_queue', {
            room_id: room.id,
            song: { ...preview, added_by: user?.name || 'Anonymous' }
        });
        setTimeout(() => {
            setStatus('added');
            // Allow user to still save to library or see success
            setTimeout(() => setStatus('ok'), 2000);
        }, 350);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        className="w-full max-w-lg bg-[#111018] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold">Add Music</h2>
                            <button onClick={handleClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tab Bar */}
                        <div className="px-6 flex gap-2 mb-6">
                            {TABS.map((t, idx) => (
                                <button
                                    key={t.id || `tab-${idx}`}
                                    onClick={() => switchTab(t.id)}
                                    className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${tab === t.id
                                            ? `${t.activeBg} text-white shadow-lg`
                                            : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    <span>{t.icon}</span>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Input */}
                        <div className="px-6 mb-4">
                            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${status === 'ok' ? `${currentTab.bg} ${currentTab.border}` :
                                    status === 'error' ? 'bg-red-500/10 border-red-500/30' :
                                        'bg-white/5 border-white/10 focus-within:border-white/30'
                                }`}>
                                <Link2 size={16} className="text-gray-500 flex-shrink-0" />
                                <input
                                    ref={inputRef}
                                    autoFocus
                                    type="url"
                                    value={url}
                                    onChange={e => handleUrlChange(e.target.value)}
                                    onPaste={e => {
                                        const pasted = e.clipboardData.getData('text');
                                        handleUrlChange(pasted);
                                    }}
                                    placeholder={currentTab.placeholder}
                                    className="flex-1 bg-transparent outline-none text-sm placeholder-gray-600"
                                />
                                {status === 'ok' && <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />}
                                {status === 'error' && <AlertCircle size={18} className="text-red-400 flex-shrink-0" />}
                                {status === 'loading' && <Loader2 size={18} className="text-blue-400 animate-spin flex-shrink-0" />}
                            </div>
                            <p className={`text-[11px] mt-2 px-1 ${status === 'error' ? 'text-red-400' : 'text-gray-600'}`}>
                                {status === 'error' ? errMsg : currentTab.hint}
                            </p>
                        </div>

                        {/* Preview card */}
                        <AnimatePresence>
                            {status === 'loading' && tab === 'spotify' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="px-6 mb-4 overflow-hidden"
                                >
                                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                        <Loader2 size={24} className="text-emerald-400 animate-spin flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-white">Finding full song on YouTube...</p>
                                            <p className="text-xs text-gray-400 mt-0.5">Resolving Spotify track for complete playback</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {preview && status === 'ok' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="px-6 mb-4 overflow-hidden"
                                >
                                    <div className={`flex items-center gap-4 p-4 rounded-2xl ${preview._fromSpotify ? 'bg-emerald-500/10 border border-emerald-500/20' : `${currentTab.bg} border ${currentTab.border}`
                                        }`}>
                                        {preview.thumbnail
                                            ? <img src={preview.thumbnail} alt="" className="w-16 aspect-video object-cover rounded-xl flex-shrink-0" />
                                            : <div className="w-16 h-10 bg-white/10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl">🎵</div>
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{preview.title}</p>
                                            <p className="text-xs text-gray-400 truncate">{preview.artist}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {preview._fromSpotify && (
                                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                                                    via Spotify
                                                </span>
                                            )}
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${preview._fromSpotify ? 'bg-red-500/20 text-red-400' : `${currentTab.bg} ${currentTab.color}`
                                                }`}>
                                                {preview.source === 'youtube' ? '▶ YouTube' : preview.source}
                                            </span>
                                        </div>
                                    </div>
                                    {preview._fromSpotify && (
                                        <p className="text-[11px] text-emerald-400/60 mt-2 px-1">
                                            {preview._is_collection 
                                                ? '✓ Resolved collection to top match on YouTube — EQ enabled'
                                                : '✓ Full-length playback — resolved from Spotify to YouTube — EQ enabled'}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Add button */}
                        <div className="px-6 pb-6 flex gap-3">
                            <motion.button
                                onClick={handleAdd}
                                disabled={status !== 'ok'}
                                whileTap={{ scale: 0.97 }}
                                className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${status === 'ok'
                                        ? `${currentTab.activeBg} text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:opacity-90`
                                        : status === 'added'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-white/5 text-gray-600 cursor-not-allowed'
                                    }`}
                            >
                                {status === 'added' ? <><CheckCircle2 size={18} /> Added!</> :
                                    status === 'loading' ? <><Loader2 size={18} className="animate-spin" /> Adding...</> :
                                        <><Plus size={18} /> Add to Queue</>}
                            </motion.button>

                            {status === 'ok' && preview && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => setPlaylistSong(preview)}
                                    className="w-14 h-14 bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 rounded-2xl flex items-center justify-center transition-all active:scale-95"
                                    title="Save to Library"
                                >
                                    <Heart size={24} fill="currentColor" />
                                </motion.button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
            <PlaylistSelectorModal 
                isOpen={!!playlistSong} 
                onClose={() => setPlaylistSong(null)} 
                song={playlistSong} 
            />
        </AnimatePresence>
    );
};

export default SearchModal;
