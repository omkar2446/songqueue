import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const BANDS = [
    { label: 'Sub Bass', freq: '60Hz',   index: 0 },
    { label: 'Bass',     freq: '250Hz',  index: 1 },
    { label: 'Mid',      freq: '1kHz',   index: 2 },
    { label: 'Presence', freq: '4kHz',   index: 3 },
    { label: 'Treble',   freq: '16kHz',  index: 4 },
];

const PRESETS = {
    Flat:       [0,   0,   0,   0,   0 ],
    Rock:       [5,   3,  -1,   2,   4 ],
    Pop:        [-1,  3,   5,   2,  -1 ],
    Classical:  [3,   2,  -1,   1,   3 ],
    Electronic: [5,   2,   0,   2,   5 ],
    Jazz:       [3,   1,   3,   1,   2 ],
    'Bass Boost':[8,  5,   0,  -1,  -2 ],
    Vocal:      [-2, -1,   4,   3,   1 ],
};

const EqualizerPanel = ({ isOpen, onClose }) => {
    const { eqBands, setEqBands } = useRoom();
    const [activePreset, setActivePreset] = useState('Flat');

    const updateBand = (index, value) => {
        const next = [...eqBands];
        next[index] = value;
        setEqBands(next);
        setActivePreset('Custom');
    };

    const applyPreset = (name) => {
        setEqBands([...PRESETS[name]]);
        setActivePreset(name);
    };

    const reset = () => applyPreset('Flat');

    const bandColor = (v) => {
        if (v > 4)  return 'bg-emerald-500';
        if (v > 0)  return 'bg-blue-500';
        if (v < -4) return 'bg-red-500';
        if (v < 0)  return 'bg-orange-400';
        return 'bg-gray-500';
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-lg bg-[#111018] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-lg">🎚️ Equalizer</h2>
                                <p className="text-xs text-gray-500">Adjust frequency bands</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={reset} className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors">
                                    <RotateCcw size={16} />
                                </button>
                                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* EQ Visualizer (vertical sliders) */}
                        <div className="p-6">
                            <div className="flex items-end justify-around h-52 gap-4 mb-4">
                                {BANDS.map(({ label, freq, index }) => {
                                    const val = eqBands[index];
                                    const pct = ((val + 12) / 24) * 100; // map -12..+12 to 0..100%
                                    return (
                                        <div key={index} className="flex flex-col items-center gap-2 flex-1">
                                            <span className={`text-xs font-bold transition-colors ${val !== 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                                                {val > 0 ? `+${val}` : val}
                                                <span className="text-[10px]">dB</span>
                                            </span>
                                            {/* Vertical slider wrapper */}
                                            <div className="relative flex items-center justify-center h-36 w-6">
                                                <div className={`absolute inset-0 flex items-center justify-center`}>
                                                    <input
                                                        type="range"
                                                        min="-12" max="12" step="0.5"
                                                        value={val}
                                                        onChange={e => updateBand(index, parseFloat(e.target.value))}
                                                        className="appearance-none cursor-pointer"
                                                        style={{
                                                            writingMode: 'vertical-lr',
                                                            direction: 'rtl',
                                                            width: '6px',
                                                            height: '136px',
                                                            accentColor: '#3b82f6',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-[10px] font-bold text-gray-500">{label}</div>
                                                <div className="text-[9px] text-gray-700">{freq}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Center line indicator */}
                            <div className="relative h-px bg-white/10 mb-4">
                                <span className="absolute left-0 -top-2.5 text-[10px] text-gray-700">0 dB</span>
                            </div>
                        </div>

                        {/* Presets */}
                        <div className="px-6 pb-6">
                            <p className="text-xs uppercase tracking-widest font-bold text-gray-600 mb-3">Presets</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(PRESETS).map(name => (
                                    <button
                                        key={name}
                                        onClick={() => applyPreset(name)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            activePreset === name
                                                ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.4)]'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {name}
                                    </button>
                                ))}
                                {activePreset === 'Custom' && (
                                    <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-500/20 text-violet-300">
                                        Custom
                                    </span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default EqualizerPanel;
