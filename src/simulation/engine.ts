import { getICDefinition } from '../ic-library';
import {
  CircuitSnapshot,
  DiagnosticIssue,
  ICInstanceRuntimeState,
  LogicLevel,
  SevenSegmentDigitState,
  SimulationSnapshot,
  TerminalId,
} from '../types/circuit';
import { evaluateIC } from './icEvaluators';
import { buildNetlist, getICPinTerminalId } from './netlist';

function resolveDrivers(drivers: LogicLevel[]): LogicLevel {
  let has0 = false;
  let has1 = false;
  let hasX = false;
  for (const d of drivers) {
    if (d === 0) has0 = true;
    else if (d === 1) has1 = true;
    else if (d === 'X') hasX = true;
  }
  if ((has0 && has1) || hasX) return 'X';
  if (has0) return 0;
  if (has1) return 1;
  return 'Z';
}

function createEmptyDisplayState(caLevel: LogicLevel = 'Z'): SevenSegmentDigitState {
  return {
    caLevel,
    segments: {
      a: false,
      b: false,
      c: false,
      d: false,
      e: false,
      f: false,
      g: false,
      dp: false,
    },
    pinLevels: {
      a: 'Z',
      b: 'Z',
      c: 'Z',
      d: 'Z',
      e: 'Z',
      f: 'Z',
      g: 'Z',
      dp: 'Z',
      CA: caLevel,
    },
  };
}

/**
 * Stateful Digital Simulation Engine instance.
 * Preserves sequential flip-flop, counter, shift-register, and 6116 SRAM states
 * across simulation steps while supporting pure event-driven combinational propagation.
 */
export class DigitalSimulationEngine {
  private simTimeNs = 0;
  private icRuntime = new Map<string, ICInstanceRuntimeState>();
  private lastICDriven = new Map<string, Record<number, LogicLevel>>();

  public resetRuntime(): void {
    this.simTimeNs = 0;
    this.icRuntime.clear();
    this.lastICDriven.clear();
  }

  public getRuntimeStates(): Record<string, ICInstanceRuntimeState> {
    const out: Record<string, ICInstanceRuntimeState> = {};
    for (const [k, v] of this.icRuntime.entries()) {
      out[k] = v;
    }
    return out;
  }

  public seedMemory(instanceId: string, memory: Uint8Array): void {
    const rt = this.icRuntime.get(instanceId);
    if (rt) {
      rt.internalMemory = new Uint8Array(memory);
    }
  }

