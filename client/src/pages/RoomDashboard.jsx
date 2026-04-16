import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import {
    Search,
    Music2,
    Users,
    Plus,
    Upload,
    Share2,
    Check,
    ArrowBigUp,
    ArrowBigDown,
    Trash2,
    ChevronUp,
    ChevronDown,
    Library,
    Heart,
    ListMusic,
    X,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MusicPlayer from '../components/MusicPlayer';
import SearchModal from '../components/SearchModal';
import DevicesPanel from '../components/DevicesPanel';
import PlaybackControls from '../components/PlaybackControls';
import EqualizerPanel from '../components/EqualizerPanel';
import PlaylistSelectorModal from '../components/PlaylistSelectorModal';

const RoomDashboard = () => {
    const { room_id } = useParams();
    const {
        room, user, queue, currentSong, isPlaying, fetchRoomState, setIsPlaying,
        playbackTime, setPlaybackTime, users, duration,
        removeSong, reorderSong, setPlaybackRate
    } = useRoom();
    const socket = useSocket();
    const navigate = useNavigate();
    
    // UI States
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDefaultTab, setSearchDefaultTab] = useState('youtube');
    const [isCopied, setIsCopied] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDevicesOpen, setIsDevicesOpen] = useState(false);
    const [isEQOpen, setIsEQOpen] = useState(false);
    const [playlistSong, setPlaylistSong] = useState(null);
    const [roomNotFound, setRoomNotFound] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const openSearchWith = (tab) => {
        setSearchDefaultTab(tab);
        setIsSearchOpen(true);
    };

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        
        const initRoom = async () => {
            if (!room && !roomNotFound) {
                const success = await fetchRoomState(room_id);
                if (!success) setRoomNotFound(true);
            }
        };
        initRoom();
    }, [room_id, user, room, roomNotFound]);

    const copyInvite = () => {
        navigator.clipboard.writeText(room_id);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_name', user?.name || 'Anonymous');

        try {
            const res = await api.post(`/room/${room_id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.song) {
                setPlaylistSong(res.data.song);
            }
        } catch (err) {
            console.error("Upload error:", err.response?.data || err.message);
            alert("Upload failed: " + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#0c0b0f] text-white flex flex-col overflow-hidden font-sans">
            {/* ── Header ── */}
            <header className="px-4 sm:px-8 py-3 flex items-center justify-between border-b border-white/5 bg-black/60 sm:backdrop-blur-xl sticky top-0 z-[60]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20">
                        <Music2 size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm sm:text-lg leading-none truncate max-w-[140px] sm:max-w-none">
                            {room?.name || 'Loading...'}
                        </h1>
                        <span className="text-[10px] text-gray-500 font-mono tracking-tight">{room_id}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    <Link to="/playlists" className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-all active:scale-95 flex items-center gap-2">
                        <Library size={18} />
                        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Library</span>
                    </Link>

                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`p-2.5 rounded-xl transition-all active:scale-95 lg:hidden ${isSidebarOpen ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-300'}`}
                    >
                        <ListMusic size={18} />
                    </button>

                    <button
                        onClick={copyInvite}
                        className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-500/10"
                    >
                        {isCopied ? <Check size={14} /> : <Share2 size={14} />}
                        {isCopied ? 'Copied' : 'Invite'}
                    </button>

                    <div className="hidden md:flex -space-x-2">
                        {users?.slice(0, 3).map((u, i) => (
                            <div key={u.id || `u-${i}`} className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-rose-600 border-2 border-[#0c0b0f] flex items-center justify-center text-[10px] font-black uppercase shadow-xl" title={u.name}>
                                {u.name.substring(0, 2)}
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            {/* ── Main Layout ── */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* ── Center: Player & Search ── */}
                <div className="flex-1 p-4 sm:p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                    
                    {/* Player Card */}
                    <div className="glass-card w-full max-w-4xl mx-auto flex flex-col items-center justify-center p-6 sm:p-12 relative group overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.4)] border-white/5">
                        {roomNotFound ? (
                            <div className="flex flex-col items-center gap-8 py-12 text-center">
                                <div className="w-20 h-20 bg-red-500/10 rounded-[2rem] flex items-center justify-center border border-red-500/20 shadow-2xl">
                                    <Trash2 size={40} className="text-red-400" />
                                </div>
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-black tracking-tight text-white">Dissolved.</h2>
                                    <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">This room expired or was deleted by the host due to inactivity.</p>
                                </div>
                                <button onClick={() => navigate('/')} className="px-10 py-4 bg-white text-black font-black rounded-2xl transition-all shadow-2xl hover:scale-105 active:scale-95">
                                    Start New Session
                                </button>
                            </div>
                        ) : (
                            <>
                                <MusicPlayer />
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 group-hover:h-2 transition-all">
                                    <motion.div
                                        className="h-full bg-red-500 shadow-[0_0_20px_#ef4444]"
                                        animate={{ width: `${(playbackTime / (duration || 1)) * 100}%` }}
                                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Controls & EQ */}
                    <div className="glass-card max-w-4xl mx-auto w-full p-1 border-white/5">
                        <PlaybackControls onOpenEQ={() => setIsEQOpen(true)} />
                    </div>

                    {/* Add Music Section */}
                    <div className="max-w-4xl mx-auto w-full mb-28 lg:mb-10">
                        <div className="flex items-center justify-between mb-6 px-2">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Source Select</h3>
                            <button onClick={copyInvite} className="sm:hidden text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-500/10 px-4 py-1.5 rounded-full border border-red-500/10">Invite Friends</button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <motion.button onClick={() => openSearchWith('youtube')} whileHover={{ y: -4, backgroundColor: 'rgba(239, 68, 68, 0.05)' }} whileTap={{ scale: 0.98 }} className="group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col items-center gap-4 text-center transition-all hover:border-red-500/30">
                                <div className="p-4 bg-red-400/10 rounded-2xl text-red-400 group-hover:scale-110 transition-transform"><Search size={24} /></div>
                                <div><p className="font-black text-sm uppercase tracking-wider">YouTube</p><p className="text-[10px] text-gray-500 mt-1">Paste Link or ID</p></div>
                            </motion.button>

                            <motion.button onClick={() => openSearchWith('spotify')} whileHover={{ y: -4, backgroundColor: 'rgba(16, 185, 129, 0.05)' }} whileTap={{ scale: 0.98 }} className="group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col items-center gap-4 text-center transition-all hover:border-emerald-500/30">
                                <div className="p-4 bg-emerald-400/10 rounded-2xl text-emerald-400 font-bold text-xl leading-none group-hover:scale-110 transition-transform">♫</div>
                                <div><p className="font-black text-sm uppercase tracking-wider">Spotify</p><p className="text-[10px] text-gray-500 mt-1">Resolve Matches</p></div>
                            </motion.button>

                            <motion.button onClick={() => document.getElementById('audio-upload')?.click()} whileHover={{ y: -4, backgroundColor: 'rgba(239, 68, 68, 0.05)' }} whileTap={{ scale: 0.98 }} className="group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col items-center gap-4 text-center transition-all hover:border-red-500/30">
                                <div className="p-4 bg-red-400/10 rounded-2xl text-red-400 group-hover:scale-110 transition-transform">
                                    {uploading ? <Loader2 className="animate-spin" size={24} /> : <Upload size={24} />}
                                </div>
                                <div><p className="font-black text-sm uppercase tracking-wider">Upload</p><p className="text-[10px] text-gray-500 mt-1">MP3 / WAV Files</p></div>
                                <input id="audio-upload" type="file" className="hidden" accept=".mp3,.wav" onChange={handleUpload} disabled={uploading} />
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* ── Sidebar: Queue ── */}
                <AnimatePresence>
                    {(isSidebarOpen || window.innerWidth > 1024) && (
                        <motion.aside 
                            initial={window.innerWidth <= 1024 ? { x: '100%' } : false}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                            className={`
                                fixed inset-y-0 right-0 w-full sm:w-[420px] lg:static lg:w-[380px]
                                border-l border-white/5 bg-[#0c0b0f] lg:bg-black/20 sm:backdrop-blur-3xl z-[100] lg:z-10
                                flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] lg:shadow-none
                            `}
                        >
                            <div className="p-6 sm:p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <ListMusic className="text-red-500" size={20} />
                                    <h3 className="font-black text-[11px] uppercase tracking-[0.3em]">Next Tracks</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-400 bg-white/5 px-2.5 py-1 rounded-full">{queue.length}</span>
                                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scrollbar">
                                {queue.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-12 space-y-4">
                                        <div className="w-16 h-16 bg-white/5 rounded-[2rem] flex items-center justify-center opacity-20">
                                            <Music2 size={32} />
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] italic">Empty Queue</p>
                                    </div>
                                ) : (
                                    queue.map((song, i) => (
                                        <motion.div
                                            key={song.id || `s-${i}`}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`flex items-center gap-4 p-4 rounded-[1.5rem] hover:bg-white/5 group transition-all border border-transparent ${currentSong?.id === song.id ? 'bg-red-500/10 border-red-500/20 shadow-2xl' : ''}`}
                                        >
                                            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 border border-white/5 relative group-hover:scale-105 transition-transform">
                                                <img src={song.thumbnail} className="w-full h-full object-cover" alt="" />
                                                {currentSong?.id === song.id && (
                                                    <div className="absolute inset-0 bg-red-600/60 flex items-center justify-center">
                                                        <div className="flex gap-1 items-end h-3">
                                                            {[1,2,3].map(j => <motion.div key={j} animate={{ height: [4, 12, 4] }} transition={{ duration: 0.5, repeat: Infinity, delay: j*0.1 }} className="w-1 bg-white" />)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`font-bold text-sm truncate ${currentSong?.id === song.id ? 'text-red-400' : 'text-white'}`}>{song.title}</h4>
                                                <p className="text-[10px] text-gray-500 truncate uppercase font-bold tracking-widest mt-0.5">{song.artist}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                                                <div className="flex flex-col items-center scale-90">
                                                    <button onClick={() => socket.emit('vote', { room_id, song_id: song.id, value: 1 })} className="text-gray-600 hover:text-red-400"><ChevronUp size={20} /></button>
                                                    <span className="text-[10px] font-black text-gray-400">{song.votes || 0}</span>
                                                    <button onClick={() => socket.emit('vote', { room_id, song_id: song.id, value: -1 })} className="text-gray-600 hover:text-red-600"><ChevronDown size={20} /></button>
                                                </div>
                                                <button onClick={() => removeSong(song.id)} className="p-2 text-gray-700 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>

                            <div className="p-8 border-t border-white/5 bg-white/[0.02]">
                                <button
                                    onClick={() => socket.emit('join_as_device', { room_id })}
                                    className="w-full py-4 bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] rounded-2xl hover:scale-[1.03] transition-all active:scale-95 shadow-[0_12px_24px_rgba(255,255,255,0.1)]"
                                >
                                    Sync Device
                                </button>
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>

            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} defaultTab={searchDefaultTab} />
            <DevicesPanel isOpen={isDevicesOpen} onClose={() => setIsDevicesOpen(false)} />
            <EqualizerPanel isOpen={isEQOpen} onClose={() => setIsEQOpen(false)} />
            <PlaylistSelectorModal isOpen={!!playlistSong} onClose={() => setPlaylistSong(null)} song={playlistSong} />
        </div>
    );
};

export default RoomDashboard;
