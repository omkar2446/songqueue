import React, { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

const Character = ({ x, y, color, mouseX, mouseY, hasGlasses, hasAntenna, hasCone, hasLaptop, scale = 1 }) => {
    const headRef = useRef(null);
    const [headPos, setHeadPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (headRef.current) {
            const rect = headRef.current.getBoundingClientRect();
            setHeadPos({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            });
        }
    }, [x, y]);

    const damping = 20;
    const stiffness = 120;
    
    const eyeX = useSpring(0, { damping, stiffness });
    const eyeY = useSpring(0, { damping, stiffness });
    const headTiltX = useSpring(0, { damping, stiffness });
    const headTiltY = useSpring(0, { damping, stiffness });

    useEffect(() => {
        const dx = mouseX - headPos.x;
        const dy = mouseY - headPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const maxEyeMove = 4;
        const angle = Math.atan2(dy, dx);
        eyeX.set(Math.cos(angle) * Math.min(maxEyeMove, dist / 40));
        eyeY.set(Math.sin(angle) * Math.min(maxEyeMove, dist / 40));

        const maxTilt = 10;
        headTiltX.set(Math.cos(angle) * Math.min(maxTilt, dist / 80));
        headTiltY.set(Math.sin(angle) * Math.min(maxTilt, dist / 80));
    }, [mouseX, mouseY, headPos, eyeX, eyeY, headTiltX, headTiltY]);

    return (
        <motion.div
            ref={headRef}
            style={{ 
                x: headTiltX, 
                y: headTiltY, 
                left: `${x}%`, 
                top: `${y}%`,
                position: 'absolute',
                zIndex: Math.floor(y),
                scale: scale * (0.8 + (y / 100) * 0.4)
            }}
            className="w-24 h-32 md:w-32 md:h-44 flex flex-col items-center group select-none transition-transform"
        >
            {/* Volumetric Body - "Shoulder Blob" shape */}
            <div 
                className="absolute bottom-[-15%] w-[120%] h-[80%] rounded-t-[100px] rounded-b-[40px]"
                style={{
                    background: 'linear-gradient(135deg, #0f0f15 0%, #1a1a25 50%, #050508 100%)',
                    boxShadow: 'inset 0 20px 30px rgba(255,255,255,0.02), 0 25px 45px rgba(0,0,0,0.9), inset -15px -5px 25px rgba(0,0,0,0.4)',
                }}
            />
            
            {/* Laptop Accessory */}
            {hasLaptop && (
                <div className="absolute bottom-[10%] w-[50%] h-[30%] bg-[#1a1a1a] rounded-sm z-[50] shadow-2xl border border-white/5 origin-bottom-center flex flex-col items-center justify-center p-1" style={{ transform: 'rotateX(-20deg)' }}>
                    <div className="w-1 h-1 bg-white/20 rounded-full mb-0.5" />
                    <div className="w-full grow bg-black/40 rounded-[1px] border border-white/5 shadow-inner" />
                </div>
            )}

            {/* Head (Proper sphere, tucked into body) */}
            <div 
                className="w-14 h-14 md:w-18 md:h-18 rounded-full relative shadow-2xl flex flex-col items-center justify-center transition-transform z-20"
                style={{ 
                    background: `radial-gradient(circle at 35% 35%, ${color}, #000)`,
                    boxShadow: 'inset -5px -5px 15px rgba(0,0,0,0.7), 0 10px 20px rgba(0,0,0,0.5)',
                    transform: 'translateY(45%)'
                }}
            >
                {/* Eyes */}
                <div className="flex gap-1 mt-3">
                    {[1, 2].map(i => (
                        <div key={i} className="w-5 h-6 bg-white rounded-full flex items-center justify-center relative overflow-hidden border border-black/5">
                            <motion.div 
                                style={{ x: eyeX, y: eyeY }}
                                className="w-2.5 h-3.5 bg-black rounded-full"
                            />
                        </div>
                    ))}
                </div>

                {hasGlasses && (
                    <div className="absolute top-[60%] w-[115%] h-5 border-[2px] border-black/80 rounded-full z-30" />
                )}
            </div>

            {/* Accessories */}
            {hasCone && (
                <div className="absolute top-[-5%] w-12 h-14 z-[40] drop-shadow-2xl" style={{ perspective: '400px' }}>
                    <div className="w-full h-full bg-[#ff6b00]" style={{ clipPath: 'polygon(50% 0%, 15% 100%, 85% 100%)', transform: 'rotateX(20deg)' }}>
                         <div className="absolute bottom-[30%] w-full h-[15%] bg-white/70" />
                         <div className="absolute bottom-0 w-full h-[15%] rounded-b-lg bg-[#b34b00]" />
                    </div>
                </div>
            )}
            {hasAntenna && (
                <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[2px] h-8 bg-gray-600 origin-bottom z-30">
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-600 rounded-full shadow-[0_0_10px_red] animate-pulse" />
                </div>
            )}
        </motion.div>
    );
};

const InteractiveCrowd = () => {
    const [mouse, setMouse] = useState({ x: 0, y: 0 });
    
    useEffect(() => {
        const handleMouseMove = (e) => setMouse({ x: e.clientX, y: e.clientY });
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Pyramid arrangement as in the photo
    const characters = [];
    const colors = ['#f87171', '#60a5fa', '#4ade80', '#fbbf24', '#f472b6', '#34d399', '#ffffff', '#a78bfa', '#ca8a04', '#4b5563', '#9ca3af'];
    
    const rows = [
        { count: 1, y: 10,  scale: 1.4 }, // Top
        { count: 2, y: 22,  scale: 1.3 },
        { count: 3, y: 35,  scale: 1.2 },
        { count: 5, y: 50,  scale: 1.1 },
        { count: 8, y: 68,  scale: 1.0 }, // Bottom Row
    ];

    rows.forEach((row, rowIndex) => {
        for (let col = 0; col < row.count; col++) {
            // Calculate horizontal centering
            const width = 80; // Total width of the "mountain"
            const x = 50 + (col - (row.count - 1) / 2) * (width / Math.max(row.count, 5));
            
            characters.push({
                x,
                y: row.y,
                color: colors[(rowIndex + col) % colors.length],
                hasGlasses: rowIndex === 3 && col === 2, // Center-ish character
                hasAntenna: rowIndex === 1 || rowIndex === 0,
                hasCone: rowIndex === 2 && col === 2,
                hasLaptop: rowIndex === 4 && col === 4, // Center bottom
                baseScale: row.scale
            });
        }
    });

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none bg-[#0a0515]">
            {/* Deep Purple Atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#4c1d95_0%,transparent_60%)] opacity-30" />
            
            {/* Dark gradient for UI overlaying */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0515] via-transparent to-[#0a0515]/60 z-[100]" />
            
            <div className="relative w-full h-full max-w-7xl mx-auto pt-10">
                {characters.sort((a,b) => a.y - b.y).map((p, i) => (
                    <Character 
                        key={i} 
                        x={p.x} 
                        y={p.y} 
                        color={p.color} 
                        mouseX={mouse.x} 
                        mouseY={mouse.y}
                        hasGlasses={p.hasGlasses}
                        hasAntenna={p.hasAntenna}
                        hasCone={p.hasCone}
                        hasLaptop={p.hasLaptop}
                        scale={p.baseScale}
                    />
                ))}
            </div>
        </div>
    );
};

export default InteractiveCrowd;
