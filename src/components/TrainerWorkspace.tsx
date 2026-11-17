import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  Info,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { canInsertIntoZif, getAllICDefinitions, getICDefinition } from '../ic-library';
import {
  classifyWireConnection,
  describeTerminalEndpoint,
  formatDirectionTag,
  getDisplayedZifPinInfo,
} from '../simulation/netlist';
import { serializeProject } from '../storage/projectStorage';
import { useLabStore } from '../store/useLabStore';
import { WIRE_COLOR_HEX } from '../trainer/boardLayout';
import { PlacedIC, WireColor, ZIFSocketId } from '../types/circuit';
import { ICInternalDiagram } from './ICInternalDiagram';
import { TrainerBoardSVG } from './TrainerBoardSVG';

function formatTerminalDisplay(terminalId: string, placedICs: PlacedIC[]): string {
  if (terminalId.startsWith('PWR:+5V:')) {
    const idx = Number(terminalId.split(':')[2]);
    return `ZIF-${idx + 1}:+5V`;
  }
  if (terminalId.startsWith('PWR:GND:')) {
    const idx = Number(terminalId.split(':')[2]);
    return `ZIF-${idx + 1}:GND`;
  }
  if (terminalId.startsWith('ZIF')) {
    const [sock, pinStr] = terminalId.split(':');
    const physPin = Number(pinStr);
    const info = getDisplayedZifPinInfo(sock as ZIFSocketId, physPin, placedICs);
    if (info.icPinName) {
      const dirTag = formatDirectionTag(info.icPinDirection);
      return `${sock}:Pin ${info.displayedPin} (${info.icPinName} · ${dirTag})`;
    }
    return `${sock}:Pin ${info.displayedPin}`;
  }
  return terminalId;
}

