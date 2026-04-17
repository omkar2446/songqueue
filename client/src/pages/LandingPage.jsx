import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Music, Library, ArrowRight, Play, Search, Radio, Disc } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const LandingPage = () => {
    const navigate = useNavigate();
    const { user } = useRoom();

    return (
        <div className="app-shell min-h-screen overflow-x-hidden text-white">
            <div className="ambient-orb left-[-10rem] top-[6rem] h-[18rem] w-[18rem] bg-red-500/30" />
            <div className="ambient-orb bottom-[10%] right-[-8rem] h-[22rem] w-[22rem] bg-orange-500/20" />

            {/* Navbar */}
            <nav className="page-shell absolute left-1/2 top-6 z-50 flex -translate-x-1/2 items-center justify-between rounded-[1.5rem] px-5 py-4 topbar-shell">
                <div className="brand-lockup">
                    <div className="brand-mark">
                        <Music size={18} className="text-white" />
                    </div>
                    <div>
                        <span className="brand-wordmark premium-text">Synco.</span>
                        <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[var(--text-soft)]">Shared listening</p>
                    </div>
                </div>
                <button
                    onClick={() => navigate(user ? '/join' : '/signup')}
                    className="button-secondary hidden min-w-[10rem] sm:inline-flex"
                >
                    {user ? 'Start a room' : 'Create account'}
                </button>
            </nav>

            {/* Hero Section */}
            <section className="relative flex min-h-screen items-center overflow-hidden pt-28">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img 
                        src="/hero.png" 
                        alt="Background" 
                        className="h-full w-full object-cover opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#050608] via-[#050608]/80 to-[#050608]/25"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-transparent to-[#050608]/20"></div>
                </div>

                <div className="page-shell relative z-10 grid items-center gap-10 py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="space-y-8"
                    >
                        <div className="section-kicker">
                            <span className="h-2 w-2 rounded-full bg-red-400"></span>
                            Live rooms, instant queueing
                        </div>
                        <h1 className="section-title premium-serif">
                            Sync and broadcast
                            <br />
                            trending vibes from
                            <br />
                            <span className="premium-text uppercase italic">The World</span>
                        </h1>

                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="section-copy font-medium tracking-tight"
                        >
                            Experience Afrobeats, Amapiano, Hip-Hop, Highlife, and millions more tracks in perfect synchronization with your squad.
                        </motion.p>

                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className="flex flex-wrap gap-4 pt-2"
                        >
                            <button 
                                onClick={() => navigate('/join')}
                                className="button-primary min-w-[12rem]"
                            >
                                Start session
                            </button>
                            <button 
                                onClick={() => navigate('/playlists')}
                                className="button-secondary min-w-[12rem]"
                            >
                                Open playlists
                            </button>
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="hero-panel p-6 sm:p-8"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            {[
                                ['Fast room setup', 'Start a session, invite friends, and keep playback synced.'],
                                ['Shared queues', 'Add tracks from uploads, YouTube, and Spotify matches in one flow.'],
                                ['Playlist memory', 'Save tracks from rooms into reusable collections for later sessions.'],
                                ['Designed for motion', 'Sharper panels, clearer controls, and cleaner visual hierarchy.'],
                            ].map(([title, copy]) => (
                                <div key={title} className="panel-muted p-5">
                                    <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-red-300">{title}</p>
                                    <p className="text-sm leading-6 text-[var(--text-muted)]">{copy}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Music By Genre Section */}
            <section className="relative overflow-hidden py-24 sm:py-32">
                <div className="absolute left-1/2 top-0 h-[300px] w-[800px] -translate-x-1/2 rounded-full bg-red-600/5 blur-[120px]"></div>
                
                <div className="page-shell space-y-12 text-center">
                    <div className="space-y-4">
                        <div className="section-kicker mx-auto">Genre-first discovery</div>
                        <h2 className="text-4xl font-black tracking-tight sm:text-6xl">Music by genre</h2>
                        <p className="mx-auto max-w-2xl text-lg text-[var(--text-muted)]">
                            Download and stream lots of music from various music genres. <br />
                            Lots of music from various categories of genres.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 sm:gap-6 lg:grid-cols-6">
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
                                className="surface-list-item aspect-square cursor-pointer border border-white/6 p-5 sm:p-6 rounded-[2rem] flex flex-col items-center justify-center gap-4 group"
                            >
                                <div className="rounded-2xl bg-red-500/10 p-4 text-red-400 transition-transform group-hover:scale-110">
                                    {genre.icon}
                                </div>
                                <span className="font-bold tracking-tight text-sm sm:text-base">{genre.name}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer / Call to Action */}
            <section className="border-t border-white/5 py-20">
                <div className="page-shell hero-panel flex flex-col items-start justify-between gap-8 px-8 py-10 md:flex-row md:items-center">
                    <div className="space-y-4">
                        <div className="section-kicker">Ready to sync</div>
                        <h3 className="text-3xl font-black italic sm:text-4xl">Join thousands listening together in real time.</h3>
                        <p className="text-[var(--text-muted)]">Move from solo listening to shared sessions with a cleaner, more focused interface.</p>
                    </div>
                    <button 
                        onClick={() => navigate('/signup')}
                        className="button-primary group min-w-[14rem]"
                    >
                        Create Your Account <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                    </button>
                </div>
            </section>
        </div>
    );
};

export default LandingPage;
