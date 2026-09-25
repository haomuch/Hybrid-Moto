import React, { useState } from 'react';
import { FileDown, ChevronDown, ChevronUp, Layers, Info } from 'lucide-react';
import { ThreeCutawayViewer } from './components/ThreeCutawayViewer';
import { CADSpecExportModal } from './components/CADSpecExportModal';
import { SYSTEM_CENTER_DISTANCE } from './data/engineeringData';

export default function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Mobile-Optimized Sleek Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          {/* Logo & Clean Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 text-white font-bold text-xs shrink-0">
              ECVT
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                混动摩托功率分流 3D 透视系统
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                单行星排输入分流 · 平行副轴 (a = {SYSTEM_CENTER_DISTANCE} mm)
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowSpecs(!showSpecs)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition ${
                showSpecs
                  ? 'bg-sky-950 border-sky-500 text-sky-300'
                  : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="查看关键机构参数"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xs:inline">机构参数</span>
              {showSpecs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              id="btn-open-cad-modal"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 shadow-sm transition active:scale-95"
              title="导出 CAD 详细参数表格"
            >
              <FileDown className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">CAD导出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-2.5 sm:p-4 space-y-3">
        {/* Core 3D Powertrain Model with Docked Mobile Kinematics Console */}
        <ThreeCutawayViewer />

        {/* Collapsible Architecture Specs Sheet */}
        {showSpecs && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xl transition-all">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>核心传动机构设计速查表</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400">
                中心距 a = {SYSTEM_CENTER_DISTANCE}.0 mm
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-sky-400 font-semibold block mb-0.5">1. 主轴系同轴对置 (Axis 1)</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  MG1（左侧，内侧精密支承轴承）与 MG2（右侧）同轴布置；行星排左偏布置；曲轴 48T 驱动 72T 行星架输入齿轮（中心距 a_ice=120mm）。
                </p>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-emerald-400 font-semibold block mb-0.5">2. 平行副轴绝对共线 (Axis 2)</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  副轴中心距 a = {SYSTEM_CENTER_DISTANCE}.0 mm。副轴 60T 齿轮（啮合齿圈，速比 1.000）与 70T 减速大齿轮（啮合 MG2 35T，速比 2.000）并列，左右双精密轴承高刚性支撑。
                </p>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-amber-400 font-semibold block mb-0.5">3. 终传驱动链条 (Axis 3)</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  主动 12T 链轮 ➔ 后轮从动 48T 链轮（终传比 4.000），匹配 160/60 ZR17 轮胎，保证低速爬坡大扭矩与极速冲刺安全转速。
                </p>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-indigo-400 font-semibold block mb-0.5">4. 电机反转陀螺效应自抵消</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  MG2 与车轮反向旋转，抵消车轮的陀螺力矩，显著降低摩托车大角度压弯翻身阻力，提升弯道敏捷度。
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CAD Spec Export Modal */}
      <CADSpecExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}
