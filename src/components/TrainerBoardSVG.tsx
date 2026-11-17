import React, { useRef, useState } from 'react';
import { canInsertIntoZif, getICDefinition } from '../ic-library';
import { getDisplayedZifPinInfo, getICPinTerminalId } from '../simulation/netlist';
import { useLabStore } from '../store/useLabStore';
import {
  ALL_TERMINAL_LIST,
  ALL_ZIF_SOCKETS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  computeWirePath,
  getTerminalGeometry,
  getZifLayout,
  WIRE_COLOR_HEX,
} from '../trainer/boardLayout';
import { LogicLevel, TerminalId, ZIFSocketId } from '../types/circuit';

function levelBadgeColor(lvl: LogicLevel): string {
  if (lvl === 1) return '#587965';
  if (lvl === 0) return '#2B323A';
  if (lvl === 'X') return '#BD8B43';
  return '#47505A';
}

function ledFill(lvl: LogicLevel, powerOn: boolean): { fill: string; ring: string } {
  if (!powerOn) return { fill: '#22282E', ring: '#38414A' };
  if (lvl === 1) return { fill: '#66A37D', ring: '#86C49D' };
  if (lvl === 0) return { fill: '#242A30', ring: '#424B54' };
  if (lvl === 'X') return { fill: '#BD8B43', ring: '#DFAC62' };
  return { fill: '#363F48', ring: '#525C66' };
}

function pinDirectionColor(dir: string | null): string {
  if (dir === 'power-vcc') return '#FF857A';
  if (dir === 'power-gnd') return '#9CC2DF';
  if (dir === 'output' || dir === 'open-collector' || dir === 'bidirectional') return '#8CE0AC';
  return '#F7F6F2';
}

interface SevenSegSVGProps {
  x: number;
  y: number;
  label: string;
  segments: { a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean; g: boolean; dp: boolean };
  powerOn: boolean;
}

const SevenSegDigitSVG: React.FC<SevenSegSVGProps> = ({ x, y, label, segments, powerOn }) => {
  const onColor = '#D93829';
  const offColor = '#2E1E1E';
  const segColor = (on: boolean) => (powerOn && on ? onColor : offColor);

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={0} y={0} width={64} height={86} rx={3} fill="#181314" stroke="#47505A" strokeWidth={1.2} />
      <text x={6} y={12} fill="#A5ACB2" fontSize={9.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
        {label}
      </text>
      {/* Segment a (top) */}
      <polygon points="18,14 46,14 42,19 22,19" fill={segColor(segments.a)} />
      {/* Segment b (top-right) */}
      <polygon points="48,16 52,20 49,40 45,43 43,39 45,20" fill={segColor(segments.b)} />
      {/* Segment c (bottom-right) */}
      <polygon points="45,45 49,48 46,68 42,72 40,67 42,48" fill={segColor(segments.c)} />
      {/* Segment d (bottom) */}
      <polygon points="14,69 40,69 43,74 11,74" fill={segColor(segments.d)} />
      {/* Segment e (bottom-left) */}
      <polygon points="13,45 17,48 14,67 10,71 8,67 11,48" fill={segColor(segments.e)} />
      {/* Segment f (top-left) */}
      <polygon points="16,16 20,20 18,39 14,43 11,40 14,20" fill={segColor(segments.f)} />
      {/* Segment g (middle) */}
      <polygon points="18,41 43,41 46,44 42,47 17,47 14,44" fill={segColor(segments.g)} />
      {/* Decimal point */}
      <circle cx={55} cy={72} r={3} fill={segColor(segments.dp)} />
    </g>
  );
};

