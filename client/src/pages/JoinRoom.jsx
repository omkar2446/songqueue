import React, { useState, useRef } from 'react';
import { useRoom } from '../context/RoomContext';
import { useNavigate } from 'react-router-dom';
import { Music, ListMusic, Loader2, ArrowRight, PlusCircle, LogIn, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AntigravityBackground from '../components/AntigravityBackground';

const JoinRoom = () => {
    const { joinRoom, user } = useRoom();
    const navigate = useNavigate();
    
    const [mode, setMode] = useState('create'); // 'create' or 'join'
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', roomId: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Auto-fill from user context
    React.useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                name: user.name || '',
                email: user.email || ''
            }));
        }
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // PERSISTENCE: Check if we have a saved anonymous identity to preserve playlists
        let usedEmail = formData.email;
        if (!usedEmail && mode !== 'signup') {
            const savedAnon = localStorage.getItem('synco_anon_email');
            if (savedAnon) {
                usedEmail = savedAnon;
            } else {
                const newAnon = `anon_${Math.random().toString(36).slice(2, 8)}@synco.guest`;
                localStorage.setItem('synco_anon_email', newAnon);
                usedEmail = newAnon;
            }
        }

        try {
            const roomId = await joinRoom(
                formData.name || 'Guest', 
                usedEmail, 
                formData.phone, 
                mode === 'join' ? formData.roomId : null
            );
            navigate(`/room/${roomId}`);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden relative transition-colors duration-500">
            <AntigravityBackground />
            
            {/* Main Floating Card */}
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                    opacity: 1, 
                    scale: 1,
                    y: [0, -10, 0] // Reduced floating for mobile
                }}
                transition={{
                    opacity: { duration: 0.8 },
                    scale: { duration: 0.8 },
                    y: { 
                        duration: 6, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                    }
                }}
                className="w-[92%] sm:w-full sm:max-w-[440px] z-10"
            >
                <div className="glass-card">
                    <div className="p-8 sm:p-10 space-y-7">
                        {/* Branding */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 bg-gradient-to-tr from-red-600 to-rose-600 rounded-[10px] flex items-center justify-center shadow-lg shadow-red-500/10 branding-glow">
                                    <Music size={18} className="text-white" />
                                </div>
                                <span className="text-lg font-black tracking-tight premium-text">SYNCO.</span>
                            </div>
                        </div>

                        {/* Title Section */}
                        <div className="space-y-1.5">
                            <h1 className="text-3xl sm:text-[2.25rem] font-extrabold tracking-tight leading-tight premium-text">Welcome.</h1>
                            <p className="text-gray-500 text-sm">Experience music in perfect sync.</p>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 relative">
                            {['join', 'create'].map((tab) => (
                                <button 
                                    key={tab}
                                    onClick={() => setMode(tab)}
                                    className={`relative z-10 flex-1 py-3.5 rounded-xl font-bold text-sm transition-colors duration-300 ${mode === tab ? 'text-black' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {mode === tab && (
                                        <motion.div 
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-white rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    <span className="relative z-20">
                                        {tab === 'join' ? 'Connect' : 'Broadcast'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Form Content */}
                        <div className="space-y-6">
                            {mode === 'create' && !user && !localStorage.getItem('synco_anon_email') ? (
                                <div className="py-6 text-center space-y-6">
                                    <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mx-auto">
                                        <ShieldCheck size={32} className="text-red-400" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold">Start Broadcasting</h3>
                                        <p className="text-sm text-gray-500 px-6">Create a room instantly as a guest or sign in for permanent playlists.</p>
                                    </div>
                                    <div className="flex flex-col gap-3 px-4">
                                        <button onClick={() => setFormData({...formData, name: 'Host'})} className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-red-500/20">
                                            Continue as Guest
                                        </button>
                                        <div className="flex gap-2">
                                            <button onClick={() => navigate('/login')} className="flex-1 bg-white/5 hover:bg-white/10 text-[var(--text-color)] py-3 rounded-xl font-bold transition-all border border-white/5 text-xs">
                                                Sign In
                                            </button>
                                            <button onClick={() => navigate('/signup')} className="flex-1 bg-white/5 hover:bg-white/10 text-[var(--text-color)] py-3 rounded-xl font-bold transition-all border border-white/5 text-xs">
                                                Register
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Display Name</label>
                                            <div className="relative group">
                                                <input 
                                                    type="text"
                                                    required
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all outline-none"
                                                    placeholder="e.g. Alex"
                                                    value={formData.name}
                                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Email (Optional - To Save Playlists)</label>
                                            <div className="relative group">
                                                <input 
                                                    type="email"
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all outline-none"
                                                    placeholder="Enter email to persist library"
                                                    value={formData.email}
                                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {mode === 'join' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="space-y-2"
                                                >
                                                    <label className="block text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Room ID</label>
                                                    <input 
                                                        type="text"
                                                        required={mode === 'join'}
                                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all outline-none"
                                                        placeholder="Enter 8-digit code"
                                                        value={formData.roomId}
                                                        onChange={e => setFormData({...formData, roomId: e.target.value})}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {error && (
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="text-red-400 text-xs bg-red-400/10 p-4 rounded-2xl border border-red-400/20 flex items-center gap-3"
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                            {error}
                                        </motion.div>
                                    )}
                                    
                                    <button 
                                        disabled={loading}
                                        className="w-full bg-red-600 text-white font-black py-5 rounded-2xl shadow-[0_20px_40px_-10px_rgba(255,0,0,0.2)] hover:shadow-[0_25px_50px_-12px_rgba(255,0,0,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 mt-4 flex items-center justify-center gap-3 text-base"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {mode === 'create' ? <PlusCircle size={20} /> : <LogIn size={20} />}
                                                {mode === 'create' ? 'Continue' : 'Enter Room'}
                                            </>
                                        )}
                                    </button>

                                    {user && (
                                        <div className="flex items-center justify-between pt-4 opacity-60 hover:opacity-100 transition-opacity">
                                            <button type="button" onClick={() => navigate('/playlists')} className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                                <ListMusic size={14} /> My Library
                                            </button>
                                            <button type="button" onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-[10px] font-black uppercase tracking-widest text-red-500">
                                                Sign Out
                                            </button>
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default JoinRoom;
