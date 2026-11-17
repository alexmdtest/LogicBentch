import test from 'node:test';
import assert from 'node:assert/strict';
import { DigitalSimulationEngine } from '../src/simulation/engine';
import { getDisplayedZifPinInfo } from '../src/simulation/netlist';
import { CircuitSnapshot, Wire } from '../src/types/circuit';

function baseCircuit(): CircuitSnapshot {
  return {
    powerOn: true,
    switches: Array(16).fill(0) as (0 | 1)[],
    clock: {
      mode: 'manual',
      autoRunning: false,
      frequencyHz: 1,
      dutyCyclePercent: 50,
      level: 0,
    },
    pulse: {
      running: false,
      frequencyHz: 2,
      dutyCyclePercent: 50,
      level: 0,
    },
    placedICs: [],
    wires: [],
  };
}

let wid = 1;
function wire(from: string, to: string, color: Wire['color'] = 'yellow'): Wire {
  return { id: `w_${wid++}`, from, to, color, kind: 'patch-cord' };
}

test('Test 1: 7400 Quad NAND gate verifies full truth table and power validation', () => {
  const engine = new DigitalSimulationEngine();
  const c = baseCircuit();
  c.placedICs = [{ instanceId: 'ic1', partNumber: '7400', placement: { kind: 'zif', socketId: 'ZIF1' } }];
  // 7400 in ZIF1: pin 14 -> ZIF1:16 (+5V), pin 7 -> ZIF1:7 (GND)
  c.wires = [
    wire('SW:0', 'ZIF1:1'),
    wire('SW:1', 'ZIF1:2'),
    wire('ZIF1:3', 'LED:0'),
  ];

  // Missing power -> output should be Z and diagnostics should report MISSING_VCC and MISSING_GND
  let snap = engine.step(c);
  assert.equal(snap.ledStates[0], 'Z');
  assert.ok(snap.diagnostics.some((d) => d.code === 'MISSING_VCC'));
  assert.ok(snap.diagnostics.some((d) => d.code === 'MISSING_GND'));

  // Connect VCC and GND
  c.wires.push(wire('PWR:+5V:0', 'ZIF1:16', 'red'), wire('PWR:GND:0', 'ZIF1:7', 'black'));

  const combos: Array<[0 | 1, 0 | 1, 0 | 1]> = [
    [0, 0, 1],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ];
  for (const [a, b, expected] of combos) {
    c.switches[0] = a;
    c.switches[1] = b;
    snap = engine.step(c);
    assert.equal(snap.ledStates[0], expected, `7400 NAND(${a},${b})`);
  }

  // Remove output wire -> LED returns to Z
  c.wires = c.wires.filter((w) => w.to !== 'LED:0');
  snap = engine.step(c);
  assert.equal(snap.ledStates[0], 'Z');
});

