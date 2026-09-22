import React, { useState } from 'react';
import { X, Download, Copy, Check, FileText } from 'lucide-react';
import { GEAR_SPECIFICATIONS, SYSTEM_CENTER_DISTANCE } from '../data/engineeringData';

interface CADSpecExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CADSpecExportModal: React.FC<CADSpecExportModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'text' | 'json'>('text');

  if (!isOpen) return null;

  const textContent = `======================================================================
摩托车功率分流混动变速箱 (ECVT) CAD 建模装配参数表
Motorcycle Power-Split Hybrid Transmission CAD Spec Sheet
======================================================================
1. 轴系基准线 (Axis Datums):
   - 发动机曲轴线 (Axis 0): Y = 0.0 mm, Z = -120.0 mm (中心距 a_ice = 120.0 mm，拉开轴距并消除中间轴重叠冲突)
     包含构件: 双缸ICE曲轴 -> 扭转减振器 -> 48T中置输出齿轮 (啮合主轴72T从动输入齿轮, i_in = 72/48 = 1.500)
   - 主轴线 (Axis 1): Y = 0.0 mm, Z = 0.0 mm
     包含构件: MG1电机(左端) -> 穿心实心轴 -> 太阳轮(左偏 X=-46) -> 行星架/齿圈(左偏 X=-46) -> 空心套管 -> 72T中间受动齿轮(居中 X=0) -> MG2齿轮/电机(右端)
   - 副轴线 (Axis 2): Y = 0.0 mm, Z = 105.0 mm (中心距 a = 105.0 mm 绝对严格对齐)
     包含构件: 12T链轮(左，紧凑下限 r=30.7mm) -> 54T副轴齿轮(左偏 X=-46，啮合66T齿圈) -> 70T副轴大齿轮(右偏 X=65，啮合35T)
   - 后轮轴线 (Axis 3): Y = 0.0 mm, Z = 655.0 mm (终传链驱动 12T -> 48T，摇臂链条中心距 a_chain = 550.0 mm)

2. 齿轮副参数与中心距校验:
   - 齿轮副 0 (曲轴中置输出 -> 行星架输入从动轮):
     * 模数 m = 2.00 mm, 压力角 α = 20°
     * 曲轴输出大齿轮 z_ice = 48, 分度圆 d_ice = 96.00 mm (合理加大，顶部处于气缸底面下方，无气缸干涉)
     * 行星架输入齿轮 z_c_in = 72, 分度圆 d_c_in = 144.00 mm (缩小齿径，距中间轴保持 31.0mm 宽裕间隙，消除重叠冲突)
     * 中心距 a_ice = (96.00 + 144.00) / 2 = 120.00 mm (初级速比 i₀ = 72/48 = 1.500)
     * 空间拓扑效果: 曲轴与行星排在空间拉开，曲轴平衡块与齿圈保持 7.5mm 径向间隙，双缸缸心距保持 84.0mm 紧凑标准！
   - 齿轮副 1 (齿圈外齿 -> 副轴受动齿轮):
     * 模数 m = 1.75 mm, 压力角 α = 20°, 齿宽 b = 22.0 mm (加宽加厚)
     * 齿圈外齿 z_ro = 66, 分度圆 d_ro = 115.50 mm (齿宽 22.0 mm)
     * 副轴齿轮 z_c1 = 54, 分度圆 d_c1 = 94.50 mm (齿宽 22.0 mm)
     * 中心距 a1 = (115.50 + 94.50) / 2 = 105.00 mm (速比 i_r_c = 54/66 = 9/11 ≈ 0.8182)
   - 齿轮副 2 (MG2主动小齿轮 -> 副轴被动大齿轮):
     * 模数 m = 2.00 mm, 压力角 α = 20°
     * MG2齿轮 z_m2 = 35, 分度圆 d_m2 = 70.00 mm (进一步加大)
     * 副轴大齿轮 z_c2 = 70, 分度圆 d_c2 = 140.00 mm (进一步减小)
     * 中心距 a2 = (70.00 + 140.00) / 2 = 105.00 mm (a1 == a2 = 105.0 mm，紧密啮合装配完全闭合！)

3. 行星排机构参数:
   - 模数 m = 1.50 mm
   - 太阳轮: z_s = 24 (d = 36.00 mm)
   - 行星轮 (3个均布): z_p = 18 (d = 27.00 mm, 销轴分布圆直径 D = 63.00 mm)
   - 齿圈内齿: z_ri = 60 (d = 90.00 mm, 齿宽 22.0 mm)
   - 装配整数条件: (24 + 60) / 3 = 28 (成立)
   - 特性分流比 ρ = 60 / 24 = 2.500
   - 齿圈单边刚性壁厚: (115.50 - 90.00) / 2 = 12.75 mm (厚实无变形)

4. 动力源与发动机详细工程规格:
   - ICE: 350cc 直列双缸 180°曲轴阿特金森循环发动机 (20 kW @ 6500 rpm, 32 N·m)
     * 缸径 × 行程: Φ63.50 mm × 55.00 mm (精确排量 348.4 cc)
     * 连杆大/小头中心距: 96.00 mm (黄金连杆比 L/S = 1.745，超低侧向倾角推力)
     * 双缸缸心距: 84.00 mm (紧凑型高刚度缸体，左缸 X=-42mm, 右缸 X=+42mm)
     * 空间防干涉裕度: 曲轴与主轴中心距 120mm，曲轴回转最大包络半径 46mm，与齿圈外径保持 7.5mm 纯物理间隙(零干涉)；72T输入轮距中间轴留 31mm 空间
     * 曲轴主轴颈: Φ30.00 mm，曲柄销: Φ28.00 mm，锻造刃口平衡块厚度: 10.00 mm
     * 连杆构造: 整体锻造工字梁连杆，内置 Φ28mm/Φ16mm 穿心轴瓦孔与双侧减重加强槽
     * 活塞规格: Φ63.00 mm 锻造铝活塞，压缩高 40.0 mm，集成 3 道气环/油环
   - MG1: 10 kW (峰值 15 kW), 扁平饼式设计, Φ130 × L48 mm
   - MG2: 16 kW (峰值 32 kW), 扁平大扭矩设计, Φ136 × L52 mm
   - 终传链比: 12T -> 48T (i_chain = 4.000, 525 滚子链, 摇臂中心距 a_chain = 550.0 mm)
   - 真实后轮规格: 160/60 ZR17 (17寸锻造铝合金轮辋 R_rim = 216.0 mm, 轮胎外半径 R_tire = 312.0 mm, 外径 624.0 mm)
======================================================================`;

  const jsonData = {
    systemName: "Motorcycle_ECVT_Hybrid_Powertrain",
    centerDistanceMm: SYSTEM_CENTER_DISTANCE,
    crankshaftCenterDistanceMm: 120.0,
    engine: {
      type: "Parallel_Twin_180deg_Atkinson",
      displacementCc: 348.4,
      boreMm: 63.5,
      strokeMm: 55.0,
      conRodLengthMm: 96.0,
      rodToStrokeRatio: 1.745,
      borePitchMm: 84.0,
      mainJournalDiameterMm: 30.0,
      crankpinDiameterMm: 28.0,
      crankwebThicknessMm: 10.0,
      pistonDiameterMm: 63.0,
      wristPinDiameterMm: 16.0
    },
    gears: GEAR_SPECIFICATIONS,
    axes: [
      { id: "Axis0_ICE_Crankshaft", zMm: -120.0, components: ["Crankshaft_180deg", "Cylinder_Twin_350cc", "Piston_Twin_63.5mm", "ConRod_96mm", "ICE_Pinion_48T"] },
      { id: "Axis1_Main", zMm: 0.0, components: ["MG1_Pancake", "Sun", "Carrier", "CarrierInput_72T", "Ring", "MG2_Pancake"] },
      { id: "Axis2_Countershaft", zMm: 105.0, components: ["CounterGear_54T", "CounterGear_70T", "Sprocket_12T"] },
      { id: "Axis3_RearAxle", zMm: 655.0, components: ["RearSprocket_48T", "Tire_160_60_R17", "BrakeDisc_240mm"] }
    ]
  };

  const handleCopy = () => {
    const textToCopy = format === 'text' ? textContent : JSON.stringify(jsonData, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const textToSave = format === 'text' ? textContent : JSON.stringify(jsonData, null, 2);
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'text' ? 'Motorcycle_ECVT_CAD_Spec.txt' : 'Motorcycle_ECVT_CAD_Spec.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">CAD 建模参数与工程规格表导出</h3>
              <p className="text-xs text-slate-400">
                可直接导入 SolidWorks、Fusion 360 或 NX Toolbox 生成齿轮与轴系
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFormat('text')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                format === 'text' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              标准工程文本 (TXT)
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                format === 'json' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              CAD 脚本数据 (JSON)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制到剪贴板' : '复制参数'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载规格文件</span>
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-5 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-slate-950">
          <pre className="whitespace-pre-wrap leading-relaxed">
            {format === 'text' ? textContent : JSON.stringify(jsonData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};
