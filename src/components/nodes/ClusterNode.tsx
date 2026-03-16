import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';

type ClusterNodeData = {
  label: string;
  subtitle?: string;
  paperCount: number;
  color: string;
  viewMode?: string;
  exportMode?: boolean;
};

function formatClusterLabel(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);

  if (words.length <= 2) return [label];
  if (words.length <= 4) {
    const midpoint = Math.ceil(words.length / 2);
    return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
  }

  return [
    words.slice(0, 2).join(' '),
    words.slice(2, 4).join(' '),
    words.slice(4, 6).join(' '),
  ].filter(Boolean);
}

export default function ClusterNode({ data, selected }: NodeProps) {
  const typed = data as unknown as ClusterNodeData;
  const color = typed.color || '#38BDF8';
  const isIllustrated = typed.viewMode === 'illustrated';
  const exportMode = typed.exportMode === true;

  const baseSize = isIllustrated ? 124 : 108;
  const size = Math.min(180, baseSize + typed.paperCount * 8);
  const lines = formatClusterLabel(typed.label);

  const haloOpacity = exportMode ? (isIllustrated ? '0.42' : '0.2') : isIllustrated ? '0.6' : '0.3';
  const ringOpacity = exportMode ? 0.24 : 0.4;

  if (exportMode) {
    return (
      <div className="relative flex items-center justify-center rounded-full" style={{ width: size, height: size }}>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
        
        {/* Simple Circular Glow - No blurs for export safety */}
        <div 
          className="absolute rounded-full"
          style={{
            width: size * 1.8,
            height: size * 1.8,
            background: `radial-gradient(circle, ${color}22 0%, ${color}08 50%, transparent 70%)`,
          }}
        />

        {/* Main Node Body - Simplified for Export */}
        <div
          className="relative rounded-full flex flex-col items-center justify-center text-center px-4"
          style={{
            width: size,
            height: size,
            background: isIllustrated
              ? `radial-gradient(circle at 50% 35%, ${color}18 0%, #050a19 55%, #020612 100%)`
              : `radial-gradient(circle at 50% 40%, ${color}14 0%, #050a14 60%, #020612 100%)`,
            border: `1.5px solid ${color}88`,
            boxShadow: `0 0 15px ${color}22`,
          }}
        >
          <div className="relative z-10 max-w-[78%] overflow-hidden">
            <div
              className={`font-display font-bold uppercase tracking-[0.16em] leading-tight ${
                isIllustrated ? 'text-[10px] mb-1' : 'text-[8px]'
              }`}
              style={{ color }}
            >
              {lines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>

            {isIllustrated && typed.subtitle && (
              <div className="text-[9px] text-slate-300 font-medium italic opacity-80 mb-1 line-clamp-1 lowercase tracking-wide">
                {typed.subtitle}
              </div>
            )}

            <div className={`text-white font-semibold flex items-center gap-1 justify-center ${isIllustrated ? 'text-[10px]' : 'text-[9px]'}`}>
              <span className="opacity-60 font-normal">n=</span>
              {typed.paperCount}
            </div>
          </div>

          {/* Simple Decorative Anchors */}
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          
          {isIllustrated && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-10"
              style={{ background: `linear-gradient(to bottom, ${color}44, transparent)` }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group rounded-full">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />

      <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <motion.div
        initial={exportMode ? false : { scale: 0.84, opacity: 0 }}
        animate={{
          scale: selected ? 1.06 : 1,
          opacity: 1,
          y: 0,
        }}
        transition={
          exportMode
            ? { duration: 0 }
            : { duration: 0.35, ease: 'easeOut' }
        }
        className="relative flex items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        {/* Atmospheric Halo / Anchor Glow */}
        <div
          className={`absolute rounded-full transition-opacity duration-700 ${
            exportMode ? '' : 'blur-3xl'
          }`}
          style={{
            width: size * 2.2,
            height: size * 2.2,
            opacity: Number(haloOpacity),
            background: exportMode
              ? `radial-gradient(circle, ${color}22 0%, ${color}12 42%, transparent 72%)`
              : `radial-gradient(circle, ${color}44 0%, ${color}11 50%, transparent 75%)`,
          }}
        />

        {/* Inner Ring Glow */}
        <div
          className={`absolute rounded-full ${exportMode ? '' : 'blur-xl'}`}
          style={{
            width: size * 1.3,
            height: size * 1.3,
            opacity: ringOpacity,
            background: exportMode
              ? `radial-gradient(circle, transparent 54%, ${color}24 72%, transparent 86%)`
              : `radial-gradient(circle, transparent 50%, ${color}33 70%, transparent 85%)`,
          }}
        />

        {/* Main Node Body */}
        <div
          className={`relative rounded-full flex flex-col items-center justify-center text-center px-4 transition-all duration-500 cursor-pointer ${
            selected ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            width: size,
            height: size,
            background: exportMode
              ? isIllustrated
                ? `radial-gradient(circle at 50% 35%, ${color}18 0%, rgba(5,10,25,0.96) 52%, rgba(2,6,18,1) 100%)`
                : `radial-gradient(circle at 50% 40%, ${color}14 0%, rgba(5,10,20,0.98) 58%, rgba(2,6,18,1) 100%)`
              : isIllustrated
                ? `radial-gradient(circle at 50% 35%, ${color}30 0%, rgba(5,10,25,0.85) 50%, rgba(2,6,18,0.98) 100%)`
                : `radial-gradient(circle at 50% 40%, ${color}20 0%, rgba(5,10,20,0.94) 55%, rgba(2,6,18,0.98) 100%)`,
            border: `1.5px solid ${selected ? `${color}aa` : `${color}66`}`,
            boxShadow: exportMode
              ? selected
                ? `0 0 0 1px ${color}66, 0 0 20px ${color}33`
                : `0 0 0 1px ${color}44, 0 0 14px ${color}22`
              : selected
                ? `0 0 50px ${color}66, inset 0 0 30px ${color}22`
                : `0 0 30px ${color}33, inset 0 0 20px ${color}15`,
            backdropFilter: exportMode ? 'none' : 'blur(12px)',
            WebkitBackdropFilter: exportMode ? 'none' : 'blur(12px)',
            filter: 'none',
          }}
        >
          {/* Animated Pulse Ring */}
          <div
            className={exportMode ? 'absolute inset-0 rounded-full' : 'absolute inset-0 rounded-full animate-pulse'}
            style={{
              border: `2px solid ${color}`,
              opacity: selected ? (exportMode ? 0.36 : 0.5) : exportMode ? 0.18 : 0.25,
              animationDuration: '3s',
            }}
          />

          <div className="relative z-10 max-w-[85%]">
            {/* Main Title */}
            <div
              className={`font-display font-bold uppercase tracking-[0.16em] leading-tight transition-all ${
                isIllustrated ? 'text-[10px] mb-1' : 'text-[8px]'
              }`}
              style={{
                color,
                textShadow: exportMode ? 'none' : `0 0 10px ${color}44`,
              }}
            >
              {lines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>

            {/* Semantic Subtitle / Descriptor */}
            {isIllustrated && typed.subtitle && (
              <div className="text-[9px] text-slate-300 font-medium italic opacity-80 mb-2 line-clamp-1 lowercase tracking-wide">
                {typed.subtitle}
              </div>
            )}

            {/* Paper Count Badge */}
            <div
              className={`text-white font-semibold flex items-center gap-1 justify-center ${
                isIllustrated ? 'text-[10px]' : 'text-[9px]'
              }`}
            >
              <span className="opacity-60 font-normal">n=</span>
              {typed.paperCount}
            </div>
          </div>

          {/* Decorative Anchors */}
          <div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: exportMode ? 'none' : `0 0 12px ${color}`,
            }}
          />
          <div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: exportMode ? 'none' : `0 0 10px ${color}`,
            }}
          />

          {/* Vertical Anchor Line (Illustrated Mode only) */}
          {isIllustrated && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-12"
              style={{
                background: `linear-gradient(to bottom, ${
                  exportMode ? `${color}66` : `${color}88`
                }, transparent)`,
                boxShadow: exportMode ? 'none' : `0 0 8px ${color}44`,
              }}
            />
          )}
        </div>
      </motion.div>


    </div>
  );
}
