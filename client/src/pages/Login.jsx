import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRoom } from '../context/RoomContext';
import { Music, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
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
            const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
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
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden relative transition-colors duration-500">
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
                className="w-[92%] sm:w-full sm:max-w-[440px] z-10 rim-light"
            >
                <div className="glass-card">
                    <div className="p-8 sm:p-10 space-y-7">
                        {/* Branding */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-[10px] flex items-center justify-center shadow-lg shadow-purple-500/10 branding-glow">
                                    <Music size={18} className="text-white" />
                                </div>
                                <span className="text-lg font-black tracking-tight premium-text">SYNCO.</span>
                            </div>
                        </div>

                        {/* Title Section */}
                        <div className="space-y-1.5">
                            <h1 className="text-3xl sm:text-[2.25rem] font-extrabold tracking-tight leading-tight premium-text">Welcome back.</h1>
                            <p className="text-gray-500 text-sm leading-relaxed">Sign in to your account.</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5 px-1">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-gray-500 ml-1">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={18} />
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full glass-input"
                                            placeholder="alex@example.com"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 px-1">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-gray-500 ml-1">Password</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={18} />
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
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[11px] text-center font-bold">
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
                                <p className="text-sm text-gray-500">
                                    New to Synco?{' '}
                                    <button type="button" onClick={() => navigate('/signup')} className="text-blue-500 font-bold hover:underline transition-all">Create account</button>
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
