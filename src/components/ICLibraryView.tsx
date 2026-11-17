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

const DIPPinoutDiagram: React.FC<{ ic: ICDefinition }> = ({ ic }) => {
  const half = ic.pinCount / 2;
  const rowH = 22;
  const bodyH = half * rowH + 24;
  const svgH = bodyH + 40;
  const bodyW = 92;
  const cx = 170;

  return (
    <svg viewBox={`0 0 340 ${svgH}`} className="w-full max-w-[340px] h-auto mx-auto">
      {/* IC Body */}
      <rect
        x={cx - bodyW / 2}
        y={20}
        width={bodyW}
        height={bodyH}
        rx={4}
        fill="#20252B"
        stroke="#47505A"
        strokeWidth={1.5}
      />
      <path
        d={`M ${cx - 12} 20 A 12 12 0 0 0 ${cx + 12} 20`}
        fill="#303840"
      />
      <circle cx={cx - bodyW / 2 + 12} cy={34} r={3} fill="#747C82" />
      <text
        x={cx}
        y={20 + bodyH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#F1F0EB"
        fontSize={13}
        fontWeight={600}
        fontFamily="IBM Plex Mono, monospace"
        transform={`rotate(-90, ${cx}, ${20 + bodyH / 2})`}
      >
        {ic.partNumber} ({ic.packageType})
      </text>

      {Array.from({ length: half }).map((_, idx) => {
        const py = 40 + idx * rowH;
        const leftPin = ic.pins.find((p) => p.pin === idx + 1)!;
        const rightPin = ic.pins.find((p) => p.pin === ic.pinCount - idx)!;

        const pinColor = (dir: string) =>
          dir === 'power-vcc'
            ? '#B83A32'
            : dir === 'power-gnd'
            ? '#303840'
            : dir === 'output' || dir === 'open-collector'
            ? '#587965'
            : '#456A83';

        return (
          <g key={idx}>
            {/* Left Lead */}
            <rect x={cx - bodyW / 2 - 14} y={py - 4} width={14} height={8} fill="#BFC3C8" />
            <text
              x={cx - bodyW / 2 - 20}
              y={py + 3}
              textAnchor="end"
              fill={pinColor(leftPin.direction)}
              fontSize={10.5}
              fontWeight={600}
              fontFamily="IBM Plex Mono, monospace"
            >
              {leftPin.pin} · {leftPin.name}
            </text>

            {/* Right Lead */}
            <rect x={cx + bodyW / 2} y={py - 4} width={14} height={8} fill="#BFC3C8" />
            <text
              x={cx + bodyW / 2 + 20}
              y={py + 3}
              textAnchor="start"
              fill={pinColor(rightPin.direction)}
              fontSize={10.5}
              fontWeight={600}
              fontFamily="IBM Plex Mono, monospace"
            >
              {rightPin.name} · {rightPin.pin}
            </text>
          </g>
        );
      })}
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
      <section className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-[#C9C9C3] bg-[#E5E5E1] flex flex-col h-72 lg:h-full shrink-0">
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
        <div className="max-w-4xl mx-auto space-y-6">
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

          {/* Pinout Diagram + Pin Table */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-5 bg-white border border-[#C9C9C3] rounded p-4">
              <h2 className="text-sm font-semibold text-[#20252B] mb-3">Package Pinout</h2>
              <DIPPinoutDiagram ic={selectedIC} />
            </div>

            <div className="xl:col-span-7 bg-white border border-[#C9C9C3] rounded overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#E5E5E1] text-[#303840] border-b border-[#C9C9C3]">
                  <tr>
                    <th className="py-2 px-3 font-mono">Pin</th>
                    <th className="py-2 px-3 font-mono">Symbol</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Function</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E1]">
                  {selectedIC.pins.map((pin) => (
                    <tr key={pin.pin}>
                      <td className="py-1.5 px-3 font-mono font-semibold">{pin.pin}</td>
                      <td className="py-1.5 px-3 font-mono text-[#456A83]">{pin.name}</td>
                      <td className="py-1.5 px-3 font-mono text-[#747C82]">{pin.direction}</td>
                      <td className="py-1.5 px-3 text-[#303840]">{pin.description}</td>
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
