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
    MoreVertical,
    Check,
    ArrowBigUp,
    ArrowBigDown,
    Trash2,
    ChevronUp,
    ChevronDown,
    Library,
    Heart
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
        removeSong, reorderSong
    } = useRoom();
    const socket = useSocket();
    const navigate = useNavigate();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDefaultTab, setSearchDefaultTab] = useState('youtube');
    const [isCopied, setIsCopied] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDevicesOpen, setIsDevicesOpen] = useState(false);
    const [isEQOpen, setIsEQOpen] = useState(false);
    const [playlistSong, setPlaylistSong] = useState(null);
    const [roomNotFound, setRoomNotFound] = useState(false);

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

    useEffect(() => {
        if (socket) {
            socket.on('room_state_update', (data) => {
                if (data.repeat_mode !== undefined) setRepeatMode(data.repeat_mode);
                if (data.current_song_id) {
                    fetchRoomState(room_id);
                }
            });
            return () => socket.off('room_state_update');
        }
    }, [socket, room_id]);

    const handlePlayback = (payload) => {
        const isObject = typeof payload === 'object';
        const action = isObject ? payload.action : payload;
        const value = isObject ? payload.value : null;

        console.log("Playback requested:", action, "Value:", value);

        if (socket && room_id) {
            const data = { room_id, action, value };
            socket.emit('playback_control', data);

            if (action === 'play') setIsPlaying(true);
            if (action === 'pause') setIsPlaying(false);
            if (action === 'speed') setPlaybackRate(value);
        }
    };

    const copyInvite = () => {
        navigator.clipboard.writeText(room_id);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        console.log("Uploading file:", file.name);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_name', user?.name || 'Anonymous');

        try {
            const res = await api.post(`/room/${room_id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            console.log("Upload success:", res.data);
            // Prompt to save to library
            if (res.data.song) {
                setPlaylistSong(res.data.song);
            }
        } catch (err) {
            console.error("Upload error:", err.response?.data || err.message);
            alert("Upload failed: " + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#0c0b0f] text-white flex flex-col">
            {/* Header */}
            <header className="px-8 py-4 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-600 rounded-lg">
                        <Music2 size={24} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-none">{room?.name || 'Loading Room...'}</h1>
                        <span className="text-xs text-gray-400">ID: {room_id}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link to="/playlists" className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 rounded-full text-sm transition-all active:scale-95">
                        <Library size={16} />
                        Library
                    </Link>
                    {/* Live Devices Button */}
                    <button
                        onClick={() => setIsDevicesOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-full text-sm transition-all active:scale-95"
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        {users?.length || 0} Live
                    </button>
                    <button
                        onClick={copyInvite}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-full text-sm transition-all active:scale-95"
                    >
                        {isCopied ? <Check size={16} /> : <Share2 size={16} />}
                        {isCopied ? 'Copied!' : 'Invite'}
                    </button>
                    <div className="flex -space-x-2">
                        {users?.slice(0, 4).map((u, i) => (
                            <div key={u.id || i} className="w-8 h-8 rounded-full bg-blue-500 border-2 border-[#0c0b0f] flex items-center justify-center text-[10px] font-bold uppercase" title={u.name}>
                                {u.name.substring(0, 2)}
                            </div>
                        ))}
                        {users?.length > 4 && (
                            <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0c0b0f] flex items-center justify-center text-[10px] text-gray-400">
                                +{users.length - 4}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Player & Search */}
                <div className="flex-1 p-8 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                    {/* Hero Player Area */}
                    <div className="glass-card aspect-video w-full max-w-4xl mx-auto flex items-center justify-center relative group overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.1)]">
                        {roomNotFound ? (
                            <div className="flex flex-col items-center gap-6 p-12 text-center">
                                <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                                    <Trash2 size={40} className="text-red-400" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black tracking-tight">Room Expired</h2>
                                    <p className="text-gray-500 text-sm max-w-xs">This room no longer exists on the server. It may have been deleted after inactivity.</p>
                                </div>
                                <button 
                                    onClick={() => navigate('/')}
                                    className="px-8 py-3 bg-white text-black font-black rounded-2xl hover:scale-105 transition-all shadow-xl"
                                >
                                    Go Back Home
                                </button>
                            </div>
                        ) : (
                            <>
                                <MusicPlayer />
                                {/* Progress Bar */}
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 group-hover:h-2 transition-all">
                                    <motion.div
                                        className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
                                        animate={{ width: `${(playbackTime / (duration || 1)) * 100}%` }}
                                        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Advanced Playback Controls */}
                    <div className="glass-card max-w-4xl mx-auto w-full">
                        <PlaybackControls onOpenEQ={() => setIsEQOpen(true)} />
                    </div>

                    {/* Add Music Options */}
                    <div className="max-w-4xl mx-auto w-full">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 px-1">Add Music</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* YouTube Card */}
                            <motion.button
                                onClick={() => openSearchWith('youtube')}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="group relative bg-gradient-to-br from-red-500/10 to-red-900/10 border border-red-500/20 rounded-2xl p-6 flex flex-col items-center gap-3 text-center transition-all hover:border-red-500/40 hover:shadow-[0_0_30px_rgba(239,68,68,0.1)] overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-3 bg-red-500/15 rounded-xl group-hover:bg-red-500/25 transition-colors relative z-10">
                                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                                        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" strokeLinecap="round" strokeLinejoin="round" />
                                        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none" />
                                    </svg>
                                </div>
                                <div className="relative z-10">
                                    <p className="font-bold text-sm text-white">YouTube Video</p>
                                    <p className="text-[11px] text-gray-500 mt-1">Paste any YouTube link</p>
                                </div>
                            </motion.button>

                            {/* Spotify Card */}
                            <motion.button
                                onClick={() => openSearchWith('spotify')}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="group relative bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col items-center gap-3 text-center transition-all hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-3 bg-emerald-500/15 rounded-xl group-hover:bg-emerald-500/25 transition-colors relative z-10">
                                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" className="text-emerald-400">
                                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                </div>
                                <div className="relative z-10">
                                    <p className="font-bold text-sm text-white">Spotify Link</p>
                                    <p className="text-[11px] text-gray-500 mt-1">Track, album, or playlist</p>
                                </div>
                            </motion.button>

                            {/* Direct Link Card */}
                            <motion.button
                                onClick={() => openSearchWith('direct')}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="group relative bg-gradient-to-br from-blue-500/10 to-blue-900/10 border border-blue-500/20 rounded-2xl p-6 flex flex-col items-center gap-3 text-center transition-all hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-3 bg-blue-500/15 rounded-xl group-hover:bg-blue-500/25 transition-colors relative z-10">
                                    <Plus size={28} className="text-blue-400" />
                                </div>
                                <div className="relative z-10">
                                    <p className="font-bold text-sm text-white">Direct Link</p>
                                    <p className="text-[11px] text-gray-500 mt-1">MP3, WAV, or video URL</p>
                                </div>
                            </motion.button>
                        </div>
                    </div>
                </div>

                <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} defaultTab={searchDefaultTab} />

                {/* Right: Queue Sidebar */}
                <aside className="w-96 border-l border-white/5 bg-black/10 backdrop-blur-xl flex flex-col">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2">
                            <Plus size={18} />
                            Up Next
                        </h3>
                        <span className="text-xs bg-white/5 px-2 py-1 rounded text-gray-400">{queue.length} Songs</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {queue.map((song, i) => (
                            <motion.div
                                key={song.id || i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 group transition-colors cursor-pointer ${currentSong?.id === song.id ? 'bg-blue-500/10 border border-blue-500/20' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
                                    <img src={song.thumbnail} className="w-full h-full object-cover" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm truncate">{song.title}</h4>
                                    <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                                </div>
                                <button 
                                    onClick={() => setPlaylistSong(song)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-600 hover:text-pink-500 transition-all active:scale-90"
                                    title="Save to Playlist"
                                >
                                    <Heart size={16} />
                                </button>
                                <div className="flex flex-col items-center gap-0">
                                    <button
                                        onClick={() => socket.emit('vote', { room_id, song_id: song.id, value: 1 })}
                                        className="text-gray-500 hover:text-emerald-400 transition-colors"
                                    >
                                        <ArrowBigUp size={20} />
                                    </button>
                                    <span className="text-[10px] font-bold">{song.votes || 0}</span>
                                    <button
                                        onClick={() => socket.emit('vote', { room_id, song_id: song.id, value: -1 })}
                                        className="text-gray-500 hover:text-red-400 transition-colors"
                                    >
                                        <ArrowBigDown size={20} />
                                    </button>
                                </div>
                                {/* Reorder + Remove */}
                                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => reorderSong(song.id, 'up')} className="text-gray-600 hover:text-white"><ChevronUp size={14} /></button>
                                    <button onClick={() => reorderSong(song.id, 'down')} className="text-gray-600 hover:text-white"><ChevronDown size={14} /></button>
                                </div>
                                <button
                                    onClick={() => removeSong(song.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-400 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </motion.div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-white/5">
                        <label className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors cursor-pointer ${uploading ? 'bg-blue-500/20 text-blue-400 cursor-wait' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
                            {uploading ? (
                                <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            {uploading ? 'Uploading...' : 'Upload Audio File'}
                            <input type="file" className="hidden" accept=".mp3,.wav" onChange={handleUpload} disabled={uploading} />
                        </label>
                    </div>
                </aside>
            </div>

            {/* Devices Panel Modal */}
            <DevicesPanel isOpen={isDevicesOpen} onClose={() => setIsDevicesOpen(false)} />
            {/* Equalizer Modal */}
            <EqualizerPanel isOpen={isEQOpen} onClose={() => setIsEQOpen(false)} />
            
            <PlaylistSelectorModal 
                isOpen={!!playlistSong} 
                onClose={() => setPlaylistSong(null)} 
                song={playlistSong} 
            />
        </div>
    );
};

export default RoomDashboard;
