import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { useSocket } from '../context/SocketContext';
import {
    Wifi, WifiOff, Smartphone, Monitor, Crown, Radio,
    QrCode, X, Copy, Check, Tv2, Headphones
} from 'lucide-react';

// Simple QR code using a free API — no API key needed
const QRCode = ({ value, size = 160 }) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0c0b0f&color=ffffff&format=png&margin=2`;
    return (
        <img
            src={url}
            alt="QR Code"
            className="rounded-xl"
            style={{ width: size, height: size }}
        />
    );
};

const DeviceIcon = ({ name }) => {
    const lower = name?.toLowerCase() || '';
    if (lower.includes('mobile') || lower.includes('phone') || lower.includes('android') || lower.includes('iphone')) {
        return <Smartphone size={16} />;
    }
    if (lower.includes('tv') || lower.includes('screen')) return <Tv2 size={16} />;
    return <Monitor size={16} />;
};

const DevicesPanel = ({ isOpen, onClose }) => {
    const { room, user, users } = useRoom();
    const socket = useSocket();
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const joinLink = `${window.location.origin}/?room=${room?.id}`;
    const roomId = room?.id || '';

    const copyLink = () => {
        navigator.clipboard.writeText(joinLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyId = () => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const promoteUser = (targetUserId) => {
        if (!user?.is_admin) return;
        socket.emit('transfer_admin', { room_id: roomId, target_user_id: targetUserId });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-full max-w-md bg-[#111018] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 rounded-xl">
                                    <Radio size={20} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg">Connected Devices</h2>
                                    <p className="text-xs text-gray-500">{users?.length || 0} active in this session</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* User List */}
                        <div className="p-4 max-h-64 overflow-y-auto space-y-2">
                            {(users || []).length === 0 ? (
                                <div className="text-center text-gray-600 py-8">
                                    <WifiOff size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">No other users connected</p>
                                </div>
                            ) : (
                                (users || []).map((u, i) => (
                                    <motion.div
                                        key={u.id || i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 group"
                                    >
                                        {/* Avatar */}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
                                            {u.name?.substring(0, 2)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm truncate">{u.name}</span>
                                                {u.is_admin && (
                                                    <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                                                        <Crown size={10} />
                                                        HOST
                                                    </span>
                                                )}
                                                {u.id === user?.id && (
                                                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                                                        You
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="text-[10px] text-gray-500">Live</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-gray-600">
                                            <DeviceIcon name={u.name} />
                                            {user?.is_admin && u.id !== user?.id && !u.is_admin && (
                                                <button
                                                    onClick={() => promoteUser(u.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-2 py-1 rounded-md transition-all"
                                                >
                                                    Make Host
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>

                        {/* Invite Section */}
                        <div className="p-6 border-t border-white/5 space-y-4">
                            <p className="text-xs uppercase tracking-widest font-bold text-gray-600">Invite to Room</p>

                            {/* Room ID Box */}
                            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                                <div className="flex-1">
                                    <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Room ID</p>
                                    <p className="font-mono font-bold text-xl tracking-widest text-blue-400">{roomId}</p>
                                </div>
                                <button
                                    onClick={copyId}
                                    className="p-3 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors"
                                >
                                    {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="text-blue-400" />}
                                </button>
                            </div>

                            {/* QR Toggle */}
                            <button
                                onClick={() => setShowQR(v => !v)}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-medium transition-colors"
                            >
                                <QrCode size={18} />
                                {showQR ? 'Hide QR Code' : 'Show QR Code'}
                            </button>

                            <AnimatePresence>
                                {showQR && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex flex-col items-center gap-4 overflow-hidden"
                                    >
                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                            <QRCode value={joinLink} size={160} />
                                        </div>
                                        <p className="text-xs text-gray-600 text-center">
                                            Scan with any device to join this room instantly
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Copy Link Button */}
                            <button
                                onClick={copyLink}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(37,99,235,0.3)]"
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Link Copied!' : 'Copy Invite Link'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default DevicesPanel;