test('Test 2: Basic Logic Gates (7402 NOR, 7404 NOT, 7408 AND, 7410 3-NAND, 7420 4-NAND, 7427 3-NOR, 7432 OR, 7486 XOR, 4077 CMOS XNOR)', () => {
  // 7402 NOR (pin 1 is output, pins 2 & 3 inputs)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7402', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:2'),
      wire('SW:1', 'ZIF1:3'),
      wire('ZIF1:1', 'LED:0'),
    ];
    c.switches[0] = 0; c.switches[1] = 0;
    assert.equal(engine.step(c).ledStates[0], 1);
    c.switches[0] = 1; c.switches[1] = 0;
    assert.equal(engine.step(c).ledStates[0], 0);
  }

  // 7404 NOT
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7404', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'),
      wire('ZIF1:2', 'LED:0'),
    ];
    c.switches[0] = 0;
    assert.equal(engine.step(c).ledStates[0], 1);
    c.switches[0] = 1;
    assert.equal(engine.step(c).ledStates[0], 0);
  }

  // 7408 AND, 7432 OR, 7486 XOR
  for (const [part, table] of [
    ['7408', [0, 0, 0, 1]],
    ['7432', [0, 1, 1, 1]],
    ['7486', [0, 1, 1, 0]],
  ] as const) {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: part, placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'),
      wire('SW:1', 'ZIF1:2'),
      wire('ZIF1:3', 'LED:0'),
    ];
    for (let i = 0; i < 4; i++) {
      c.switches[0] = (i >> 1) as 0 | 1;
      c.switches[1] = (i & 1) as 0 | 1;
      assert.equal(engine.step(c).ledStates[0], table[i], `${part} combo ${i}`);
    }
  }

  // 7410 3-input NAND (Gate 1: pins 1,2,13 -> 12; in ZIF1 pin 13 is ZIF1:15, pin 12 is ZIF1:14)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7410', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'),
      wire('SW:1', 'ZIF1:2'),
      wire('SW:2', 'ZIF1:15'),
      wire('ZIF1:14', 'LED:0'),
    ];
    c.switches[0] = 1; c.switches[1] = 1; c.switches[2] = 0;
    assert.equal(engine.step(c).ledStates[0], 1);
    c.switches[2] = 1;
    assert.equal(engine.step(c).ledStates[0], 0);
  }

  // 7420 4-input NAND (Gate 1: 1,2,4,5 -> 6)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7420', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'),
      wire('SW:1', 'ZIF1:2'),
      wire('SW:2', 'ZIF1:4'),
      wire('SW:3', 'ZIF1:5'),
      wire('ZIF1:6', 'LED:0'),
    ];
    c.switches[0] = 1; c.switches[1] = 1; c.switches[2] = 1; c.switches[3] = 1;
    assert.equal(engine.step(c).ledStates[0], 0);
    c.switches[3] = 0;
    assert.equal(engine.step(c).ledStates[0], 1);
  }

  // 7427 3-input NOR (Gate 1: 1,2,13 -> 12 -> ZIF1:14)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7427', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'),
      wire('SW:1', 'ZIF1:2'),
      wire('SW:2', 'ZIF1:15'),
      wire('ZIF1:14', 'LED:0'),
    ];
    c.switches[0] = 0; c.switches[1] = 0; c.switches[2] = 0;
    assert.equal(engine.step(c).ledStates[0], 1);
    c.switches[2] = 1;
    assert.equal(engine.step(c).ledStates[0], 0);
  }

  // 4077 CMOS XNOR (Gate 2: pins 5,6 -> 4)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '4077', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:5'),
      wire('SW:1', 'ZIF1:6'),
      wire('ZIF1:4', 'LED:0'),
    ];
    c.switches[0] = 0; c.switches[1] = 0;
    const snap = engine.step(c);
    assert.equal(snap.ledStates[0], 1);
    assert.ok(snap.diagnostics.some((d) => d.code === 'CMOS_FLOATING_INPUT'));
    c.switches[0] = 1; c.switches[1] = 0;
    assert.equal(engine.step(c).ledStates[0], 0);
  }
});

