import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Zap } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const BANDS = [
    { label: 'Sub Bass', freq: '60Hz',  index: 0, color: '#f43f5e' },
    { label: 'Bass',     freq: '250Hz', index: 1, color: '#f97316' },
    { label: 'Mid',      freq: '1kHz',  index: 2, color: '#eab308' },
    { label: 'Presence', freq: '4kHz',  index: 3, color: '#22c55e' },
    { label: 'Treble',   freq: '16kHz', index: 4, color: '#3b82f6' },
];

const PRESETS = {
    Flat:        [0,   0,   0,   0,   0],
    Rock:        [5,   3,  -1,   2,   4],
    Pop:         [-1,  3,   5,   2,  -1],
    Classical:   [3,   2,  -1,   1,   3],
    Electronic:  [5,   2,   0,   2,   5],
    Jazz:        [3,   1,   3,   1,   2],
    'Bass Boost':[8,   5,   0,  -1,  -2],
    Vocal:       [-2, -1,   4,   3,   1],
};

// ── Mini EQ curve visualizer ──────────────────────────────────────────
const EQCurve = ({ bands }) => {
    const W = 320, H = 60;
    const FREQS = [20, 60, 150, 400, 1000, 3000, 8000, 20000];
    // Map log-freq to x, dB to y
    const xOf = (f) => ((Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * W;
    const yOf = (db) => H / 2 - (db / 12) * (H / 2 - 4);

    // Compute magnitude response at each display freq
    const EQ_FREQS = [60, 250, 1000, 4000, 16000];
    const getGain = (displayFreq) => {
        let totalGain = 0;
        EQ_FREQS.forEach((cf, i) => {
            const dist = Math.abs(Math.log2(displayFreq / cf));
            const weight = Math.max(0, 1 - dist * 0.9);
            totalGain += (bands[i] || 0) * weight;
        });
        return Math.max(-12, Math.min(12, totalGain));
    };

    const displayFreqs = [30, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];
    const points = displayFreqs.map(f => `${xOf(f).toFixed(1)},${yOf(getGain(f)).toFixed(1)}`).join(' ');

    return (
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
            {/* Center line */}
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            {/* +6dB, -6dB markers */}
            <line x1="0" y1={yOf(6)}  x2={W} y2={yOf(6)}  stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1={yOf(-6)} x2={W} y2={yOf(-6)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="4,4" />

            {/* EQ curve fill */}
            <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${H / 2} ${points} ${W},${H / 2}`}
                fill="url(#eqGrad)"
            />
            <polyline
                points={points}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Band dots */}
            {EQ_FREQS.map((cf, i) => (
                <circle
                    key={i}
                    cx={xOf(cf)}
                    cy={yOf(bands[i] || 0)}
                    r="4"
                    fill={BANDS[i].color}
                    stroke="#111"
                    strokeWidth="1.5"
                />
            ))}
        </svg>
    );
};

// ── Vertical slider ──────────────────────────────────────────────────
const BandSlider = ({ band, value, onChange }) => {
    const pct = ((value + 12) / 24) * 100;
    const isBoost = value > 0;
    const isCut = value < 0;

    return (
        <div className="flex flex-col items-center gap-2 flex-1 select-none">
            {/* dB label */}
            <span className={`text-xs font-bold tabular-nums w-10 text-center transition-colors ${
                isBoost ? 'text-emerald-400' : isCut ? 'text-red-400' : 'text-gray-600'
            }`}>
                {value > 0 ? `+${value}` : value}<span className="text-[9px]">dB</span>
            </span>

            {/* Slider track */}
            <div className="relative flex items-center justify-center w-8 h-36">
                {/* Track background */}
                <div className="absolute w-1.5 h-full rounded-full bg-white/5" />
                {/* Fill above/below center */}
                <div
                    className="absolute w-1.5 rounded-full transition-all duration-75"
                    style={{
                        backgroundColor: isBoost ? band.color : isCut ? '#f43f5e' : 'transparent',
                        opacity: 0.7,
                        bottom: `${Math.min(50, pct)}%`,
                        top: `${Math.max(0, 100 - Math.max(pct, 50))}%`,
                    }}
                />
                {/* Center tick */}
                <div className="absolute w-3 h-px bg-white/20 rounded-full" style={{ top: '50%' }} />

                {/* Range input (rotated vertical) */}
                <input
                    type="range"
                    min="-12" max="12" step="0.5"
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    className="absolute cursor-pointer appearance-none bg-transparent"
                    style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        width: '32px',
                        height: '144px',
                        accentColor: band.color,
                    }}
                />
            </div>

            {/* Label */}
            <div className="text-center">
                <div className="text-[10px] font-bold text-gray-500">{band.label}</div>
                <div className="text-[9px] text-gray-700">{band.freq}</div>
            </div>
        </div>
    );
};

// ── Main ──────────────────────────────────────────────────────────────
const EqualizerPanel = ({ isOpen, onClose }) => {
    const { eqBands, setEqBands, normalizeVolume, setNormalizeVolume } = useRoom();
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

    const allFlat = eqBands.every(v => v === 0);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-lg bg-[#0e0d14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="px-6 pt-5 pb-4 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-lg flex items-center gap-2">
                                    🎚️ Equalizer
                                    {!allFlat && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400">
                                            ACTIVE
                                        </span>
                                    )}
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">Real-time frequency shaping via Web Audio</p>
                                <p className="text-[10px] text-amber-500/60 font-medium mt-1 uppercase tracking-tighter">Note: Works for Uploads / Direct Links only</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={reset}
                                    className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors"
                                    title="Reset to flat"
                                >
                                    <RotateCcw size={15} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* EQ Curve Visualizer */}
                        <div className="px-6 pt-4 pb-2">
                            <div className="bg-white/3 rounded-2xl p-3 border border-white/5">
                                <EQCurve bands={eqBands} />
                            </div>
                        </div>

                        {/* Band Sliders */}
                        <div className="px-6 py-4">
                            <div className="flex items-stretch justify-around gap-2">
                                {BANDS.map((band) => (
                                    <BandSlider
                                        key={band.index}
                                        band={band}
                                        value={eqBands[band.index]}
                                        onChange={(v) => updateBand(band.index, v)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Normalize toggle */}
                        <div className="px-6 pb-3 flex items-center justify-between">
                            <button
                                onClick={() => setNormalizeVolume(v => !v)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                    normalizeVolume
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <Zap size={12} className={normalizeVolume ? 'fill-emerald-400' : ''} />
                                Volume Normalize
                            </button>
                            <span className="text-[11px] text-gray-600 italic">
                                {normalizeVolume ? 'Loudness leveling ON' : 'Dynamic range: natural'}
                            </span>
                        </div>

                        {/* Presets */}
                        <div className="px-6 pb-5">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-2.5">Presets</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(PRESETS).map(name => (
                                    <button
                                        key={name}
                                        onClick={() => applyPreset(name)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            activePreset === name
                                                ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)]'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {name}
                                    </button>
                                ))}
                                {activePreset === 'Custom' && (
                                    <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/20">
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
