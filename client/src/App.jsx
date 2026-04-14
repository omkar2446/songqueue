import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { RoomProvider } from './context/RoomContext';
import JoinRoom from './pages/JoinRoom';
import RoomDashboard from './pages/RoomDashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Playlists from './pages/Playlists';

function App() {
    const [user, setUser] = useState(null);
    const spotlightRef = useRef(null);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (spotlightRef.current) {
                spotlightRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

  return (
    <div className="dark">
      <SocketProvider>
        <RoomProvider value={{ user, setUser }}>
          <BrowserRouter>
            <div className="min-h-screen bg-black relative">
                <div ref={spotlightRef} className="mouse-spotlight hidden sm:block" />
                <Routes>
                  <Route path="/" element={<JoinRoom />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/playlists" element={<Playlists />} />
                  <Route path="/room/:room_id" element={<RoomDashboard />} />
                </Routes>
            </div>
          </BrowserRouter>
        </RoomProvider>
      </SocketProvider>
    </div>
  );
}

export default App;