test('Test 3: Combinational ICs (7483, 7485, 74138, 74139, 74148, 74151, 74153)', () => {
  // 7483 4-bit Full Adder (non-standard VCC=5, GND=12): 0101 (5) + 0111 (7) + Cin(1) = 13 (1101, C4=0)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7483', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:5', 'red'),
      wire('PWR:GND:0', 'ZIF1:12', 'black'),
      // A = SW0..3 (A1=10, A2=8, A3=3, A4=1)
      wire('SW:0', 'ZIF1:10'), wire('SW:1', 'ZIF1:8'), wire('SW:2', 'ZIF1:3'), wire('SW:3', 'ZIF1:1'),
      // B = SW4..7 (B1=11, B2=7, B3=4, B4=16)
      wire('SW:4', 'ZIF1:11'), wire('SW:5', 'ZIF1:7'), wire('SW:6', 'ZIF1:4'), wire('SW:7', 'ZIF1:16'),
      wire('SW:8', 'ZIF1:13'), // C0
      // Sum -> LED0..3 (S1=9, S2=6, S3=2, S4=15), C4=14 -> LED4
      wire('ZIF1:9', 'LED:0'), wire('ZIF1:6', 'LED:1'), wire('ZIF1:2', 'LED:2'), wire('ZIF1:15', 'LED:3'),
      wire('ZIF1:14', 'LED:4'),
    ];
    // A = 5 (0101)
    c.switches[0] = 1; c.switches[1] = 0; c.switches[2] = 1; c.switches[3] = 0;
    // B = 7 (0111)
    c.switches[4] = 1; c.switches[5] = 1; c.switches[6] = 1; c.switches[7] = 0;
    // Cin = 1 -> 13 (1101, C4=0)
    c.switches[8] = 1;
    let snap = engine.step(c);
    assert.deepEqual(snap.ledStates.slice(0, 5), [1, 0, 1, 1, 0]);

    // A = 15 + B = 1 + Cin = 0 -> 16 (0000, C4=1)
    c.switches[0] = 1; c.switches[1] = 1; c.switches[2] = 1; c.switches[3] = 1;
    c.switches[4] = 1; c.switches[5] = 0; c.switches[6] = 0; c.switches[7] = 0;
    c.switches[8] = 0;
    snap = engine.step(c);
    assert.deepEqual(snap.ledStates.slice(0, 5), [0, 0, 0, 0, 1]);
  }

  // 7485 Magnitude Comparator
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7485', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:2', 'black'), // IA<B = 0
      wire('PWR:+5V:1', 'ZIF1:3', 'red'),  // IA=B = 1
      wire('PWR:GND:2', 'ZIF1:4', 'black'), // IA>B = 0
      wire('SW:0', 'ZIF1:10'), wire('SW:1', 'ZIF1:12'), wire('SW:2', 'ZIF1:13'), wire('SW:3', 'ZIF1:15'),
      wire('SW:4', 'ZIF1:9'), wire('SW:5', 'ZIF1:11'), wire('SW:6', 'ZIF1:14'), wire('SW:7', 'ZIF1:1'),
      wire('ZIF1:5', 'LED:0'), wire('ZIF1:6', 'LED:1'), wire('ZIF1:7', 'LED:2'),
    ];
    // A = 6, B = 6 -> OA=B = 1
    c.switches[1] = 1; c.switches[2] = 1;
    c.switches[5] = 1; c.switches[6] = 1;
    assert.deepEqual(engine.step(c).ledStates.slice(0, 3), [0, 1, 0]);
    // A = 7, B = 6 -> OA>B = 1
    c.switches[0] = 1;
    assert.deepEqual(engine.step(c).ledStates.slice(0, 3), [1, 0, 0]);
  }

  // 74138 3-to-8 Decoder
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74138', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:4', 'black'), // ~G2A
      wire('PWR:GND:2', 'ZIF1:5', 'black'), // ~G2B
      wire('PWR:+5V:1', 'ZIF1:6', 'red'),  // G1
      wire('SW:0', 'ZIF1:1'), wire('SW:1', 'ZIF1:2'), wire('SW:2', 'ZIF1:3'),
      wire('ZIF1:15', 'LED:0'), wire('ZIF1:14', 'LED:1'), wire('ZIF1:13', 'LED:2'), wire('ZIF1:12', 'LED:3'),
      wire('ZIF1:11', 'LED:4'), wire('ZIF1:10', 'LED:5'), wire('ZIF1:9', 'LED:6'), wire('ZIF1:7', 'LED:7'),
    ];
    // CBA = 101 (5) -> ~Y5 = 0
    c.switches[0] = 1; c.switches[1] = 0; c.switches[2] = 1;
    assert.deepEqual(engine.step(c).ledStates.slice(0, 8), [1, 1, 1, 1, 1, 0, 1, 1]);
  }

  // 74139 Dual 2-to-4 Decoder
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74139', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:1', 'black'), // ~1G
      wire('SW:0', 'ZIF1:2'), wire('SW:1', 'ZIF1:3'),
      wire('ZIF1:4', 'LED:0'), wire('ZIF1:5', 'LED:1'), wire('ZIF1:6', 'LED:2'), wire('ZIF1:7', 'LED:3'),
    ];
    c.switches[0] = 0; c.switches[1] = 1; // B=1, A=0 -> idx 2 -> ~Y2 = 0
    assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [1, 1, 0, 1]);
  }

  // 74148 8-to-3 Priority Encoder
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74148', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:5', 'black'), // ~EI = 0
      wire('SW:0', 'ZIF1:10'), wire('SW:1', 'ZIF1:11'), wire('SW:2', 'ZIF1:12'), wire('SW:3', 'ZIF1:13'),
      wire('SW:4', 'ZIF1:1'), wire('SW:5', 'ZIF1:2'), wire('SW:6', 'ZIF1:3'), wire('SW:7', 'ZIF1:4'),
      wire('ZIF1:6', 'LED:2'), wire('ZIF1:7', 'LED:1'), wire('ZIF1:9', 'LED:0'),
      wire('ZIF1:14', 'LED:3'), wire('ZIF1:15', 'LED:4'),
    ];
    for (let i = 0; i < 8; i++) c.switches[i] = 1;
    // Active input 5 (~I5 = 0) & input 2 (~I2 = 0) -> priority 5 (101) -> inverted ~A2..~A0 = 010
    c.switches[2] = 0;
    c.switches[5] = 0;
    const snap = engine.step(c);
    // LED0=~A0=0, LED1=~A1=1, LED2=~A2=0, LED3=~GS=0, LED4=~EO=1
    assert.deepEqual(snap.ledStates.slice(0, 5), [0, 1, 0, 0, 1]);
  }

  // 74151 8-to-1 Mux
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74151', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:7', 'black'), // ~G = 0
      wire('SW:0', 'ZIF1:11'), wire('SW:1', 'ZIF1:10'), wire('SW:2', 'ZIF1:9'), // A,B,C
      wire('SW:3', 'ZIF1:14'), // D5
      wire('ZIF1:5', 'LED:0'), wire('ZIF1:6', 'LED:1'),
    ];
    c.switches[0] = 1; c.switches[1] = 0; c.switches[2] = 1; // select 5
    c.switches[3] = 1; // D5 = 1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 2), [1, 0]);
  }

  // 74153 Dual 4-to-1 Mux
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74153', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:1', 'black'), // ~1G
      wire('SW:0', 'ZIF1:14'), wire('SW:1', 'ZIF1:2'), // A, B
      wire('SW:2', 'ZIF1:4'), // 1C2
      wire('ZIF1:7', 'LED:0'),
    ];
    c.switches[0] = 0; c.switches[1] = 1; // select 2
    c.switches[2] = 1;
    assert.equal(engine.step(c).ledStates[0], 1);
  }
});

