'use client';

import React from 'react';

interface RadarChartProps {
  labels: string[];
  currentValues: number[];
  potentialValues: number[];
  maxValue: number;
  size?: number;
  currentColor?: string;
  potentialColor?: string;
  currentFillOpacity?: number;
  potentialFillOpacity?: number;
  locale?: string;
}

export function RadarChart({
  labels,
  currentValues,
  potentialValues,
  maxValue,
  size = 180,
  currentColor = '#a1ffc2',
  potentialColor = '#2f4e44',
  currentFillOpacity = 0.3,
  potentialFillOpacity = 0.15,
  locale = 'en',
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;
  const levelCount = 4;
  const angleStep = (2 * Math.PI) / labels.length;

  // Calculate point position on the radar
  const getPoint = (value: number, index: number, r: number) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const normalized = Math.min(value / maxValue, 1);
    return {
      x: cx + r * normalized * Math.cos(angle),
      y: cy + r * normalized * Math.sin(angle),
    };
  };

  // Generate path for values
  const generatePath = (values: number[], r: number) => {
    const points = values.map((v, i) => getPoint(v, i, r));
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  };

  // Generate grid levels
  const gridLevels = Array.from({ length: levelCount }, (_, i) => (i + 1) / levelCount);

  // Generate axis lines
  const axisLines = labels.map((_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    return {
      x1: cx,
      y1: cy,
      x2: cx + radius * Math.cos(angle),
      y2: cy + radius * Math.sin(angle),
    };
  });

  // Get label positions (outside the chart)
  const getLabelPos = (index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const labelRadius = radius * 1.35;
    return {
      x: cx + labelRadius * Math.cos(angle),
      y: cy + labelRadius * Math.sin(angle),
    };
  };

  return (
    <svg
      width={size + 20}
      height={size + 20}
      viewBox={`-${10} -${10} ${size + 20} ${size + 20}`}
      className="overflow-visible"
    >
      {/* Grid circles */}
      {gridLevels.map((level, i) => (
        <polygon
          key={`grid-${i}`}
          points={labels
            .map((_, j) => {
              const angle = j * angleStep - Math.PI / 2;
              const r = radius * level;
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
            })
            .join(' ')}
          fill="none"
          stroke="#2f4e44"
          strokeWidth="0.5"
          opacity={0.5}
        />
      ))}

      {/* Axis lines */}
      {axisLines.map((line, i) => (
        <line
          key={`axis-${i}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#2f4e44"
          strokeWidth="0.5"
          opacity={0.5}
        />
      ))}

      {/* Potential area (background) */}
      <path
        d={generatePath(potentialValues, radius)}
        fill={potentialColor}
        fillOpacity={potentialFillOpacity}
        stroke={potentialColor}
        strokeWidth="1.5"
        strokeOpacity={0.6}
      />

      {/* Current values area */}
      <path
        d={generatePath(currentValues, radius)}
        fill={currentColor}
        fillOpacity={currentFillOpacity}
        stroke={currentColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data points for current values */}
      {currentValues.map((v, i) => {
        const point = getPoint(v, i, radius);
        return (
          <circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r="2.5"
            fill={currentColor}
            stroke="#001e17"
            strokeWidth="1.5"
          />
        );
      })}

      {/* Labels */}
      {labels.map((label, i) => {
        const pos = getLabelPos(i);
        const textAnchor =
          Math.abs(pos.x - cx) < 5
            ? 'middle'
            : pos.x < cx
            ? 'end'
            : 'start';

        return (
          <text
            key={`label-${i}`}
            x={pos.x}
            y={pos.y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            className="text-[7px] font-bold font-space uppercase fill-[#91b2a6]"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
