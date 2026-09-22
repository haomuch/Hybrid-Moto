import React, { useState } from 'react';
import { Layers, Activity, Settings2, FileDown, ShieldCheck, Compass, Sparkles, Box } from 'lucide-react';
import { ThreeCutawayViewer } from './components/ThreeCutawayViewer';
import { GyroscopicDynamicsSimulator } from './components/GyroscopicDynamicsSimulator';
import { GearingKinematicsWorkbench } from './components/GearingKinematicsWorkbench';
import { CADSpecExportModal } from './components/CADSpecExportModal';
import { SYSTEM_CENTER_DISTANCE } from './data/engineeringData';

export default function App() {
  const [activeTab, setActiveTab] = useState<'3d_viewer' | 'gyro_dynamics' | 'gearing_spec'>('3d_viewer');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Top Engineering Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold text-sm">
              HY
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  摩托车功率分流混动架构工程分析台
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-semibold bg-sky-950 text-sky-400 border border-sky-800 rounded">
                  ECVT INPUT-SPLIT
                </span>
              </div>
              <p className="text-xs text-slate-400">
                单行星排输入分流 · 同轴主轴 (MG1-Planetary-MG2) · 平行副轴 (a = {SYSTEM_CENTER_DISTANCE} mm)
              </p>
            </div>
          </div>

          {/* Top Actions & CAD Export */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              id="btn-open-cad-modal"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition"
            >
              <FileDown className="w-3.5 h-3.5 text-sky-400" />
              <span>CAD规格导出</span>
            </button>
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>几何闭合校验完成</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-800/60">
          <button
            id="tab-3d-viewer"
            onClick={() => setActiveTab('3d_viewer')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === '3d_viewer'
                ? 'border-sky-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-4 h-4 text-sky-400" />
            <span>3D 机械装配与剖切视窗</span>
          </button>

          <button
            id="tab-gyro-dynamics"
            onClick={() => setActiveTab('gyro_dynamics')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'gyro_dynamics'
                ? 'border-sky-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>双电机惯量与陀螺效应动力学仿真</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </button>

          <button
            id="tab-gearing-spec"
            onClick={() => setActiveTab('gearing_spec')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'gearing_spec'
                ? 'border-sky-500 text-white bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-4 h-4 text-amber-400" />
            <span>齿轮匹配·中心距·工况共线图</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === '3d_viewer' && (
          <div className="space-y-4">
            <ThreeCutawayViewer />

            {/* Architecture Highlight Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 block">主轴系同轴布置 (Axis 1)</span>
                <span className="text-sm font-bold text-white block mt-0.5">中间受动齿轮 · 行星排左偏布置</span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  缩小行星架输入齿轮(72T，留 31mm 空间消除中间轴冲突)；曲轴输出加大至 48T(避开气缸)；中心距 a_ice=120mm
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 block">平行副轴绝对中心距 (Axis 2)</span>
                <span className="text-sm font-bold text-emerald-400 block mt-0.5 font-mono">
                  a₁ = a₂ = {SYSTEM_CENTER_DISTANCE}.0 mm
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  齿圈外齿 60T 啮合副轴 60T (m=1.75) 与 MG2 35T 啮合 70T (m=2.0) 轴间距完全闭合且紧密啮合
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 block">终传驱动链条 (Axis 2 ➔ 3)</span>
                <span className="text-sm font-bold text-sky-400 block mt-0.5">
                  12T ➔ 48T 链轮 (i = 4.000)
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  主动链轮 12T (r=30.7mm) 与后轮从动 48T (r=121.4mm)，终传比高达 4.000，轮端输出扭矩显著增强
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 block">高速巡航校核 (130 km/h)</span>
                <span className="text-sm font-bold text-amber-400 block mt-0.5 font-mono">
                  MG2: 8,842 rpm / MG1: 6,870 rpm
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  在 4.000 终传比下，130 km/h 时 MG2 处于 9,000 rpm 安全转速内，兼顾低中速极强的弹射爆发力
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gyro_dynamics' && <GyroscopicDynamicsSimulator />}

        {activeTab === 'gearing_spec' && <GearingKinematicsWorkbench />}
      </main>

      {/* CAD Spec Export Modal */}
      <CADSpecExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}