test('Test 4: Sequential ICs (7474 pos-edge, 7476 neg-edge, 7490 decade counter, 74192 up/down, 7495 shift)', () => {
  // 7474 D Flip-Flop
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7474', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'), // ~CLR
      wire('SW:1', 'ZIF1:2'), // D
      wire('CLK:OUT', 'ZIF1:3'), // CLK
      wire('SW:2', 'ZIF1:4'), // ~PRE
      wire('ZIF1:5', 'LED:0'), wire('ZIF1:6', 'LED:1'),
    ];
    c.switches[0] = 1; c.switches[2] = 1; c.switches[1] = 1;
    c.clock.level = 0;
    assert.equal(engine.step(c).ledStates[0], 0);
    c.clock.level = 1; // rising edge captures D=1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 2), [1, 0]);
    // Clear active-low
    c.switches[0] = 0;
    assert.deepEqual(engine.step(c).ledStates.slice(0, 2), [0, 1]);
  }

  // 7476 JK Flip-Flop (VCC=5, GND=13, Negative-Edge)
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7476', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:5', 'red'),
      wire('PWR:GND:0', 'ZIF1:13', 'black'),
      wire('CLK:OUT', 'ZIF1:1'), // 1CLK
      wire('SW:0', 'ZIF1:2'), // ~1PRE
      wire('SW:1', 'ZIF1:3'), // ~1CLR
      wire('SW:2', 'ZIF1:4'), // 1J
      wire('SW:3', 'ZIF1:16'), // 1K
      wire('ZIF1:15', 'LED:0'), wire('ZIF1:14', 'LED:1'),
    ];
    c.switches[0] = 1; c.switches[1] = 1; c.switches[2] = 1; c.switches[3] = 1; // toggle mode
    c.clock.level = 0;
    assert.equal(engine.step(c).ledStates[0], 0);
    c.clock.level = 1; // rising edge must NOT toggle 7476
    assert.equal(engine.step(c).ledStates[0], 0);
    c.clock.level = 0; // falling edge toggles Q -> 1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 2), [1, 0]);
  }

  // 7490 Decade Counter (VCC=5, GND=10, external QA(12->ZIF1:14) -> CKB(1->ZIF1:1))
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7490', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:5', 'red'),
      wire('PWR:GND:0', 'ZIF1:12', 'black'), // IC pin 10 (GND) -> ZIF1:12
      wire('CLK:OUT', 'ZIF1:16'), // IC pin 14 (CKA) -> ZIF1:16
      wire('ZIF1:14', 'ZIF1:1'),  // IC pin 12 (QA) -> IC pin 1 (CKB)
      wire('SW:0', 'ZIF1:2'), wire('SW:1', 'ZIF1:3'), // R0(1), R0(2)
      wire('PWR:GND:1', 'ZIF1:6', 'black'), wire('PWR:GND:2', 'ZIF1:7', 'black'), // R9=0
      wire('ZIF1:14', 'LED:0'), // QA (pin 12)
      wire('ZIF1:11', 'LED:1'), // QB (pin 9 -> ZIF1:11)
      wire('ZIF1:10', 'LED:2'), // QC (pin 8 -> ZIF1:10)
      wire('ZIF1:13', 'LED:3'), // QD (pin 11 -> ZIF1:13)
    ];
    c.switches[0] = 0; c.switches[1] = 0;
    c.clock.level = 0;
    engine.step(c);

    const observedCounts: number[] = [0];
    for (let i = 0; i < 10; i++) {
      c.clock.level = 1;
      engine.step(c);
      c.clock.level = 0;
      const snap = engine.step(c);
      const val =
        (snap.ledStates[0] as number) +
        ((snap.ledStates[1] as number) << 1) +
        ((snap.ledStates[2] as number) << 2) +
        ((snap.ledStates[3] as number) << 3);
      observedCounts.push(val);
    }
    assert.deepEqual(observedCounts, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  }

  // 74192 Up/Down Counter
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '74192', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:8', 'black'),
      wire('PWR:GND:1', 'ZIF1:14', 'black'), // CLR=0
      wire('PWR:+5V:1', 'ZIF1:11', 'red'), // ~LOAD=1
      wire('CLK:OUT', 'ZIF1:5'), // UP
      wire('PWR:+5V:2', 'ZIF1:4', 'red'), // DOWN=1
      wire('ZIF1:3', 'LED:0'), wire('ZIF1:2', 'LED:1'), wire('ZIF1:6', 'LED:2'), wire('ZIF1:7', 'LED:3'),
    ];
    c.clock.level = 0;
    engine.step(c);
    c.clock.level = 1; // rising edge -> 1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [1, 0, 0, 0]);
    c.clock.level = 0;
    engine.step(c);
    c.clock.level = 1; // rising edge -> 2
    assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [0, 1, 0, 0]);
  }

  // 7495 4-bit Shift Register
  {
    const engine = new DigitalSimulationEngine();
    const c = baseCircuit();
    c.placedICs = [{ instanceId: 'ic', partNumber: '7495', placement: { kind: 'zif', socketId: 'ZIF1' } }];
    c.wires = [
      wire('PWR:+5V:0', 'ZIF1:16', 'red'),
      wire('PWR:GND:0', 'ZIF1:7', 'black'),
      wire('SW:0', 'ZIF1:1'), // SER
      wire('PWR:GND:1', 'ZIF1:6', 'black'), // MODE=0 (serial)
      wire('CLK:OUT', 'ZIF1:11'), // ~CLK1 = IC pin 9 -> ZIF1:11
      wire('PWR:+5V:1', 'ZIF1:10', 'red'), // ~CLK2 = IC pin 8 -> ZIF1:10
      // QA=13(ZIF1:15), QB=12(ZIF1:14), QC=11(ZIF1:13), QD=10(ZIF1:12)
      wire('ZIF1:15', 'LED:0'), wire('ZIF1:14', 'LED:1'), wire('ZIF1:13', 'LED:2'), wire('ZIF1:12', 'LED:3'),
    ];
    c.switches[0] = 1;
    c.clock.level = 1; engine.step(c);
    c.clock.level = 0; // shift 1 in -> QA=1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [1, 0, 0, 0]);
    c.switches[0] = 0;
    c.clock.level = 1; engine.step(c);
    c.clock.level = 0; // shift 0 in -> QA=0, QB=1
    assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [0, 1, 0, 0]);
  }
});

