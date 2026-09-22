import React, { useState } from 'react';
import { Settings, Calculator, Check, ArrowRight, Gauge, RotateCw, Zap, Activity, Cog, Link2 } from 'lucide-react';
import { GEAR_SPECIFICATIONS, SYSTEM_CENTER_DISTANCE, TYPICAL_OPERATING_POINTS } from '../data/engineeringData';
import { OperatingPoint } from '../types';

interface GearingKinematicsWorkbenchProps {
  onSelectOperatingPoint?: (point: OperatingPoint) => void;
}

export const GearingKinematicsWorkbench: React.FC<GearingKinematicsWorkbenchProps> = ({
  onSelectOperatingPoint
}) => {
  const [selectedPoint, setSelectedPoint] = useState<OperatingPoint>(TYPICAL_OPERATING_POINTS[1]); // Default 100km/h Eco
  const [customSpeedKmh, setCustomSpeedKmh] = useState(100);
  const [customIceRpm, setCustomIceRpm] = useState(3400);

  // Planetary ratio
  const rho = 60 / 24; // 2.500

  // Compute live speeds for nomograph & calculator (100% unified with 3D animation and kinematics)
  const wheelRadius = 0.312; // 160/60 ZR17 (R = 0.312 m, outer diameter 624 mm)
  const wheelRpm = Math.round(((customSpeedKmh / 3.6) / wheelRadius) * 60 / (2 * Math.PI));
  const countershaftRpm = Math.round(wheelRpm * (48 / 12)); // 12T -> 48T final drive ratio: 4.000
  const ringRpm = Math.round(countershaftRpm * (54 / 66));  // 66T ring -> 54T countershaft ratio: 54/66 = 9/11
  const carrierRpm = Math.round(customIceRpm / (72 / 48));  // 48T crank -> 72T carrier ratio: 1.500
  const sunRpm = Math.round((1 + rho) * carrierRpm - rho * ringRpm); // Willis equation
  const mg2Rpm = Math.round(countershaftRpm * (70 / 35));   // 35T MG2 -> 70T countershaft ratio: 2.000

  const handleSelectPreset = (point: OperatingPoint) => {
    setSelectedPoint(point);
    setCustomSpeedKmh(point.vehicleSpeedKmh);
    setCustomIceRpm(point.iceRpm);
    if (onSelectOperatingPoint) {
      onSelectOperatingPoint(point);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Operating Mode Presets & Interactive Sliders */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              整车典型工况与动力学切分校验
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              验证各工况下电机转速不超速、发电/驱动力矩平衡与轮端输出（与 3D 视窗动力学完全一致）
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
            中心距 a = {SYSTEM_CENTER_DISTANCE} mm 绝对吻合
          </span>
        </div>

        {/* Operating Point Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {TYPICAL_OPERATING_POINTS.map((op) => {
            const isSelected = selectedPoint.id === op.id && customSpeedKmh === op.vehicleSpeedKmh && customIceRpm === op.iceRpm;
            return (
              <button
                key={op.id}
                onClick={() => handleSelectPreset(op)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'bg-sky-950/80 border-sky-500 shadow-md ring-1 ring-sky-500/50'
                    : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-white truncate">{op.title.split(' ')[0]}</span>
                  <span
                    className={`text-[9px] font-mono px-1 rounded ${
                      op.powerSplitMode === 'EV'
                        ? 'bg-emerald-900 text-emerald-300'
                        : op.powerSplitMode === 'MAX_ACCEL'
                        ? 'bg-rose-900 text-rose-300'
                        : 'bg-sky-900 text-sky-300'
                    }`}
                  >
                    {op.powerSplitMode}
                  </span>
                </div>
                <div className="text-lg font-mono font-bold text-sky-300">{op.vehicleSpeedKmh} km/h</div>
                <div className="text-[10px] text-slate-400 line-clamp-1 mt-1">{op.description}</div>
              </button>
            );
          })}
        </div>

        {/* Dual Interactive Sliders (Synchronized with 3D Dynamic Panel) */}
        <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vehicle Speed Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Gauge className="w-4 h-4 text-sky-400" />
                <span>摩托车行驶车速 (Vehicle Speed):</span>
              </span>
              <span className="font-mono text-sky-400 font-bold text-sm">
                {customSpeedKmh} <span className="text-[10px] font-normal text-slate-400">km/h</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="180"
              step="5"
              value={customSpeedKmh}
              onChange={(e) => setCustomSpeedKmh(parseFloat(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0 (静止)</span>
              <span>35 (起步)</span>
              <span>60 (巡航)</span>
              <span>100 (高速)</span>
              <span>180 km/h</span>
            </div>
          </div>

          {/* Engine RPM Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <RotateCw className="w-4 h-4 text-amber-400" />
                <span>发动机曲轴转速 (Engine ICE RPM):</span>
              </span>
              <span className="font-mono text-amber-400 font-bold text-sm">
                {customIceRpm} <span className="text-[10px] font-normal text-slate-400">RPM</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="8500"
              step="100"
              value={customIceRpm}
              onChange={(e) => setCustomIceRpm(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0 (熄火纯电)</span>
              <span>1500 (怠速)</span>
              <span>3400 (最高效率岛)</span>
              <span>6000 (极速)</span>
              <span>8500 (红线)</span>
            </div>
          </div>
        </div>

        {/* Selected Mode Summary Card (All 7 Shaft Speeds & Ratios) */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center">
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">ICE 曲轴 (350cc)</span>
            <span className="font-mono text-sm font-bold text-white mt-0.5 block">{customIceRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span></span>
            <span className="text-[9px] text-slate-500 block font-mono">主动 48T</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">行星架 Carrier</span>
            <span className="font-mono text-sm font-bold text-sky-400 mt-0.5 block">{carrierRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span></span>
            <span className="text-[9px] text-sky-500 block font-mono">72T (i=1.50)</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">太阳轮 / MG1</span>
            <span
              className={`font-mono text-sm font-bold mt-0.5 block ${
                Math.abs(sunRpm) > 10500 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {sunRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span>
            </span>
            <span className="text-[9px] text-emerald-500 block font-mono">24T (ρ=2.500)</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">外齿圈 Ring</span>
            <span className="font-mono text-sm font-bold text-green-400 mt-0.5 block">{ringRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span></span>
            <span className="text-[9px] text-green-500 block font-mono">66T (内60T)</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">平行副轴 (Axis 2)</span>
            <span className="font-mono text-sm font-bold text-cyan-400 mt-0.5 block">{countershaftRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span></span>
            <span className="text-[9px] text-cyan-500 block font-mono">54T/70T/12T</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">MG2 主驱电机</span>
            <span
              className={`font-mono text-sm font-bold mt-0.5 block ${
                Math.abs(mg2Rpm) > 11500 ? 'text-amber-400' : 'text-yellow-400'
              }`}
            >
              {mg2Rpm} <span className="text-[9px] font-normal text-slate-500">rpm</span>
            </span>
            <span className="text-[9px] text-yellow-500 block font-mono">35T (2.00x)</span>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">后轮 (160/60)</span>
            <span className="font-mono text-sm font-bold text-slate-200 mt-0.5 block">{wheelRpm} <span className="text-[9px] font-normal text-slate-500">rpm</span></span>
            <span className="text-[9px] text-slate-500 block font-mono">48T (i=4.00)</span>
          </div>
        </div>
      </div>

      {/* 2. Planetary Nomograph (共线杠杆图) & Center Distance Proof */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Nomograph Col (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                单行星排转速共线图 (Planetary Lever Nomograph)
              </h4>
              <p className="text-[11px] text-slate-400">
                满足转速共线方程：(1 + ρ)·n_c = n_s + ρ·n_r，杠杆比 SC : CR = 2.500 : 1
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">ρ = 60/24 = 2.500</span>
          </div>

          {/* Interactive Nomograph SVG */}
          <div className="w-full bg-slate-950 p-4 rounded-lg border border-slate-800/80">
            <svg viewBox="0 0 540 240" className="w-full h-auto select-none">
              {/* Reference Grid lines */}
              <line x1="60" y1="120" x2="480" y2="120" stroke="#334155" strokeWidth="1.5" />
              <text x="490" y="124" fill="#64748b" fontSize="10" fontFamily="monospace">
                0 rpm
              </text>

              {/* Speed reference dashes */}
              <line x1="60" y1="40" x2="480" y2="40" stroke="#1e293b" strokeDasharray="4 4" />
              <text x="490" y="44" fill="#475569" fontSize="9" fontFamily="monospace">
                +10,000
              </text>
              <line x1="60" y1="200" x2="480" y2="200" stroke="#1e293b" strokeDasharray="4 4" />
              <text x="490" y="204" fill="#475569" fontSize="9" fontFamily="monospace">
                -10,000
              </text>

              {/* Vertical Stems for S, C, R */}
              {/* S: Sun Gear (MG1) X=100 */}
              <line x1="100" y1="25" x2="100" y2="215" stroke="#475569" strokeWidth="1.5" />
              <text x="100" y="232" fill="#ef4444" fontSize="11" fontWeight="bold" textAnchor="middle">
                S (太阳轮/MG1)
              </text>

              {/* C: Carrier (ICE) X=350 (Ratio SC : CR = 2.500 : 1 -> 250px : 100px) */}
              <line x1="350" y1="25" x2="350" y2="215" stroke="#475569" strokeWidth="1.5" />
              <text x="350" y="232" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">
                C (行星架/ICE)
              </text>

              {/* R: Ring Gear (Output) X=450 */}
              <line x1="450" y1="25" x2="450" y2="215" stroke="#475569" strokeWidth="1.5" />
              <text x="450" y="232" fill="#22c55e" fontSize="11" fontWeight="bold" textAnchor="middle">
                R (齿圈输出)
              </text>

              {/* Distance dimension indicators */}
              <text x="225" y="16" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="monospace">
                距离比 = ρ (2.500)
              </text>
              <text x="400" y="16" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="monospace">
                1.0
              </text>

              {/* Calculate Y coordinates based on speeds (mapping: 0rpm=120, +10000=40, -10000=200) */}
              {(() => {
                const mapY = (rpm: number) => 120 - (rpm / 10000) * 80;
                const yS = Math.max(20, Math.min(220, mapY(sunRpm)));
                const yC = Math.max(20, Math.min(220, mapY(carrierRpm)));
                const yR = Math.max(20, Math.min(220, mapY(ringRpm)));

                return (
                  <g>
                    {/* Live Collinear Lever line */}
                    <line x1="100" y1={yS} x2="450" y2={yR} stroke="#facc15" strokeWidth="3" />

                    {/* Point S (Sun) */}
                    <circle cx="100" cy={yS} r="6" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                    <rect x="70" y={yS - 24} width="60" height="18" rx="3" fill="#1e293b" />
                    <text x="100" y={yS - 12} fill="#fca5a5" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      {sunRpm}
                    </text>

                    {/* Point C (Carrier) */}
                    <circle cx="350" cy={yC} r="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                    <rect x="320" y={yC - 24} width="60" height="18" rx="3" fill="#1e293b" />
                    <text x="350" y={yC - 12} fill="#bae6fd" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      {carrierRpm}
                    </text>

                    {/* Point R (Ring) */}
                    <circle cx="450" cy={yR} r="6" fill="#16a34a" stroke="#ffffff" strokeWidth="2" />
                    <rect x="420" y={yR - 24} width="60" height="18" rx="3" fill="#1e293b" />
                    <text x="450" y={yR - 12} fill="#86efac" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      {ringRpm}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="font-bold text-slate-200 block">共线图物理运行原理：</span>
            <div>• <b>纯电起步 (0-45 km/h)</b>：发动机熄火停机（C点锁在 0 线），后轮经终传与副轴反拖齿圈（R点）向上转，MG1（S点）被迫反向空转（负转速），实现零发动机阻力纯电滑行。</div>
            <div>• <b>高效巡航 (100 km/h)</b>：车速固定使 R 点稳定，发动机控制在 3400 rpm 最优热效率岛（C点），MG1（S点）处于 977 rpm 高效发电工况，回充电池并驱动 MG2。</div>
          </div>
        </div>

        {/* Center Distance Proof Col (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-sky-400" />
              轴系中心距与速比数学闭合校验
            </h4>
            <span className="text-xs font-mono text-emerald-400 font-bold">a = 105.0 mm</span>
          </div>

          {/* Proof Card 0: Pair 0 ICE to Carrier */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-400">齿轮副 0: 曲轴输出 ➔ 行星架输入</span>
              <span className="text-[10px] text-slate-500 font-mono">模数 m = 2.00</span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
              <div>• 曲轴输出齿轮: d_ice = 48 × 2.0 = 96.00 mm (避让气缸)</div>
              <div>• 行星架输入齿轮: d_c_in = 72 × 2.0 = 144.00 mm</div>
              <div className="text-sky-400 font-bold pt-1 border-t border-slate-800 flex justify-between">
                <span>中心距 a_ice = (96 + 144) / 2 = 120.00 mm</span>
                <span>速比 i₀ = 1.500</span>
              </div>
            </div>
          </div>

          {/* Proof Card 1: Pair 1 Ring to Countershaft */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400">齿轮副 1: 齿圈外齿 ➔ 副轴受动齿轮</span>
              <span className="text-[10px] text-slate-500 font-mono">模数 m = 1.75</span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
              <div>• 齿圈外齿分度圆: d_ro = 66 × 1.75 = 115.50 mm (齿宽 22.0mm)</div>
              <div>• 副轴受动齿分度圆: d_c1 = 54 × 1.75 = 94.50 mm (齿宽 22.0mm)</div>
              <div className="text-emerald-400 font-bold pt-1 border-t border-slate-800 flex justify-between">
                <span>中心距 a₁ = (115.50 + 94.50) / 2 = 105.00 mm</span>
                <span>速比 i₁ = 54/66 (9/11)</span>
              </div>
            </div>
          </div>

          {/* Proof Card 2: Pair 2 MG2 to Countershaft */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-400">齿轮副 2: MG2小齿轮 ➔ 副轴大齿轮</span>
              <span className="text-[10px] text-slate-500 font-mono">模数 m = 2.00</span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
              <div>• MG2小齿轮分度圆: d_m2 = 35 × 2.0 = 70.00 mm</div>
              <div>• 副轴大齿轮分度圆: d_c2 = 70 × 2.0 = 140.00 mm</div>
              <div className="text-amber-400 font-bold pt-1 border-t border-slate-800 flex justify-between">
                <span>中心距 a₂ = (70.00 + 140.00) / 2 = 105.00 mm</span>
                <span>速比 i₂ = 2.000</span>
              </div>
            </div>
          </div>

          {/* Proof Card 3: Final Drive Chain */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-400">终传链条副: 12T主动链轮 ➔ 48T后轮链盘</span>
              <span className="text-[10px] text-slate-500 font-mono">525 滚子链</span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
              <div>• 主动链轮分度圆: d_sprocket = 61.3 mm (r = 30.7 mm)</div>
              <div>• 后轮从动链盘: d_rear = 242.7 mm (r = 121.4 mm)</div>
              <div className="text-cyan-400 font-bold pt-1 border-t border-slate-800 flex justify-between">
                <span>平叉跨距 a_chain = 550.00 mm</span>
                <span>终传比 i_chain = 4.000</span>
              </div>
            </div>
          </div>

          {/* Assembly Status Verified Badge */}
          <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <b>结论：a₁ = a₂ = 105.0 mm 绝对相等。</b> 主轴与副轴两条平行轴线完美对齐，所有速比闭环无干涉。
            </span>
          </div>
        </div>
      </div>

      {/* 3. Detailed Gear Specifications Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            全系统零部件详细设计参数表 (CAD/加工出图标注依据)
          </h4>
          <span className="text-xs text-slate-500">共 11 个关键齿轮与链传动构件</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="pb-2.5 font-semibold">构件名称</th>
                <th className="pb-2.5 font-semibold">代号</th>
                <th className="pb-2.5 font-semibold">齿数 (z)</th>
                <th className="pb-2.5 font-semibold">模数 (m)</th>
                <th className="pb-2.5 font-semibold">分度圆 (d)</th>
                <th className="pb-2.5 font-semibold">齿宽 (b)</th>
                <th className="pb-2.5 font-semibold">安装物理位置</th>
                <th className="pb-2.5 font-semibold">机械作用说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {GEAR_SPECIFICATIONS.map((g, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 font-sans font-semibold text-white">{g.name}</td>
                  <td className="py-2.5 text-sky-400">{g.code}</td>
                  <td className="py-2.5 font-bold">{g.teeth}</td>
                  <td className="py-2.5">{g.module > 0 ? g.module.toFixed(2) : '-'}</td>
                  <td className="py-2.5 text-emerald-400">{g.pitchDiameter.toFixed(1)} mm</td>
                  <td className="py-2.5">{g.width.toFixed(1)} mm</td>
                  <td className="py-2.5 font-sans text-slate-400">{g.location}</td>
                  <td className="py-2.5 font-sans text-slate-400 text-[11px] max-w-xs truncate" title={g.description}>
                    {g.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
