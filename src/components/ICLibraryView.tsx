import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  canInsertIntoZif,
  CATEGORY_LABELS,
  filterICDefinitions,
  getICDefinition,
} from '../ic-library';
import { useLabStore } from '../store/useLabStore';
import { ICCategory, ICDefinition } from '../types/circuit';
import { ICInternalDiagram } from './ICInternalDiagram';

/**
 * Draws a small IEEE/ANSI logic gate symbol centered at (cx, cy) inside the DIP package body.
 * dir = 'left' means inputs enter from the right and output exits toward the left;
 * dir = 'right' means inputs enter from the left and output exits toward the right;
 * dir = 'down' means inputs enter from top/sides and output exits at the bottom.
 */
function renderMiniGateInPackage(
  gateType: 'NAND' | 'NOR' | 'NOT' | 'AND' | 'OR' | 'XOR' | 'XNOR',
  cx: number,
  cy: number,
  pointing: 'left' | 'right'
): React.ReactNode {
  const s = pointing === 'right' ? 1 : -1;
  const stroke = '#20252B';
  const fill = '#FFFFFF';
  const sw = 1.65;
  const hasBubble =
    gateType === 'NAND' || gateType === 'NOR' || gateType === 'NOT' || gateType === 'XNOR';
  const isOrFamily =
    gateType === 'OR' || gateType === 'NOR' || gateType === 'XOR' || gateType === 'XNOR';
  const isXorFamily = gateType === 'XOR' || gateType === 'XNOR';

  if (gateType === 'NOT') {
    const xBack = cx - s * 11;
    const xTip = cx + s * 9;
    const xBub = cx + s * 12.5;
    return (
      <g>
        <path
          d={`M ${xBack} ${cy - 9} L ${xTip} ${cy} L ${xBack} ${cy + 9} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <circle cx={xBub} cy={cy} r={3.2} fill={fill} stroke={stroke} strokeWidth={sw} />
      </g>
    );
  }

  if (!isOrFamily) {
    // AND / NAND
    const xBack = cx - s * 13;
    const xMid = cx - s * 1;
    const xTip = cx + s * 11;
    const sweep = pointing === 'right' ? 1 : 0;
    return (
      <g>
        <path
          d={`M ${xBack} ${cy - 11} L ${xMid} ${cy - 11} A 11 11 0 0 ${sweep} ${xMid} ${cy + 11} L ${xBack} ${cy + 11} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        {hasBubble && (
          <circle
            cx={xTip + s * 3.4}
            cy={cy}
            r={3.2}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        )}
      </g>
    );
  }

  // OR / NOR / XOR / XNOR
  const xBack = cx - s * 13;
  const xTip = cx + s * 12;
  return (
    <g>
      {isXorFamily && (
        <path
          d={`M ${xBack - s * 4.5} ${cy - 11} Q ${xBack + s * 2} ${cy} ${xBack - s * 4.5} ${cy + 11}`}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      <path
        d={`M ${xBack} ${cy - 11} L ${cx - s * 3} ${cy - 11} Q ${cx + s * 7} ${cy - 10} ${xTip} ${cy} Q ${cx + s * 7} ${cy + 10} ${cx - s * 3} ${cy + 11} L ${xBack} ${cy + 11} Q ${xBack + s * 5.5} ${cy} ${xBack} ${cy - 11} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {hasBubble && (
        <circle
          cx={xTip + s * 3.4}
          cy={cy}
          r={3.2}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      )}
    </g>
  );
}

/**
 * Reusable IEEE Flip-Flop symbol (D, JK, SR, T) with clock dynamic indicator (>CK),
 * optional negative-edge clock bubble, active-low preset (~PR) / clear (~CLR) bubbles,
 * and Q / ~Q output terminals for inside-package schematics.
 */
function renderFlipFlopSymbol(
  x: number,
  y: number,
  w: number,
  h: number,
  typeLabel: string,
  opts?: {
    negEdgeClk?: boolean;
    hasPre?: boolean;
    hasClr?: boolean;
    topLabel?: string;
    clkSide?: 'left' | 'top';
  }
) {
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2.5}
        fill="#FFFFFF"
        stroke="#20252B"
        strokeWidth={1.6}
      />
      {opts?.topLabel && (
        <text
          x={cx}
          y={y + 11}
          textAnchor="middle"
          fill="#456A83"
          fontSize={7.2}
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
        >
          {opts.topLabel}
        </text>
      )}
      {/* Preset & Clear Bubbles */}
      {opts?.hasPre && (
        <g>
          <circle cx={cx - 12} cy={y - 3} r={2.8} fill="#FFFFFF" stroke="#20252B" strokeWidth={1.3} />
          <text x={cx - 12} y={y + 9} textAnchor="middle" fill="#7A4848" fontSize={6.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            PR
          </text>
        </g>
      )}
      {opts?.hasClr && (
        <g>
          <circle cx={cx + 12} cy={y + h + 3} r={2.8} fill="#FFFFFF" stroke="#20252B" strokeWidth={1.3} />
          <text x={cx + 12} y={y + h - 4} textAnchor="middle" fill="#7A4848" fontSize={6.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            CLR
          </text>
        </g>
      )}
      {/* Clock Triangle */}
      {opts?.clkSide === 'top' ? (
        <g>
          {opts?.negEdgeClk && (
            <circle cx={cx} cy={y - 3} r={2.8} fill="#FFFFFF" stroke="#20252B" strokeWidth={1.3} />
          )}
          <polygon
            points={`${cx - 4.5},${y} ${cx + 4.5},${y} ${cx},${y + 6.5}`}
            fill="none"
            stroke="#20252B"
            strokeWidth={1.3}
          />
        </g>
      ) : (
        <g>
          {opts?.negEdgeClk && (
            <circle cx={x - 3} cy={y + h / 2} r={2.8} fill="#FFFFFF" stroke="#20252B" strokeWidth={1.3} />
          )}
          <polygon
            points={`${x},${y + h / 2 - 4.5} ${x + 6.5},${y + h / 2} ${x},${y + h / 2 + 4.5}`}
            fill="none"
            stroke="#20252B"
            strokeWidth={1.3}
          />
        </g>
      )}
      <text
        x={cx}
        y={y + h / 2 + 3}
        textAnchor="middle"
        fill="#20252B"
        fontSize={7.8}
        fontWeight={700}
        fontFamily="IBM Plex Mono, monospace"
      >
        {typeLabel}
      </text>
      {/* Q and ~Q Output Indicators */}
      <text x={x + w - 4} y={y + 13} textAnchor="end" fill="#3B5746" fontSize={7.2} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
        Q
      </text>
      <circle cx={x + w + 2.8} cy={y + h - 10} r={2.6} fill="#FFFFFF" stroke="#20252B" strokeWidth={1.3} />
      <text x={x + w - 4} y={y + h - 7} textAnchor="end" fill="#3B5746" fontSize={7} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
        Q̄
      </text>
    </g>
  );
}

/**
 * Reusable Full Adder gate sub-network (2 XOR gates + 2 AND gates + 1 OR carry gate)
 * rendered inside the 7483 4-bit binary full adder package.
 */
function renderFullAdderGateNetwork(
  x: number,
  y: number,
  w: number,
  h: number,
  bitIdx: number,
  aLabel: string,
  bLabel: string,
  sLabel: string,
  cInLabel: string,
  cOutLabel: string
) {
  const cy = y + h / 2;
  const xor1X = x + 46;
  const xor2X = x + 118;
  const andX = x + 118;
  const orX = x + 178;
  return (
    <g>
      {/* Subtle stage frame */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="#FAF9F5"
        stroke="#B8B7B0"
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      <text
        x={x + 6}
        y={y + 11}
        fill="#456A83"
        fontSize={7.2}
        fontWeight={700}
        fontFamily="IBM Plex Mono, monospace"
      >
        FA{bitIdx}: {aLabel}⊕{bLabel}⊕{cInLabel} → {sLabel}, {cOutLabel}
      </text>
      {/* Input traces A_i, B_i into XOR1 */}
      <line x1={x + 8} y1={cy - 10} x2={xor1X - 18} y2={cy - 10} stroke="#2C5E8A" strokeWidth={1.3} />
      <line x1={x + 8} y1={cy + 2} x2={xor1X - 18} y2={cy + 2} stroke="#2C5E8A" strokeWidth={1.3} />
      {renderMiniGateInPackage('XOR', xor1X, cy - 4, 'right')}
      {/* Half-sum P_i = A_i ⊕ B_i to XOR2 */}
      <line x1={xor1X + 16} y1={cy - 4} x2={xor2X - 18} y2={cy - 10} stroke="#20252B" strokeWidth={1.3} />
      {/* Carry-in trace into XOR2 */}
      <line x1={x + 68} y1={y + 4} x2={x + 68} y2={cy - 2} stroke="#456A83" strokeWidth={1.3} />
      <line x1={x + 68} y1={cy - 2} x2={xor2X - 18} y2={cy - 2} stroke="#456A83" strokeWidth={1.3} />
      {renderMiniGateInPackage('XOR', xor2X, cy - 6, 'right')}
      {/* Sum output S_i */}
      <line x1={xor2X + 16} y1={cy - 6} x2={x + w - 8} y2={cy - 6} stroke="#3B5746" strokeWidth={1.5} />
      <text x={x + w - 10} y={cy - 10} textAnchor="end" fill="#3B5746" fontSize={7.2} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
        {sLabel}
      </text>
      {/* Carry generate/propagate AND + OR gates */}
      <line x1={xor1X - 22} y1={cy + 2} x2={xor1X - 22} y2={cy + 22} stroke="#2C5E8A" strokeWidth={1.1} />
      <line x1={xor1X - 22} y1={cy + 22} x2={andX - 16} y2={cy + 22} stroke="#2C5E8A" strokeWidth={1.1} />
      <line x1={x + 68} y1={cy - 2} x2={x + 68} y2={cy + 14} stroke="#456A83" strokeWidth={1.1} />
      <line x1={x + 68} y1={cy + 14} x2={andX - 16} y2={cy + 14} stroke="#456A83" strokeWidth={1.1} />
      {renderMiniGateInPackage('AND', andX, cy + 18, 'right')}
      <line x1={andX + 14} y1={cy + 18} x2={orX - 16} y2={cy + 18} stroke="#456A83" strokeWidth={1.2} />
      {renderMiniGateInPackage('OR', orX, cy + 18, 'right')}
      {/* Carry-out line */}
      <line x1={orX + 16} y1={cy + 18} x2={orX + 26} y2={cy + 18} stroke="#3B5746" strokeWidth={1.4} />
      <line x1={orX + 26} y1={cy + 18} x2={orX + 26} y2={y + h} stroke="#456A83" strokeWidth={1.4} strokeDasharray="2 1.5" />
      <text x={orX + 22} y={y + h - 4} textAnchor="end" fill="#456A83" fontSize={6.8} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
        {cOutLabel}
      </text>
    </g>
  );
}

/**
 * Full-height DIP Package Pinout & Internal Pin-Wired Diagram rendered right beside the
 * Pin Configuration Table so both cards have equal height and show how every physical pin
 * connects inside the IC (matching the Ramaiah Institute of Technology IC-PIN DETAILS BOOK).
 */
const DIPPinoutDiagram: React.FC<{ ic: ICDefinition }> = ({ ic }) => {
  const half = ic.pinCount / 2;
  const rowH = 58;
  const topPad = 36;
  const botPad = 34;
  const bodyH = (half - 1) * rowH + 56;
  const svgH = bodyH + topPad + botPad;
  const svgW = 460;
  const bodyX = 96;
  const bodyW = 268;
  const bodyRight = bodyX + bodyW; // 364
  const cx = svgW / 2; // 230

  const pinY = (pinNum: number): number => {
    if (pinNum <= half) {
      return topPad + 28 + (pinNum - 1) * rowH;
    }
    const rightIdx = ic.pinCount - pinNum;
    return topPad + 28 + rightIdx * rowH;
  };

  const pinColor = (dir: string) =>
    dir === 'power-vcc'
      ? '#B83A32'
      : dir === 'power-gnd'
      ? '#20252B'
      : dir === 'output' || dir === 'open-collector'
      ? '#3B5746'
      : '#2C5E8A';

  // Render internal gate-level & flip-flop wiring for all 25 ICs directly inside the DIP body
  const renderInternalGateWiring = () => {
    const p = ic.partNumber;
    const wireIn = '#2C5E8A';
    const wireOut = '#3B5746';
    const wireInternal = '#456A83';

    // 1. Standard Quad 2-Input Gates: 7400 (NAND), 7408 (AND), 7432 (OR), 7486 (XOR)
    // Pins: G1(1,2->3), G2(4,5->6), GND(7), G3(10,9->8), G4(13,12->11), VCC(14)
    if (p === '7400' || p === '7408' || p === '7432' || p === '7486') {
      const gType =
        p === '7400' ? 'NAND' : p === '7408' ? 'AND' : p === '7432' ? 'OR' : 'XOR';
      const hasBub = p === '7400';
      const leftPairs = [
        { inA: 1, inB: 2, outY: 3, gx: 162, gy: (pinY(1) + pinY(2)) / 2 + 8 },
        { inA: 4, inB: 5, outY: 6, gx: 162, gy: (pinY(4) + pinY(5)) / 2 + 8 },
      ];
      const rightPairs = [
        { inA: 13, inB: 12, outY: 11, gx: 298, gy: (pinY(13) + pinY(12)) / 2 + 8 },
        { inA: 10, inB: 9, outY: 8, gx: 298, gy: (pinY(10) + pinY(9)) / 2 + 8 },
      ];

      return (
        <g>
          {leftPairs.map((g, idx) => {
            const yA = pinY(g.inA);
            const yB = pinY(g.inB);
            const yOut = pinY(g.outY);
            const inX = g.gx - 13;
            const outX = g.gx + (hasBub ? 15 : 12);
            return (
              <g key={`lg-${idx}`}>
                {/* Input A -> Gate */}
                <path
                  d={`M ${bodyX} ${yA} L ${bodyX + 26} ${yA} L ${bodyX + 26} ${g.gy - 5} L ${inX} ${g.gy - 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                {/* Input B -> Gate */}
                <path
                  d={`M ${bodyX} ${yB} L ${bodyX + 16} ${yB} L ${bodyX + 16} ${g.gy + 5} L ${inX} ${g.gy + 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                {/* Gate Output -> Pin outY */}
                <path
                  d={`M ${outX} ${g.gy} L ${g.gx + 28} ${g.gy} L ${g.gx + 28} ${yOut} L ${bodyX} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage(gType, g.gx, g.gy, 'right')}
              </g>
            );
          })}

          {rightPairs.map((g, idx) => {
            const yA = pinY(g.inA);
            const yB = pinY(g.inB);
            const yOut = pinY(g.outY);
            const inX = g.gx + 13;
            const outX = g.gx - (hasBub ? 15 : 12);
            return (
              <g key={`rg-${idx}`}>
                {/* Input A -> Gate */}
                <path
                  d={`M ${bodyRight} ${yA} L ${bodyRight - 26} ${yA} L ${bodyRight - 26} ${g.gy - 5} L ${inX} ${g.gy - 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                {/* Input B -> Gate */}
                <path
                  d={`M ${bodyRight} ${yB} L ${bodyRight - 16} ${yB} L ${bodyRight - 16} ${g.gy + 5} L ${inX} ${g.gy + 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                {/* Gate Output -> Pin outY */}
                <path
                  d={`M ${outX} ${g.gy} L ${g.gx - 28} ${g.gy} L ${g.gx - 28} ${yOut} L ${bodyRight} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage(gType, g.gx, g.gy, 'left')}
              </g>
            );
          })}
        </g>
      );
    }

    // 2. 7402 Quad 2-Input NOR (Reversed pinout: G1(2,3->1), G2(5,6->4), G3(8,9->10), G4(11,12->13))
    if (p === '7402') {
      const leftPairs = [
        { inA: 2, inB: 3, outY: 1, gx: 162, gy: (pinY(2) + pinY(3)) / 2 - 8 },
        { inA: 5, inB: 6, outY: 4, gx: 162, gy: (pinY(5) + pinY(6)) / 2 - 8 },
      ];
      const rightPairs = [
        { inA: 12, inB: 11, outY: 13, gx: 298, gy: (pinY(12) + pinY(11)) / 2 - 8 },
        { inA: 9, inB: 8, outY: 10, gx: 298, gy: (pinY(9) + pinY(8)) / 2 - 8 },
      ];
      return (
        <g>
          {leftPairs.map((g, idx) => {
            const yA = pinY(g.inA);
            const yB = pinY(g.inB);
            const yOut = pinY(g.outY);
            const inX = g.gx - 13;
            const outX = g.gx + 15.5;
            return (
              <g key={`nor-l-${idx}`}>
                <path
                  d={`M ${bodyX} ${yA} L ${bodyX + 16} ${yA} L ${bodyX + 16} ${g.gy - 5} L ${inX} ${g.gy - 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${bodyX} ${yB} L ${bodyX + 26} ${yB} L ${bodyX + 26} ${g.gy + 5} L ${inX} ${g.gy + 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${outX} ${g.gy} L ${g.gx + 28} ${g.gy} L ${g.gx + 28} ${yOut} L ${bodyX} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage('NOR', g.gx, g.gy, 'right')}
              </g>
            );
          })}
          {rightPairs.map((g, idx) => {
            const yA = pinY(g.inA);
            const yB = pinY(g.inB);
            const yOut = pinY(g.outY);
            const inX = g.gx + 13;
            const outX = g.gx - 15.5;
            return (
              <g key={`nor-r-${idx}`}>
                <path
                  d={`M ${bodyRight} ${yA} L ${bodyRight - 16} ${yA} L ${bodyRight - 16} ${g.gy - 5} L ${inX} ${g.gy - 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${bodyRight} ${yB} L ${bodyRight - 26} ${yB} L ${bodyRight - 26} ${g.gy + 5} L ${inX} ${g.gy + 5}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${outX} ${g.gy} L ${g.gx - 28} ${g.gy} L ${g.gx - 28} ${yOut} L ${bodyRight} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage('NOR', g.gx, g.gy, 'left')}
              </g>
            );
          })}
        </g>
      );
    }

    // 3. 4077 Quad CMOS XNOR (G1: 1,2->3; G2: 5,6->4; G3: 8,9->10; G4: 12,13->11)
    if (p === '4077') {
      const leftGates = [
        { inA: 1, inB: 2, outY: 3, gx: 162, gy: (pinY(1) + pinY(2)) / 2 + 8 },
        { inA: 5, inB: 6, outY: 4, gx: 162, gy: (pinY(5) + pinY(6)) / 2 - 8 },
      ];
      const rightGates = [
        { inA: 13, inB: 12, outY: 11, gx: 298, gy: (pinY(13) + pinY(12)) / 2 + 8 },
        { inA: 9, inB: 8, outY: 10, gx: 298, gy: (pinY(9) + pinY(8)) / 2 - 8 },
      ];
      return (
        <g>
          {leftGates.map((g, idx) => (
            <g key={`xnor-l-${idx}`}>
              <path
                d={`M ${bodyX} ${pinY(g.inA)} L ${bodyX + 20} ${pinY(g.inA)} L ${bodyX + 20} ${g.gy - 5} L ${g.gx - 15} ${g.gy - 5}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.6}
              />
              <path
                d={`M ${bodyX} ${pinY(g.inB)} L ${bodyX + 28} ${pinY(g.inB)} L ${bodyX + 28} ${g.gy + 5} L ${g.gx - 15} ${g.gy + 5}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.6}
              />
              <path
                d={`M ${g.gx + 15.5} ${g.gy} L ${g.gx + 28} ${g.gy} L ${g.gx + 28} ${pinY(g.outY)} L ${bodyX} ${pinY(g.outY)}`}
                fill="none"
                stroke={wireOut}
                strokeWidth={1.75}
              />
              {renderMiniGateInPackage('XNOR', g.gx, g.gy, 'right')}
            </g>
          ))}
          {rightGates.map((g, idx) => (
            <g key={`xnor-r-${idx}`}>
              <path
                d={`M ${bodyRight} ${pinY(g.inA)} L ${bodyRight - 20} ${pinY(g.inA)} L ${bodyRight - 20} ${g.gy - 5} L ${g.gx + 15} ${g.gy - 5}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.6}
              />
              <path
                d={`M ${bodyRight} ${pinY(g.inB)} L ${bodyRight - 28} ${pinY(g.inB)} L ${bodyRight - 28} ${g.gy + 5} L ${g.gx + 15} ${g.gy + 5}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.6}
              />
              <path
                d={`M ${g.gx - 15.5} ${g.gy} L ${g.gx - 28} ${g.gy} L ${g.gx - 28} ${pinY(g.outY)} L ${bodyRight} ${pinY(g.outY)}`}
                fill="none"
                stroke={wireOut}
                strokeWidth={1.75}
              />
              {renderMiniGateInPackage('XNOR', g.gx, g.gy, 'left')}
            </g>
          ))}
        </g>
      );
    }

    // 4. 7404 Hex Inverter (6 NOT gates: 1->2, 3->4, 5->6 on left; 13->12, 11->10, 9->8 on right)
    if (p === '7404') {
      const leftNot = [
        { inP: 1, outP: 2 },
        { inP: 3, outP: 4 },
        { inP: 5, outP: 6 },
      ];
      const rightNot = [
        { inP: 13, outP: 12 },
        { inP: 11, outP: 10 },
        { inP: 9, outP: 8 },
      ];
      return (
        <g>
          {leftNot.map((g, idx) => {
            const yIn = pinY(g.inP);
            const yOut = pinY(g.outP);
            const gy = (yIn + yOut) / 2;
            const gx = 160;
            return (
              <g key={`not-l-${idx}`}>
                <path
                  d={`M ${bodyX} ${yIn} L ${gx - 24} ${yIn} L ${gx - 24} ${gy} L ${gx - 11} ${gy}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${gx + 16} ${gy} L ${gx + 28} ${gy} L ${gx + 28} ${yOut} L ${bodyX} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage('NOT', gx, gy, 'right')}
              </g>
            );
          })}
          {rightNot.map((g, idx) => {
            const yIn = pinY(g.inP);
            const yOut = pinY(g.outP);
            const gy = (yIn + yOut) / 2;
            const gx = 300;
            return (
              <g key={`not-r-${idx}`}>
                <path
                  d={`M ${bodyRight} ${yIn} L ${gx + 24} ${yIn} L ${gx + 24} ${gy} L ${gx + 11} ${gy}`}
                  fill="none"
                  stroke={wireIn}
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${gx - 16} ${gy} L ${gx - 28} ${gy} L ${gx - 28} ${yOut} L ${bodyRight} ${yOut}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.75}
                />
                {renderMiniGateInPackage('NOT', gx, gy, 'left')}
              </g>
            );
          })}
        </g>
      );
    }

    // 5. 7410 (Triple 3-Input NAND) & 7427 (Triple 3-Input NOR)
    // G1: 1,2,13 -> 12; G2: 3,4,5 -> 6; G3: 9,10,11 -> 8
    if (p === '7410' || p === '7427') {
      const gType = p === '7410' ? 'NAND' : 'NOR';
      const g1x = 228;
      const g1y = pinY(2);
      const g2x = 164;
      const g2y = pinY(4);
      const g3x = 296;
      const g3y = pinY(10);
      return (
        <g>
          {/* Gate 1: Pins 1, 2 (left) + Pin 13 (right) -> Pin 12 (right) */}
          <path
            d={`M ${bodyX} ${pinY(1)} L ${g1x - 30} ${pinY(1)} L ${g1x - 30} ${g1y - 6} L ${g1x - 13} ${g1y - 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyX} ${pinY(2)} L ${g1x - 13} ${pinY(2)}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyRight} ${pinY(13)} L ${g1x - 22} ${pinY(13)} L ${g1x - 22} ${g1y + 6} L ${g1x - 13} ${g1y + 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${g1x + 15.5} ${g1y} L ${g1x + 42} ${g1y} L ${g1x + 42} ${pinY(12)} L ${bodyRight} ${pinY(12)}`}
            fill="none"
            stroke={wireOut}
            strokeWidth={1.75}
          />
          {renderMiniGateInPackage(gType, g1x, g1y, 'right')}

          {/* Gate 2: Pins 3, 4, 5 (left) -> Pin 6 (left) */}
          <path
            d={`M ${bodyX} ${pinY(3)} L ${bodyX + 22} ${pinY(3)} L ${bodyX + 22} ${g2y - 6} L ${g2x - 13} ${g2y - 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyX} ${pinY(4)} L ${g2x - 13} ${pinY(4)}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyX} ${pinY(5)} L ${bodyX + 22} ${pinY(5)} L ${bodyX + 22} ${g2y + 6} L ${g2x - 13} ${g2y + 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${g2x + 15.5} ${g2y} L ${g2x + 28} ${g2y} L ${g2x + 28} ${pinY(6)} L ${bodyX} ${pinY(6)}`}
            fill="none"
            stroke={wireOut}
            strokeWidth={1.75}
          />
          {renderMiniGateInPackage(gType, g2x, g2y, 'right')}

          {/* Gate 3: Pins 11, 10, 9 (right) -> Pin 8 (right) */}
          <path
            d={`M ${bodyRight} ${pinY(11)} L ${bodyRight - 22} ${pinY(11)} L ${bodyRight - 22} ${g3y - 6} L ${g3x + 13} ${g3y - 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyRight} ${pinY(10)} L ${g3x + 13} ${pinY(10)}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${bodyRight} ${pinY(9)} L ${bodyRight - 22} ${pinY(9)} L ${bodyRight - 22} ${g3y + 6} L ${g3x + 13} ${g3y + 6}`}
            fill="none"
            stroke={wireIn}
            strokeWidth={1.6}
          />
          <path
            d={`M ${g3x - 15.5} ${g3y} L ${g3x - 28} ${g3y} L ${g3x - 28} ${pinY(8)} L ${bodyRight} ${pinY(8)}`}
            fill="none"
            stroke={wireOut}
            strokeWidth={1.75}
          />
          {renderMiniGateInPackage(gType, g3x, g3y, 'left')}
        </g>
      );
    }

    // 6. 7420 Dual 4-Input NAND (G1: 1,2,4,5 -> 6; G2: 13,12,10,9 -> 8)
    if (p === '7420') {
      const g1x = 166;
      const g1y = pinY(3);
      const g2x = 294;
      const g2y = pinY(11);
      return (
        <g>
          {[1, 2, 4, 5].map((pin, idx) => {
            const offsets = [-7, -2.5, 2.5, 7];
            const xTurn = bodyX + 14 + idx * 6;
            return (
              <path
                key={pin}
                d={`M ${bodyX} ${pinY(pin)} L ${xTurn} ${pinY(pin)} L ${xTurn} ${g1y + offsets[idx]} L ${g1x - 13} ${g1y + offsets[idx]}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.5}
              />
            );
          })}
          <path
            d={`M ${g1x + 15.5} ${g1y} L ${g1x + 28} ${g1y} L ${g1x + 28} ${pinY(6)} L ${bodyX} ${pinY(6)}`}
            fill="none"
            stroke={wireOut}
            strokeWidth={1.75}
          />
          {renderMiniGateInPackage('NAND', g1x, g1y, 'right')}

          {[13, 12, 10, 9].map((pin, idx) => {
            const offsets = [-7, -2.5, 2.5, 7];
            const xTurn = bodyRight - 14 - idx * 6;
            return (
              <path
                key={pin}
                d={`M ${bodyRight} ${pinY(pin)} L ${xTurn} ${pinY(pin)} L ${xTurn} ${g2y + offsets[idx]} L ${g2x + 13} ${g2y + offsets[idx]}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.5}
              />
            );
          })}
          <path
            d={`M ${g2x - 15.5} ${g2y} L ${g2x - 28} ${g2y} L ${g2x - 28} ${pinY(8)} L ${bodyRight} ${pinY(8)}`}
            fill="none"
            stroke={wireOut}
            strokeWidth={1.75}
          />
          {renderMiniGateInPackage('NAND', g2x, g2y, 'left')}
        </g>
      );
    }

    // 5. Dual D Positive-Edge Triggered Flip-Flop (7474) — 2 real IEEE D-FF symbols wired to pins 1..6 and 8..13
    if (p === '7474') {
      const ffW = 92;
      const ffH = 128;
      const ffX = cx - ffW / 2;
      const ff1Y = topPad + 44;
      const ff2Y = topPad + 224;
      return (
        <g>
          {/* D-FF 1 (Pins 1..6) */}
          <path d={`M ${bodyX} ${pinY(1)} L ${ffX - 24} ${pinY(1)} L ${ffX - 24} ${ff1Y + ffH + 14} L ${cx + 12} ${ff1Y + ffH + 14} L ${cx + 12} ${ff1Y + ffH + 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyX} ${pinY(2)} L ${ffX} ${pinY(2)}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <text x={ffX + 6} y={pinY(2) + 3} fill="#2C5E8A" fontSize={7.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">1D</text>
          <path d={`M ${bodyX} ${pinY(3)} L ${ffX - 10} ${pinY(3)} L ${ffX - 10} ${ff1Y + ffH / 2} L ${ffX} ${ff1Y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyX} ${pinY(4)} L ${ffX - 18} ${pinY(4)} L ${ffX - 18} ${ff1Y - 12} L ${cx - 12} ${ff1Y - 12} L ${cx - 12} ${ff1Y - 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${ffX + ffW} ${ff1Y + 12} L ${ffX + ffW + 24} ${ff1Y + 12} L ${ffX + ffW + 24} ${pinY(5)} L ${bodyX} ${pinY(5)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          <path d={`M ${ffX + ffW + 6} ${ff1Y + ffH - 10} L ${ffX + ffW + 32} ${ff1Y + ffH - 10} L ${ffX + ffW + 32} ${pinY(6)} L ${bodyX} ${pinY(6)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          {renderFlipFlopSymbol(ffX, ff1Y, ffW, ffH, 'D-FF 1', { hasPre: true, hasClr: true, topLabel: 'POS-EDGE D1' })}

          {/* D-FF 2 (Pins 8..13) */}
          <path d={`M ${bodyRight} ${pinY(13)} L ${ffX + ffW + 34} ${pinY(13)} L ${ffX + ffW + 34} ${ff2Y + ffH + 14} L ${cx + 12} ${ff2Y + ffH + 14} L ${cx + 12} ${ff2Y + ffH + 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyRight} ${pinY(12)} L ${ffX + ffW + 20} ${pinY(12)} L ${ffX + ffW + 20} ${ff2Y + 34} L ${ffX} ${ff2Y + 34}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <text x={ffX + 6} y={ff2Y + 37} fill="#2C5E8A" fontSize={7.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">2D</text>
          <path d={`M ${bodyRight} ${pinY(11)} L ${ffX + ffW + 14} ${pinY(11)} L ${ffX + ffW + 14} ${ff2Y + ffH / 2} L ${ffX} ${ff2Y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyRight} ${pinY(10)} L ${ffX + ffW + 26} ${pinY(10)} L ${ffX + ffW + 26} ${ff2Y - 12} L ${cx - 12} ${ff2Y - 12} L ${cx - 12} ${ff2Y - 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${ffX + ffW} ${ff2Y + 12} L ${ffX + ffW + 18} ${ff2Y + 12} L ${ffX + ffW + 18} ${pinY(9)} L ${bodyRight} ${pinY(9)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          <path d={`M ${ffX + ffW + 6} ${ff2Y + ffH - 10} L ${ffX + ffW + 22} ${ff2Y + ffH - 10} L ${ffX + ffW + 22} ${pinY(8)} L ${bodyRight} ${pinY(8)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          {renderFlipFlopSymbol(ffX, ff2Y, ffW, ffH, 'D-FF 2', { hasPre: true, hasClr: true, topLabel: 'POS-EDGE D2' })}
        </g>
      );
    }

    // 6. Dual JK Negative-Edge Flip-Flop (7476) — 2 real IEEE JK-FF symbols with Preset & Clear wired to pins 1..16
    if (p === '7476') {
      const ffW = 96;
      const ffH = 148;
      const ffX = cx - ffW / 2;
      const ff1Y = topPad + 42;
      const ff2Y = topPad + 248;
      return (
        <g>
          {/* JK-FF 1 (1CLK=1, ~1PRE=2, ~1CLR=3, 1J=4, 1K=16, 1Q=15, 1~Q=14) */}
          <path d={`M ${bodyX} ${pinY(1)} L ${ffX - 18} ${pinY(1)} L ${ffX - 18} ${ff1Y + ffH / 2} L ${ffX - 6} ${ff1Y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyX} ${pinY(2)} L ${ffX - 12} ${pinY(2)} L ${ffX - 12} ${ff1Y - 12} L ${cx - 12} ${ff1Y - 12} L ${cx - 12} ${ff1Y - 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyX} ${pinY(3)} L ${ffX - 24} ${pinY(3)} L ${ffX - 24} ${ff1Y + ffH + 12} L ${cx + 12} ${ff1Y + ffH + 12} L ${cx + 12} ${ff1Y + ffH + 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyX} ${pinY(4)} L ${ffX} ${pinY(4)}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyRight} ${pinY(16)} L ${ffX + ffW + 24} ${pinY(16)} L ${ffX + ffW + 24} ${ff1Y + 34} L ${ffX} ${ff1Y + 34}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${ffX + ffW} ${ff1Y + 12} L ${ffX + ffW + 16} ${ff1Y + 12} L ${ffX + ffW + 16} ${pinY(15)} L ${bodyRight} ${pinY(15)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          <path d={`M ${ffX + ffW + 6} ${ff1Y + ffH - 10} L ${ffX + ffW + 20} ${ff1Y + ffH - 10} L ${ffX + ffW + 20} ${pinY(14)} L ${bodyRight} ${pinY(14)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          {renderFlipFlopSymbol(ffX, ff1Y, ffW, ffH, 'JK-FF 1', { negEdgeClk: true, hasPre: true, hasClr: true, topLabel: '1J(4) · 1K(16)' })}

          {/* JK-FF 2 (2CLK=6, ~2PRE=7, ~2CLR=8, 2J=9, 2K=12, 2Q=11, 2~Q=10) */}
          <path d={`M ${bodyX} ${pinY(6)} L ${ffX - 18} ${pinY(6)} L ${ffX - 18} ${ff2Y + ffH / 2} L ${ffX - 6} ${ff2Y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyX} ${pinY(7)} L ${ffX - 12} ${pinY(7)} L ${ffX - 12} ${ff2Y - 12} L ${cx - 12} ${ff2Y - 12} L ${cx - 12} ${ff2Y - 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyX} ${pinY(8)} L ${ffX - 24} ${pinY(8)} L ${ffX - 24} ${ff2Y + ffH + 12} L ${cx + 12} ${ff2Y + ffH + 12} L ${cx + 12} ${ff2Y + ffH + 6}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyRight} ${pinY(9)} L ${ffX + ffW + 28} ${pinY(9)} L ${ffX + ffW + 28} ${ff2Y + 34} L ${ffX} ${ff2Y + 34}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${bodyRight} ${pinY(12)} L ${ffX + ffW + 22} ${pinY(12)} L ${ffX + ffW + 22} ${ff2Y + ffH - 28} L ${ffX} ${ff2Y + ffH - 28}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          <path d={`M ${ffX + ffW} ${ff2Y + 12} L ${ffX + ffW + 14} ${ff2Y + 12} L ${ffX + ffW + 14} ${pinY(11)} L ${bodyRight} ${pinY(11)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          <path d={`M ${ffX + ffW + 6} ${ff2Y + ffH - 10} L ${ffX + ffW + 18} ${ff2Y + ffH - 10} L ${ffX + ffW + 18} ${pinY(10)} L ${bodyRight} ${pinY(10)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
          {renderFlipFlopSymbol(ffX, ff2Y, ffW, ffH, 'JK-FF 2', { negEdgeClk: true, hasPre: true, hasClr: true, topLabel: '2J(9) · 2K(12)' })}
        </g>
      );
    }

    // 7. 4-Bit Binary Full Adder with Fast Carry (7483) — 4 cascaded Full Adder XOR+AND+OR gate networks
    if (p === '7483') {
      const stageX = bodyX + 18;
      const stageW = bodyW - 36;
      const stageH = 92;
      const gap = 14;
      const startY = topPad + 28;
      const faConfigs = [
        { bit: 1, aPin: 10, bPin: 11, sPin: 9, aL: 'A1(10)', bL: 'B1(11)', sL: 'S1(9)', cIn: 'C0(13)', cOut: 'C1' },
        { bit: 2, aPin: 8, bPin: 7, sPin: 6, aL: 'A2(8)', bL: 'B2(7)', sL: 'S2(6)', cIn: 'C1', cOut: 'C2' },
        { bit: 3, aPin: 3, bPin: 4, sPin: 2, aL: 'A3(3)', bL: 'B3(4)', sL: 'S3(2)', cIn: 'C2', cOut: 'C3' },
        { bit: 4, aPin: 1, bPin: 16, sPin: 15, aL: 'A4(1)', bL: 'B4(16)', sL: 'S4(15)', cIn: 'C3', cOut: 'C4(14)' },
      ];
      return (
        <g>
          {/* C0 (Pin 13) carry-in trace to FA1 */}
          <path d={`M ${bodyRight} ${pinY(13)} L ${stageX + stageW + 10} ${pinY(13)} L ${stageX + stageW + 10} ${startY - 6} L ${stageX + 68} ${startY - 6} L ${stageX + 68} ${startY + 4}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          {faConfigs.map((fa, idx) => {
            const sy = startY + idx * (stageH + gap);
            const cy = sy + stageH / 2;
            const aSideX = fa.aPin <= half ? bodyX : bodyRight;
            const bSideX = fa.bPin <= half ? bodyX : bodyRight;
            const sSideX = fa.sPin <= half ? bodyX : bodyRight;
            return (
              <g key={fa.bit}>
                <path d={`M ${aSideX} ${pinY(fa.aPin)} L ${fa.aPin <= half ? stageX - 6 : stageX + stageW + 6} ${pinY(fa.aPin)} L ${fa.aPin <= half ? stageX - 6 : stageX + stageW + 6} ${cy - 10} L ${stageX + 8} ${cy - 10}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
                <path d={`M ${bSideX} ${pinY(fa.bPin)} L ${fa.bPin <= half ? stageX - 10 : stageX + stageW + 8} ${pinY(fa.bPin)} L ${fa.bPin <= half ? stageX - 10 : stageX + stageW + 8} ${cy + 2} L ${stageX + 8} ${cy + 2}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
                <path d={`M ${stageX + stageW - 8} ${cy - 6} L ${fa.sPin <= half ? stageX - 12 : stageX + stageW + 12} ${cy - 6} L ${fa.sPin <= half ? stageX - 12 : stageX + stageW + 12} ${pinY(fa.sPin)} L ${sSideX} ${pinY(fa.sPin)}`} fill="none" stroke={wireOut} strokeWidth={1.5} />
                {renderFullAdderGateNetwork(stageX, sy, stageW, stageH, fa.bit, fa.aL, fa.bL, fa.sL, fa.cIn, fa.cOut)}
                {idx < 3 && (
                  <path d={`M ${stageX + 204} ${sy + stageH} L ${stageX + 204} ${sy + stageH + gap / 2} L ${stageX + 68} ${sy + stageH + gap / 2} L ${stageX + 68} ${sy + stageH + gap + 4}`} fill="none" stroke="#456A83" strokeWidth={1.5} strokeDasharray="3 1.5" />
                )}
              </g>
            );
          })}
          {/* C4 (Pin 14) Carry-Out trace */}
          <path d={`M ${stageX + 204} ${startY + 3 * (stageH + gap) + stageH} L ${stageX + 204} ${pinY(14)} L ${bodyRight} ${pinY(14)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
        </g>
      );
    }

    // 8. Decade (7490) and 4-Bit Binary (7493) Ripple Counters — 4 JK/T Flip-Flop stages + NAND Reset Gates
    if (p === '7490' || p === '7493') {
      const is90 = p === '7490';
      const ffW = 78;
      const ffH = 62;
      const ffX = cx - ffW / 2 - 14;
      const ffs = [
        { name: 'FF-A (÷2)', clkPin: 14, qPin: 12, y: topPad + 30, top: 'CKA(14)→QA(12)' },
        { name: 'FF-B', clkPin: 1, qPin: 9, y: topPad + 110, top: 'CKB(1)→QB(9)' },
        { name: 'FF-C', clkPin: 0, qPin: 8, y: topPad + 190, top: 'QB→QC(8)' },
        { name: 'FF-D', clkPin: 0, qPin: 11, y: topPad + 270, top: is90 ? 'BCD QD(11)' : 'QC→QD(11)' },
      ];
      const r0GateX = cx + 58;
      const r0GateY = topPad + 86;
      const r9GateY = topPad + 216;
      return (
        <g>
          {ffs.map((f, i) => (
            <g key={f.name}>
              {renderFlipFlopSymbol(ffX, f.y, ffW, ffH, f.name, { negEdgeClk: true, hasClr: true, topLabel: f.top })}
              <path d={`M ${ffX + ffW} ${f.y + 12} L ${ffX + ffW + 22} ${f.y + 12} L ${ffX + ffW + 22} ${pinY(f.qPin)} L ${bodyRight} ${pinY(f.qPin)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
              {i >= 1 && i < 3 && (
                <path d={`M ${ffX + ffW} ${f.y + 12} L ${ffX - 14} ${f.y + ffH + 8} L ${ffX - 14} ${ffs[i + 1].y + ffH / 2} L ${ffX - 6} ${ffs[i + 1].y + ffH / 2}`} fill="none" stroke="#456A83" strokeWidth={1.4} strokeDasharray="3 1.5" />
              )}
            </g>
          ))}
          <path d={`M ${bodyRight} ${pinY(14)} L ${ffX - 16} ${pinY(14)} L ${ffX - 16} ${ffs[0].y + ffH / 2} L ${ffX - 6} ${ffs[0].y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyX} ${pinY(1)} L ${ffX - 18} ${pinY(1)} L ${ffX - 18} ${ffs[1].y + ffH / 2} L ${ffX - 6} ${ffs[1].y + ffH / 2}`} fill="none" stroke={wireIn} strokeWidth={1.6} />
          <path d={`M ${bodyX} ${pinY(2)} L ${r0GateX - 16} ${r0GateY - 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyX} ${pinY(3)} L ${r0GateX - 16} ${r0GateY + 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          {renderMiniGateInPackage('NAND', r0GateX, r0GateY, 'right')}
          <path d={`M ${r0GateX + 19} ${r0GateY} L ${r0GateX + 30} ${r0GateY} L ${r0GateX + 30} ${ffs[3].y + ffH + 10} L ${ffX + ffW / 2 + 12} ${ffs[3].y + ffH + 10}`} fill="none" stroke="#7A4848" strokeWidth={1.3} strokeDasharray="2.5 1.5" />
          {is90 && (
            <g>
              <path d={`M ${bodyX} ${pinY(6)} L ${r0GateX - 16} ${r9GateY - 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              <path d={`M ${bodyX} ${pinY(7)} L ${r0GateX - 16} ${r9GateY + 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              {renderMiniGateInPackage('NAND', r0GateX, r9GateY, 'right')}
              <text x={r0GateX} y={r9GateY - 16} textAnchor="middle" fill="#7A4848" fontSize={7} fontWeight={700} fontFamily="IBM Plex Mono, monospace">R9(6,7)→SET 9</text>
            </g>
          )}
        </g>
      );
    }

    // 9. 3-to-8 Line Decoder (74138) & Dual 2-to-4 Line Decoder (74139) — Select Inverters + Multi-Input NAND Decoder Array
    if (p === '74138' || p === '74139') {
      const busX1 = bodyX + 46;
      const busX2 = bodyX + 64;
      const busX3 = bodyX + 82;
      const nandX = cx + 44;
      if (p === '74138') {
        const outPins = [15, 14, 13, 12, 11, 10, 9, 7];
        return (
          <g>
            {[1, 2, 3].map((pin, idx) => {
              const bx = busX1 + idx * 18;
              return (
                <g key={pin}>
                  <path d={`M ${bodyX} ${pinY(pin)} L ${bx} ${pinY(pin)} L ${bx} ${topPad + bodyH - 22}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
                  {renderMiniGateInPackage('NOT', bx + 9, pinY(pin) + 20, 'right')}
                </g>
              );
            })}
            <path d={`M ${bodyX} ${pinY(4)} L ${busX3 + 22} ${pinY(4)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
            <path d={`M ${bodyX} ${pinY(5)} L ${busX3 + 22} ${pinY(5)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
            <path d={`M ${bodyX} ${pinY(6)} L ${busX3 + 22} ${pinY(6)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
            {renderMiniGateInPackage('AND', busX3 + 36, pinY(5), 'right')}
            {outPins.map((outPin, idx) => {
              const gy = topPad + 44 + idx * 50;
              const isLeft = outPin <= half;
              return (
                <g key={outPin}>
                  <line x1={busX1} y1={gy - 5} x2={nandX - 16} y2={gy - 5} stroke={wireInternal} strokeWidth={1.2} />
                  <line x1={busX2} y1={gy} x2={nandX - 16} y2={gy} stroke={wireInternal} strokeWidth={1.2} />
                  <line x1={busX3} y1={gy + 5} x2={nandX - 16} y2={gy + 5} stroke={wireInternal} strokeWidth={1.2} />
                  {renderMiniGateInPackage('NAND', nandX, gy, 'right')}
                  <path
                    d={`M ${nandX + 19} ${gy} L ${isLeft ? bodyX + 20 : nandX + 42} ${gy} L ${isLeft ? bodyX + 20 : nandX + 42} ${pinY(outPin)} L ${isLeft ? bodyX : bodyRight} ${pinY(outPin)}`}
                    fill="none"
                    stroke={wireOut}
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </g>
        );
      }
      return (
        <g>
          <path d={`M ${bodyX} ${pinY(1)} L ${busX1} ${pinY(1)} L ${busX1} ${pinY(7) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyX} ${pinY(2)} L ${busX2} ${pinY(2)} L ${busX2} ${pinY(7) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyX} ${pinY(3)} L ${busX3} ${pinY(3)} L ${busX3} ${pinY(7) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          {[4, 5, 6, 7].map((outPin) => (
            <g key={outPin}>
              <line x1={busX1} y1={pinY(outPin) - 5} x2={cx - 24} y2={pinY(outPin) - 5} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={busX2} y1={pinY(outPin)} x2={cx - 24} y2={pinY(outPin)} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={busX3} y1={pinY(outPin) + 5} x2={cx - 24} y2={pinY(outPin) + 5} stroke={wireInternal} strokeWidth={1.2} />
              {renderMiniGateInPackage('NAND', cx - 8, pinY(outPin), 'left')}
              <line x1={cx - 27} y1={pinY(outPin)} x2={bodyX} y2={pinY(outPin)} stroke={wireOut} strokeWidth={1.6} />
            </g>
          ))}
          <path d={`M ${bodyRight} ${pinY(15)} L ${bodyRight - 44} ${pinY(15)} L ${bodyRight - 44} ${pinY(9) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyRight} ${pinY(14)} L ${bodyRight - 60} ${pinY(14)} L ${bodyRight - 60} ${pinY(9) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyRight} ${pinY(13)} L ${bodyRight - 76} ${pinY(13)} L ${bodyRight - 76} ${pinY(9) + 10}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          {[12, 11, 10, 9].map((outPin) => (
            <g key={outPin}>
              <line x1={bodyRight - 76} y1={pinY(outPin) - 5} x2={cx + 24} y2={pinY(outPin) - 5} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={bodyRight - 60} y1={pinY(outPin)} x2={cx + 24} y2={pinY(outPin)} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={bodyRight - 44} y1={pinY(outPin) + 5} x2={cx + 24} y2={pinY(outPin) + 5} stroke={wireInternal} strokeWidth={1.2} />
              {renderMiniGateInPackage('NAND', cx + 40, pinY(outPin), 'right')}
              <line x1={cx + 59} y1={pinY(outPin)} x2={bodyRight} y2={pinY(outPin)} stroke={wireOut} strokeWidth={1.6} />
            </g>
          ))}
        </g>
      );
    }

    // 10. 8-to-1 Multiplexer (74151) & Dual 4-to-1 Multiplexer (74153) — AND-OR Gate Array + Select Inverters
    if (p === '74151' || p === '74153') {
      const andX = cx - 22;
      const orX = cx + 44;
      if (p === '74151') {
        const dPins = [4, 3, 2, 1, 15, 14, 13, 12];
        const orY = pinY(5);
        return (
          <g>
            {[11, 10, 9].map((sPin, idx) => (
              <path key={sPin} d={`M ${bodyRight} ${pinY(sPin)} L ${andX - 30 - idx * 10} ${pinY(sPin)} L ${andX - 30 - idx * 10} ${topPad + 36}`} fill="none" stroke={wireIn} strokeWidth={1.2} />
            ))}
            <path d={`M ${bodyX} ${pinY(7)} L ${andX - 20} ${pinY(7)} L ${andX - 20} ${topPad + 36}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
            {dPins.map((dPin, idx) => {
              const gy = topPad + 42 + idx * 48;
              const isLeft = dPin <= half;
              return (
                <g key={dPin}>
                  <path d={`M ${isLeft ? bodyX : bodyRight} ${pinY(dPin)} L ${isLeft ? andX - 16 : andX + 26} ${pinY(dPin)} L ${andX - 16} ${gy}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
                  {renderMiniGateInPackage('AND', andX, gy, 'right')}
                  <path d={`M ${andX + 14} ${gy} L ${orX - 16} ${orY + (idx - 3.5) * 3}`} fill="none" stroke={wireInternal} strokeWidth={1.2} />
                </g>
              );
            })}
            {renderMiniGateInPackage('OR', orX, orY, 'right')}
            <path d={`M ${orX + 16} ${orY} L ${orX + 28} ${orY} L ${orX + 28} ${pinY(5)} L ${bodyX} ${pinY(5)}`} fill="none" stroke={wireOut} strokeWidth={1.6} />
            {renderMiniGateInPackage('NOT', orX, pinY(6), 'left')}
            <path d={`M ${orX + 28} ${orY} L ${orX + 28} ${pinY(6)} L ${orX + 14} ${pinY(6)}`} fill="none" stroke={wireInternal} strokeWidth={1.4} />
            <line x1={orX - 19} y1={pinY(6)} x2={bodyX} y2={pinY(6)} stroke={wireOut} strokeWidth={1.6} />
          </g>
        );
      }
      return (
        <g>
          <path d={`M ${bodyX} ${pinY(2)} L ${cx} ${pinY(2)} L ${cx} ${topPad + bodyH - 28}`} fill="none" stroke="#456A83" strokeWidth={1.4} strokeDasharray="3 1.5" />
          <path d={`M ${bodyRight} ${pinY(14)} L ${cx + 12} ${pinY(14)} L ${cx + 12} ${topPad + bodyH - 28}`} fill="none" stroke="#456A83" strokeWidth={1.4} strokeDasharray="3 1.5" />
          {[3, 4, 5, 6].map((cPin) => (
            <g key={cPin}>
              <line x1={bodyX} y1={pinY(cPin)} x2={cx - 64} y2={pinY(cPin)} stroke={wireIn} strokeWidth={1.4} />
              <line x1={cx} y1={pinY(cPin) + 5} x2={cx - 64} y2={pinY(cPin) + 5} stroke="#456A83" strokeWidth={1.1} />
              {renderMiniGateInPackage('AND', cx - 48, pinY(cPin), 'right')}
              <path d={`M ${cx - 34} ${pinY(cPin)} L ${cx - 18} ${pinY(7)}`} fill="none" stroke={wireInternal} strokeWidth={1.2} />
            </g>
          ))}
          {renderMiniGateInPackage('OR', cx - 32, pinY(7), 'left')}
          <line x1={cx - 48} y1={pinY(7)} x2={bodyX} y2={pinY(7)} stroke={wireOut} strokeWidth={1.7} />
          {[13, 12, 11, 10].map((cPin) => (
            <g key={cPin}>
              <line x1={bodyRight} y1={pinY(cPin)} x2={cx + 64} y2={pinY(cPin)} stroke={wireIn} strokeWidth={1.4} />
              <line x1={cx + 12} y1={pinY(cPin) + 5} x2={cx + 64} y2={pinY(cPin) + 5} stroke="#456A83" strokeWidth={1.1} />
              {renderMiniGateInPackage('AND', cx + 48, pinY(cPin), 'left')}
              <path d={`M ${cx + 34} ${pinY(cPin)} L ${cx + 28} ${pinY(9)}`} fill="none" stroke={wireInternal} strokeWidth={1.2} />
            </g>
          ))}
          {renderMiniGateInPackage('OR', cx + 44, pinY(9), 'right')}
          <line x1={cx + 60} y1={pinY(9)} x2={bodyRight} y2={pinY(9)} stroke={wireOut} strokeWidth={1.7} />
        </g>
      );
    }

    // 11. 4-Bit Magnitude Comparator (7485) — 4 XNOR Bit-Equality Gates + Magnitude AND/OR Expander Tree
    if (p === '7485') {
      const bitPairs = [
        { bit: 3, aPin: 15, bPin: 1, y: topPad + 64, label: 'A3=B3' },
        { bit: 2, aPin: 13, bPin: 14, y: topPad + 144, label: 'A2=B2' },
        { bit: 1, aPin: 12, bPin: 11, y: topPad + 224, label: 'A1=B1' },
        { bit: 0, aPin: 10, bPin: 9, y: topPad + 304, label: 'A0=B0' },
      ];
      const xnorX = cx + 32;
      const outGateX = cx - 44;
      return (
        <g>
          {bitPairs.map((bp) => (
            <g key={bp.bit}>
              <path d={`M ${bp.aPin <= half ? bodyX : bodyRight} ${pinY(bp.aPin)} L ${xnorX + 24} ${pinY(bp.aPin)} L ${xnorX + 24} ${bp.y - 6} L ${xnorX + 18} ${bp.y - 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              <path d={`M ${bp.bPin <= half ? bodyX : bodyRight} ${pinY(bp.bPin)} L ${bp.bPin <= half ? xnorX - 44 : xnorX + 30} ${pinY(bp.bPin)} L ${xnorX + 18} ${bp.y + 6}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              {renderMiniGateInPackage('XNOR', xnorX, bp.y, 'left')}
              <path d={`M ${xnorX - 21} ${bp.y} L ${outGateX + 22} ${pinY(6)}`} fill="none" stroke={wireInternal} strokeWidth={1.2} />
            </g>
          ))}
          <path d={`M ${bodyX} ${pinY(2)} L ${outGateX + 20} ${pinY(2)} L ${outGateX + 20} ${pinY(7)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyX} ${pinY(3)} L ${outGateX + 16} ${pinY(3)} L ${outGateX + 16} ${pinY(6)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyX} ${pinY(4)} L ${outGateX + 18} ${pinY(4)} L ${outGateX + 18} ${pinY(5)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          {renderMiniGateInPackage('OR', outGateX, pinY(5), 'left')}
          {renderMiniGateInPackage('AND', outGateX, pinY(6), 'left')}
          {renderMiniGateInPackage('OR', outGateX, pinY(7), 'left')}
          <line x1={outGateX - 16} y1={pinY(5)} x2={bodyX} y2={pinY(5)} stroke={wireOut} strokeWidth={1.7} />
          <line x1={outGateX - 14} y1={pinY(6)} x2={bodyX} y2={pinY(6)} stroke={wireOut} strokeWidth={1.7} />
          <line x1={outGateX - 16} y1={pinY(7)} x2={bodyX} y2={pinY(7)} stroke={wireOut} strokeWidth={1.7} />
        </g>
      );
    }

    // 12. 8-to-3 Priority Encoder (74148) — Priority Masking AND Array + 3 Active-Low NAND Output Encoders
    if (p === '74148') {
      const inPins = [4, 3, 2, 1, 13, 12, 11, 10];
      const outNands = [
        { pin: 6, label: '~A2', y: pinY(6), side: 'left' as const },
        { pin: 7, label: '~A1', y: pinY(7), side: 'left' as const },
        { pin: 9, label: '~A0', y: pinY(9), side: 'right' as const },
        { pin: 14, label: '~GS', y: pinY(14), side: 'right' as const },
        { pin: 15, label: '~EO', y: pinY(15), side: 'right' as const },
      ];
      return (
        <g>
          <path d={`M ${bodyX} ${pinY(5)} L ${cx - 46} ${pinY(5)}`} fill="none" stroke={wireIn} strokeWidth={1.5} />
          {renderMiniGateInPackage('NOT', cx - 30, pinY(5), 'right')}
          {inPins.map((inPin) => {
            const isLeft = inPin <= half;
            return (
              <path
                key={inPin}
                d={`M ${isLeft ? bodyX : bodyRight} ${pinY(inPin)} L ${cx} ${pinY(inPin)}`}
                fill="none"
                stroke={wireIn}
                strokeWidth={1.3}
              />
            );
          })}
          <line x1={cx} y1={pinY(1)} x2={cx} y2={pinY(9)} stroke="#456A83" strokeWidth={2} />
          {outNands.map((og) => {
            const gx = og.side === 'left' ? cx - 42 : cx + 42;
            return (
              <g key={og.pin}>
                <line x1={cx} y1={og.y - 5} x2={og.side === 'left' ? gx + 16 : gx - 16} y2={og.y - 5} stroke={wireInternal} strokeWidth={1.3} />
                <line x1={cx} y1={og.y + 5} x2={og.side === 'left' ? gx + 16 : gx - 16} y2={og.y + 5} stroke={wireInternal} strokeWidth={1.3} />
                {renderMiniGateInPackage('NAND', gx, og.y, og.side)}
                <line
                  x1={og.side === 'left' ? gx - 19 : gx + 19}
                  y1={og.y}
                  x2={og.side === 'left' ? bodyX : bodyRight}
                  y2={og.y}
                  stroke={wireOut}
                  strokeWidth={1.6}
                />
              </g>
            );
          })}
        </g>
      );
    }

    // 13. BCD-to-7-Segment Decoders (7446 / 7447) — BCD Inverters + AND-NAND Segment Matrix driving ~a..~g
    if (p === '7446' || p === '7447') {
      const bcdPins = [7, 1, 2, 6];
      const segPins = [13, 12, 11, 10, 9, 15, 14];
      const busX = bodyX + 64;
      const gateX = cx + 42;
      return (
        <g>
          {bcdPins.map((bPin, idx) => {
            const bx = busX + idx * 14;
            return (
              <g key={bPin}>
                <path d={`M ${bodyX} ${pinY(bPin)} L ${bx} ${pinY(bPin)} L ${bx} ${topPad + bodyH - 24}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
                {renderMiniGateInPackage('NOT', bx, pinY(bPin) + 22, 'right')}
              </g>
            );
          })}
          <path d={`M ${bodyX} ${pinY(3)} L ${busX - 18} ${pinY(4) - 6}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
          <path d={`M ${bodyX} ${pinY(5)} L ${busX - 18} ${pinY(4) + 6}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
          {renderMiniGateInPackage('NAND', busX - 2, pinY(4), 'left')}
          <line x1={busX - 21} y1={pinY(4)} x2={bodyX} y2={pinY(4)} stroke={wireOut} strokeWidth={1.5} />
          {segPins.map((sPin) => (
            <g key={sPin}>
              <line x1={busX} y1={pinY(sPin) - 5} x2={gateX - 16} y2={pinY(sPin) - 5} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={busX + 14} y1={pinY(sPin)} x2={gateX - 16} y2={pinY(sPin)} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={busX + 28} y1={pinY(sPin) + 5} x2={gateX - 16} y2={pinY(sPin) + 5} stroke={wireInternal} strokeWidth={1.2} />
              {renderMiniGateInPackage('NAND', gateX, pinY(sPin), 'right')}
              <line x1={gateX + 19} y1={pinY(sPin)} x2={bodyRight} y2={pinY(sPin)} stroke={wireOut} strokeWidth={1.6} />
            </g>
          ))}
        </g>
      );
    }

    // 14. 4-Bit Parallel-Access Shift Register (7495) & Synchronous Up/Down Counter (74192) — 4 Cascaded Flip-Flops + Mode/Clock Gating
    if (p === '7495' || p === '74192') {
      const is95 = p === '7495';
      const ffW = 78;
      const ffH = 62;
      const ffX = cx - ffW / 2 + 12;
      const stages = is95
        ? [
            { name: 'SR-A', inPin: 2, outPin: 13, y: topPad + 32, top: 'A(2)→QA(13)' },
            { name: 'SR-B', inPin: 3, outPin: 12, y: topPad + 112, top: 'B(3)→QB(12)' },
            { name: 'SR-C', inPin: 4, outPin: 11, y: topPad + 192, top: 'C(4)→QC(11)' },
            { name: 'SR-D', inPin: 5, outPin: 10, y: topPad + 272, top: 'D(5)→QD(10)' },
          ]
        : [
            { name: 'FF-A', inPin: 15, outPin: 3, y: topPad + 48, top: 'A(15)→QA(3)' },
            { name: 'FF-B', inPin: 1, outPin: 2, y: topPad + 132, top: 'B(1)→QB(2)' },
            { name: 'FF-C', inPin: 10, outPin: 6, y: topPad + 216, top: 'C(10)→QC(6)' },
            { name: 'FF-D', inPin: 9, outPin: 7, y: topPad + 300, top: 'D(9)→QD(7)' },
          ];
      return (
        <g>
          {is95 ? (
            <g>
              <path d={`M ${bodyX} ${pinY(1)} L ${ffX} ${stages[0].y + 20}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              <path d={`M ${bodyX} ${pinY(6)} L ${cx - 56} ${pinY(6)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              <path d={`M ${bodyRight} ${pinY(9)} L ${cx - 56} ${pinY(6) - 8}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
              <path d={`M ${bodyRight} ${pinY(8)} L ${cx - 56} ${pinY(6) + 8}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
              {renderMiniGateInPackage('OR', cx - 42, pinY(6), 'right')}
            </g>
          ) : (
            <g>
              <path d={`M ${bodyX} ${pinY(5)} L ${cx - 54} ${pinY(5)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              <path d={`M ${bodyX} ${pinY(4)} L ${cx - 54} ${pinY(4)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
              {renderMiniGateInPackage('AND', cx - 38, (pinY(4) + pinY(5)) / 2, 'right')}
              {renderMiniGateInPackage('NAND', cx + 56, pinY(12), 'right')}
              <line x1={cx + 75} y1={pinY(12)} x2={bodyRight} y2={pinY(12)} stroke={wireOut} strokeWidth={1.5} />
              {renderMiniGateInPackage('NAND', cx + 56, pinY(13), 'right')}
              <line x1={cx + 75} y1={pinY(13)} x2={bodyRight} y2={pinY(13)} stroke={wireOut} strokeWidth={1.5} />
            </g>
          )}
          {stages.map((st, idx) => {
            const inIsLeft = st.inPin <= half;
            const outIsLeft = st.outPin <= half;
            return (
              <g key={st.name}>
                {renderFlipFlopSymbol(ffX, st.y, ffW, ffH, st.name, { negEdgeClk: is95, hasClr: !is95, topLabel: st.top })}
                <path d={`M ${inIsLeft ? bodyX : bodyRight} ${pinY(st.inPin)} L ${ffX} ${st.y + 34}`} fill="none" stroke={wireIn} strokeWidth={1.3} />
                <path d={`M ${ffX + ffW} ${st.y + 12} L ${outIsLeft ? bodyX : bodyRight} ${pinY(st.outPin)}`} fill="none" stroke={wireOut} strokeWidth={1.5} />
                {idx < 3 && (
                  <path d={`M ${ffX + ffW} ${st.y + 12} L ${ffX + ffW + 14} ${st.y + 12} L ${ffX + ffW + 14} ${stages[idx + 1].y + 20} L ${ffX} ${stages[idx + 1].y + 20}`} fill="none" stroke="#456A83" strokeWidth={1.4} strokeDasharray="3 1.5" />
                )}
              </g>
            );
          })}
        </g>
      );
    }

    // 15. 2K × 8 Static CMOS RAM (6116, DIP-24) — Row/Column Address Decoder NANDs + Cross-Coupled Latch Matrix + Tri-State I/O Buffers
    if (p === '6116') {
      const addrLeft = [1, 2, 3, 4, 5, 6, 7, 8];
      const addrRight = [23, 22, 19];
      const ioPins = [9, 10, 11, 13, 14, 15, 16, 17];
      const decX = cx - 44;
      const cellX = cx - 54;
      const cellY = topPad + 210;
      const cellW = 108;
      const cellH = 190;
      return (
        <g>
          {addrLeft.map((aPin) => (
            <line key={aPin} x1={bodyX} y1={pinY(aPin)} x2={decX - 18} y2={pinY(aPin)} stroke={wireIn} strokeWidth={1.3} />
          ))}
          {addrRight.map((aPin) => (
            <path key={aPin} d={`M ${bodyRight} ${pinY(aPin)} L ${decX + 86} ${pinY(aPin)} L ${decX - 18} ${pinY(aPin - 15)}`} fill="none" stroke={wireIn} strokeWidth={1.2} />
          ))}
          <line x1={decX - 18} y1={pinY(1)} x2={decX - 18} y2={pinY(8)} stroke="#2C5E8A" strokeWidth={2.2} />
          {[2, 4, 6, 8].map((rPin) => (
            <g key={rPin}>
              <line x1={decX - 18} y1={pinY(rPin) - 5} x2={decX - 2} y2={pinY(rPin) - 5} stroke={wireInternal} strokeWidth={1.2} />
              <line x1={decX - 18} y1={pinY(rPin) + 5} x2={decX - 2} y2={pinY(rPin) + 5} stroke={wireInternal} strokeWidth={1.2} />
              {renderMiniGateInPackage('AND', decX + 14, pinY(rPin), 'right')}
            </g>
          ))}

          {/* 6T CMOS Static Latch Cell Array (Cross-Coupled Inverter Pairs) */}
          <rect x={cellX} y={cellY} width={cellW} height={cellH} rx={4} fill="#FAF9F5" stroke="#20252B" strokeWidth={1.5} />
          <text x={cx} y={cellY + 14} textAnchor="middle" fill="#20252B" fontSize={7.8} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            2K×8 CMOS LATCH MATRIX
          </text>
          {[0, 1, 2].map((row) => {
            const ly = cellY + 42 + row * 50;
            return (
              <g key={row}>
                {renderMiniGateInPackage('NOT', cx - 18, ly - 8, 'right')}
                {renderMiniGateInPackage('NOT', cx + 18, ly + 8, 'left')}
                <path d={`M ${cx - 2} ${ly - 8} L ${cx + 34} ${ly - 8} L ${cx + 34} ${ly + 8}`} fill="none" stroke="#456A83" strokeWidth={1.2} />
                <path d={`M ${cx - 2} ${ly + 8} L ${cx - 34} ${ly + 8} L ${cx - 34} ${ly - 8}`} fill="none" stroke="#456A83" strokeWidth={1.2} />
              </g>
            );
          })}

          <path d={`M ${bodyRight} ${pinY(18)} L ${cx + 46} ${pinY(18)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyRight} ${pinY(20)} L ${cx + 46} ${pinY(20)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          <path d={`M ${bodyRight} ${pinY(21)} L ${cx + 46} ${pinY(21)}`} fill="none" stroke={wireIn} strokeWidth={1.4} />
          {renderMiniGateInPackage('NOR', cx + 30, pinY(20), 'left')}

          {ioPins.map((ioPin) => {
            const isLeft = ioPin <= half;
            return (
              <g key={ioPin}>
                <path
                  d={`M ${isLeft ? cellX : cellX + cellW} ${Math.max(cellY + 24, Math.min(cellY + cellH - 16, pinY(ioPin)))} L ${isLeft ? bodyX + 26 : bodyRight - 26} ${pinY(ioPin)} L ${isLeft ? bodyX : bodyRight} ${pinY(ioPin)}`}
                  fill="none"
                  stroke={wireOut}
                  strokeWidth={1.4}
                />
                <polygon
                  points={
                    isLeft
                      ? `${bodyX + 24},${pinY(ioPin) - 5} ${bodyX + 24},${pinY(ioPin) + 5} ${bodyX + 14},${pinY(ioPin)}`
                      : `${bodyRight - 24},${pinY(ioPin) - 5} ${bodyRight - 24},${pinY(ioPin) + 5} ${bodyRight - 14},${pinY(ioPin)}`
                  }
                  fill="#FFFFFF"
                  stroke="#3B5746"
                  strokeWidth={1.2}
                />
              </g>
            );
          })}
        </g>
      );
    }

    return null;
  };

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      data-testid="package-pinout-svg"
      className="w-full h-full block"
    >
      {/* Top & Bottom Package Header / Footer */}
      <text
        x={cx}
        y={17}
        textAnchor="middle"
        fill="#20252B"
        fontSize={10.2}
        fontWeight={700}
        fontFamily="IBM Plex Mono, monospace"
      >
        {ic.partNumber} ({ic.packageType}) — INTERNAL GATE & PIN WIRING DIAGRAM
      </text>

      {/* DIP IC Molded Package Outline (Stretched to match Pin Configuration Table height) */}
      <rect
        x={bodyX}
        y={topPad}
        width={bodyW}
        height={bodyH}
        rx={5}
        fill="#F4F3EE"
        stroke="#20252B"
        strokeWidth={2.2}
      />

      {/* Inner Die Cavity Border */}
      <rect
        x={bodyX + 6}
        y={topPad + 6}
        width={bodyW - 12}
        height={bodyH - 12}
        rx={3}
        fill="none"
        stroke="#C9C9C3"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Top Pin-1 Orientation Half-Moon Notch */}
      <path
        d={`M ${cx - 18} ${topPad} A 18 18 0 0 0 ${cx + 18} ${topPad}`}
        fill="#DAD9D3"
        stroke="#20252B"
        strokeWidth={1.8}
      />
      <circle cx={bodyX + 16} cy={topPad + 14} r={3.5} fill="#20252B" />

      {/* Internal Gate Symbols, Flip-Flops, Decoders, Full Adders & Latches Wired to Pins */}
      {renderInternalGateWiring()}

      {/* Left & Right Numbered DIP Pin Boxes and Signal Labels */}
      {Array.from({ length: half }).map((_, idx) => {
        const leftPin = ic.pins.find((p) => p.pin === idx + 1)!;
        const rightPin = ic.pins.find((p) => p.pin === ic.pinCount - idx)!;
        const py = pinY(idx + 1);

        const leftIsActiveLow = leftPin.name.startsWith('~') || leftPin.name.includes('~');
        const rightIsActiveLow = rightPin.name.startsWith('~') || rightPin.name.includes('~');

        return (
          <g key={idx}>
            {/* Left Numbered DIP Pin Box (like Ramaiah IC-PIN DETAILS BOOK) */}
            <rect
              x={bodyX - 24}
              y={py - 10}
              width={24}
              height={20}
              rx={2}
              fill="#E5E5E1"
              stroke="#20252B"
              strokeWidth={1.4}
            />
            <text
              x={bodyX - 12}
              y={py + 3.8}
              textAnchor="middle"
              fill="#20252B"
              fontSize={10.5}
              fontWeight={700}
              fontFamily="IBM Plex Mono, monospace"
            >
              {leftPin.pin}
            </text>
            {/* Active-Low Input/Output Bubble on Package Wall if applicable */}
            {leftIsActiveLow && (
              <circle
                cx={bodyX + 4}
                cy={py}
                r={3}
                fill="#FFFFFF"
                stroke="#20252B"
                strokeWidth={1.3}
              />
            )}
            {/* Left Pin Signal Name */}
            <text
              x={bodyX - 30}
              y={py + 3.8}
              textAnchor="end"
              fill={pinColor(leftPin.direction)}
              fontSize={10.5}
              fontWeight={700}
              fontFamily="IBM Plex Mono, monospace"
            >
              {leftPin.name}
            </text>

            {/* Right Numbered DIP Pin Box */}
            <rect
              x={bodyRight}
              y={py - 10}
              width={24}
              height={20}
              rx={2}
              fill="#E5E5E1"
              stroke="#20252B"
              strokeWidth={1.4}
            />
            <text
              x={bodyRight + 12}
              y={py + 3.8}
              textAnchor="middle"
              fill="#20252B"
              fontSize={10.5}
              fontWeight={700}
              fontFamily="IBM Plex Mono, monospace"
            >
              {rightPin.pin}
            </text>
            {rightIsActiveLow && (
              <circle
                cx={bodyRight - 4}
                cy={py}
                r={3}
                fill="#FFFFFF"
                stroke="#20252B"
                strokeWidth={1.3}
              />
            )}
            {/* Right Pin Signal Name */}
            <text
              x={bodyRight + 30}
              y={py + 3.8}
              textAnchor="start"
              fill={pinColor(rightPin.direction)}
              fontSize={10.5}
              fontWeight={700}
              fontFamily="IBM Plex Mono, monospace"
            >
              {rightPin.name}
            </text>
          </g>
        );
      })}

      {/* Bottom Legend Strip */}
      <text
        x={cx}
        y={svgH - 10}
        textAnchor="middle"
        fill="#555C62"
        fontSize={8.2}
        fontWeight={600}
        fontFamily="IBM Plex Mono, monospace"
      >
        Blue: Inputs/Controls · Green: Outputs/I/O · Red: Supply ({ic.supplyVoltage})
      </text>
    </svg>
  );
};

export const ICLibraryView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ICCategory | 'all'>('all');
  const [selectedPart, setSelectedPart] = useState('7400');

  const insertIC = useLabStore((s) => s.insertIC);
  const setPendingInsertIC = useLabStore((s) => s.setPendingInsertIC);
  const setActiveView = useLabStore((s) => s.setActiveView);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => filterICDefinitions(query, category), [query, category]);
  const selectedIC = getICDefinition(selectedPart) ?? filtered[0] ?? getICDefinition('7400')!;
  const zifCompat16 = canInsertIntoZif(selectedIC.partNumber, 'ZIF1');
  const zifCompat24 = canInsertIntoZif(selectedIC.partNumber, 'ZIF5');

  const categories: Array<{ id: ICCategory | 'all'; label: string }> = [
    { id: 'all', label: 'All (25)' },
    { id: 'logic-gates', label: 'Logic Gates (10)' },
    { id: 'combinational', label: 'Combinational (9)' },
    { id: 'sequential', label: 'Sequential (5)' },
    { id: 'memory', label: 'Memory (1)' },
  ];

  const handleDirectInsert = (socketId: 'ZIF1' | 'ZIF2' | 'ZIF3' | 'ZIF4' | 'ZIF5') => {
    const res = insertIC(selectedIC.partNumber, { kind: 'zif', socketId });
    if (res.ok) {
      setPendingInsertIC(null);
      setFeedback(null);
      setActiveView('workspace');
    } else {
      setFeedback(res.error ?? 'Cannot insert IC into socket.');
    }
  };

  return (
    <main className="flex-1 overflow-hidden bg-[#F1F0EB] text-[#20252B] flex flex-col lg:flex-row">
      {/* Left Catalog List */}
      <section className="w-full lg:w-88 border-b lg:border-b-0 lg:border-r border-[#C9C9C3] bg-[#E5E5E1] flex flex-col h-72 lg:h-full shrink-0">
        <div className="p-4 border-b border-[#C9C9C3] space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#747C82] absolute left-3 top-2.5" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 7400, 7447, 4077, 6116..."
              aria-label="Search IC library"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] focus:outline-none focus:border-[#456A83]"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  category === cat.id
                    ? 'bg-[#20252B] text-[#F1F0EB]'
                    : 'bg-[#F1F0EB] text-[#555C62] hover:text-[#20252B]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#C9C9C3]">
          {filtered.map((ic) => {
            const active = ic.partNumber === selectedIC.partNumber;
            return (
              <button
                key={ic.partNumber}
                type="button"
                onClick={() => {
                  setSelectedPart(ic.partNumber);
                  setFeedback(null);
                }}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                  active ? 'bg-[#303840] text-[#F1F0EB]' : 'hover:bg-[#DAD9D3] text-[#20252B]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{ic.partNumber}</span>
                  <span
                    className={`font-mono text-xs ${
                      active ? 'text-[#A5ACB2]' : 'text-[#747C82]'
                    }`}
                  >
                    {ic.family} · {ic.packageType}
                  </span>
                </div>
                <div
                  className={`text-xs mt-0.5 truncate ${
                    active ? 'text-[#D6D5CE]' : 'text-[#555C62]'
                  }`}
                >
                  {ic.name}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-[#747C82]">
              No IC models match &quot;{query}&quot;.
            </div>
          )}
        </div>
      </section>

      {/* Right Datasheet & Pinout Detail */}
      <section className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#C9C9C3] pb-5">
            <div>
              <div className="text-xs font-mono text-[#747C82]">
                {CATEGORY_LABELS[selectedIC.category]} · {selectedIC.family} · {selectedIC.packageType}
              </div>
              <h1 className="text-2xl font-semibold text-[#20252B] mt-1">
                {selectedIC.partNumber} — {selectedIC.name}
              </h1>
              <p className="text-sm text-[#555C62] mt-1.5 max-w-2xl">{selectedIC.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['ZIF1', 'ZIF2', 'ZIF3', 'ZIF4'] as const).map((sockId, idx) => (
                <button
                  key={sockId}
                  type="button"
                  disabled={!zifCompat16.ok}
                  onClick={() => handleDirectInsert(sockId)}
                  className="px-3 py-2 text-xs font-medium bg-[#303840] text-[#F1F0EB] rounded hover:bg-[#414B56] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Insert in ZIF-{idx + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={!zifCompat24.ok}
                onClick={() => handleDirectInsert('ZIF5')}
                className="px-3.5 py-2 text-xs font-medium bg-[#456A83] text-[#F1F0EB] rounded hover:bg-[#527B96] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Insert in ZIF-5 (24-Pin RAM)
              </button>
            </div>
          </div>

          {feedback && (
            <div className="p-3 bg-[#BD8B43]/15 border border-[#BD8B43] rounded text-xs text-[#20252B]">
              {feedback}
            </div>
          )}

          {/* Specs Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#E5E5E1] border border-[#C9C9C3] rounded p-3">
              <div className="text-xs text-[#747C82]">Package</div>
              <div className="text-sm font-mono font-semibold mt-0.5">{selectedIC.packageType}</div>
            </div>
            <div className="bg-[#E5E5E1] border border-[#C9C9C3] rounded p-3">
              <div className="text-xs text-[#747C82]">Supply Voltage</div>
              <div className="text-sm font-mono font-semibold mt-0.5">{selectedIC.supplyVoltage}</div>
            </div>
            <div className="bg-[#E5E5E1] border border-[#C9C9C3] rounded p-3">
              <div className="text-xs text-[#747C82]">Typ. Prop. Delay</div>
              <div className="text-sm font-mono font-semibold mt-0.5">{selectedIC.propagationDelayNs} ns</div>
            </div>
            <div className="bg-[#E5E5E1] border border-[#C9C9C3] rounded p-3">
              <div className="text-xs text-[#747C82]">Socket Fit</div>
              <div className="text-sm font-mono font-semibold mt-0.5">
                {zifCompat16.ok ? 'ZIF-1 .. ZIF-4 (16p)' : 'ZIF-5 (24-Pin RAM)'}
              </div>
            </div>
          </div>

          {/* Datasheet Summary */}
          <div className="bg-white border border-[#C9C9C3] rounded p-4 text-xs text-[#303840] space-y-1">
            <div className="font-semibold text-[#20252B]">Datasheet Reference</div>
            <div>{selectedIC.datasheetSummary}</div>
          </div>

          {/* Internal Gate-Level / Functional Block Structure Diagram (Preserved as requested) */}
          <div className="bg-white border border-[#C9C9C3] rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#20252B]">
                Datasheet Internal Logic &amp; Gate-Level Structure
              </h2>
              <span className="text-xs font-mono text-[#747C82]">
                IEEE/ANSI Functional Schematic
              </span>
            </div>
            <ICInternalDiagram ic={selectedIC} />
          </div>

          {/* Equal-Height Package Pinout (with Internal Gate/Cascaded Wiring) + Pin Configuration Table */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            <div
              data-testid="package-pinout-card"
              className="xl:col-span-6 bg-white border border-[#C9C9C3] rounded p-4 flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-[#E5E5E1] pb-2.5 mb-3 shrink-0">
                <h2 className="text-sm font-semibold text-[#20252B]">
                  Package Pinout &amp; Internal Pin Wiring
                </h2>
                <span className="text-xs font-mono text-[#555C62]">
                  {selectedIC.partNumber} ({selectedIC.packageType})
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <DIPPinoutDiagram ic={selectedIC} />
              </div>
            </div>

            <div
              data-testid="pin-config-table-card"
              className="xl:col-span-6 bg-white border border-[#C9C9C3] rounded overflow-hidden flex flex-col"
            >
              <table className="w-full h-full text-left text-xs">
                <thead className="bg-[#E5E5E1] text-[#303840] border-b border-[#C9C9C3]">
                  <tr>
                    <th className="py-2.5 px-3 font-mono">Pin</th>
                    <th className="py-2.5 px-3 font-mono">Symbol</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Function</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E1]">
                  {selectedIC.pins.map((pin) => (
                    <tr key={pin.pin}>
                      <td className="py-2 px-3 font-mono font-semibold">{pin.pin}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-[#456A83]">
                        {pin.name}
                      </td>
                      <td className="py-2 px-3 font-mono text-[#747C82]">{pin.direction}</td>
                      <td className="py-2 px-3 text-[#303840]">{pin.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Truth Table Preview */}
          {selectedIC.truthTablePreview.length > 0 && (
            <div className="bg-white border border-[#C9C9C3] rounded p-4 space-y-2">
              <h2 className="text-sm font-semibold text-[#20252B]">Functional Truth Table Summary</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#C9C9C3] text-[#747C82]">
                      <th className="py-1.5 pr-4">Inputs</th>
                      <th className="py-1.5">Outputs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E1]">
                    {selectedIC.truthTablePreview.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 pr-4 text-[#20252B]">
                          {Object.entries(row.inputs)
                            .map(([k, v]) => `${k}=${v}`)
                            .join('  ')}
                        </td>
                        <td className="py-1.5 text-[#587965] font-semibold">
                          {Object.entries(row.outputs)
                            .map(([k, v]) => `${k}=${v}`)
                            .join('  ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};
