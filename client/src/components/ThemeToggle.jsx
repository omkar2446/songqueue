import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-accent-primary hover:scale-110 active:scale-95 transition-all shadow-lg"
            aria-label="Toggle Theme"
        >
            <AnimatePresence mode="wait">
                {theme === 'dark' ? (
                    <motion.div
                        key="moon"
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: 90, opacity: 0 }}
                    >
                        <Moon size={24} className="text-violet-400" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="sun"
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: 90, opacity: 0 }}
                    >
                        <Sun size={24} className="text-amber-500" />
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
};

export default ThemeToggle;
