import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

type DebateData = {
  label: string;
  subtitle?: string;
  severity?: 'hot' | 'warm';
};

export default function DebateNode({ data, selected }: NodeProps) {
  const typed = data as DebateData;

  return (
    <>
      <Handle type="target" position={Position.Top} className="node-handle hot" />
      <div className={`glass-node debate-node ${selected ? 'is-selected' : ''}`}>
        <div className="glass-node__title">{typed.label}</div>
        {typed.subtitle ? <div className="glass-node__subtitle">{typed.subtitle}</div> : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle hot" />
    </>
  );
}
