"use client";

import { useRef, useState, useCallback, useEffect } from 'react';

interface ArcSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

export function ArcSlider({ value, onChange, min, max }: ArcSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Normalized value 0-1
  const normalized = (value - min) / (max - min);
  
  // Arc parameters
  const size = 120;
  const strokeWidth = 3;
  const radius = 50;
  const cx = size - 10; // Center X at right edge
  const cy = 10;        // Center Y at top edge
  
  // Arc goes from bottom (0%) to left (100%)
  // Start angle: 90° (pointing down from center)
  // End angle: 180° (pointing left from center)
  const startAngle = 90;  // degrees, bottom
  const endAngle = 180;   // degrees, left
  const angleRange = endAngle - startAngle; // 90°
  
  // Current angle based on value
  const currentAngle = startAngle + normalized * angleRange;
  
  // Convert angle to SVG coordinates
  const angleToPoint = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };
  
  const currentPoint = angleToPoint(currentAngle);
  
  // Create arc path using SVG arc command
  const describeArc = (startA: number, endA: number) => {
    const start = angleToPoint(startA);
    const end = angleToPoint(endA);
    const largeArc = Math.abs(endA - startA) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };
  
  const trackPath = describeArc(startAngle, endAngle);
  const activePath = normalized > 0.01 ? describeArc(startAngle, currentAngle) : '';
  
  // Handle interaction
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const scale = size / rect.width;
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;
    
    // Calculate angle from arc center
    const dx = x - cx;
    const dy = y - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Clamp to arc range [90°, 180°]
    angle = Math.max(startAngle, Math.min(endAngle, angle));
    
    // Convert angle to value
    const newNormalized = (angle - startAngle) / angleRange;
    const newValue = Math.round(min + newNormalized * (max - min));
    onChange(Math.max(min, Math.min(max, newValue)));
  }, [onChange, min, max, angleRange, cx, startAngle]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => handleInteraction(e.clientX, e.clientY);
    const handleMouseUp = () => setIsDragging(false);
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleInteraction]);

  return (
    <div 
      ref={containerRef}
      className="absolute top-0 right-0 z-50 no-drag select-none cursor-pointer" 
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Track (background arc) */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* Active arc */}
        {activePath && (
          <path
            d={activePath}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        
        {/* Glow */}
        <circle
          cx={currentPoint.x}
          cy={currentPoint.y}
          r="10"
          fill="rgba(248, 113, 113, 0.2)"
        />
        
        {/* Knob */}
        <circle
          cx={currentPoint.x}
          cy={currentPoint.y}
          r="5"
          fill="#f87171"
        />
        
        {/* Knob inner highlight */}
        <circle
          cx={currentPoint.x - 1}
          cy={currentPoint.y - 1}
          r="1.5"
          fill="rgba(255,255,255,0.5)"
        />
      </svg>
      
      {/* Hz Label - top right corner, inside the arc */}
      <div className="absolute top-2 right-3 flex items-baseline gap-0.5 pointer-events-none">
        <span className="text-lg font-extralight text-white/70 tabular-nums">{value}</span>
        <span className="text-[8px] text-white/30">Hz</span>
      </div>
    </div>
  );
}