export const TrainerBoardSVG: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  const project = useLabStore((s) => s.project);
  const simulation = useLabStore((s) => s.simulation);
  const wiringFrom = useLabStore((s) => s.wiringFrom);
  const selectedWireId = useLabStore((s) => s.selectedWireId);
  const selectedWireColor = useLabStore((s) => s.selectedWireColor);
  const pendingInsertIC = useLabStore((s) => s.pendingInsertIC);
  const selectedICInstanceId = useLabStore((s) => s.selectedICInstanceId);

  const togglePower = useLabStore((s) => s.togglePower);
  const toggleSwitch = useLabStore((s) => s.toggleSwitch);
  const setClockMode = useLabStore((s) => s.setClockMode);
  const triggerManualClockPress = useLabStore((s) => s.triggerManualClockPress);
  const triggerSingleStepClock = useLabStore((s) => s.triggerSingleStepClock);
  const toggleAutoClock = useLabStore((s) => s.toggleAutoClock);
  const togglePulseGenerator = useLabStore((s) => s.togglePulseGenerator);
  const insertIC = useLabStore((s) => s.insertIC);
  const setSelectedICInstanceId = useLabStore((s) => s.setSelectedICInstanceId);
  const startOrCompleteWiring = useLabStore((s) => s.startOrCompleteWiring);
  const cancelWiring = useLabStore((s) => s.cancelWiring);
  const setSelectedWireId = useLabStore((s) => s.setSelectedWireId);
  const removeWire = useLabStore((s) => s.removeWire);
  const updateWireOffset = useLabStore((s) => s.updateWireOffset);

  const [pointerSvg, setPointerSvg] = useState<{ x: number; y: number } | null>(null);
  const [hoverTerminal, setHoverTerminal] = useState<TerminalId | null>(null);
  const [draggingWireMid, setDraggingWireMid] = useState<{
    wireId: string;
    startX: number;
    startY: number;
    origDx: number;
    origDy: number;
  } | null>(null);

  const { circuit } = project;
  const occupiedSockets = new Set<TerminalId>();
  for (const w of circuit.wires) {
    occupiedSockets.add(w.from);
    occupiedSockets.add(w.to);
  }

  const toSvgCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toSvgCoords(e.clientX, e.clientY);
    if (!pt) return;
    if (wiringFrom) {
      setPointerSvg(pt);
    }
    if (draggingWireMid) {
      const dx = draggingWireMid.origDx + (pt.x - draggingWireMid.startX);
      const dy = draggingWireMid.origDy + (pt.y - draggingWireMid.startY);
      updateWireOffset(draggingWireMid.wireId, Math.round(dx), Math.round(dy));
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingWireMid) {
      setDraggingWireMid(null);
    }
  };

  const handleSvgContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    if (wiringFrom) {
      e.preventDefault();
      cancelWiring();
      setPointerSvg(null);
    }
  };

  const renderZifSocket = (socketId: ZIFSocketId) => {
    const layout = getZifLayout(socketId);
    const is24 = layout.maxPins === 24;
    const occupant = circuit.placedICs.find(
      (p) => p.placement.kind === 'zif' && p.placement.socketId === socketId
    );
    const occupantDef = occupant ? getICDefinition(occupant.partNumber) : undefined;
    const is14PinShifted = Boolean(occupantDef && occupantDef.pinCount === 14 && !is24);
    const pendingCompat = pendingInsertIC ? canInsertIntoZif(pendingInsertIC, socketId) : null;
    const canInsertHere = Boolean(pendingInsertIC && !occupant && pendingCompat?.ok);
    const isIncompatible = Boolean(pendingInsertIC && !occupant && pendingCompat && !pendingCompat.ok);

    const titleText = is24
      ? 'ZIF-5 (24-PIN RAM)'
      : `ZIF-${layout.index + 1} (${is14PinShifted ? '14-PIN MODE' : '16-PIN'})`;

    return (
      <g key={socketId}>
        {/* Module Instrument Bezel */}
        <rect
          x={layout.baseX}
          y={layout.topY}
          width={layout.width}
          height={layout.height}
          rx={5}
          fill="#232A31"
          stroke={
            canInsertHere
              ? '#587965'
              : isIncompatible
              ? '#BD8B43'
              : '#4A545E'
          }
          strokeWidth={canInsertHere || isIncompatible ? 2.2 : 1.2}
        />

        {/* Module Header Label */}
        <text
          x={layout.baseX + 10}
          y={layout.topY + 17}
          fill="#F1F0EB"
          fontSize={11}
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
        >
          {titleText}
        </text>
        <text
          x={layout.baseX + layout.width - 10}
          y={layout.topY + 17}
          textAnchor="end"
          fill={occupant ? '#8CE0AC' : '#8D959C'}
          fontSize={10}
          fontWeight={600}
          fontFamily="IBM Plex Mono, monospace"
        >
          {occupant ? `${occupant.partNumber} (${occupantDef?.pinCount}P)` : 'EMPTY'}
        </text>

        {/* Built-in Top +5V Label (below top-center red socket, matching reference image) */}
        <text
          x={layout.vccX}
          y={layout.vccY + 20}
          textAnchor="middle"
          fill="#FF857A"
          stroke="#181C20"
          strokeWidth={2.5}
          paintOrder="stroke"
          fontSize={10.5}
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
        >
          +5V
        </text>

        {/* ZIF Locking Lever Handle */}
        <rect
          x={layout.bodyX - 10}
          y={layout.cradleTopY - 12}
          width={12}
          height={22}
          rx={2}
          fill="#8D949B"
          stroke="#181C20"
          strokeWidth={0.8}
        />
        <circle cx={layout.bodyX - 4} cy={layout.cradleTopY - 8} r={4.5} fill="#D6D5CE" />

        {/* ZIF Socket Cradle */}
        <rect
          x={layout.bodyX}
          y={layout.cradleTopY}
          width={layout.bodyW}
          height={layout.cradleH}
          rx={3.5}
          fill="#375B73"
          stroke="#181C20"
          strokeWidth={1.4}
          className={pendingInsertIC && !occupant ? 'cursor-pointer' : ''}
          onClick={() => {
            if (pendingInsertIC && !occupant) {
              insertIC(pendingInsertIC, { kind: 'zif', socketId });
            }
          }}
        />

        {/* Pin 1 Orientation Notch on Socket */}
        <path
          d={`M ${layout.bodyX + 26} ${layout.cradleTopY} A 10 10 0 0 0 ${layout.bodyX + 46} ${layout.cradleTopY}`}
          fill="#232A31"
        />

        {/* Socket Rows: High-Resolution Pin Numbers, Traces & Contact Slots */}
        {Array.from({ length: layout.rows }).map((_, rowIdx) => {
          const y = layout.pinStartY + rowIdx * layout.pinStepY;
          const leftSocketPin = rowIdx + 1;
          const rightSocketPin = layout.maxPins - rowIdx;

          const leftInfo = getDisplayedZifPinInfo(socketId, leftSocketPin, circuit.placedICs);
          const rightInfo = getDisplayedZifPinInfo(socketId, rightSocketPin, circuit.placedICs);

          const leftIsNC = leftInfo.displayedPin === 'NC';
          const rightIsNC = rightInfo.displayedPin === 'NC';
          const numFontSize = is24 ? 10.5 : 11.5;
          const nameFontSize = is24 ? 9.5 : 10.5;

          return (
            <g key={rowIdx}>
              {/* Left & Right PCB Trace Lines */}
              <line
                x1={layout.leftTermX}
                y1={y}
                x2={layout.bodyX + 6}
                y2={y}
                stroke={leftIsNC ? '#3A424A' : '#64707A'}
                strokeWidth={1.4}
              />
              <line
                x1={layout.bodyX + layout.bodyW - 6}
                y1={y}
                x2={layout.rightTermX}
                y2={y}
                stroke={rightIsNC ? '#3A424A' : '#64707A'}
                strokeWidth={1.4}
              />

              {/* ZIF Contact Slots */}
              <rect x={layout.bodyX + 6} y={y - 3} width={7} height={6} rx={1} fill="#16191D" />
              <rect x={layout.bodyX + layout.bodyW - 13} y={y - 3} width={7} height={6} rx={1} fill="#16191D" />

              {/* Left High-Contrast Label Plate (between Left Terminal and IC Body) */}
              <rect
                x={layout.leftTermX + 10}
                y={y - (is24 ? 7.5 : 8.5)}
                width={layout.bodyX - layout.leftTermX - 13}
                height={is24 ? 15 : 17}
                rx={2.5}
                fill="#171C21"
                stroke={leftIsNC ? '#2D343B' : '#39434D'}
                strokeWidth={0.8}
              />
              {/* Left Shifted/Standard Pin Number */}
              <text
                x={layout.leftTermX + 14}
                y={y + 3.8}
                textAnchor="start"
                fill={leftIsNC ? '#687078' : '#FFFFFF'}
                fontSize={numFontSize}
                fontWeight={700}
                fontFamily="IBM Plex Mono, monospace"
              >
                {leftInfo.displayedPin}
              </text>
              {/* Left IC Pin Function Name */}
              {leftInfo.icPinName && !leftIsNC && (
                <text
                  x={layout.bodyX - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={pinDirectionColor(leftInfo.icPinDirection)}
                  fontSize={leftInfo.icPinName.length > 5 ? 8.2 : nameFontSize}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {leftInfo.icPinName}
                </text>
              )}

              {/* Right High-Contrast Label Plate (between IC Body and Right Terminal) */}
              <rect
                x={layout.bodyX + layout.bodyW + 3}
                y={y - (is24 ? 7.5 : 8.5)}
                width={layout.rightTermX - (layout.bodyX + layout.bodyW) - 13}
                height={is24 ? 15 : 17}
                rx={2.5}
                fill="#171C21"
                stroke={rightIsNC ? '#2D343B' : '#39434D'}
                strokeWidth={0.8}
              />
              {/* Right IC Pin Function Name */}
              {rightInfo.icPinName && !rightIsNC && (
                <text
                  x={layout.bodyX + layout.bodyW + 6}
                  y={y + 3.5}
                  textAnchor="start"
                  fill={pinDirectionColor(rightInfo.icPinDirection)}
                  fontSize={rightInfo.icPinName.length > 5 ? 8.2 : nameFontSize}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {rightInfo.icPinName}
                </text>
              )}
              {/* Right Shifted/Standard Pin Number (shifts 16->14 automatically for 14-pin ICs!) */}
              <text
                x={layout.rightTermX - 14}
                y={y + 3.8}
                textAnchor="end"
                fill={rightIsNC ? '#687078' : is14PinShifted ? '#FFD479' : '#FFFFFF'}
                fontSize={numFontSize}
                fontWeight={700}
                fontFamily="IBM Plex Mono, monospace"
              >
                {rightInfo.displayedPin}
              </text>
            </g>
          );
        })}

        {/* Inserted DIP IC Package */}
        {occupant && occupantDef && (
          <g
            className="cursor-pointer"
            onClick={() => setSelectedICInstanceId(occupant.instanceId)}
          >
            {(() => {
              const half = occupantDef.pinCount / 2;
              const chipTop = layout.pinStartY - 11;
              const chipHeight = (half - 1) * layout.pinStepY + 22;
              const isSelected = selectedICInstanceId === occupant.instanceId;
              const icRt = simulation.icStates[occupant.instanceId];
              return (
                <>
                  {/* DIP Silver Metallic Leads */}
                  {Array.from({ length: half }).map((_, i) => {
                    const py = layout.pinStartY + i * layout.pinStepY;
                    return (
                      <g key={i}>
                        <rect x={layout.bodyX + 5} y={py - 2.5} width={10} height={5} fill="#CFD3D7" />
                        <rect x={layout.bodyX + layout.bodyW - 15} y={py - 2.5} width={10} height={5} fill="#CFD3D7" />
                      </g>
                    );
                  })}
                  {/* Matte Epoxy IC Body */}
                  <rect
                    x={layout.bodyX + 12}
                    y={chipTop}
                    width={layout.bodyW - 24}
                    height={chipHeight}
                    rx={2.5}
                    fill="#181B1F"
                    stroke={isSelected ? '#6CA181' : icRt?.powered ? '#587965' : '#525C66'}
                    strokeWidth={isSelected ? 2.2 : 1.4}
                  />
                  {/* Notch & Pin 1 Dot */}
                  <path
                    d={`M ${layout.bodyX + 30} ${chipTop} A 6 6 0 0 0 ${layout.bodyX + 42} ${chipTop}`}
                    fill="#2D333B"
                  />
                  <circle cx={layout.bodyX + 20} cy={chipTop + 10} r={2.4} fill="#C6C9CD" />

                  {/* Vertical IC Silkscreen Marking */}
                  <text
                    x={layout.bodyX + layout.bodyW / 2}
                    y={chipTop + chipHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#FFFFFF"
                    fontSize={12.5}
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, monospace"
                    transform={`rotate(-90, ${layout.bodyX + layout.bodyW / 2}, ${chipTop + chipHeight / 2})`}
                  >
                    {occupant.partNumber === '6116'
                      ? 'HM6116P-3 SRAM'
                      : occupantDef.family === 'CMOS'
                      ? `CD${occupant.partNumber}BE`
                      : `SN74LS${occupant.partNumber.replace(/^74/, '')}N`}
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Built-in Bottom GND Label (above bottom-center black socket, matching reference image) */}
        <text
          x={layout.gndX}
          y={layout.gndY - 12}
          textAnchor="middle"
          fill="#D6D5CE"
          stroke="#181C20"
          strokeWidth={2.5}
          paintOrder="stroke"
          fontSize={10.5}
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
        >
          GND
        </text>

        {/* Interactive Click Overlay when Pending IC is ready */}
        {pendingInsertIC && !occupant && (
          <g
            role="button"
            aria-label={`Insert ${pendingInsertIC} into ${socketId}`}
            className="cursor-pointer"
            onClick={() => insertIC(pendingInsertIC, { kind: 'zif', socketId })}
          >
            <rect
              x={layout.bodyX}
              y={layout.cradleTopY}
              width={layout.bodyW}
              height={layout.cradleH}
              rx={3.5}
              fill={canInsertHere ? 'rgba(88,121,101,0.28)' : 'rgba(189,139,67,0.22)'}
            />
            <text
              x={layout.bodyX + layout.bodyW / 2}
              y={layout.cradleTopY + layout.cradleH / 2}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={10.5}
              fontWeight={700}
              fontFamily="IBM Plex Mono, monospace"
            >
              {canInsertHere ? `INSERT ${pendingInsertIC}` : 'WRONG PINS'}
            </text>
          </g>
        )}
      </g>
    );
  };

  // Helper to get human-friendly pin label when hovering terminals
  const getTerminalTooltip = (termId: TerminalId): string => {
    const geom = getTerminalGeometry(termId);
    const base = geom?.label ?? termId;
    const lvl = simulation.terminalStates[termId] ?? 'Z';

    if (geom?.group === 'zif' && geom.socketId && geom.socketPin) {
      const info = getDisplayedZifPinInfo(geom.socketId, geom.socketPin, circuit.placedICs);
      if (info.partNumber) {
        if (info.displayedPin === 'NC') {
          return `${geom.socketId} · Unused Slot (NC on 14-pin ${info.partNumber})`;
        }
        return `${geom.socketId} Pin ${info.displayedPin} · ${info.partNumber} (${info.icPinName}) [${lvl}]`;
      }
    }

    for (const ic of circuit.placedICs) {
      const def = getICDefinition(ic.partNumber);
      if (!def) continue;
      for (const pin of def.pins) {
        if (getICPinTerminalId(ic, pin.pin) === termId) {
          return `${base} · ${ic.partNumber} Pin ${pin.pin} (${pin.name}) [${lvl}]`;
        }
      }
    }
    return `${base} [${lvl}]`;
  };

  const renderTerminalSockets = () => {
    return ALL_TERMINAL_LIST.map((term) => {
      const isSource = wiringFrom === term.id;
      const isHovered = hoverTerminal === term.id;
      const isOccupied = occupiedSockets.has(term.id);
      const lvl = simulation.terminalStates[term.id] ?? 'Z';

      // Circular metallic banana/patch socket for Trainer Panel & ZIF Pins
      // Match reference image: Red for +5V, Black for GND, Yellow for ZIF IC pins, Silver/Steel for panel I/O
      const ringColor =
        term.id.startsWith('PWR:+5V')
          ? '#D13B31'
          : term.id.startsWith('PWR:GND')
          ? '#181C20'
          : isSource
          ? '#F0C75E'
          : isHovered
          ? '#7EB0D1'
          : term.group === 'zif'
          ? '#D4A72C'
          : wiringFrom
          ? '#6F8FA4'
          : '#8D949B';

      return (
        <g
          key={term.id}
          role="button"
          aria-label={term.label}
          data-terminal-id={term.id}
          className="cursor-crosshair"
          onMouseEnter={() => setHoverTerminal(term.id)}
          onMouseLeave={() => setHoverTerminal((h) => (h === term.id ? null : h))}
          onClick={(e) => {
            e.stopPropagation();
            startOrCompleteWiring(term.id);
          }}
        >
          {/* Outer colored collar */}
          <circle
            cx={term.x}
            cy={term.y}
            r={term.radius + (isHovered || isSource ? 1.6 : 0)}
            fill={ringColor}
            stroke={term.id.startsWith('PWR:GND') || term.id.startsWith('PWR:+5V') ? '#E5E5E1' : '#16191D'}
            strokeWidth={term.id.startsWith('PWR:') ? 1.3 : 1}
          />
          {/* Metallic rim */}
          <circle
            cx={term.x}
            cy={term.y}
            r={term.radius - 2.3}
            fill={term.id.startsWith('PWR:GND') ? '#384048' : '#D5D7DA'}
          />
          {/* Socket bore */}
          <circle
            cx={term.x}
            cy={term.y}
            r={term.radius - 4.0}
            fill={isOccupied ? '#456A83' : '#111417'}
          />
          {/* Subtle logic probe dot on hover */}
          {isHovered && circuit.powerOn && (
            <circle cx={term.x} cy={term.y} r={2.3} fill={levelBadgeColor(lvl)} pointerEvents="none" />
          )}
        </g>
      );
    });
  };

  return (
    <div className="relative w-full bg-[#20252B] rounded-md border border-[#303840] p-2 select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
        className="w-full h-auto block"
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onContextMenu={handleSvgContextMenu}
        data-testid="trainer-board-svg"
      >
        {/* Main DT-1004 Chassis */}
        <rect x={4} y={4} width={BOARD_WIDTH - 8} height={BOARD_HEIGHT - 8} rx={8} fill="#20252B" stroke="#47505A" strokeWidth={1.5} />
        <rect x={16} y={16} width={BOARD_WIDTH - 32} height={BOARD_HEIGHT - 32} rx={5} fill="#303840" stroke="#47505A" strokeWidth={1} />

        {/* Model Plate */}
        <text x={32} y={36} fill="#F1F0EB" fontSize={12.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
          LOGICBENCH DT-1004 DIGITAL TRAINER
        </text>

        {/* ================= A. MAIN POWER SECTION (CLEAN ROCKER & STATUS, +5V/GND INTEGRATED IN ZIF SOCKETS) ================= */}
        <g>
          <rect x={32} y={46} width={212} height={174} rx={4} fill="#252B32" stroke="#47505A" strokeWidth={1} />
          <text x={44} y={65} fill="#F1F0EB" fontSize={11} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            POWER SUPPLY
          </text>

          {/* Rocker Power Switch */}
          <g
            role="button"
            aria-label={circuit.powerOn ? 'Main Power Switch ON' : 'Main Power Switch OFF'}
            className="cursor-pointer"
            onClick={togglePower}
          >
            <rect x={44} y={78} width={64} height={42} rx={3} fill="#181C20" stroke="#5A636D" strokeWidth={1.2} />
            <rect
              x={50}
              y={circuit.powerOn ? 83 : 99}
              width={52}
              height={16}
              rx={2}
              fill={circuit.powerOn ? '#D13B31' : '#47505A'}
            />
            <text x={76} y={134} textAnchor="middle" fill="#F1F0EB" fontSize={10.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
              {circuit.powerOn ? 'PWR: ON' : 'PWR: OFF'}
            </text>
          </g>

          {/* Pilot Power LED */}
          <circle
            cx={146}
            cy={99}
            r={9}
            fill={circuit.powerOn ? '#66A37D' : '#22282E'}
            stroke={circuit.powerOn ? '#95CBA8' : '#47505A'}
            strokeWidth={1.5}
          />
          <text x={162} y={103} fill="#F1F0EB" fontSize={10.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
            +5V DC
          </text>

          {/* Integrated Socket Power Reference Note */}
          <rect x={44} y={148} width={188} height={58} rx={3} fill="#1B2026" stroke="#39434D" strokeWidth={1} />
          <circle cx={58} cy={164} r={5} fill="#D13B31" stroke="#E5E5E1" strokeWidth={1} />
          <text x={70} y={168} fill="#F1F0EB" fontSize={9.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
            +5V: Top of each ZIF
          </text>
          <circle cx={58} cy={188} r={5} fill="#181C20" stroke="#E5E5E1" strokeWidth={1} />
          <text x={70} y={192} fill="#D6D5CE" fontSize={9.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
            GND: Bottom of each ZIF
          </text>
        </g>

        {/* ================= D & E. CLOCK & PULSE GENERATORS ================= */}
        <g>
          <rect x={256} y={46} width={302} height={174} rx={4} fill="#252B32" stroke="#47505A" strokeWidth={1} />
          <text x={268} y={65} fill="#F1F0EB" fontSize={11} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            CLOCK &amp; PULSE GENERATOR
          </text>

          {/* Clock Mode Buttons */}
          {(['manual', 'single-step', 'auto'] as const).map((m, idx) => {
            const active = circuit.clock.mode === m;
            const bx = 268 + idx * 64;
            return (
              <g
                key={m}
                className="cursor-pointer"
                onClick={() => setClockMode(m)}
              >
                <rect
                  x={bx}
                  y={74}
                  width={60}
                  height={20}
                  rx={2.5}
                  fill={active ? '#456A83' : '#1B2026'}
                  stroke={active ? '#7EB0D1' : '#47505A'}
                  strokeWidth={1}
                />
                <text
                  x={bx + 30}
                  y={87}
                  textAnchor="middle"
                  fill="#F1F0EB"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {m === 'manual' ? 'MANUAL' : m === 'single-step' ? 'STEP' : 'AUTO'}
                </text>
              </g>
            );
          })}

          {/* Clock Action Button (Manual Push or Step or Auto Start/Stop) */}
          {circuit.clock.mode === 'manual' && (
            <g
              className="cursor-pointer"
              onMouseDown={() => triggerManualClockPress(true)}
              onMouseUp={() => triggerManualClockPress(false)}
              onMouseLeave={() => {
                if (circuit.clock.level === 1) triggerManualClockPress(false);
              }}
            >
              <rect x={268} y={102} width={110} height={32} rx={3} fill="#36404A" stroke="#747C82" strokeWidth={1.2} />
              <circle cx={286} cy={118} r={6.5} fill={circuit.clock.level === 1 && circuit.powerOn ? '#DF5D55' : '#7B2B26'} />
              <text x={330} y={121} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                HOLD PULSE
              </text>
            </g>
          )}
          {circuit.clock.mode === 'single-step' && (
            <g className="cursor-pointer" onClick={triggerSingleStepClock}>
              <rect x={268} y={102} width={110} height={32} rx={3} fill="#36404A" stroke="#747C82" strokeWidth={1.2} />
              <text x={323} y={121} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                STEP ({circuit.clock.level}→{circuit.clock.level === 1 ? 0 : 1})
              </text>
            </g>
          )}
          {circuit.clock.mode === 'auto' && (
            <g className="cursor-pointer" onClick={toggleAutoClock}>
              <rect
                x={268}
                y={102}
                width={110}
                height={32}
                rx={3}
                fill={circuit.clock.autoRunning ? '#587965' : '#36404A'}
                stroke="#747C82"
                strokeWidth={1.2}
              />
              <text x={323} y={121} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                {circuit.clock.autoRunning ? 'STOP AUTO' : 'START AUTO'}
              </text>
            </g>
          )}

          {/* Clock LED + Telemetry */}
          <circle
            cx={398}
            cy={118}
            r={6.5}
            fill={circuit.powerOn && circuit.clock.level === 1 ? '#66A37D' : '#1E2329'}
            stroke="#5A636D"
            strokeWidth={1}
          />
          <text x={412} y={114} fill="#F1F0EB" fontSize={9.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
            {circuit.clock.frequencyHz.toFixed(1)}Hz
          </text>
          <text x={412} y={127} fill="#A5ACB2" fontSize={9} fontFamily="IBM Plex Mono, monospace">
            {circuit.clock.dutyCyclePercent}%
          </text>

          <text x={484} y={92} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">CLK</text>
          <text x={528} y={92} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">~CLK</text>

          {/* Divider */}
          <line x1={268} y1={144} x2={546} y2={144} stroke="#3A424B" strokeWidth={1} />

          {/* Pulse Generator */}
          <text x={268} y={162} fill="#D6D5CE" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            AUX PULSE GEN
          </text>
          <g className="cursor-pointer" onClick={togglePulseGenerator}>
            <rect
              x={268}
              y={170}
              width={96}
              height={30}
              rx={3}
              fill={circuit.pulse.running ? '#456A83' : '#1B2026'}
              stroke="#5A636D"
              strokeWidth={1}
            />
            <text x={316} y={189} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
              {circuit.pulse.running ? 'STOP PULSE' : 'START PULSE'}
            </text>
          </g>
          <circle
            cx={384}
            cy={186}
            r={6.5}
            fill={circuit.powerOn && circuit.pulse.level === 1 ? '#66A37D' : '#1E2329'}
            stroke="#5A636D"
            strokeWidth={1}
          />
          <text x={400} y={183} fill="#F1F0EB" fontSize={9.5} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
            {circuit.pulse.frequencyHz.toFixed(1)}Hz
          </text>
          <text x={400} y={196} fill="#A5ACB2" fontSize={9} fontFamily="IBM Plex Mono, monospace">
            {circuit.pulse.dutyCyclePercent}%
          </text>
          <text x={506} y={170} textAnchor="middle" fill="#F1F0EB" fontSize={9.5} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            PULSE
          </text>
        </g>

        {/* ================= F & G. ONBOARD SEVEN-SEGMENT DISPLAYS (LTS542) ================= */}
        <g>
          <rect x={570} y={46} width={356} height={174} rx={4} fill="#252B32" stroke="#47505A" strokeWidth={1} />
          <text x={582} y={65} fill="#F1F0EB" fontSize={11} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            7-SEGMENT DISPLAY (COMMON ANODE · LTS542)
          </text>

          <SevenSegDigitSVG
            x={634}
            y={70}
            label="D1"
            segments={simulation.displays.DISP1.segments}
            powerOn={circuit.powerOn}
          />
          <SevenSegDigitSVG
            x={810}
            y={70}
            label="D2"
            segments={simulation.displays.DISP2.segments}
            powerOn={circuit.powerOn}
          />

          {/* Segment pin labels */}
          {(['DISP1', 'DISP2'] as const).map((dispId, dIdx) => {
            const bx = dIdx === 0 ? 590 : 766;
            const r1 = ['a', 'b', 'c', 'd', 'e'] as const;
            const r2 = ['f', 'g', 'dp', 'CA'] as const;
            return (
              <g key={dispId}>
                {r1.map((seg, i) => (
                  <text
                    key={seg}
                    x={bx + 20 + i * 30}
                    y={184}
                    textAnchor="middle"
                    fill="#F1F0EB"
                    fontSize={9.5}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {seg}
                  </text>
                ))}
                {r2.map((seg, i) => (
                  <text
                    key={seg}
                    x={bx + 35 + i * 30}
                    y={215}
                    textAnchor="middle"
                    fill={seg === 'CA' ? '#FF857A' : '#F1F0EB'}
                    fontSize={9.5}
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {seg}
                  </text>
                ))}
              </g>
            );
          })}
        </g>

        {/* ================= C. 16 DIGITAL OUTPUT LEDS ================= */}
        <g>
          <rect x={938} y={46} width={430} height={174} rx={4} fill="#252B32" stroke="#47505A" strokeWidth={1} />
          <text x={950} y={65} fill="#F1F0EB" fontSize={11} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            DIGITAL OUTPUT INDICATORS (L0 – L15)
          </text>

          {Array.from({ length: 16 }).map((_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const x = 966 + col * 51;
            const termY = row === 0 ? 112 : 196;
            const ledY = row === 0 ? 86 : 170;
            const lvl = simulation.ledStates[i] ?? 'Z';
            const colors = ledFill(lvl, circuit.powerOn);
            return (
              <g
                key={i}
                data-led-index={i}
                data-led-state={circuit.powerOn ? String(lvl) : 'OFF'}
              >
                <circle cx={x} cy={ledY} r={10} fill="#181C20" stroke="#47505A" strokeWidth={1} />
                <circle cx={x} cy={ledY} r={7.2} fill={colors.fill} stroke={colors.ring} strokeWidth={1.2} />
                <text
                  x={x}
                  y={ledY + 3.2}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={8.5}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {circuit.powerOn ? String(lvl) : ''}
                </text>
                <text
                  x={x}
                  y={termY + 19}
                  textAnchor="middle"
                  fill="#F1F0EB"
                  fontSize={9.5}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  L{i}
                </text>
              </g>
            );
          })}
        </g>

        {/* ================= H. 5 ZIF IC SOCKETS (4 × 16-PIN + 1 × 24-PIN RAM, WITH INTEGRATED +5V/GND) ================= */}
        {ALL_ZIF_SOCKETS.map((sockId) => renderZifSocket(sockId))}

        {/* ================= B. 16 DIGITAL INPUT SWITCHES ================= */}
        <g>
          <rect x={32} y={660} width={1336} height={168} rx={4} fill="#252B32" stroke="#47505A" strokeWidth={1} />
          <text x={44} y={678} fill="#F1F0EB" fontSize={11} fontWeight={700} fontFamily="IBM Plex Mono, monospace">
            DIGITAL INPUT SWITCHES (SW0 – SW15)
          </text>

          {Array.from({ length: 16 }).map((_, i) => {
            const x = 74 + i * 83.2;
            const val = circuit.switches[i] ?? 0;
            const isHigh = val === 1;
            return (
              <g key={i}>
                {/* State indicator */}
                <text
                  x={x}
                  y={722}
                  textAnchor="middle"
                  fill={isHigh && circuit.powerOn ? '#86C49D' : '#A5ACB2'}
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {isHigh ? '1 (HI)' : '0 (LO)'}
                </text>
                {/* Physical toggle switch */}
                <g
                  role="switch"
                  aria-checked={isHigh}
                  aria-label={`Input Switch SW${i}`}
                  className="cursor-pointer"
                  onClick={() => toggleSwitch(i)}
                >
                  <rect x={x - 14} y={730} width={28} height={54} rx={3} fill="#181C20" stroke="#5A636D" strokeWidth={1.2} />
                  <circle cx={x} cy={757} r={7} fill="#47505A" />
                  {/* Lever arm */}
                  <rect
                    x={x - 5}
                    y={isHigh ? 734 : 756}
                    width={10}
                    height={24}
                    rx={3}
                    fill={isHigh ? '#D6D5CE' : '#8D949B'}
                    stroke="#20252B"
                    strokeWidth={1}
                  />
                </g>
                <text
                  x={x}
                  y={806}
                  textAnchor="middle"
                  fill="#F1F0EB"
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  SW{i}
                </text>
              </g>
            );
          })}
        </g>

        {/* ================= PATCH CORDS & BREADBOARD JUMPERS (BELOW SOCKET TARGETS) ================= */}
        <g pointerEvents={wiringFrom ? 'none' : 'auto'}>
          {circuit.wires.map((wire, idx) => {
            const fromG = getTerminalGeometry(wire.from);
            const toG = getTerminalGeometry(wire.to);
            if (!fromG || !toG) return null;
            const { d } = computeWirePath(
              fromG,
              toG,
              wire.kind,
              idx,
              wire.controlOffset
            );
            const colors = WIRE_COLOR_HEX[wire.color];
            const isSelected = selectedWireId === wire.id;
            const strokeWidth = wire.kind === 'jumper' ? 3 : 4.2;

            return (
              <g key={wire.id}>
                {/* Subtle cable shadow */}
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={strokeWidth + 2}
                  strokeLinecap="round"
                  transform="translate(0, 2.5)"
                  pointerEvents="none"
                />
                {/* Insulated wire body */}
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? colors.highlight : colors.stroke}
                  strokeWidth={isSelected ? strokeWidth + 1.2 : strokeWidth}
                  strokeLinecap="round"
                  pointerEvents={wiringFrom ? 'none' : 'stroke'}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWireId(isSelected ? null : wire.id);
                  }}
                />
              </g>
            );
          })}
        </g>

        {/* ================= TERMINAL SOCKETS (ALWAYS CLICKABLE ON TOP OF CORDS) ================= */}
        {renderTerminalSockets()}

        {/* ================= PLUG BOOTS, ACTIVE CORD PREVIEW & SELECTED WIRE HANDLES ================= */}
        <g>
          {circuit.wires.map((wire, idx) => {
            const fromG = getTerminalGeometry(wire.from);
            const toG = getTerminalGeometry(wire.to);
            if (!fromG || !toG) return null;
            const colors = WIRE_COLOR_HEX[wire.color];
            const isSelected = selectedWireId === wire.id;
            const { midX, midY } = computeWirePath(
              fromG,
              toG,
              wire.kind,
              idx,
              wire.controlOffset
            );

            return (
              <g key={`boots-${wire.id}`}>
                {/* Molded plug boots */}
                <circle
                  cx={fromG.x}
                  cy={fromG.y}
                  r={wire.kind === 'jumper' ? 3.2 : 5.0}
                  fill={colors.stroke}
                  stroke="#181C20"
                  strokeWidth={1}
                  pointerEvents="none"
                />
                <circle
                  cx={toG.x}
                  cy={toG.y}
                  r={wire.kind === 'jumper' ? 3.2 : 5.0}
                  fill={colors.stroke}
                  stroke="#181C20"
                  strokeWidth={1}
                  pointerEvents="none"
                />
                {/* Draggable Midpoint & Remove Action when selected */}
                {isSelected && (
                  <g>
                    <circle
                      cx={midX}
                      cy={midY}
                      r={7}
                      fill="#F1F0EB"
                      stroke="#20252B"
                      strokeWidth={1.5}
                      className="cursor-move"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const pt = toSvgCoords(e.clientX, e.clientY);
                        if (!pt) return;
                        setDraggingWireMid({
                          wireId: wire.id,
                          startX: pt.x,
                          startY: pt.y,
                          origDx: wire.controlOffset?.dx ?? 0,
                          origDy: wire.controlOffset?.dy ?? 0,
                        });
                      }}
                    />
                    <g
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWire(wire.id);
                      }}
                    >
                      <circle cx={midX + 18} cy={midY - 12} r={8.5} fill="#B83A32" stroke="#F1F0EB" strokeWidth={1} />
                      <text
                        x={midX + 18}
                        y={midY - 8.5}
                        textAnchor="middle"
                        fill="#F1F0EB"
                        fontSize={10}
                        fontWeight={700}
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        ×
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* Active rubber-band cord preview */}
          {wiringFrom && pointerSvg && (() => {
            const fromG = getTerminalGeometry(wiringFrom);
            if (!fromG) return null;
            const targetG = hoverTerminal ? getTerminalGeometry(hoverTerminal) : null;
            const endPt = targetG ?? pointerSvg;
            const { d } = computeWirePath(fromG, endPt, 'patch-cord', 0);
            const colors = WIRE_COLOR_HEX[selectedWireColor];
            return (
              <path
                d={d}
                fill="none"
                stroke={colors.highlight}
                strokeWidth={3.8}
                strokeDasharray="6 4"
                strokeLinecap="round"
                pointerEvents="none"
              />
            );
          })()}
        </g>

        {/* Hover Terminal Tooltip */}
        {hoverTerminal && (() => {
          const g = getTerminalGeometry(hoverTerminal);
          if (!g) return null;
          const text = getTerminalTooltip(hoverTerminal);
          const boxW = Math.min(340, Math.max(140, text.length * 6.5 + 16));
          const tx = Math.min(BOARD_WIDTH - boxW - 12, Math.max(12, g.x - boxW / 2));
          const ty = g.y < 60 ? g.y + 18 : g.y - 30;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={boxW} height={22} rx={3} fill="#20252B" stroke="#747C82" strokeWidth={1} />
              <text
                x={tx + boxW / 2}
                y={ty + 14}
                textAnchor="middle"
                fill="#F1F0EB"
                fontSize={10}
                fontFamily="IBM Plex Mono, monospace"
              >
                {text}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
};
