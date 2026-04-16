import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useSocket } from './SocketContext';
import { useAudioEngine } from '../hooks/useAudioEngine';

const RoomContext = createContext();
export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [room, setRoom] = useState(null);
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
    const [queue, setQueue] = useState([]);
    const [users, setUsers] = useState([]);
    const [currentSong, setCurrentSong] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(100);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isPro, setIsPro] = useState(user?.is_pro || false);
    const [ytPlayer, setYtPlayer] = useState(null); // Direct YouTube player instance

    // Advanced playback states
    const [repeatMode, setRepeatMode] = useState(0);      // 0=off 1=all 2=one
    const [shuffleMode, setShuffleMode] = useState(false);
    const [crossfadeDuration, setCrossfadeDuration] = useState(3); // seconds
    const [normalizeVolume, setNormalizeVolume] = useState(false);
    const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0]); // 60,250,1k,4k,16k Hz

    const socket = useSocket();

    // ── Single audio engine instance for the whole app ──
    const { resume: _resumeAudio } = useAudioEngine(eqBands, volume, normalizeVolume);
    const resumeAudio = (extraArgs) => _resumeAudio({ eqBands, volume, normalize: normalizeVolume, ...extraArgs });

    const fetchRoomState = async (roomId) => {
        try {
            const res = await api.get(`/room/${roomId}`);
            // Only update room if the name or ID changed significantly
            if (!room || room.id !== res.data.id) {
                setRoom({ id: res.data.id, name: res.data.name });
            }
            setQueue(res.data.queue);
            
            if (hasInteracted) {
                setIsPlaying(res.data.is_playing);
            }

            setPlaybackTime(res.data.playback_time);
            if (res.data.repeat_type !== undefined) setRepeatMode(res.data.repeat_type);
            if (res.data.shuffle_mode !== undefined) setShuffleMode(res.data.shuffle_mode);
            if (res.data.current_song_id) {
                const song = res.data.queue.find(s => s.id === res.data.current_song_id);
                setCurrentSong(song || null);
            } else {
                setCurrentSong(null);
            }
            return true;
        } catch (err) {
            console.error('Failed to fetch room state', err);
            if (err.response?.status === 404) {
                setRoom(null); // Clear room state if it doesn't exist on server
                return false;
            }
            return true; // Assume transient error for others
        }
    };

    useEffect(() => {
        if (socket && room && user) {
            socket.emit('join', { room: room.id, user_id: user.id, user_name: user.name });

            socket.on('user_list', setUsers);
            socket.on('queue_updated', () => fetchRoomState(room.id));
            socket.on('playback_update', (data) => {
                if (data.action === 'play')  setIsPlaying(true);
                if (data.action === 'pause') setIsPlaying(false);
                if (data.action === 'seek')  setPlaybackTime(data.value);
                if (data.action === 'speed') setPlaybackRate(data.value);
            });
            socket.on('room_state_update', (data) => {
                console.log('Room state update received:', data);
                if (data.repeat_type !== undefined)  setRepeatMode(data.repeat_type);
                if (data.shuffle_mode !== undefined) setShuffleMode(data.shuffle_mode);
                
                if (data.current_song !== undefined) {
                    setCurrentSong(data.current_song);
                    setPlaybackTime(0);
                    if (hasInteracted) setIsPlaying(true);
                } else if (data.current_song_id !== undefined) {
                    fetchRoomState(room.id);
                }
            });

            return () => {
                socket.emit('leave', { room: room.id, user_id: user.id });
                socket.off('user_list');
                socket.off('queue_updated');
                socket.off('playback_update');
                socket.off('room_state_update');
            };
        }
    }, [socket, room, user]);

    const joinRoom = async (name, email, phone, roomId = null) => {
        try {
            const res = await api.post('/auth/join', {
                name, email, phone, room_id: roomId
            });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setUser(res.data.user);
            await fetchRoomState(res.data.room_id);
            return res.data.room_id;
        } catch (err) {
            throw err.response?.data?.error || 'Failed to join room';
        }
    };

    const removeSong = async (songId) => {
        if (!room) return;
        try {
            await api.delete(`/room/${room.id}/queue/${songId}`);
        } catch (err) {
            console.error('Remove song failed', err);
        }
    };

    const reorderSong = async (songId, direction) => {
        if (!room) return;
        try {
            await api.post(`/room/${room.id}/reorder`, { song_id: songId, direction });
        } catch (err) {
            console.error('Reorder failed', err);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setRoom(null);
    };

    return (
        <RoomContext.Provider value={{
            room, user, setUser, queue, users, currentSong, isPlaying, playbackTime, duration,
            volume, setVolume, playbackRate, setPlaybackRate,
            repeatMode, setRepeatMode,
            shuffleMode, setShuffleMode,
            crossfadeDuration, setCrossfadeDuration,
            normalizeVolume, setNormalizeVolume,
            eqBands, setEqBands,
            hasInteracted, setHasInteracted,
            joinRoom, setRoom, fetchRoomState, logout,
            setIsPlaying, setPlaybackTime, setDuration,
            removeSong, reorderSong, isPro, setIsPro,
            ytPlayer, setYtPlayer,
            resumeAudio,
        }}>
            {children}
        </RoomContext.Provider>
    );
};