export const TrainerWorkspace: React.FC = () => {
  const project = useLabStore((s) => s.project);
  const simulation = useLabStore((s) => s.simulation);
  const undoStack = useLabStore((s) => s.undoStack);
  const redoStack = useLabStore((s) => s.redoStack);

  const selectedWireColor = useLabStore((s) => s.selectedWireColor);
  const wiringFrom = useLabStore((s) => s.wiringFrom);
  const selectedWireId = useLabStore((s) => s.selectedWireId);
  const selectedWireIds = useLabStore((s) => s.selectedWireIds);
  const pendingInsertIC = useLabStore((s) => s.pendingInsertIC);
  const selectedICInstanceId = useLabStore((s) => s.selectedICInstanceId);
  const placementError = useLabStore((s) => s.placementError);

  const setSelectedWireColor = useLabStore((s) => s.setSelectedWireColor);
  const setSelectedWireIds = useLabStore((s) => s.setSelectedWireIds);
  const toggleSelectedWireId = useLabStore((s) => s.toggleSelectedWireId);
  const setPendingInsertIC = useLabStore((s) => s.setPendingInsertIC);
  const clearPlacementError = useLabStore((s) => s.clearPlacementError);
  const cancelWiring = useLabStore((s) => s.cancelWiring);
  const insertIC = useLabStore((s) => s.insertIC);
  const removeIC = useLabStore((s) => s.removeIC);
  const removeWire = useLabStore((s) => s.removeWire);
  const removeWires = useLabStore((s) => s.removeWires);
  const undo = useLabStore((s) => s.undo);
  const redo = useLabStore((s) => s.redo);
  const resetCircuit = useLabStore((s) => s.resetCircuit);
  const renameProject = useLabStore((s) => s.renameProject);
  const setAdvisorOpen = useLabStore((s) => s.setAdvisorOpen);

  const setClockFrequency = useLabStore((s) => s.setClockFrequency);
  const setClockDutyCycle = useLabStore((s) => s.setClockDutyCycle);
  const tickAutoClockLevel = useLabStore((s) => s.tickAutoClockLevel);
  const setPulseFrequency = useLabStore((s) => s.setPulseFrequency);
  const setPulseDutyCycle = useLabStore((s) => s.setPulseDutyCycle);
  const tickPulseLevel = useLabStore((s) => s.tickPulseLevel);

  const [quickICPart, setQuickICPart] = useState('7400');
  const [inspectorTab, setInspectorTab] = useState<'diagnostics' | 'ic' | 'wires' | 'clock'>(
    'diagnostics'
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const allICs = getAllICDefinitions();
  const { circuit } = project;

  // Escape key cancels active patch cord routing, pending IC placement, or reset confirmation popup;
  // Delete / Backspace deletes all selected wires
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        cancelWiring();
        setPendingInsertIC(null);
        setShowResetConfirmModal(false);
        setSelectedWireIds([]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable) {
        if (selectedWireIds.length > 0) {
          e.preventDefault();
          removeWires(selectedWireIds);
        } else if (selectedWireId) {
          e.preventDefault();
          removeWire(selectedWireId);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isEditable) {
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cancelWiring,
    setPendingInsertIC,
    setSelectedWireIds,
    selectedWireIds,
    selectedWireId,
    removeWires,
    removeWire,
    undo,
    redo,
  ]);

  // Automatic Clock Generator Timer (respects frequencyHz & dutyCyclePercent)
  useEffect(() => {
    if (!circuit.powerOn || !circuit.clock.autoRunning) return;
    const periodMs = 1000 / Math.max(0.25, circuit.clock.frequencyHz);
    const highMs = Math.max(20, periodMs * (circuit.clock.dutyCyclePercent / 100));
    const lowMs = Math.max(20, periodMs - highMs);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = (currentLevel: 0 | 1) => {
      const wait = currentLevel === 1 ? highMs : lowMs;
      timer = setTimeout(() => {
        if (!active) return;
        const next: 0 | 1 = currentLevel === 1 ? 0 : 1;
        tickAutoClockLevel(next);
        scheduleNext(next);
      }, wait);
    };

    scheduleNext(circuit.clock.level);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    circuit.powerOn,
    circuit.clock.autoRunning,
    circuit.clock.frequencyHz,
    circuit.clock.dutyCyclePercent,
    circuit.clock.level,
    tickAutoClockLevel,
  ]);

  // Pulse Generator Timer
  useEffect(() => {
    if (!circuit.powerOn || !circuit.pulse.running) return;
    const periodMs = 1000 / Math.max(0.5, circuit.pulse.frequencyHz);
    const highMs = Math.max(15, periodMs * (circuit.pulse.dutyCyclePercent / 100));
    const lowMs = Math.max(15, periodMs - highMs);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = (currentLevel: 0 | 1) => {
      const wait = currentLevel === 1 ? highMs : lowMs;
      timer = setTimeout(() => {
        if (!active) return;
        const next: 0 | 1 = currentLevel === 1 ? 0 : 1;
        tickPulseLevel(next);
        scheduleNext(next);
      }, wait);
    };

    scheduleNext(circuit.pulse.level);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    circuit.powerOn,
    circuit.pulse.running,
    circuit.pulse.frequencyHz,
    circuit.pulse.dutyCyclePercent,
    circuit.pulse.level,
    tickPulseLevel,
  ]);

  const handleExportJson = () => {
    const json = serializeProject(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'logicbench-circuit'}.logicbench.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickCompat16 = canInsertIntoZif(quickICPart, 'ZIF1');
  const quickCompat24 = canInsertIntoZif(quickICPart, 'ZIF5');

  const inspectedIC =
    circuit.placedICs.find((p) => p.instanceId === selectedICInstanceId) ??
    circuit.placedICs[0] ??
    null;
  const inspectedICDef = inspectedIC ? getICDefinition(inspectedIC.partNumber) : null;
  const inspectedICRt = inspectedIC ? simulation.icStates[inspectedIC.instanceId] : undefined;

  const wireColors: WireColor[] = ['red', 'black', 'yellow', 'blue', 'green'];

  const errorCount = simulation.diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = simulation.diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[#F1F0EB] text-[#20252B]">
      {/* Instrument Bench Toolbar */}
      <div className="bg-[#E5E5E1] border-b border-[#C9C9C3] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Project & IC Insertion Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="Current project name"
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="px-2.5 py-1 text-xs font-medium bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] w-40 focus:outline-none focus:border-[#456A83]"
          />

          <div className="h-5 w-px bg-[#C9C9C3]" />

          <label htmlFor="quick-ic-select" className="text-xs font-medium text-[#303840]">
            IC:
          </label>
          <select
            id="quick-ic-select"
            value={quickICPart}
            onChange={(e) => setQuickICPart(e.target.value)}
            className="px-2 py-1 text-xs font-mono bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] max-w-[calc(100vw-2rem)] sm:max-w-[260px] truncate focus:outline-none focus:border-[#456A83]"
          >
            {allICs.map((ic) => (
              <option key={ic.partNumber} value={ic.partNumber}>
                {ic.partNumber} — {ic.name} ({ic.pinCount}p)
              </option>
            ))}
          </select>

          {(['ZIF1', 'ZIF2', 'ZIF3', 'ZIF4'] as const).map((sockId, idx) => (
            <button
              key={sockId}
              type="button"
              disabled={!quickCompat16.ok}
              onClick={() => insertIC(quickICPart, { kind: 'zif', socketId: sockId })}
              className="px-2 py-1 text-xs font-medium bg-[#303840] text-[#F1F0EB] rounded hover:bg-[#414B56] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              + ZIF-{idx + 1}
            </button>
          ))}

          <button
            type="button"
            disabled={!quickCompat24.ok}
            onClick={() => insertIC(quickICPart, { kind: 'zif', socketId: 'ZIF5' })}
            className="px-2.5 py-1 text-xs font-medium bg-[#456A83] text-[#F1F0EB] rounded hover:bg-[#527B96] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            + ZIF-5 (24P RAM)
          </button>
        </div>

        {/* Patch Cord Color & Bench Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#F1F0EB] border border-[#C9C9C3] rounded px-2 py-1">
            <span className="text-[11px] font-medium text-[#555C62] mr-1">Cord:</span>
            {wireColors.map((c) => {
              const active = selectedWireColor === c;
              return (
                <button
                  key={c}
                  type="button"
                  title={WIRE_COLOR_HEX[c].label}
                  aria-label={`Select ${WIRE_COLOR_HEX[c].label} patch cord`}
                  onClick={() => setSelectedWireColor(c)}
                  className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                    active ? 'scale-115 ring-2 ring-[#456A83] border-white' : 'border-[#20252B]/40'
                  }`}
                  style={{ backgroundColor: WIRE_COLOR_HEX[c].stroke }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            aria-label="Undo circuit edit"
            title="Undo (Ctrl+Z)"
            className="p-1.5 bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] hover:bg-[#DAD9D3] disabled:opacity-40 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoStack.length === 0}
            aria-label="Redo circuit edit"
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] hover:bg-[#DAD9D3] disabled:opacity-40 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            aria-label="Export project JSON"
            title="Export Project JSON"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] hover:bg-[#DAD9D3] whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={() => setShowResetConfirmModal(true)}
            aria-label="Reset trainer circuit"
            title="Reset Trainer Circuit"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] hover:bg-[#DAD9D3] whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setAdvisorOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#456A83] text-[#F1F0EB] rounded hover:bg-[#527B96] whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Advisor
          </button>
        </div>
      </div>

      {/* Contextual Status Banners */}
      {(wiringFrom ||
        pendingInsertIC ||
        placementError ||
        selectedWireIds.length > 0 ||
        selectedWireId) && (
        <div className="bg-[#303840] text-[#F1F0EB] px-4 py-1.5 text-xs flex items-center justify-between gap-4 border-b border-[#20252B] shrink-0">
          <div className="flex items-center gap-3 font-mono">
            {wiringFrom && (
              <span>
                Routing patch cord from{' '}
                <strong>{formatTerminalDisplay(wiringFrom, circuit.placedICs)}</strong> — click
                destination terminal or press Esc to cancel.
              </span>
            )}
            {pendingInsertIC && !wiringFrom && (
              <span>
                Placing <strong>{pendingInsertIC}</strong> — click a compatible ZIF socket on the
                trainer board.
              </span>
            )}
            {placementError && <span className="text-[#E8A45C]">{placementError}</span>}
            {(selectedWireIds.length > 0 || selectedWireId) && !wiringFrom && !placementError && (
              <span>
                {selectedWireIds.length > 1
                  ? `${selectedWireIds.length} patch cords selected (marquee drag or Shift+Click) — press Delete/Backspace or click Delete Selected.`
                  : 'Patch cord selected — drag from any point on the wire to curve around labels, Shift+Click or drag box to multi-select, or press Delete.'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(selectedWireIds.length > 0 || selectedWireId) && (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedWireIds([])}
                  className="px-2 py-0.5 text-xs bg-[#414B56] text-[#F1F0EB] rounded hover:bg-[#525E6B] cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  data-testid="banner-delete-selected-wires"
                  onClick={() =>
                    removeWires(
                      selectedWireIds.length > 0
                        ? selectedWireIds
                        : selectedWireId
                        ? [selectedWireId]
                        : []
                    )
                  }
                  className="px-2.5 py-0.5 text-xs font-semibold bg-[#B83A32] text-white rounded hover:bg-[#9E2F28] cursor-pointer"
                >
                  {selectedWireIds.length > 1
                    ? `Delete ${selectedWireIds.length} Wires`
                    : 'Delete Wire'}
                </button>
              </>
            )}
            {(wiringFrom || pendingInsertIC || placementError) && (
              <button
                type="button"
                onClick={() => {
                  cancelWiring();
                  setPendingInsertIC(null);
                  clearPlacementError();
                }}
                className="p-0.5 text-[#A5ACB2] hover:text-white cursor-pointer"
                aria-label="Dismiss active tool message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Split: Trainer Canvas + Retractable Right Engineering Inspector */}
      <div className="flex-1 overflow-hidden flex flex-col xl:flex-row">
        {/* DT-1004 Hardware Board Stage (expands automatically when inspector is retracted) */}
        <div className="flex-1 overflow-auto p-2 lg:p-3 flex items-start justify-center bg-[#DFDDD6] transition-all duration-200">
          <div
            className={`w-full transition-all duration-200 ${
              inspectorCollapsed ? 'max-w-[1640px]' : 'max-w-[1360px]'
            }`}
          >
            <TrainerBoardSVG />
          </div>
        </div>

        {/* Right Engineering Inspector — Horizontally Minimizable & Retractable */}
        {inspectorCollapsed ? (
          <aside
            aria-label="Minimized Engineering Inspector"
            className="w-full xl:w-11 border-t xl:border-t-0 xl:border-l border-[#C9C9C3] bg-[#DAD9D3] flex xl:flex-col items-center justify-between xl:justify-start py-2 px-3 xl:px-1.5 gap-3 shrink-0 transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => setInspectorCollapsed(false)}
              title="Expand Inspector Panel"
              aria-label="Expand Inspector Panel"
              className="p-1.5 rounded bg-[#303840] text-[#F1F0EB] hover:bg-[#456A83] transition-colors cursor-pointer"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>

            <div className="flex xl:flex-col items-center gap-2 text-[10px] font-mono text-[#303840]">
              <button
                type="button"
                onClick={() => {
                  setInspectorTab('diagnostics');
                  setInspectorCollapsed(false);
                }}
                title={`Checks (${errorCount + warnCount})`}
                className="px-1.5 py-1 rounded bg-[#F1F0EB] border border-[#B8B8B1] hover:border-[#456A83] font-semibold cursor-pointer"
              >
                C:{errorCount + warnCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectorTab('ic');
                  setInspectorCollapsed(false);
                }}
                title={`ICs (${circuit.placedICs.length})`}
                className="px-1.5 py-1 rounded bg-[#F1F0EB] border border-[#B8B8B1] hover:border-[#456A83] font-semibold cursor-pointer"
              >
                IC:{circuit.placedICs.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectorTab('wires');
                  setInspectorCollapsed(false);
                }}
                title={`Wires (${circuit.wires.length})`}
                className="px-1.5 py-1 rounded bg-[#F1F0EB] border border-[#B8B8B1] hover:border-[#456A83] font-semibold cursor-pointer"
              >
                W:{circuit.wires.length}
              </button>
            </div>
          </aside>
        ) : (
          <aside
            aria-label="Engineering Inspector"
            className="w-full xl:w-80 border-t xl:border-t-0 xl:border-l border-[#C9C9C3] bg-[#E5E5E1] flex flex-col shrink-0 h-72 xl:h-full transition-all duration-200"
          >
            {/* Inspector Tabs + Horizontal Collapse Button */}
            <div className="flex items-center border-b border-[#C9C9C3] bg-[#DAD9D3] text-xs font-medium shrink-0">
              <div className="grid grid-cols-4 flex-1">
                <button
                  type="button"
                  onClick={() => setInspectorTab('diagnostics')}
                  className={`py-2 px-1 text-center border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === 'diagnostics'
                      ? 'border-[#456A83] bg-[#E5E5E1] text-[#20252B]'
                      : 'border-transparent text-[#555C62] hover:text-[#20252B]'
                  }`}
                >
                  Checks ({errorCount + warnCount})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('ic')}
                  className={`py-2 px-1 text-center border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === 'ic'
                      ? 'border-[#456A83] bg-[#E5E5E1] text-[#20252B]'
                      : 'border-transparent text-[#555C62] hover:text-[#20252B]'
                  }`}
                >
                  ICs ({circuit.placedICs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('wires')}
                  className={`py-2 px-1 text-center border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === 'wires'
                      ? 'border-[#456A83] bg-[#E5E5E1] text-[#20252B]'
                      : 'border-transparent text-[#555C62] hover:text-[#20252B]'
                  }`}
                >
                  Wires ({circuit.wires.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('clock')}
                  className={`py-2 px-1 text-center border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === 'clock'
                      ? 'border-[#456A83] bg-[#E5E5E1] text-[#20252B]'
                      : 'border-transparent text-[#555C62] hover:text-[#20252B]'
                  }`}
                >
                  Timing
                </button>
              </div>

              <button
                type="button"
                onClick={() => setInspectorCollapsed(true)}
                title="Minimize Inspector Horizontally"
                aria-label="Minimize Inspector Horizontally"
                className="px-2 py-2 text-[#303840] hover:bg-[#C9C9C3] hover:text-[#20252B] border-l border-[#C9C9C3] transition-colors cursor-pointer"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {/* TAB 1: DIAGNOSTICS */}
              {inspectorTab === 'diagnostics' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono text-[#555C62]">
                    <span>Sim Time: {simulation.simTimeNs} ns</span>
                    <span>Nets: {simulation.netCount}</span>
                  </div>

                  {simulation.diagnostics.length === 0 ? (
                    <div className="bg-[#F1F0EB] border border-[#587965]/40 rounded p-3 flex items-start gap-2.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-[#587965] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-[#20252B]">Electrical Checks Nominal</div>
                        <div className="text-[#555C62] mt-0.5">
                          All placed ICs have valid +5V/GND rails and no bus conflicts detected.
                        </div>
                      </div>
                    </div>
                  ) : (
                    simulation.diagnostics.map((d) => (
                      <div
                        key={d.id}
                        className={`bg-[#F1F0EB] border rounded p-2.5 flex items-start gap-2 text-xs ${
                          d.severity === 'error'
                            ? 'border-[#B83A32]'
                            : d.severity === 'warning'
                            ? 'border-[#BD8B43]'
                            : 'border-[#C9C9C3]'
                        }`}
                      >
                        {d.severity === 'error' || d.severity === 'warning' ? (
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              d.severity === 'error' ? 'text-[#B83A32]' : 'text-[#BD8B43]'
                            }`}
                          />
                        ) : (
                          <Info className="w-4 h-4 text-[#456A83] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-[#20252B]">{d.title}</div>
                          <div className="text-[#555C62] mt-0.5 leading-snug">{d.detail}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: PLACED ICs & PIN STATES + 6116 MEMORY INSPECTOR */}
              {inspectorTab === 'ic' && (
                <div className="space-y-3">
                  {circuit.placedICs.length === 0 ? (
                    <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded p-4 text-center text-xs text-[#747C82]">
                      No ICs installed. Select an IC in the toolbar above and insert it into ZIF-1..4
                      (14/16-pin) or ZIF-5 (24-pin RAM).
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {circuit.placedICs.map((ic) => {
                          const rt = simulation.icStates[ic.instanceId];
                          const loc =
                            ic.placement.kind === 'zif'
                              ? ic.placement.socketId
                              : `Col ${ic.placement.startCol}`;
                          const active = inspectedIC?.instanceId === ic.instanceId;
                          return (
                            <div
                              key={ic.instanceId}
                              className={`p-2.5 rounded border flex items-center justify-between gap-2 text-xs ${
                                active
                                  ? 'bg-[#303840] text-[#F1F0EB] border-[#20252B]'
                                  : 'bg-[#F1F0EB] text-[#20252B] border-[#C9C9C3]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  useLabStore.getState().setSelectedICInstanceId(ic.instanceId)
                                }
                                className="text-left flex-1 min-w-0 cursor-pointer"
                              >
                                <div className="font-mono font-semibold flex items-center gap-1.5">
                                  <Cpu className="w-3.5 h-3.5 shrink-0" />
                                  {ic.partNumber} ({loc})
                                </div>
                                <div
                                  className={`text-[11px] font-mono ${
                                    active ? 'text-[#A5ACB2]' : 'text-[#747C82]'
                                  }`}
                                >
                                  {rt?.powered ? 'Powered (+5V/GND OK)' : 'Unpowered'}
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${ic.partNumber}`}
                                onClick={() => removeIC(ic.instanceId)}
                                className="p-1 text-[#B83A32] hover:bg-[#B83A32]/10 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {inspectedIC && inspectedICDef && (
                        <>
                          <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded overflow-hidden">
                            <div className="px-3 py-2 bg-[#DAD9D3] border-b border-[#C9C9C3] text-xs font-mono font-semibold">
                              {inspectedICDef.partNumber} Internal Logic Structure
                            </div>
                            <div className="p-2">
                              <ICInternalDiagram
                                ic={inspectedICDef}
                                pinStates={inspectedICRt?.pinStates}
                                compact
                              />
                            </div>
                          </div>

                          <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded overflow-hidden">
                            <div className="px-3 py-2 bg-[#DAD9D3] border-b border-[#C9C9C3] text-xs font-mono font-semibold">
                              {inspectedICDef.partNumber} Live Pin States
                            </div>
                            <div className="max-h-52 overflow-y-auto divide-y divide-[#E5E5E1]">
                              {inspectedICDef.pins.map((pin) => {
                                const lvl = inspectedICRt?.pinStates[pin.pin] ?? 'Z';
                                return (
                                  <div
                                    key={pin.pin}
                                    className="px-3 py-1 flex items-center justify-between text-[11px] font-mono"
                                  >
                                    <span>
                                      {pin.pin}. {pin.name}{' '}
                                      <span className="text-[10px] text-[#747C82]">
                                        ({formatDirectionTag(pin.direction)})
                                      </span>
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-semibold ${
                                        lvl === 1
                                          ? 'bg-[#587965]/20 text-[#3B5746]'
                                          : lvl === 0
                                          ? 'bg-[#20252B]/10 text-[#20252B]'
                                          : lvl === 'X'
                                          ? 'bg-[#BD8B43]/20 text-[#8A6124]'
                                          : 'text-[#747C82]'
                                      }`}
                                    >
                                      {String(lvl)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      {/* 6116 Memory Inspector */}
                      {inspectedIC?.partNumber === '6116' && inspectedICRt?.internalMemory && (
                        <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded overflow-hidden">
                          <div className="px-3 py-2 bg-[#DAD9D3] border-b border-[#C9C9C3] text-xs font-mono font-semibold">
                            6116 SRAM Contents (0x00–0x1F)
                          </div>
                          <div className="p-2 font-mono text-[11px] grid grid-cols-4 gap-1">
                            {Array.from({ length: 32 }).map((_, addr) => {
                              const val = inspectedICRt.internalMemory![addr] ?? 0;
                              return (
                                <div
                                  key={addr}
                                  className={`px-1.5 py-0.5 rounded border ${
                                    val !== 0
                                      ? 'bg-[#456A83]/15 border-[#456A83] font-semibold'
                                      : 'bg-white border-[#E5E5E1] text-[#747C82]'
                                  }`}
                                >
                                  {addr.toString(16).padStart(2, '0').toUpperCase()}:
                                  {val.toString(16).padStart(2, '0').toUpperCase()}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: WIRES LIST WITH MULTI-SELECT & CONNECTION CLASSIFICATION */}
              {inspectorTab === 'wires' && (
                <div className="space-y-2.5">
                  {circuit.wires.length === 0 ? (
                    <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded p-4 text-center text-xs text-[#747C82]">
                      Click any circular terminal socket on the trainer, then click a second
                      terminal to route a patch cord. You can also drag a selection box on the
                      board to select and delete multiple wires at once.
                    </div>
                  ) : (
                    <>
                      {/* Batch Selection & Multi-Delete Toolbar */}
                      <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded p-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedWireIds(circuit.wires.map((w) => w.id))}
                            className="px-2 py-0.5 rounded bg-[#E5E5E1] border border-[#B8B8B1] text-[#20252B] hover:border-[#456A83] cursor-pointer"
                          >
                            Select All ({circuit.wires.length})
                          </button>
                          {selectedWireIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedWireIds([])}
                              className="px-2 py-0.5 rounded bg-[#E5E5E1] border border-[#B8B8B1] text-[#555C62] hover:text-[#20252B] cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          data-testid="inspector-delete-selected-wires"
                          disabled={selectedWireIds.length === 0}
                          onClick={() => removeWires(selectedWireIds)}
                          className="px-2 py-0.5 rounded bg-[#B83A32] text-white font-semibold hover:bg-[#9E2F28] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Delete Selected ({selectedWireIds.length})
                        </button>
                      </div>

                      <div className="text-[10px] font-mono text-[#555C62] leading-snug">
                        Tip: Drag a box across patch cords on the trainer panel (or Shift+Click) to
                        select multiple wires and press Delete.
                      </div>

                      {circuit.wires.map((w) => {
                        const fromLabel = formatTerminalDisplay(w.from, circuit.placedICs);
                        const toLabel = formatTerminalDisplay(w.to, circuit.placedICs);
                        const isChecked =
                          selectedWireIds.includes(w.id) || selectedWireId === w.id;

                        return (
                          <div
                            key={w.id}
                            className={`rounded border px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs font-mono transition-colors ${
                              isChecked
                                ? 'bg-[#456A83]/15 border-[#456A83]'
                                : 'bg-[#F1F0EB] border-[#C9C9C3]'
                            }`}
                          >
                            <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectedWireId(w.id)}
                                aria-label={`Select wire ${fromLabel} to ${toLabel}`}
                                className="accent-[#456A83] cursor-pointer"
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: WIRE_COLOR_HEX[w.color].stroke }}
                              />
                              <span
                                className="text-[11px] text-[#20252B] font-semibold truncate"
                                title={`${fromLabel} → ${toLabel}`}
                              >
                                {fromLabel} → {toLabel}
                              </span>
                            </label>
                            <button
                              type="button"
                              aria-label={`Disconnect ${w.from} to ${w.to}`}
                              onClick={() => removeWire(w.id)}
                              className="p-1 text-[#747C82] hover:text-[#B83A32] shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: CLOCK & PULSE PARAMETERS */}
              {inspectorTab === 'clock' && (
                <div className="space-y-4">
                  <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded p-3 space-y-3">
                    <div className="text-xs font-semibold text-[#20252B]">
                      Automatic Clock Parameters
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <label htmlFor="clk-freq">Frequency</label>
                        <span>{circuit.clock.frequencyHz.toFixed(1)} Hz</span>
                      </div>
                      <input
                        id="clk-freq"
                        type="range"
                        min={0.5}
                        max={15}
                        step={0.5}
                        value={circuit.clock.frequencyHz}
                        onChange={(e) => setClockFrequency(Number(e.target.value))}
                        className="w-full accent-[#456A83]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <label htmlFor="clk-duty">Duty Cycle</label>
                        <span>{circuit.clock.dutyCyclePercent}%</span>
                      </div>
                      <input
                        id="clk-duty"
                        type="range"
                        min={10}
                        max={90}
                        step={5}
                        value={circuit.clock.dutyCyclePercent}
                        onChange={(e) => setClockDutyCycle(Number(e.target.value))}
                        className="w-full accent-[#456A83]"
                      />
                    </div>
                  </div>

                  <div className="bg-[#F1F0EB] border border-[#C9C9C3] rounded p-3 space-y-3">
                    <div className="text-xs font-semibold text-[#20252B]">
                      Auxiliary Pulse Generator
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <label htmlFor="pulse-freq">Frequency</label>
                        <span>{circuit.pulse.frequencyHz.toFixed(1)} Hz</span>
                      </div>
                      <input
                        id="pulse-freq"
                        type="range"
                        min={0.5}
                        max={20}
                        step={0.5}
                        value={circuit.pulse.frequencyHz}
                        onChange={(e) => setPulseFrequency(Number(e.target.value))}
                        className="w-full accent-[#456A83]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <label htmlFor="pulse-duty">Duty Cycle</label>
                        <span>{circuit.pulse.dutyCyclePercent}%</span>
                      </div>
                      <input
                        id="pulse-duty"
                        type="range"
                        min={10}
                        max={90}
                        step={5}
                        value={circuit.pulse.dutyCyclePercent}
                        onChange={(e) => setPulseDutyCycle(Number(e.target.value))}
                        className="w-full accent-[#456A83]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Reset Caution Confirmation Modal Popup */}
      {showResetConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-caution-title"
          data-testid="reset-confirm-modal"
          className="fixed inset-0 z-50 bg-[#181C20]/65 flex items-center justify-center p-4"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div
            className="bg-[#F1F0EB] border-2 border-[#303840] rounded-md shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#303840] text-[#F1F0EB] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#E8A45C]" />
                <h2 id="reset-caution-title" className="text-sm font-semibold font-mono">
                  CAUTION — RESET TRAINER KIT
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close reset confirmation popup"
                onClick={() => setShowResetConfirmModal(false)}
                className="text-[#A5ACB2] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs text-[#303840]">
              <p className="leading-relaxed">
                Are you sure you want to reset the <strong>DT-1004 Digital Trainer Kit</strong>? This
                action will clear all inserted ICs from sockets <strong>ZIF-1..ZIF-5</strong>,
                disconnect all patch cords, and return all input switches and clock generators to
                their default laboratory state.
              </p>
              <div className="bg-[#E5E5E1] border border-[#C9C9C3] rounded px-3 py-2 font-mono text-[11px] flex items-center justify-between">
                <span>Placed ICs: {circuit.placedICs.length}</span>
                <span>Patch Cords: {circuit.wires.length}</span>
              </div>
              <p className="text-[11px] text-[#555C62]">
                Tip: Even after confirming a reset, you can press <strong>Ctrl+Z (Undo)</strong> if
                you need to restore your previous wiring.
              </p>
            </div>

            <div className="bg-[#E5E5E1] border-t border-[#C9C9C3] px-4 py-2.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-medium bg-[#F1F0EB] border border-[#B8B8B1] rounded text-[#20252B] hover:bg-[#DAD9D3] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-reset-btn"
                onClick={() => {
                  resetCircuit();
                  setShowResetConfirmModal(false);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#B83A32] text-white rounded hover:bg-[#9E2F28] cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
