import React, { useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { SocketProvider } from './context/SocketContext';
import { RoomProvider } from './context/RoomContext';
import JoinRoom from './pages/JoinRoom';
import RoomDashboard from './pages/RoomDashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Playlists from './pages/Playlists';
import LandingPage from './pages/LandingPage';
import GlobalPlayerHost from './components/GlobalPlayerHost';
import PageTransition from './components/PageTransition';
import { ToastProvider } from './context/ToastContext';

const AppRoutes = () => {
    const location = useLocation();
    return (
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
                <Route path="/join" element={<PageTransition><JoinRoom /></PageTransition>} />
                <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
                <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
                <Route path="/playlists" element={<PageTransition><Playlists /></PageTransition>} />
                <Route path="/room/:room_id" element={<PageTransition><RoomDashboard /></PageTransition>} />
            </Routes>
        </AnimatePresence>
    );
};

function App() {
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
        <RoomProvider>
          <ToastProvider>
            <BrowserRouter>
              <div className="app-shell relative overflow-hidden">
                <div ref={spotlightRef} className="mouse-spotlight hidden sm:block" />
                <GlobalPlayerHost />
                <AppRoutes />
              </div>
            </BrowserRouter>
          </ToastProvider>
        </RoomProvider>
      </SocketProvider>
    </div>
  );
}

export default App;
