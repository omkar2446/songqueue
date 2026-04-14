import React, { useEffect, useRef } from 'react';

const AntigravityBackground = () => {
    const canvasRef = useRef(null);
    const mouse = useRef({ x: 0, y: 0, active: false });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const isMobile = window.innerWidth < 768;
        const dots = [];
        const spacingX = isMobile ? 22 : 32;
        const spacingY = isMobile ? 18 : 28;
        const rows = isMobile ? 40 : 55;
        const cols = isMobile ? 45 : 80;
        let time = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const init = () => {
            dots.length = 0;
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    dots.push({
                        x: (j - cols / 2) * spacingX,
                        y: (i - rows / 2) * spacingY,
                        baseSize: 0.8 + Math.random() * 0.4,
                        h: 190 + Math.random() * 30 // Professional Cyan/Blue range
                    });
                }
            }
        };

        const project = (x, y, z) => {
            const focalLength = 800;
            
            // Curved Surface Projection (Bowl Effect)
            const curvature = 0.00018;
            const distSq = x * x + y * y;
            const curvedZ = z + distSq * curvature;

            const scale = focalLength / (focalLength + curvedZ + 400);
            
            // Camera Tilt/Parallax
            const tx = (mouse.current.x - window.innerWidth / 2) * 0.08 * (1 - scale);
            const ty = (mouse.current.y - window.innerHeight / 2) * 0.08 * (1 - scale);

            return {
                x: (x + tx) * scale + canvas.width / 2,
                y: (y + ty) * scale + canvas.height / 2 + 100,
                scale: scale,
                z: curvedZ
            };
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            time += 0.01;

            dots.forEach(dot => {
                // Base Wave
                const d = Math.sqrt(dot.x * dot.x + dot.y * dot.y);
                let waveZ = Math.sin(d * 0.012 - time) * 35;
                
                // Mouse Interaction (Repulsion/Distortion)
                if (mouse.current.active) {
                    const mdx = dot.x - (mouse.current.x - canvas.width / 2) / 0.5;
                    const mdy = dot.y - (mouse.current.y - canvas.height / 2) / 0.5;
                    const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
                    if (mDist < 200) {
                        const push = (1 - mDist / 200) * 80;
                        waveZ -= push;
                    }
                }

                const projected = project(dot.x, dot.y, waveZ);

                // Rendering Logic
                if (projected.scale > 0.1) {
                    const size = dot.baseSize * projected.scale * 2.2;
                    const opacity = Math.min(1, Math.pow(projected.scale, 2.8) * 1.5);
                    const lum = 40 + (waveZ / 60) * 30;

                    ctx.beginPath();
                    ctx.arc(projected.x, projected.y, size, 0, Math.PI * 2);
                    
                    ctx.fillStyle = `hsla(${dot.h}, 90%, ${lum}%, ${opacity})`;
                    
                    if (projected.scale > 0.7) {
                        ctx.shadowBlur = 8 * projected.scale;
                        ctx.shadowColor = `hsla(${dot.h}, 90%, ${lum}%, 0.4)`;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    
                    ctx.fill();
                }
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        const handleMouseMove = (e) => {
            mouse.current.x = e.clientX;
            mouse.current.y = e.clientY;
            mouse.current.active = true;
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        
        resize();
        init();
        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // Encoded 64x64 noise pattern - reliable and zero-latency
    const noiseDataUri = "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

    return (
        <>
            <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ background: '#02040a' }} />
            <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_90%)]" />
                <div 
                    className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
                    style={{ backgroundImage: `url("${noiseDataUri}")` }}
                />
            </div>
        </>
    );
};

export default AntigravityBackground;
