import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { X, Plus, Music2, Check, Loader2, Heart } from 'lucide-react';

const PlaylistSelectorModal = ({ isOpen, onClose, song }) => {
    const { user } = useRoom();
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading]     = useState(false);
    const [adding, setAdding]       = useState(null); // ID of playlist being added to
    const [success, setSuccess]     = useState(null);

    const token = localStorage.getItem('token');

    useEffect(() => {
        if (isOpen && user && token) fetchPlaylists();
    }, [isOpen]);

    const fetchPlaylists = async () => {
        setLoading(true);
        try {
            const res = await api.get('/playlists');
            setPlaylists(res.data.my_playlists || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const addToPlaylist = async (pid) => {
        setAdding(pid);
        try {
            await api.post(`/playlists/${pid}/songs`, song);
            setSuccess(pid);
            setTimeout(() => {
                setSuccess(null);
                setAdding(null);
            }, 1500);
        } catch (err) { 
            console.error(err); 
            setAdding(null);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-md bg-[#1a1827] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
                >
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/2">
                        <div className="flex items-center gap-3">
                            <Heart className="text-pink-500" size={20} fill="currentColor" />
                            <h2 className="font-bold text-lg">Save to Playlist</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                    </div>

                    <div className="p-4 flex items-center gap-4 bg-white/5 border-b border-white/5 mx-4 mt-4 rounded-2xl mb-4">
                        <img src={song?.thumbnail} className="w-12 h-12 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm truncate">{song?.title}</p>
                            <p className="text-xs text-gray-500 truncate">{song?.artist}</p>
                        </div>
                    </div>

                    <div className="px-4 pb-8">
                        {!token ? (
                            <div className="p-8 text-center space-y-6">
                                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                    <Music2 size={32} className="text-gray-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-lg">Sign in to save</p>
                                    <p className="text-sm text-gray-500 mt-1">Keep your favorite tracks in personal playlists forever.</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <button onClick={() => window.location.href='/login'} className="w-full bg-violet-600 hover:bg-violet-500 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]">
                                        Log In
                                    </button>
                                    <button onClick={() => window.location.href='/signup'} className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-sm font-bold transition-all border border-white/5 active:scale-[0.98]">
                                        Create Account
                                    </button>
                                </div>
                            </div>
                        ) : loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-violet-500" size={32} /></div>
                        ) : playlists.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-sm text-gray-500">No playlists found.</p>
                                <button onClick={() => window.location.href='/playlists'} className="text-violet-400 text-xs font-bold mt-2 hover:underline">Create a Playlist</button>
                            </div>
                        ) : (
                            (playlists || []).map((p, i) => (
                                <button
                                    key={p.id || `psm-${i}`}
                                    onClick={() => addToPlaylist(p.id)}
                                    disabled={adding === p.id}
                                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                                            <Music2 size={18} className="text-violet-400" />
                                        </div>
                                        <p className="font-bold text-sm text-left">{p.name}</p>
                                    </div>
                                    {success === p.id ? (
                                        <Check className="text-emerald-500" size={20} />
                                    ) : adding === p.id ? (
                                        <Loader2 className="animate-spin text-gray-500" size={20} />
                                    ) : (
                                        <Plus className="text-gray-600 group-hover:text-white transition-colors" size={20} />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default PlaylistSelectorModal;