  public step(circuit: CircuitSnapshot): SimulationSnapshot {
    const netlist = buildNetlist(circuit.wires);
    const diagnostics: DiagnosticIssue[] = [];

    // Reconcile IC runtime map with currently placed ICs
    const activeIds = new Set(circuit.placedICs.map((ic) => ic.instanceId));
    for (const key of this.icRuntime.keys()) {
      if (!activeIds.has(key)) {
        this.icRuntime.delete(key);
        this.lastICDriven.delete(key);
      }
    }
    for (const placed of circuit.placedICs) {
      if (!this.icRuntime.has(placed.instanceId)) {
        const def = getICDefinition(placed.partNumber);
        this.icRuntime.set(placed.instanceId, {
          instanceId: placed.instanceId,
          partNumber: placed.partNumber,
          powered: false,
          hasVcc: false,
          hasGnd: false,
          pinStates: {},
          internalMemory: placed.partNumber === '6116' ? new Uint8Array(2048) : undefined,
          flipFlopState:
            def?.category === 'sequential' ? {} : undefined,
          prevClockState:
            def?.category === 'sequential' ? {} : undefined,
        });
      }
    }

    if (!circuit.powerOn) {
      diagnostics.push({
        id: 'power-off',
        severity: 'info',
        code: 'POWER_OFF',
        title: 'Main Trainer Power OFF',
        detail: 'Switch on the main trainer POWER toggle to energize +5V supply rails, switches, clocks, and ICs.',
      });
    }

    // Trainer fixed source drivers
    const fixedNetDrivers = new Map<string, LogicLevel[]>();
    const addFixedDriver = (terminal: TerminalId, val: LogicLevel) => {
      const netId = netlist.getNetId(terminal);
      let arr = fixedNetDrivers.get(netId);
      if (!arr) {
        arr = [];
        fixedNetDrivers.set(netId, arr);
      }
      arr.push(val);
    };

    if (circuit.powerOn) {
      addFixedDriver('PWR:+5V:0', 1);
      addFixedDriver('PWR:GND:0', 0);

      for (let i = 0; i < 16; i++) {
        addFixedDriver(`SW:${i}`, circuit.switches[i] ?? 0);
      }
      addFixedDriver('CLK:OUT', circuit.clock.level);
      addFixedDriver('CLK:OUT_N', circuit.clock.level === 1 ? 0 : 1);
      addFixedDriver('PULSE:OUT', circuit.pulse.level);
    }

    // Detect direct +5V to GND short before evaluating ICs
    if (circuit.powerOn) {
      const vccNet = netlist.getNetId('PWR:+5V:0');
      const gndNet = netlist.getNetId('PWR:GND:0');
      if (vccNet === gndNet) {
        diagnostics.push({
          id: 'power-short',
          severity: 'error',
          code: 'POWER_SHORT',
          title: 'Direct +5V to GND Short Circuit',
          detail: 'The +5V supply rail is electrically shorted to GND. Remove the shorting wire immediately.',
        });
      }
    }

    // Resolve power status for each placed IC using trainer supply nets
    const vccNetId = netlist.getNetId('PWR:+5V:0');
    const gndNetId = netlist.getNetId('PWR:GND:0');

    for (const placed of circuit.placedICs) {
      const def = getICDefinition(placed.partNumber);
      const rt = this.icRuntime.get(placed.instanceId)!;
      if (!def) continue;

      let hasVcc = false;
      let hasGnd = false;
      let reversed = false;

      if (circuit.powerOn && vccNetId !== gndNetId) {
        for (const pin of def.pins) {
          const term = getICPinTerminalId(placed, pin.pin);
          if (!term) continue;
          const pinNet = netlist.getNetId(term);
          if (pin.direction === 'power-vcc') {
            if (pinNet === vccNetId) hasVcc = true;
            if (pinNet === gndNetId) reversed = true;
          } else if (pin.direction === 'power-gnd') {
            if (pinNet === gndNetId) hasGnd = true;
            if (pinNet === vccNetId) reversed = true;
          }
        }
      }

      rt.hasVcc = hasVcc;
      rt.hasGnd = hasGnd;
      rt.powered = circuit.powerOn && hasVcc && hasGnd && !reversed && vccNetId !== gndNetId;

      if (circuit.powerOn) {
        if (reversed) {
          diagnostics.push({
            id: `rev-${placed.instanceId}`,
            severity: 'error',
            code: 'POWER_REVERSED',
            title: `${placed.partNumber}: Reversed Power Polarity`,
            detail: `VCC and GND pins are connected to opposite polarity on ${placed.partNumber}. Check datasheet power pin numbers.`,
            targetId: placed.instanceId,
          });
        } else {
          if (!hasVcc) {
            const vccPins = def.pins
              .filter((p) => p.direction === 'power-vcc')
              .map((p) => `Pin ${p.pin} (${p.name})`)
              .join(', ');
            diagnostics.push({
              id: `novcc-${placed.instanceId}`,
              severity: 'error',
              code: 'MISSING_VCC',
              title: `${placed.partNumber}: Missing +5V Supply`,
              detail: `Connect +5V to ${vccPins} on ${placed.partNumber}.`,
              targetId: placed.instanceId,
            });
          }
          if (!hasGnd) {
            const gndPins = def.pins
              .filter((p) => p.direction === 'power-gnd')
              .map((p) => `Pin ${p.pin} (${p.name})`)
              .join(', ');
            diagnostics.push({
              id: `nognd-${placed.instanceId}`,
              severity: 'error',
              code: 'MISSING_GND',
              title: `${placed.partNumber}: Missing Ground Connection`,
              detail: `Connect GND to ${gndPins} on ${placed.partNumber}.`,
              targetId: placed.instanceId,
            });
          }
        }
      }
    }

    // Track per-IC driven pin states across delta cycles (seeded from previous step's steady outputs)
    const icDrivenByInstance = new Map<string, Record<number, LogicLevel>>();
    for (const placed of circuit.placedICs) {
      const prev = this.lastICDriven.get(placed.instanceId);
      if (prev) {
        icDrivenByInstance.set(placed.instanceId, { ...prev });
      }
    }
    const netValues = new Map<string, LogicLevel>();

    const recomputeNets = () => {
      netValues.clear();
      const allNetDrivers = new Map<string, LogicLevel[]>();

      for (const [netId, list] of fixedNetDrivers.entries()) {
        allNetDrivers.set(netId, [...list]);
      }

      for (const placed of circuit.placedICs) {
        const driven = icDrivenByInstance.get(placed.instanceId);
        if (!driven) continue;
        for (const [pinStr, val] of Object.entries(driven)) {
          if (val === 'Z') continue;
          const term = getICPinTerminalId(placed, Number(pinStr));
          if (!term) continue;
          const netId = netlist.getNetId(term);
          let arr = allNetDrivers.get(netId);
          if (!arr) {
            arr = [];
            allNetDrivers.set(netId, arr);
          }
          arr.push(val);
        }
      }

      for (const [netId, drivers] of allNetDrivers.entries()) {
        netValues.set(netId, resolveDrivers(drivers));
      }
    };

    // Initial net state from fixed sources
    recomputeNets();

    // Iterative event-driven propagation (combinational settling + sequential edge commit on cycle 0)
    const MAX_DELTA_CYCLES = 16;
    let settled = false;
    let deltaCount = 0;

    for (let cycle = 0; cycle < MAX_DELTA_CYCLES; cycle++) {
      deltaCount = cycle + 1;
      let changed = false;

      for (const placed of circuit.placedICs) {
        const def = getICDefinition(placed.partNumber);
        const rt = this.icRuntime.get(placed.instanceId)!;
        if (!def) continue;

        const pinInputs: Record<number, LogicLevel> = {};
        for (const pin of def.pins) {
          const term = getICPinTerminalId(placed, pin.pin);
          if (!term) continue;
          const netId = netlist.getNetId(term);
          pinInputs[pin.pin] = netValues.get(netId) ?? 'Z';
        }

        const evalRes = evaluateIC({
          partNumber: placed.partNumber,
          pinInputs,
          runtime: rt,
          // Edge-triggered detectors guard against re-triggering via prevClockState
          commitSequential: true,
        });

        const prevDriven = icDrivenByInstance.get(placed.instanceId) ?? {};
        const nextDriven = evalRes.drivenPins;
        const allPinKeys = new Set([
          ...Object.keys(prevDriven),
          ...Object.keys(nextDriven),
        ]);
        for (const k of allPinKeys) {
          const pn = Number(k);
          if ((prevDriven[pn] ?? 'Z') !== (nextDriven[pn] ?? 'Z')) {
            changed = true;
            break;
          }
        }
        icDrivenByInstance.set(placed.instanceId, nextDriven);
      }

      recomputeNets();
      if (!changed) {
        settled = true;
        break;
      }
    }

    // Persist steady-state driven IC outputs for next step's pre-edge reference
    this.lastICDriven.clear();
    for (const [id, driven] of icDrivenByInstance.entries()) {
      this.lastICDriven.set(id, { ...driven });
    }

    if (circuit.placedICs.length > 0 && circuit.powerOn) {
      const maxDelay = Math.max(
        ...circuit.placedICs.map((p) => getICDefinition(p.partNumber)?.propagationDelayNs ?? 10)
      );
      this.simTimeNs += maxDelay * deltaCount;
    }

    if (!settled) {
      diagnostics.push({
        id: 'osc-loop',
        severity: 'warning',
        code: 'OSCILLATION_DETECTED',
        title: 'Combinational Feedback Oscillation',
        detail: 'Signals did not stabilize within 16 delta cycles (ring oscillator or feedback loop detected).',
      });
    }

    // Update final pinStates on IC runtime & check floating inputs / driver conflicts
    const netDriversMap = new Map<string, Array<{ label: string; level: LogicLevel }>>();
    for (const [netId, list] of fixedNetDrivers.entries()) {
      netDriversMap.set(
        netId,
        list.map((level) => ({ label: 'Trainer Source', level }))
      );
    }
    for (const placed of circuit.placedICs) {
      const def = getICDefinition(placed.partNumber);
      const rt = this.icRuntime.get(placed.instanceId)!;
      const driven = icDrivenByInstance.get(placed.instanceId) ?? {};
      if (!def) continue;

      let hasAnySignalWire = false;
      const floatingInputNames: string[] = [];

      for (const pin of def.pins) {
        const term = getICPinTerminalId(placed, pin.pin);
        if (!term) continue;
        const netId = netlist.getNetId(term);
        const val = netValues.get(netId) ?? 'Z';
        rt.pinStates[pin.pin] = val;

        const netTerminals = netlist.nets.get(netId) ?? [];
        if (
          pin.direction !== 'power-vcc' &&
          pin.direction !== 'power-gnd' &&
          pin.direction !== 'nc' &&
          (netTerminals.length > 1 || circuit.wires.some((w) => w.from === term || w.to === term))
        ) {
          hasAnySignalWire = true;
        }

        const outVal = driven[pin.pin];
        if (outVal !== undefined && outVal !== 'Z') {
          let arr = netDriversMap.get(netId);
          if (!arr) {
            arr = [];
            netDriversMap.set(netId, arr);
          }
          arr.push({ label: `${placed.partNumber} Pin ${pin.pin} (${pin.name})`, level: outVal });
        }

        if (pin.direction === 'input' && val === 'Z') {
          // Only report floating input if connected to something or on CMOS or if other pins on IC are wired
          if (def.family === 'CMOS' || hasAnySignalWire) {
            floatingInputNames.push(`${pin.pin}:${pin.name}`);
          }
        }
      }

      if (circuit.powerOn && rt.powered && !hasAnySignalWire) {
        diagnostics.push({
          id: `unconn-${placed.instanceId}`,
          severity: 'info',
          code: 'UNCONNECTED_IC',
          title: `${placed.partNumber}: No Signal Connections`,
          detail: `${placed.partNumber} is powered but has no input or output signal wires connected.`,
          targetId: placed.instanceId,
        });
      } else if (circuit.powerOn && rt.powered && floatingInputNames.length > 0) {
        const isCmos = def.family === 'CMOS';
        diagnostics.push({
          id: `float-${placed.instanceId}`,
          severity: isCmos ? 'warning' : 'info',
          code: isCmos ? 'CMOS_FLOATING_INPUT' : 'FLOATING_INPUT',
          title: `${placed.partNumber}: Floating ${isCmos ? 'CMOS ' : ''}Input${floatingInputNames.length > 1 ? 's' : ''}`,
          detail: `Unconnected input pin(s): ${floatingInputNames.slice(0, 6).join(', ')}${floatingInputNames.length > 6 ? ` (+${floatingInputNames.length - 6} more)` : ''}. Tie unused inputs to +5V or GND.`,
          targetId: placed.instanceId,
        });
      }
    }

    // Check driver conflicts (0 vs 1 on same net)
    for (const [netId, drivers] of netDriversMap.entries()) {
      const has0 = drivers.some((d) => d.level === 0);
      const has1 = drivers.some((d) => d.level === 1);
      if (has0 && has1 && netId !== netlist.getNetId('PWR:+5V:0')) {
        diagnostics.push({
          id: `conflict-${netId}`,
          severity: 'error',
          code: 'DRIVER_CONFLICT',
          title: 'Bus / Output Driver Conflict',
          detail: `Multiple drivers are driving conflicting 0 and 1 states onto the same net (${drivers.map((d) => `${d.label}=${d.level}`).join(', ')}).`,
        });
      }
    }

    // Build terminalStates lookup for UI inspection
    const terminalStates: Record<TerminalId, LogicLevel> = {};
    for (const t of netlist.allTerminals) {
      const netId = netlist.getNetId(t);
      terminalStates[t] = netValues.get(netId) ?? 'Z';
    }

    const ledStates: LogicLevel[] = [];
    for (let i = 0; i < 16; i++) {
      ledStates.push(terminalStates[`LED:${i}`] ?? 'Z');
    }

    // Compute onboard LTS542 Common-Anode 7-segment display states
    const evalDisplay = (dispId: 'DISP1' | 'DISP2'): SevenSegmentDigitState => {
      const caLevel = terminalStates[`${dispId}:CA`] ?? 'Z';
      const state = createEmptyDisplayState(caLevel);
      const segKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
      let anyActiveHighWhenNoCA = false;

      for (const s of segKeys) {
        const lvl = terminalStates[`${dispId}:${s}`] ?? 'Z';
        state.pinLevels[s] = lvl;
        // Common-anode LTS542: illuminates when CA == 1 (+5V) and segment cathode == 0 (LOW)
        if (circuit.powerOn && caLevel === 1 && lvl === 0) {
          state.segments[s] = true;
        }
        if (lvl !== 'Z' && caLevel !== 1) {
          anyActiveHighWhenNoCA = true;
        }
      }

      if (circuit.powerOn && anyActiveHighWhenNoCA) {
        diagnostics.push({
          id: `disp-ca-${dispId}`,
          severity: 'warning',
          code: 'DISPLAY_POLARITY',
          title: `${dispId}: Missing Common Anode (+5V)`,
          detail: `${dispId} has segment wires connected, but ${dispId}:CA is not connected to +5V. Connect CA to +5V for common-anode operation.`,
          targetId: dispId,
        });
      }
      return state;
    };

    return {
      simTimeNs: this.simTimeNs,
      powerOn: circuit.powerOn,
      terminalStates,
      ledStates,
      displays: {
        DISP1: evalDisplay('DISP1'),
        DISP2: evalDisplay('DISP2'),
      },
      icStates: this.getRuntimeStates(),
      diagnostics,
      netCount: netlist.nets.size,
    };
  }
}