test('Test 5: 7447 BCD-to-7-Segment Driver drives onboard LTS542 Common-Anode Display', () => {
  const engine = new DigitalSimulationEngine();
  const c = baseCircuit();
  c.placedICs = [{ instanceId: 'ic', partNumber: '7447', placement: { kind: 'zif', socketId: 'ZIF1' } }];
  c.wires = [
    wire('PWR:+5V:0', 'ZIF1:16', 'red'),
    wire('PWR:GND:0', 'ZIF1:8', 'black'),
    wire('PWR:+5V:1', 'ZIF1:3', 'red'), // ~LT = 1
    wire('PWR:+5V:2', 'ZIF1:4', 'red'), // ~BI/~RBO = 1
    wire('PWR:+5V:3', 'ZIF1:5', 'red'), // ~RBI = 1
    wire('SW:0', 'ZIF1:7'), // A
    wire('SW:1', 'ZIF1:1'), // B
    wire('SW:2', 'ZIF1:2'), // C
    wire('SW:3', 'ZIF1:6'), // D
    // Segments a..g: 13,12,11,10,9,15,14 -> DISP1
    wire('ZIF1:13', 'DISP1:a'),
    wire('ZIF1:12', 'DISP1:b'),
    wire('ZIF1:11', 'DISP1:c'),
    wire('ZIF1:10', 'DISP1:d'),
    wire('ZIF1:9', 'DISP1:e'),
    wire('ZIF1:15', 'DISP1:f'),
    wire('ZIF1:14', 'DISP1:g'),
    wire('PWR:+5V:0', 'DISP1:CA', 'red'),
  ];

  // Digit 5 = 0101 (A=1, B=0, C=1, D=0) -> a,c,d,f,g ON; b,e OFF
  c.switches[0] = 1; c.switches[1] = 0; c.switches[2] = 1; c.switches[3] = 0;
  const snap = engine.step(c);
  assert.deepEqual(snap.displays.DISP1.segments, {
    a: true,
    b: false,
    c: true,
    d: true,
    e: false,
    f: true,
    g: true,
    dp: false,
  });
});

