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

interface InternalCascadeStage {
  title: string;
  subtitle: string;
  leftPins: number[];
  rightPins: number[];
  cascadeLabel?: string;
}

function getInternalCascadedStages(partNumber: string): InternalCascadeStage[] | null {
  switch (partNumber) {
    case '7474':
      return [
        {
          title: 'D FLIP-FLOP 1 (POS-EDGE)',
          subtitle: '~1CLR(1), 1D(2), >1CLK(3), ~1PRE(4) → 1Q(5), 1~Q(6)',
          leftPins: [1, 2, 3, 4, 5, 6],
          rightPins: [14],
          cascadeLabel: 'Independent Dual Edge-Triggered Stages',
        },
        {
          title: 'D FLIP-FLOP 2 (POS-EDGE)',
          subtitle: '~2CLR(13), 2D(12), >2CLK(11), ~2PRE(10) → 2Q(9), 2~Q(8)',
          leftPins: [7],
          rightPins: [13, 12, 11, 10, 9, 8],
        },
      ];
    case '7476':
      return [
        {
          title: 'JK FLIP-FLOP 1 (NEG-EDGE)',
          subtitle: '1CLK(1), ~1PRE(2), ~1CLR(3), 1J(4), 1K(16) → 1Q(15), 1~Q(14)',
          leftPins: [1, 2, 3, 4],
          rightPins: [16, 15, 14],
          cascadeLabel: 'Shared Supply Rails: VCC(5) · GND(13)',
        },
        {
          title: 'JK FLIP-FLOP 2 (NEG-EDGE)',
          subtitle: '2CLK(6), ~2PRE(7), ~2CLR(8), 2J(9), 2K(12) → 2Q(11), 2~Q(10)',
          leftPins: [5, 6, 7, 8],
          rightPins: [13, 12, 11, 10, 9],
        },
      ];
    case '7483':
      return [
        {
          title: 'FULL ADDER STAGE 1 & 2 (BITS 1–2)',
          subtitle: 'C0(13) + A1(10),B1(11)→S1(9) ➔ C1 ➔ A2(8),B2(7)→S2(6)',
          leftPins: [5, 6, 7, 8],
          rightPins: [13, 12, 11, 10, 9],
          cascadeLabel: 'Internal Carry Chain C1 ➔ C2 ➔ C3',
        },
        {
          title: 'FULL ADDER STAGE 3 & 4 (BITS 3–4)',
          subtitle: 'C2 + A3(3),B3(4)→S3(2) ➔ C3 ➔ A4(1),B4(16)→S4(15), C4(14)',
          leftPins: [1, 2, 3, 4],
          rightPins: [16, 15, 14],
        },
      ];
    case '7485':
      return [
        {
          title: '4-BIT MAGNITUDE COMPARE TREE',
          subtitle: 'A3,B3(15,1) · A2,B2(13,14) · A1,B1(12,11) · A0,B0(10,9)',
          leftPins: [1],
          rightPins: [16, 15, 14, 13, 12, 11, 10, 9],
          cascadeLabel: 'Word Equality / Inequality Signals ↓',
        },
        {
          title: 'CASCADE EXPANDER & OUTPUT MATRIX',
          subtitle: 'IA<B(2), IA=B(3), IA>B(4) ➔ OA>B(5), OA=B(6), OA<B(7)',
          leftPins: [2, 3, 4, 5, 6, 7, 8],
          rightPins: [],
        },
      ];
    case '7490':
      return [
        {
          title: 'MOD-2 STAGE (FF-A) & RESET GATES',
          subtitle: 'CKA(14)→QA(12) · R0(1,2)=Pins 2,3 · R9(1,2)=Pins 6,7',
          leftPins: [2, 3, 5, 6, 7],
          rightPins: [14, 12, 10],
          cascadeLabel: 'External Cascade: Wire QA(12) ➔ CKB(1)',
        },
        {
          title: 'MOD-5 RIPPLE CHAIN (FF-B ➔ FF-C ➔ FF-D)',
          subtitle: 'CKB(1) ➔ QB(9) ➔ QC(8) ➔ QD(11) BCD Feedback',
          leftPins: [1],
          rightPins: [11, 9, 8],
        },
      ];
    case '7493':
      return [
        {
          title: 'DIV-BY-2 STAGE (FF-A) & MASTER RESET',
          subtitle: 'CKA(14) ➔ QA(12) · Reset NAND: R0(1)=Pin 2, R0(2)=Pin 3',
          leftPins: [2, 3, 5],
          rightPins: [14, 12, 10],
          cascadeLabel: 'External Cascade: Wire QA(12) ➔ CKB(1)',
        },
        {
          title: 'DIV-BY-8 RIPPLE CHAIN (FF-B ➔ FF-C ➔ FF-D)',
          subtitle: 'CKB(1) ➔ QB(9) ➔ QC(8) ➔ QD(11) (Mod-16 Binary)',
          leftPins: [1],
          rightPins: [11, 9, 8],
        },
      ];
    case '7495':
      return [
        {
          title: 'MODE SELECT & CLOCK GATING',
          subtitle: 'MODE(6): 0=Serial (SER Pin 1, ~CLK1 Pin 9) · 1=Parallel (~CLK2 Pin 8)',
          leftPins: [1, 6, 7],
          rightPins: [14, 9, 8],
          cascadeLabel: 'Gated Clock & Muxed D Inputs ↓',
        },
        {
          title: '4-STAGE SHIFT REGISTER (SR-A ➔ SR-B ➔ SR-C ➔ SR-D)',
          subtitle: 'Inputs A..D(2..5) ➔ Stages A..D ➔ Outputs QA..QD(13..10)',
          leftPins: [2, 3, 4, 5],
          rightPins: [13, 12, 11, 10],
        },
      ];
    case '74138':
      return [
        {
          title: 'ADDRESS INVERTERS & ENABLE GATE',
          subtitle: 'Select A(1), B(2), C(3) · Enable EN = G1(6) · ~G2A(4) · ~G2B(5)',
          leftPins: [1, 2, 3, 4, 5, 6],
          rightPins: [16],
          cascadeLabel: '3-Bit Complementary Address + Enable Bus ↓',
        },
        {
          title: '8× ACTIVE-LOW NAND DECODER ARRAY',
          subtitle: 'Outputs ~Y0(15), ~Y1(14), ~Y2(13), ~Y3(12), ~Y4(11), ~Y5(10), ~Y6(9), ~Y7(7)',
          leftPins: [7, 8],
          rightPins: [15, 14, 13, 12, 11, 10, 9],
        },
      ];
    case '74139':
      return [
        {
          title: 'DECODER 1 (2-TO-4 ACTIVE-LOW NANDS)',
          subtitle: '~1G(1) Enable + Select 1A(2), 1B(3) ➔ 1~Y0..1~Y3 (Pins 4..7)',
          leftPins: [1, 2, 3, 4, 5, 6, 7, 8],
          rightPins: [16],
          cascadeLabel: 'Dual Independent 2-to-4 Decoder Channels',
        },
        {
          title: 'DECODER 2 (2-TO-4 ACTIVE-LOW NANDS)',
          subtitle: '~2G(15) Enable + Select 2A(14), 2B(13) ➔ 2~Y0..2~Y3 (Pins 12..9)',
          leftPins: [],
          rightPins: [15, 14, 13, 12, 11, 10, 9],
        },
      ];
    case '74148':
      return [
        {
          title: 'PRIORITY INPUT MASK & ENABLE (~EI)',
          subtitle: '~EI(5) + Active-Low Inputs ~I0..~I3(10..13) & ~I4..~I7(1..4)',
          leftPins: [1, 2, 3, 4, 5],
          rightPins: [16, 13, 12, 11, 10],
          cascadeLabel: 'Highest-Priority Request Latch ↓',
        },
        {
          title: 'OCTAL ENCODER & CASCADE GATES',
          subtitle: 'Code ~A2(6), ~A1(7), ~A0(9) · Group ~GS(14) · Enable Out ~EO(15)',
          leftPins: [6, 7, 8],
          rightPins: [15, 14, 9],
        },
      ];
    case '74151':
      return [
        {
          title: '3-TO-8 ADDRESS DECODER & STROBE (~G)',
          subtitle: 'Select A(11), B(10), C(9) + Active-Low Strobe ~G(7)',
          leftPins: [7, 8],
          rightPins: [16, 11, 10, 9],
          cascadeLabel: '8 Select Lines Gate Data Inputs D0..D7 ↓',
        },
        {
          title: '8× AND-OR MULTIPLEXER & INVERT BUFFER',
          subtitle: 'D0..D3(4..1), D4..D7(15..12) ➔ True Y(5) & Inverted ~W(6)',
          leftPins: [1, 2, 3, 4, 5, 6],
          rightPins: [15, 14, 13, 12],
        },
      ];
    case '74153':
      return [
        {
          title: '4-TO-1 MUX 1 & SHARED SELECT (B, A)',
          subtitle: 'Select B(2), A(14) · Strobe ~1G(1) · Inputs 1C3..1C0(3..6) ➔ 1Y(7)',
          leftPins: [1, 2, 3, 4, 5, 6, 7, 8],
          rightPins: [16, 14],
          cascadeLabel: 'Common Select Bus (B, A) Drives Both MUXes ↓',
        },
        {
          title: '4-TO-1 MUX 2 (PINS 9..15)',
          subtitle: 'Strobe ~2G(15) · Inputs 2C3..2C0(13..10) ➔ Output 2Y(9)',
          leftPins: [],
          rightPins: [15, 13, 12, 11, 10, 9],
        },
      ];
    case '74192':
      return [
        {
          title: 'UP/DOWN CLOCK, LOAD & CLEAR CONTROL',
          subtitle: 'UP(5), DOWN(4), CLR(14), ~LOAD(11) ➔ ~CO(12), ~BO(13)',
          leftPins: [4, 5, 8],
          rightPins: [16, 14, 13, 12, 11],
          cascadeLabel: 'Synchronous State & Carry/Borrow Gating ↓',
        },
        {
          title: '4-BIT SYNCHRONOUS BCD COUNTER (FF-A..FF-D)',
          subtitle: 'Preset A,B,C,D(15,1,10,9) ➔ Outputs QA(3), QB(2), QC(6), QD(7)',
          leftPins: [1, 2, 3, 6, 7],
          rightPins: [15, 10, 9],
        },
      ];
    case '7446':
    case '7447':
      return [
        {
          title: 'BCD INPUT BUFFERS & BLANKING / LAMP TEST',
          subtitle: 'BCD: A(7), B(1), C(2), D(6) · Control: ~LT(3), ~BI/~RBO(4), ~RBI(5)',
          leftPins: [1, 2, 3, 4, 5, 6, 7, 8],
          rightPins: [16],
          cascadeLabel: 'Internal BCD-to-7-Segment ROM Matrix ↓',
        },
        {
          title: '7× OPEN-COLLECTOR CATHODE SINK DRIVERS',
          subtitle: 'Active-Low Outputs ~a(13), ~b(12), ~c(11), ~d(10), ~e(9), ~f(15), ~g(14)',
          leftPins: [],
          rightPins: [15, 14, 13, 12, 11, 10, 9],
        },
      ];
    case '6116':
      return [
        {
          title: 'ROW & COLUMN ADDRESS DECODERS (A0..A10)',
          subtitle: 'Row A0..A6 (Pins 8..2) · Column A7..A10 (Pins 1, 23, 22, 19)',
          leftPins: [1, 2, 3, 4, 5, 6, 7, 8],
          rightPins: [24, 23, 22, 19],
          cascadeLabel: '2,048 Word Lines × 8-Bit Sense/Write Amplifiers ↓',
        },
        {
          title: '16K-BIT (2K × 8) STATIC CMOS MEMORY ARRAY',
          subtitle: '128 × 128 Six-Transistor (6T) Static Latch Cells',
          leftPins: [9, 10],
          rightPins: [18, 17, 16],
          cascadeLabel: 'Bidirectional Internal Data Bus ↓',
        },
        {
          title: 'BUS CONTROL (~CS, ~RE, ~WR) & TRI-STATE I/O',
          subtitle: '~CS(18), ~RE(20), ~WR(21) ➔ I/O0..I/O7 (Pins 9..11, 13..17)',
          leftPins: [11, 12],
          rightPins: [21, 20, 15, 14, 13],
        },
      ];
    default:
      return null;
  }
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

  // Render internal gate-level wiring for the 10 Logic Gate ICs directly inside the DIP body
  const renderInternalGateWiring = () => {
    const p = ic.partNumber;
    const wireIn = '#2C5E8A';
    const wireOut = '#3B5746';

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

    return null;
  };

  // Render cascaded internal stages and pin-to-stage connection traces for MSI / Sequential / RAM ICs
  const renderCascadedBlocksInPackage = () => {
    const stages = getInternalCascadedStages(ic.partNumber);
    if (!stages) return null;

    const innerX = bodyX + 18;
    const innerW = bodyW - 36; // 232
    const innerTop = topPad + 34;
    const innerAvailH = bodyH - 68;
    const gap = stages.length > 2 ? 26 : 34;
    const stageH = (innerAvailH - (stages.length - 1) * gap) / stages.length;

    const splitSubtitle = (text: string): [string, string | null] => {
      if (text.length <= 40) return [text, null];
      const mid = Math.floor(text.length / 2);
      // Prefer splitting near midpoint on ' · ' or ' ➔ ' or ' + ' or space
      const separators = [' · ', ' ➔ ', ' + ', ' '];
      for (const sep of separators) {
        const leftIdx = text.lastIndexOf(sep, mid + 10);
        if (leftIdx > 12 && leftIdx < text.length - 10) {
          return [
            text.slice(0, leftIdx).trim(),
            text.slice(leftIdx + (sep === ' ' ? 1 : 0)).trim(),
          ];
        }
      }
      return [text.slice(0, 40), text.slice(40)];
    };

    return (
      <g>
        {stages.map((st, sIdx) => {
          const sy = innerTop + sIdx * (stageH + gap);
          const sMidY = sy + (stageH + 18) / 2;
          const [subLine1, subLine2] = splitSubtitle(st.subtitle);

          return (
            <g key={sIdx}>
              {/* Pin-to-Stage Internal Connection Lines (Left Pins) */}
              {st.leftPins.map((pNum) => {
                const py = pinY(pNum);
                const pDef = ic.pins.find((p) => p.pin === pNum);
                const isOut =
                  pDef?.direction === 'output' || pDef?.direction === 'open-collector';
                const targetY = Math.max(sy + 10, Math.min(sy + stageH - 10, py));
                return (
                  <g key={`lp-${pNum}`}>
                    <path
                      d={`M ${bodyX} ${py} L ${innerX - 8} ${py} L ${innerX - 8} ${targetY} L ${innerX} ${targetY}`}
                      fill="none"
                      stroke={isOut ? '#3B5746' : '#2C5E8A'}
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={innerX}
                      cy={targetY}
                      r={2.4}
                      fill={isOut ? '#3B5746' : '#2C5E8A'}
                    />
                  </g>
                );
              })}

              {/* Pin-to-Stage Internal Connection Lines (Right Pins) */}
              {st.rightPins.map((pNum) => {
                const py = pinY(pNum);
                const pDef = ic.pins.find((p) => p.pin === pNum);
                const isOut =
                  pDef?.direction === 'output' || pDef?.direction === 'open-collector';
                const targetY = Math.max(sy + 10, Math.min(sy + stageH - 10, py));
                return (
                  <g key={`rp-${pNum}`}>
                    <path
                      d={`M ${bodyRight} ${py} L ${innerX + innerW + 8} ${py} L ${innerX + innerW + 8} ${targetY} L ${innerX + innerW} ${targetY}`}
                      fill="none"
                      stroke={isOut ? '#3B5746' : '#2C5E8A'}
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={innerX + innerW}
                      cy={targetY}
                      r={2.4}
                      fill={isOut ? '#3B5746' : '#2C5E8A'}
                    />
                  </g>
                );
              })}

              {/* Internal Cascaded Functional Block */}
              <rect
                x={innerX}
                y={sy}
                width={innerW}
                height={stageH}
                rx={4}
                fill="#FFFFFF"
                stroke="#303840"
                strokeWidth={1.4}
              />
              <rect
                x={innerX}
                y={sy}
                width={innerW}
                height={20}
                rx={3}
                fill="#303840"
              />
              <text
                x={cx}
                y={sy + 13.5}
                textAnchor="middle"
                fill="#F1F0EB"
                fontSize={st.title.length > 36 ? 7.3 : 8.1}
                fontWeight={700}
                fontFamily="IBM Plex Mono, monospace"
              >
                {st.title}
              </text>

              {subLine2 ? (
                <>
                  <text
                    x={cx}
                    y={sMidY - 3}
                    textAnchor="middle"
                    fill="#20252B"
                    fontSize={7.4}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {subLine1}
                  </text>
                  <text
                    x={cx}
                    y={sMidY + 9}
                    textAnchor="middle"
                    fill="#3B5746"
                    fontSize={7.3}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {subLine2}
                  </text>
                </>
              ) : (
                <text
                  x={cx}
                  y={sMidY + 3}
                  textAnchor="middle"
                  fill="#20252B"
                  fontSize={7.6}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {subLine1}
                </text>
              )}

              {/* Cascade Bus / Inter-Stage Link to Next Stage */}
              {sIdx < stages.length - 1 && (
                <g>
                  <line
                    x1={cx - 32}
                    y1={sy + stageH}
                    x2={cx - 32}
                    y2={sy + stageH + gap}
                    stroke="#456A83"
                    strokeWidth={1.6}
                    strokeDasharray="3 2"
                  />
                  <line
                    x1={cx + 32}
                    y1={sy + stageH}
                    x2={cx + 32}
                    y2={sy + stageH + gap}
                    stroke="#456A83"
                    strokeWidth={1.6}
                    strokeDasharray="3 2"
                  />
                  <polygon
                    points={`${cx - 32},${sy + stageH + gap} ${cx - 36},${sy + stageH + gap - 6} ${cx - 28},${sy + stageH + gap - 6}`}
                    fill="#456A83"
                  />
                  <polygon
                    points={`${cx + 32},${sy + stageH + gap} ${cx + 28},${sy + stageH + gap - 6} ${cx + 36},${sy + stageH + gap - 6}`}
                    fill="#456A83"
                  />
                  {st.cascadeLabel && (
                    <text
                      x={cx}
                      y={sy + stageH + gap / 2 + 3}
                      textAnchor="middle"
                      fill="#456A83"
                      fontSize={7.2}
                      fontWeight={700}
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {st.cascadeLabel}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
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
        {ic.partNumber} ({ic.packageType}) — INTERNAL PIN-TO-GATE / CASCADED STRUCTURE
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

      {/* Internal Gate Symbols or Cascaded Functional Stages with Pin Wiring */}
      {renderInternalGateWiring() ?? renderCascadedBlocksInPackage()}

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
