import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

type GlassNodeData = {
  label: string;
  subtitle?: string;
  tone?: 'blue' | 'green' | 'slate' | 'cream';
  onRemove?: () => void;
};

const toneClassMap = {
  blue: 'tone-blue',
  green: 'tone-green',
  slate: 'tone-slate',
  cream: 'tone-cream',
};

export default function GlassNode({ data, selected }: NodeProps) {
  const typed = data as GlassNodeData;
  const toneClass = toneClassMap[typed.tone ?? 'slate'];

  return (
    <>
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className={`glass-node ${toneClass} ${selected ? 'is-selected' : ''}`}>
        <div className="glass-node__orb" />
        <div className="glass-node__content">
          <div className="glass-node__title">{typed.label}</div>
          {typed.subtitle ? <div className="glass-node__subtitle">{typed.subtitle}</div> : null}
        </div>
        {typed.onRemove && (
          <button
            className="node-remove-btn"
            onClick={(e) => {
              e.stopPropagation();
              typed.onRemove?.();
            }}
            title="Remove from analysis"
          >
            ×
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </>
  );
}