test('Test 6: 6116 2K x 8 Static RAM placed in 24-pin ZIF-5 socket performs Write, Standby Hi-Z, and Read', () => {
  const engine = new DigitalSimulationEngine();
  const c = baseCircuit();
  // Place 6116 in 24-pin ZIF5 socket:
  // Pin 24 (VCC) = ZIF5:24, Pin 12 (VSS) = ZIF5:12
  // Integrated socket power terminals: PWR:+5V:4 and PWR:GND:4
  // Address: A0=8, A1=7, A2..A10 = GND (6,5,4,3,2,1,23,22,19)
  // I/O0..I/O3 = 9, 10, 11, 13; I/O4..7 (14,15,16,17) = GND
  // ~CS=18, ~OE=20, ~WE=21
  c.placedICs = [{ instanceId: 'ram1', partNumber: '6116', placement: { kind: 'zif', socketId: 'ZIF5' } }];
  c.wires = [
    wire('PWR:+5V:4', 'ZIF5:24', 'red'),   // VCC (Pin 24)
    wire('PWR:GND:4', 'ZIF5:12', 'black'), // VSS (Pin 12)
    // Address A0, A1 from SW0, SW1; A2..A10 tied to GND
    wire('SW:0', 'ZIF5:8'), // A0 (pin 8)
    wire('SW:1', 'ZIF5:7'), // A1 (pin 7)
    wire('PWR:GND:4', 'ZIF5:6', 'black'),  // A2
    wire('PWR:GND:4', 'ZIF5:5', 'black'),  // A3
    wire('PWR:GND:4', 'ZIF5:4', 'black'),  // A4
    wire('PWR:GND:4', 'ZIF5:3', 'black'),  // A5
    wire('PWR:GND:4', 'ZIF5:2', 'black'),  // A6
    wire('PWR:GND:4', 'ZIF5:1', 'black'),  // A7
    wire('PWR:GND:4', 'ZIF5:23', 'black'), // A8
    wire('PWR:GND:4', 'ZIF5:22', 'black'), // A9
    wire('PWR:GND:4', 'ZIF5:19', 'black'), // A10
    // Control: ~CS=SW2, ~OE=SW3, ~WE=SW4
    wire('SW:2', 'ZIF5:18'), // ~CS (pin 18)
    wire('SW:3', 'ZIF5:20'), // ~OE (pin 20)
    wire('SW:4', 'ZIF5:21'), // ~WE (pin 21)
    // Tie I/O4..7 to GND
    wire('PWR:GND:4', 'ZIF5:14', 'black'), // I/O4
    wire('PWR:GND:4', 'ZIF5:15', 'black'), // I/O5
    wire('PWR:GND:4', 'ZIF5:16', 'black'), // I/O6
    wire('PWR:GND:4', 'ZIF5:17', 'black'), // I/O7
    // Monitor I/O0..I/O3 on LEDs 0..3
    wire('ZIF5:9', 'LED:0'),
    wire('ZIF5:10', 'LED:1'),
    wire('ZIF5:11', 'LED:2'),
    wire('ZIF5:13', 'LED:3'),
  ];

  // Attach switches SW5..SW8 ONLY during write, then disconnect to read!
  const writeDrivers = [
    wire('SW:5', 'ZIF5:9'),
    wire('SW:6', 'ZIF5:10'),
    wire('SW:7', 'ZIF5:11'),
    wire('SW:8', 'ZIF5:13'),
  ];
  c.wires.push(...writeDrivers);

  // Write 0b1011 (11) to Address 2 (A1=1, A0=0)
  c.switches[0] = 0; c.switches[1] = 1; // Addr = 2
  c.switches[2] = 0; // ~CS = 0
  c.switches[3] = 1; // ~OE = 1
  c.switches[4] = 0; // ~WE = 0 (WRITE)
  c.switches[5] = 1; c.switches[6] = 1; c.switches[7] = 0; c.switches[8] = 1; // 1011
  engine.step(c);

  // Write 0b0101 (5) to Address 1 (A1=0, A0=1)
  c.switches[0] = 1; c.switches[1] = 0; // Addr = 1
  c.switches[5] = 1; c.switches[6] = 0; c.switches[7] = 1; c.switches[8] = 0; // 0101
  engine.step(c);

  // Remove external write drivers (tri-state bus release)
  c.wires = c.wires.filter((w) => !writeDrivers.includes(w));
  c.switches[4] = 1; // ~WE = 1 (READ mode)

  // Standby check: ~CS = 1 -> Hi-Z
  c.switches[2] = 1; c.switches[3] = 0;
  assert.deepEqual(engine.step(c).ledStates.slice(0, 4), ['Z', 'Z', 'Z', 'Z']);

  // Read Addr 2 -> 1011
  c.switches[2] = 0; c.switches[3] = 0;
  c.switches[0] = 0; c.switches[1] = 1;
  assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [1, 1, 0, 1]);

  // Read Addr 1 -> 0101
  c.switches[0] = 1; c.switches[1] = 0;
  assert.deepEqual(engine.step(c).ledStates.slice(0, 4), [1, 0, 1, 0]);
});

