/**
 * useAudioEngine — Singleton Web Audio EQ + Compressor
 *
 * Designed to be called ONCE (from RoomContext). Uses module-level singletons
 * so multiple React renders don't create multiple audio graphs.
 *
 * For YouTube IFrame (cross-origin): We can't tap its audio stream directly.
 * Normalize for YouTube is handled separately via ytPlayer.setVolume().
 * EQ/Compress applies to any <audio>/<video> elements accessible in the page DOM.
 */

import { useEffect, useRef, useCallback } from 'react';

const EQ_CONFIG = [
    { freq: 60,    type: 'lowshelf'  },
    { freq: 250,   type: 'peaking'   },
    { freq: 1000,  type: 'peaking'   },
    { freq: 4000,  type: 'peaking'   },
    { freq: 16000, type: 'highshelf' },
];

// ─── Module-level singletons (survive re-renders) ───────────────────
let _ctx           = null;
let _filters       = [];
let _compressor    = null;
let _masterGain    = null;
let _graphReady    = false;
let _seenElements  = new WeakSet();

function getCtx() {
    if (!_ctx || _ctx.state === 'closed') {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _ctx;
}

export function buildGraph(eqBands, volume, normalize) {
    if (_graphReady) return; // already built
    const ctx = getCtx();

    // 5-band EQ
    _filters = EQ_CONFIG.map(({ freq, type }, i) => {
        const f = ctx.createBiquadFilter();
        f.type            = type;
        f.frequency.value = freq;
        f.Q.value         = 1.4;
        f.gain.value      = eqBands?.[i] ?? 0;
        return f;
    });

    // Dynamics compressor
    _compressor = ctx.createDynamicsCompressor();
    _compressor.threshold.value = normalize ? -24  : -100;
    _compressor.knee.value      = 30;
    _compressor.ratio.value     = normalize ? 12   : 1;
    _compressor.attack.value    = 0.003;
    _compressor.release.value   = 0.25;

    // Master gain
    _masterGain = ctx.createGain();
    _masterGain.gain.value = (volume ?? 100) / 100;

    // Wire chain: [source] → eq×5 → compressor → masterGain → destination
    for (let i = 0; i < _filters.length - 1; i++) {
        _filters[i].connect(_filters[i + 1]);
    }
    _filters[_filters.length - 1].connect(_compressor);
    _compressor.connect(_masterGain);
    _masterGain.connect(ctx.destination);

    _graphReady = true;
    console.log('[AudioEngine] Graph built ✓');
}

function tryConnect(el) {
    if (!el || _seenElements.has(el) || !_graphReady) return;
    
    // Add event listeners for future source changes
    if (!el._eqListenersAttached) {
        el._eqListenersAttached = true;
        el.addEventListener('loadstart', () => {
            // Re-scan if source changes, though createMediaElementSource 
            // usually stays valid for the hijacked element.
            if (_graphReady) scan();
        });
    }

    try {
        const ctx = getCtx();
        const src = ctx.createMediaElementSource(el);
        src.connect(_filters[0]);
        _seenElements.add(el);
        console.log('[AudioEngine] Connected:', el.tagName, el.src?.slice(0, 80) || '(no src)');
    } catch (err) {
        if (err.message?.includes('already')) {
            _seenElements.add(el);
        } else {
            console.warn('[AudioEngine] Connection error:', err.message);
        }
    }
}

function scan() {
    if (!_graphReady) return;
    document.querySelectorAll('audio, video').forEach(tryConnect);
}

// Install once – intercepts any AudioContext.createMediaElementSource call
let _patched = false;
function installInterceptor() {
    if (_patched) return;
    _patched = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const orig = AC.prototype.createMediaElementSource;
    AC.prototype.createMediaElementSource = function (el) {
        const node = orig.call(this, el);
        if (this !== _ctx) setTimeout(() => tryConnect(el), 50);
        return node;
    };
}

// ─── Hook (call ONCE in RoomContext) ────────────────────────────────
export function useAudioEngine(eqBands, volume, normalizeVolume) {
    const initialized = useRef(false);
    const observerRef = useRef(null);

    // One-time DOM setup
    useEffect(() => {
        installInterceptor();

        // MutationObserver: catch dynamically added <audio>/<video>
        observerRef.current = new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.matches?.('audio,video')) tryConnect(n);
                    n.querySelectorAll?.('audio,video').forEach(tryConnect);
                }
            }
        });
        observerRef.current.observe(document.documentElement, { childList: true, subtree: true });

        return () => observerRef.current?.disconnect();
    }, []);

    // ── EQ bands sync ──────────────────────────────────────────────
    useEffect(() => {
        if (!_graphReady || !_ctx) return;
        _filters.forEach((f, i) => {
            if (eqBands?.[i] !== undefined) {
                f.gain.setTargetAtTime(eqBands[i], _ctx.currentTime, 0.015);
            }
        });
    }, [eqBands]);

    // ── Volume sync (Web Audio master gain) ────────────────────────
    useEffect(() => {
        if (!_graphReady || !_masterGain || !_ctx) return;
        _masterGain.gain.setTargetAtTime(volume / 100, _ctx.currentTime, 0.02);
    }, [volume]);

    // ── Normalize sync (compressor params) ────────────────────────
    useEffect(() => {
        if (!_graphReady || !_compressor || !_ctx) return;
        const t = _ctx.currentTime;
        _compressor.threshold.setTargetAtTime(normalizeVolume ? -24  : -100, t, 0.05);
        _compressor.ratio.setTargetAtTime(    normalizeVolume ? 12   : 1,    t, 0.05);
        _compressor.knee.setTargetAtTime(     normalizeVolume ? 30   : 0,    t, 0.05);
        console.log('[AudioEngine] Normalize:', normalizeVolume ? 'ON' : 'OFF');
    }, [normalizeVolume]);

    // ── Called on first user gesture ───────────────────────────────
    const resume = useCallback(({ eqBands: bands, volume: vol, normalize: norm } = {}) => {
        if (!initialized.current) {
            initialized.current = true;
            buildGraph(bands, vol, norm);
        }
        const ctx = getCtx();
        if (ctx.state === 'suspended') ctx.resume();

        // Scan now + with delays to catch lazy-loaded YouTube elements
        scan();
        setTimeout(scan, 300);
        setTimeout(scan, 1000);
        setTimeout(scan, 2500);
    }, []);

    return { resume };
}
