import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useRoom } from '../context/RoomContext';
import { Music, User, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
import AntigravityBackground from '../components/AntigravityBackground';

const Signup = () => {
    const [name, setName]         = useState('');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    
    const navigate = useNavigate();
    const { setUser } = useRoom();

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/signup', { name, email, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setUser(res.data.user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Signup failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-color)] flex items-center justify-center p-6 selection:bg-red-500/30 overflow-hidden relative transition-colors duration-500">
            <AntigravityBackground />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                    opacity: 1, 
                    scale: 1,
                    y: [0, -10, 0] 
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
                className="w-[92%] sm:w-full sm:max-w-[440px] z-10 rim-light"
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
                            <h1 className="text-3xl sm:text-[2.25rem] font-extrabold tracking-tight text-white premium-text">Create room.</h1>
                            <p className="text-gray-500 text-sm">Join the sync revolution.</p>
                        </div>

                        <form onSubmit={handleSignup} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5 px-1">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-gray-500 ml-1">Full Name</label>
                                    <div className="relative group">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={18} />
                                        <input 
                                            type="text" 
                                            required
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            className="w-full glass-input pl-12"
                                            placeholder="Alex Rivera"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 px-1">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-gray-500 ml-1">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={18} />
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full glass-input pl-12"
                                            placeholder="alex@example.com"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 px-1">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-gray-500 ml-1">Password</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={18} />
                                        <input 
                                            type="password" 
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full glass-input pl-12"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                                    {error}
                                </motion.div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full accent-button py-5 rounded-2xl mt-4 flex items-center justify-center gap-2 group"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
                            </button>

                            <div className="text-center pt-2">
                                <p className="text-sm text-gray-500">
                                    Already have an account?{' '}
                                    <button type="button" onClick={() => navigate('/login')} className="text-red-500 font-bold hover:underline transition-all">Sign in</button>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Signup;