test('Test 7: 16-pin ZIF socket shifts displayed pin numbers from 16 to 14 when a 14-pin IC is inserted', () => {
  // Empty ZIF1 -> physical pin 16 displays as 16, physical pin 10 displays as 10
  const emptyInfo16 = getDisplayedZifPinInfo('ZIF1', 16, []);
  assert.equal(emptyInfo16.displayedPin, 16);
  assert.equal(emptyInfo16.icPinName, null);

  // 14-pin 7400 inserted in ZIF1 -> top-right physical pin 16 shifts to display Pin 14 (VCC),
  // physical pin 10 shifts to display Pin 8 (3Y), and bottom row pins 8 & 9 become NC
  const placed14 = [{ instanceId: 'ic14', partNumber: '7400', placement: { kind: 'zif' as const, socketId: 'ZIF1' as const } }];
  const shiftedTopRight = getDisplayedZifPinInfo('ZIF1', 16, placed14);
  assert.equal(shiftedTopRight.displayedPin, 14);
  assert.equal(shiftedTopRight.icPinName, 'VCC');

  const shiftedRow7Right = getDisplayedZifPinInfo('ZIF1', 10, placed14);
  assert.equal(shiftedRow7Right.displayedPin, 8);
  assert.equal(shiftedRow7Right.icPinName, '3Y');

  const bottomLeftNC = getDisplayedZifPinInfo('ZIF1', 8, placed14);
  const bottomRightNC = getDisplayedZifPinInfo('ZIF1', 9, placed14);
  assert.equal(bottomLeftNC.displayedPin, 'NC');
  assert.equal(bottomRightNC.displayedPin, 'NC');
});


