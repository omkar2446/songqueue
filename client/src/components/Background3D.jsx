import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const FloatingShape = ({ color, size, initialX, initialY, duration }) => {
    return (
        <motion.div
            initial={{ x: initialX, y: initialY, z: -100, rotate: 0 }}
            animate={{
                x: [initialX, initialX + 100, initialX - 50, initialX],
                y: [initialY, initialY - 100, initialY + 50, initialY],
                z: [0, 50, -50, 0],
                rotate: [0, 180, 360],
                opacity: [0.1, 0.3, 0.1]
            }}
            transition={{
                duration,
                repeat: Infinity,
                ease: "linear"
            }}
            style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '30%',
                background: `linear-gradient(135deg, ${color}, transparent)`,
                filter: 'blur(40px)',
                perspective: '1000px',
                transformStyle: 'preserve-3d'
            }}
        />
    );
};

const Background3D = () => {
    const shapes = useMemo(() => [
        { color: '#6366f1', size: 400, x: -100, y: -100, duration: 20 },
        { color: '#a855f7', size: 300, x: '80%', y: '10%', duration: 25 },
        { color: '#ec4899', size: 500, x: '10%', y: '60%', duration: 30 },
        { color: '#3b82f6', size: 350, x: '60%', y: '70%', duration: 22 },
    ], []);

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 bg-[#0a0515]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1e1b4b_0%,transparent_100%)] opacity-50" />
            
            {/* 3D Moving Grid */}
            <div 
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90(#fff 1px, transparent 1px)`,
                    backgroundSize: '100px 100px',
                    transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-100px)',
                    transformOrigin: 'top',
                    maskImage: 'linear-gradient(to bottom, black, transparent)'
                }}
            />

            {shapes.map((s, i) => (
                <FloatingShape key={i} {...s} initialX={s.x} initialY={s.y} />
            ))}

            <div className="absolute inset-0 backdrop-blur-[100px]" />
        </div>
    );
};

export default Background3D;
