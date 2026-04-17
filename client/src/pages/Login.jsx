import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { Music, Mail, Lock, Loader2 } from 'lucide-react';
import AntigravityBackground from '../components/AntigravityBackground';

const Login = () => {
    const [email, setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    
    const navigate = useNavigate();
    const { setUser } = useRoom();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setUser(res.data.user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-shell min-h-screen w-full overflow-hidden relative bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-500">
            <AntigravityBackground />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                    opacity: 1, 
                    scale: 1,
                    y: [0, -10, 0] // Floating animation
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
                className="z-10 mx-auto flex min-h-screen w-[92%] items-center justify-center py-10 sm:w-full sm:max-w-[440px] rim-light"
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
                            <div className="section-kicker">Back in the room</div>
                            <h1 className="text-3xl sm:text-[2.25rem] font-extrabold tracking-tight leading-tight premium-text">Welcome back.</h1>
                            <p className="text-[var(--text-muted)] text-sm leading-relaxed">Sign in to your account and jump straight into your saved rooms and playlists.</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5 px-1">
                                    <label className="field-label">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={18} />
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="glass-input pl-12"
                                            placeholder="alex@example.com"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 px-1">
                                    <label className="field-label">Password</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={18} />
                                        <input 
                                            type="password" 
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full glass-input"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="status-banner p-4 text-[11px] text-center font-bold">
                                    {error}
                                </motion.div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full accent-button py-5 rounded-2xl mt-4 flex items-center justify-center gap-2 group"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Continue'}
                            </button>

                            <div className="text-center pt-2">
                                <p className="text-sm text-[var(--text-muted)]">
                                    New to Synco?{' '}
                                    <button type="button" onClick={() => navigate('/signup')} className="text-red-500 font-bold hover:underline transition-all">Create account</button>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
