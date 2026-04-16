import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Menu, Music, Library, ArrowRight, Play, Search, Radio, Disc } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const LandingPage = () => {
    const navigate = useNavigate();
    const { user } = useRoom();

    return (
        <div className="min-h-screen bg-black text-white overflow-x-hidden font-sans">
            {/* Navbar */}
            <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-8 md:px-16">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                        <Music size={18} className="text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tighter uppercase italic">Synco.</span>
                </div>
                <button className="w-12 h-12 flex flex-col items-end justify-center gap-1.5 group">
                    <div className="w-8 h-0.5 bg-white transition-all group-hover:w-10"></div>
                    <div className="w-10 h-0.5 bg-white"></div>
                    <div className="w-6 h-0.5 bg-white transition-all group-hover:w-10"></div>
                </button>
            </nav>

            {/* Hero Section */}
            <section className="relative h-screen flex items-center px-8 md:px-16 overflow-hidden">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img 
                        src="/hero.png" 
                        alt="Background" 
                        className="w-full h-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                </div>

                <div className="relative z-10 max-w-4xl space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="text-5xl md:text-8xl font-black leading-[1.1] premium-serif">
                            Sync & Broadcast <br />
                            Trending Vibes from <br />
                            <span className="premium-text uppercase italic">The World</span>
                        </h1>
                    </motion.div>

                    <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="text-gray-400 text-lg md:text-xl max-w-2xl font-medium tracking-tight"
                    >
                        Experience Afrobeats, Amapiano, Hip-Hop, Highlife, and millions more tracks in perfect synchronization with your squad.
                    </motion.p>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="flex flex-wrap gap-4 pt-4"
                    >
                        <button 
                            onClick={() => navigate('/join')}
                            className="px-10 py-5 bg-red-600 hover:bg-red-700 text-white font-black rounded-full transition-all hover:scale-105 shadow-xl shadow-red-600/20 uppercase tracking-wider text-sm"
                        >
                            Start Session
                        </button>
                        <button 
                            onClick={() => navigate('/playlists')}
                            className="px-10 py-5 bg-transparent border-2 border-red-600 hover:bg-red-600/10 text-white font-black rounded-full transition-all hover:scale-105 uppercase tracking-wider text-sm"
                        >
                            Playlist
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Music By Genre Section */}
            <section className="py-32 px-8 md:px-16 bg-[#050505] relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-red-600/5 blur-[120px] rounded-full"></div>
                
                <div className="max-w-7xl mx-auto text-center space-y-12">
                    <div className="space-y-4">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tight">Music By Genre</h2>
                        <p className="text-gray-500 max-w-2xl mx-auto text-lg">
                            Download and stream lots of music from various music genres. <br />
                            Lots of music from various categories of genres.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 pt-12">
                        {[
                            { name: 'Afrobeats', icon: <Radio size={32} /> },
                            { name: 'Hip Hop', icon: <Disc size={32} /> },
                            { name: 'Amapiano', icon: <Music size={32} /> },
                            { name: 'Highlife', icon: <Library size={32} /> },
                            { name: 'R&B', icon: <Play size={32} /> },
                            { name: 'Jazz', icon: <Search size={32} /> },
                        ].map((genre, i) => (
                            <motion.div
                                key={i}
                                whileHover={{ y: -10 }}
                                className="aspect-square bg-white/5 border border-white/5 rounded-3xl flex flex-col items-center justify-center gap-4 hover:bg-white/10 transition-all cursor-pointer group"
                            >
                                <div className="text-red-500 group-hover:scale-110 transition-transform">
                                    {genre.icon}
                                </div>
                                <span className="font-bold tracking-tight">{genre.name}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer / Call to Action */}
            <section className="py-24 px-8 md:px-16 border-t border-white/5 bg-black">
                <div className="flex flex-col md:flex-row items-center justify-between gap-12 max-w-7xl mx-auto">
                    <div className="space-y-4">
                        <h3 className="text-3xl font-black italic">Ready to sync?</h3>
                        <p className="text-gray-500">Join thousands of people listening together in real-time.</p>
                    </div>
                    <button 
                        onClick={() => navigate('/signup')}
                        className="group flex items-center gap-4 px-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-red-600 hover:text-white transition-all"
                    >
                        Create Your Account <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                    </button>
                </div>
            </section>
        </div>
    );
};

export default LandingPage;
