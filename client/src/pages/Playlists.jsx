import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { useToast } from '../context/ToastContext';
import { 
    Library, Plus, Music2, Trash2, Play, ChevronRight, 
    ArrowLeft, ListMusic, Music, Search, Heart, Loader2
} from 'lucide-react';
import SearchModal from '../components/SearchModal';

const Playlists = () => {
    const { user, logout, room } = useRoom();
    const { showToast } = useToast();
    const navigate = useNavigate();
    
    const [myPlaylists, setMyPlaylists] = useState([]);
    const [publicPlaylists, setPublicPlaylists] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [selected, setSelected]   = useState(null); // Selected playlist ID
    const [detail, setDetail]       = useState(null); // Selected playlist details (songs)
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName]     = useState('');
    const [isAddingSong, setIsAddingSong] = useState(false);

    const token = localStorage.getItem('token');

    async function fetchPlaylists() {
        try {
            const res = await api.get('/playlists');
            setMyPlaylists(res.data.my_playlists || []);
            setPublicPlaylists(res.data.public_playlists || []);
        } catch (err) {
            console.error('Fetch playlists failed', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchPlaylistDetail(id) {
        try {
            const res = await api.get(`/playlists/${id}`);
            setDetail(res.data);
        } catch (err) {
            console.error('Fetch detail failed', err);
        }
    }

    useEffect(() => {
        if (user && token) fetchPlaylists();
    }, [user, token]);

    useEffect(() => {
        if (selected) fetchPlaylistDetail(selected);
        else setDetail(null);
    }, [selected]);

    if (!token) {
        return (
            <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/10 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-600/10 blur-[120px] rounded-full" />
                </div>
                
                <div className="relative z-10 max-w-sm">
                    <div className="w-20 h-20 bg-gradient-to-br from-red-600 to-rose-600 rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-8">
                        <ListMusic size={40} />
                    </div>
                    <h1 className="text-3xl font-black mb-4">Your Music, Synced.</h1>
                    <p className="text-gray-400 text-sm leading-relaxed mb-10">
                        Create personal playlists, save your favorite tracks, and sync them across any room. Sign in to start your collection.
                    </p>
                    
                    <div className="flex flex-col gap-3">
                        <button onClick={() => navigate('/login')} className="w-full bg-red-600 hover:bg-red-500 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-red-500/20 active:scale-[0.98]">
                            Sign In
                        </button>
                        <button onClick={() => navigate('/signup')} className="w-full bg-white/5 hover:bg-white/10 py-4 rounded-2xl font-bold transition-all border border-white/5 active:scale-[0.98]">
                            Create Account
                        </button>
                    </div>

                    <button onClick={() => navigate('/')} className="mt-8 text-gray-600 text-sm font-bold hover:text-gray-400 transition-colors">
                        ← Back to Rooms
                    </button>
                </div>
            </div>
        );
    }



    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            await api.post('/playlists', { name: newName });
            setNewName('');
            setShowCreate(false);
            fetchPlaylists();
            showToast('Playlist created!');
        } catch (err) { 
            showToast('Failed to create playlist', 'error');
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Delete this playlist?')) return;
        try {
            await api.delete(`/playlists/${id}`);
            if (selected === id) setSelected(null);
            fetchPlaylists();
            showToast('Playlist removed');
        } catch (err) { showToast('Delete failed', 'error'); }
    };

    const handleRemoveSong = async (sid) => {
        try {
            await api.delete(`/playlists/${selected}/songs/${sid}`);
            fetchPlaylistDetail(selected);
        } catch (err) { console.error(err); }
    };

    const addToRoom = async (song) => {
        if (!room) {
            showToast('Join a room first to play songs!', 'info');
            return;
        }
        try {
            await api.post(`/room/${room.id}/add`, {
                ...song,
                added_by: user.name
            });
            showToast(`Added ${song.title} to queue`);
        } catch (err) { 
            showToast("Failed to add song to room", "error");
        }
    };

    const playPlaylist = async () => {
        if (!room) {
            alert('Join a room first to play songs!');
            return;
        }
        if (!detail?.songs?.length) return;
        
        try {
            await api.post(`/room/${room.id}/add-bulk`, {
                songs: detail.songs,
                added_by: user.name
            });
            // Optional: navigate to the room
            // navigate(`/room/${room.id}`);
        } catch (err) {
            console.error(err);
            alert("Failed to add playlist to room");
        }
    };

    const togglePublic = async (id, e) => {
        e.stopPropagation();
        try {
            await api.post(`/playlists/${id}/toggle-public`);
            fetchPlaylists();
        } catch (err) { console.error(err); }
    };

    const handleAddSong = async (song) => {
        if (!selected) return;
        try {
            await api.post(`/playlists/${selected}/songs`, song);
            fetchPlaylistDetail(selected);
        } catch (err) {
            console.error('Failed to add song to playlist', err);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0514] text-white selection:bg-violet-500/30">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-[#000000]/80 backdrop-blur-xl border-b border-white/5 py-4 px-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link to={room ? `/room/${room.id}` : '/'} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex items-center gap-2">
                        <Library className="text-red-500" size={24} />
                        <h1 className="text-xl font-bold">Your Library</h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold">{user?.name}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{user?.email}</p>
                    </div>
                    <button onClick={logout} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5">
                        Log Out
                    </button>
                </div>
            </header>

            <main className="pt-24 pb-12 px-8 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">
                
                {/* Playlists List */}
                <div className="md:col-span-4 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <ListMusic size={18} className="text-red-500" />
                            Playlists
                        </h2>
                        <button 
                            onClick={() => setShowCreate(true)}
                            className="p-1.5 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <AnimatePresence>
                        {showCreate && (
                            <motion.form 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                onSubmit={handleCreate}
                                className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3"
                            >
                                <input 
                                    autoFocus
                                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-red-500/50"
                                    placeholder="Playlist name..."
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <button type="submit" className="flex-1 bg-red-600 py-1.5 rounded-lg text-xs font-bold">Create</button>
                                    <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-white/5 py-1.5 rounded-lg text-xs font-bold">Cancel</button>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>

                    <div className="space-y-2">
                    <div className="space-y-6">
                        {/* My Playlists */}
                        <div className="space-y-2">
                            {loading ? (
                                <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-700" size={32} /></div>
                            ) : myPlaylists.length === 0 ? (
                                <div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                                    <Music2 size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm text-gray-500 font-medium italic">No playlists yet</p>
                                </div>
                            ) : (
                                (myPlaylists || []).map((p, i) => (
                                    <motion.div
                                        key={p.id || i}
                                        whileHover={{ x: 4 }}
                                        onClick={() => setSelected(p.id)}
                                        className={`p-4 rounded-2xl cursor-pointer flex items-center justify-between transition-all group ${selected === p.id ? 'bg-red-500/20 border-red-500/30 border' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gradient-to-br from-red-600/20 to-rose-600/20 rounded-xl flex items-center justify-center">
                                                <Music2 className={selected === p.id ? 'text-red-400' : 'text-gray-600 group-hover:text-white transition-colors'} size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm truncate">{p.name}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">{p.count} songs</p>
                                                    {p.is_public && <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1 rounded font-black">PUBLIC</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={(e) => togglePublic(p.id, e)}
                                                className={`p-2 rounded-lg transition-all ${p.is_public ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-gray-600 hover:text-white hover:bg-white/5'}`}
                                                title={p.is_public ? "Make Private" : "Make Public"}
                                            >
                                                <Heart size={14} fill={p.is_public ? "currentColor" : "none"} />
                                            </button>
                                            <button 
                                                onClick={(e) => handleDelete(p.id, e)}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-gray-600 hover:text-red-400 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>

                        {/* Public Discovery */}
                        {publicPlaylists.length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 flex items-center gap-2">
                                    <Search size={12} /> Community Discovery
                                </h3>
                                <div className="space-y-2">
                                    {(publicPlaylists || []).map((p, i) => (
                                        <motion.div
                                            key={p.id}
                                            whileHover={{ x: 4 }}
                                            onClick={() => setSelected(p.id)}
                                            className={`p-4 rounded-2xl cursor-pointer flex items-center justify-between transition-all group ${selected === p.id ? 'bg-violet-500/20 border-violet-500/30 border' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
                                                    <Library className="text-violet-400" size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm truncate">{p.name}</p>
                                                    <p className="text-[9px] text-violet-400 font-bold uppercase tracking-widest truncate">By {p.owner}</p>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-gray-600 font-mono">{p.count} tracks</div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    </div>
                </div>

                {/* Playlist Details */}
                <div className="md:col-span-8">
                    {selected ? (
                        <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 min-h-[600px] relative overflow-hidden">
                            {/* Decorative blur */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
                            
                            <div className="relative z-10 space-y-8">
                                <div className="flex items-end gap-6">
                                    <div className="w-40 h-40 bg-gradient-to-br from-red-600 to-rose-600 rounded-[2rem] shadow-2xl flex items-center justify-center">
                                        <Music size={64} className="text-white opacity-40" />
                                    </div>
                                    <div className="flex-1 pb-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-3">Playlist</p>
                                        <h2 className="text-5xl font-black mb-4 tracking-tight">{detail?.name}</h2>
                                        <div className="flex items-center gap-3 text-sm font-medium text-gray-400">
                                            <span className="text-red-400">{detail?.owner || user?.name}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-700" />
                                            <span>{detail?.songs?.length || 0} tracks</span>
                                            {detail?.is_public && <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-black border border-emerald-500/10">PUBLIC</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={playPlaylist}
                                        className="w-14 h-14 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 hover:scale-110 active:scale-95 transition-all"
                                    >
                                        <Play size={24} fill="white" className="ml-1" />
                                    </button>
                                    <button 
                                        onClick={() => setIsAddingSong(true)}
                                        className="h-14 px-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl flex items-center justify-center gap-2 font-bold transition-all border border-white/5 active:scale-95"
                                    >
                                        <Plus size={20} />
                                        Add Songs
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    {detail?.songs?.length === 0 ? (
                                        <div className="py-20 text-center text-gray-600 italic">
                                            This playlist is empty. Add songs from a room!
                                        </div>
                                    ) : (
                                        detail?.songs?.map((s, i) => (
                                            <div key={s.id || i} className="group p-3 rounded-2xl hover:bg-white/5 flex items-center gap-4 transition-colors">
                                                <span className="w-4 text-center text-[10px] font-mono text-gray-600 group-hover:hidden">{i + 1}</span>
                                                <button onClick={() => addToRoom(s)} className="hidden group-hover:flex w-4 items-center justify-center text-red-500">
                                                    <Play size={12} fill="currentColor" />
                                                </button>
                                                
                                                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                                    {s.thumbnail ? <img src={s.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🎵</div>}
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm truncate">{s.title}</p>
                                                    <p className="text-xs text-gray-500 truncate">{s.artist}</p>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <span className="text-[11px] font-mono text-gray-600 hidden sm:block">
                                                        {Math.floor(s.duration / 60)}:{(s.duration % 60).toString().padStart(2, '0')}
                                                    </span>
                                                    <button 
                                                        onClick={() => handleRemoveSong(s.id)}
                                                        className="p-2 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-lg"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/5 border border-white/10 rounded-[48px] p-20 flex flex-col items-center justify-center text-center">
                            <div className="w-24 h-24 bg-gradient-to-br from-white/5 to-white/0 rounded-[2rem] border border-white/10 flex items-center justify-center mb-8 shadow-2xl">
                                <Library size={48} className="text-gray-700" />
                            </div>
                            <h2 className="text-2xl font-bold mb-4 italic">Select a playlist to view tracks</h2>
                            <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
                                Your personal collections are synced across all your devices. Add tracks from any room to build your perfect library.
                            </p>
                        </div>
                    )}
                </div>
            </main>

            <SearchModal 
                isOpen={isAddingSong} 
                onClose={() => setIsAddingSong(false)} 
                onSelect={handleAddSong}
            />
        </div>
    );
};

export default Playlists;
