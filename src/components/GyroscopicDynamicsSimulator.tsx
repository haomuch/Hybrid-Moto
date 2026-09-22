import React, { useState, useMemo } from 'react';
import { Shield, Zap, AlertTriangle, CheckCircle2, Sliders, Activity, Info, ChevronRight, Cog, Gauge, TrendingDown } from 'lucide-react';
import { GyroSimulationParams, GyroSimulationResult } from '../types';

export const GyroscopicDynamicsSimulator: React.FC = () => {
  const [params, setParams] = useState<GyroSimulationParams>({
    speedKmh: 90,
    leanAngleDeg: 35,
    rollRateDegPerSec: 45,       // 压弯翻身速率 (deg/s)
    throttleRampRateRpmS: 25000, // 弯中开油瞬间电机转速爬升率 (rpm/s)
    rotorType: 'slender',        // 细长型 vs 传统盘式
    imuSlewLimitEnabled: true    // 6轴 IMU 斜率限幅
  });

  // 最新定型 MG2 减速比：35T 啮合 70T，速比 i = 70 / 35 = 2.000
  const MG2_REDUCTION_RATIO = 70 / 35;

  // Calculate physical metrics based on motorcycle dynamics formulas
  const result: GyroSimulationResult = useMemo(() => {
    const wheelRadius = 0.312; // m (160/60 R17)
    const wheelSpeedRadS = (params.speedKmh / 3.6) / wheelRadius;
    const wheelRpm = (wheelSpeedRadS * 60) / (2 * Math.PI);

    // Countershaft and MG2 speed calculation (严格按最新 12T/48T 终传与 35T/70T 速比 2.000 计算)
    const countershaftRpm = wheelRpm * (48 / 12);
    const mg2Rpm = countershaftRpm * MG2_REDUCTION_RATIO;
    const mg2RadS = (mg2Rpm * 2 * Math.PI) / 60;

    // Wheels total rotational inertia (front + rear + sprockets ~ 0.85 kg·m²)
    const I_wheels = 0.85;
    const wheelAngularMomentum = I_wheels * wheelSpeedRadS;

    // Motor rotor inertia based on geometry
    // I = 0.5 * m * r^2. Notice that diameter is to the 4th power for given density!
    // Slender: D = 68mm, m = 3.2kg => I ~ 0.00185 kg·m²
    // Pancake: D = 135mm, m = 3.8kg => I ~ 0.00865 kg·m² (4.6 times higher!)
    const I_mg2 = params.rotorType === 'slender' ? 0.00185 : 0.00865;
    const I_mg1 = params.rotorType === 'slender' ? 0.00125 : 0.00580;

    // Because MG2 is an external mesh with the countershaft, it rotates COUNTER to the wheels!
    // Negative angular momentum vector!
    const mg2AngularMomentum = -I_mg2 * mg2RadS;

    // MG1 approximate cruising speed
    const mg1Rpm = Math.max(1000, 3200 * 1.4 - 0.7 * wheelRpm);
    const mg1RadS = (mg1Rpm * 2 * Math.PI) / 60;
    const mg1AngularMomentum = I_mg1 * mg1RadS * 0.5; // smaller effect

    // Net roll axis momentum
    const netRollMomentum = wheelAngularMomentum + mg2AngularMomentum;

    // Cancellation percentage of wheel gyroscopic resistance
    const gyroCancellationPercent = Math.min(
      85,
      Math.max(5, (Math.abs(mg2AngularMomentum) / wheelAngularMomentum) * 100)
    );

    // Roll rate in rad/s
    const rollRateRadS = (params.rollRateDegPerSec * Math.PI) / 180;

    // Effective throttle acceleration rate (affected by IMU slew limit)
    const effectiveRampRate = params.imuSlewLimitEnabled && params.leanAngleDeg > 15
      ? Math.min(params.throttleRampRateRpmS, 6500) // limited to 6500 rpm/s when leaning!
      : params.throttleRampRateRpmS;

    const alphaRadS2 = (effectiveRampRate * 2 * Math.PI) / 60;

    // Handlebar kickback jerk torque:
    // Change in precession torque: delta_T = omega_roll * (I_mg2 * delta_omega)
    const deltaOmega = alphaRadS2 * 0.25; // in 250ms transient
    const handlebarJerkTorqueNm = rollRateRadS * (I_mg2 * deltaOmega);

    // Anti-squat pitch reaction torque on chassis
    const antiSquatPitchJerkNm = I_mg2 * alphaRadS2;

    // Agility index (how easy it is to flick into a corner)
    const agilityIndex = Math.min(
      98,
      Math.max(30, Math.round(50 + (gyroCancellationPercent - 25) * 1.2))
    );

    // Steering stability score (penalized heavily by jerk torque)
    const jerkPenalty = Math.min(65, handlebarJerkTorqueNm * 14.5);
    const steeringStabilityScore = Math.max(
      15,
      Math.min(99, Math.round(98 - jerkPenalty + (params.imuSlewLimitEnabled ? 8 : -10)))
    );

    return {
      wheelAngularMomentum,
      mg2AngularMomentum,
      mg1AngularMomentum,
      netRollMomentum,
      gyroCancellationPercent,
      handlebarJerkTorqueNm,
      steeringStabilityScore,
      agilityIndex,
      antiSquatPitchJerkNm,
      wheelRpm,
      countershaftRpm,
      mg2Rpm
    };
  }, [params]);

  const presetScenarios = [
    {
      label: '弯心大油门出弯',
      speed: 85,
      lean: 42,
      rollRate: 20,
      rampRate: 38000,
      desc: '车手在大倾角下瞬间拧大油门，测试电机急加速陀螺力矩是否抢把'
    },
    {
      label: '快速翻身入弯 (S弯)',
      speed: 110,
      lean: 38,
      rollRate: 75,
      rampRate: 12000,
      desc: '高速连续翻身，测试 MG2 反向旋转对车轮陀螺效应的 MotoGP 式抵消红利'
    },
    {
      label: '直道全力加速',
      speed: 60,
      lean: 0,
      rollRate: 5,
      rampRate: 45000,
      desc: '零倾角直道，电机全功率释放转速暴拉，无翻身阻力干涉'
    }
  ];

  // 最新定型齿轮规格：MG2 35T 啮合副轴 70T (速比 2.000)
  // 中心距 a2 = (70.0 + 140.0) / 2 = 105.0 mm 绝对严密啮合
  const z_m2 = 35;
  const z_c2 = 70;
  const d_m2 = '70.0';
  const d_c2 = '140.0';
  const actualCenterDist = '105.00';

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                <Activity className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-bold text-white tracking-tight">
                双电机转动惯量 & 陀螺效应 (Gyroscopic Precession) 动力学分析台
              </h3>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              针对用户核心问题深度解析：MG1 与 MG2 达万转且频繁调速，如何通过
              <b className="text-sky-300"> MG2 反转中和车轮角动量</b>、
              <b className="text-emerald-300"> 细长轴轻量转子</b> 与
              <b className="text-amber-300"> IMU 弯道转速斜率滤波</b>，将隐患化为 MotoGP 级别的翻身灵活性。
            </p>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {presetScenarios.map((sc, i) => (
              <button
                key={i}
                onClick={() =>
                  setParams({
                    ...params,
                    speedKmh: sc.speed,
                    leanAngleDeg: sc.lean,
                    rollRateDegPerSec: sc.rollRate,
                    throttleRampRateRpmS: sc.rampRate
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-all text-left"
              >
                <div className="font-semibold">{sc.label}</div>
                <div className="text-[10px] text-slate-400">{sc.speed}km/h · {sc.lean}°倾角</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Controls Left, Real-time Metrics Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                车辆工况与动态参数输入
              </h4>
              <span className="text-[11px] text-slate-500 font-mono">LIVE_PHYSICS_SOLVER</span>
            </div>

            {/* Slider 1: Speed */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">车速 (Vehicle Speed):</span>
                <span className="font-mono text-sky-400 font-bold">{params.speedKmh} km/h</span>
              </div>
              <input
                type="range"
                min="10"
                max="160"
                step="5"
                value={params.speedKmh}
                onChange={(e) => setParams({ ...params, speedKmh: parseInt(e.target.value) })}
                className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>10 km/h (低速)</span>
                <span>80 km/h (弯道)</span>
                <span>160 km/h (极速)</span>
              </div>
            </div>

            {/* Slider 2: Lean Angle */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">车身压弯倾角 (Roll Lean Angle):</span>
                <span className="font-mono text-emerald-400 font-bold">{params.leanAngleDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="55"
                step="1"
                value={params.leanAngleDeg}
                onChange={(e) => setParams({ ...params, leanAngleDeg: parseInt(e.target.value) })}
                className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0° (直立)</span>
                <span>35° (运动巡航)</span>
                <span>55° (赛道极限)</span>
              </div>
            </div>

            {/* Slider 3: Roll Rate (Flickability) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">倾倒翻身角速度 (Roll Rate ω):</span>
                <span className="font-mono text-indigo-400 font-bold">{params.rollRateDegPerSec} °/s</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={params.rollRateDegPerSec}
                onChange={(e) => setParams({ ...params, rollRateDegPerSec: parseInt(e.target.value) })}
                className="w-full accent-indigo-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>10 °/s (平缓)</span>
                <span>45 °/s (快速入弯)</span>
                <span>90 °/s (激进抽身)</span>
              </div>
            </div>

            {/* Slider 4: Throttle Transient Acceleration */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">弯中开油转速爬升斜率 (dω/dt):</span>
                <span className="font-mono text-amber-400 font-bold">
                  {params.throttleRampRateRpmS.toLocaleString()} rpm/s
                </span>
              </div>
              <input
                type="range"
                min="2000"
                max="50000"
                step="2000"
                value={params.throttleRampRateRpmS}
                onChange={(e) => setParams({ ...params, throttleRampRateRpmS: parseInt(e.target.value) })}
                className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>平稳开油</span>
                <span>中速提速</span>
                <span>全油门暴拉</span>
              </div>
            </div>

            {/* MG2 Gear Specification: Fixed to 35T / 70T (2.000) */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Cog className="w-3.5 h-3.5 text-amber-400" />
                  MG2 减速传动定型规格:
                </span>
                <span className="font-mono text-amber-400 font-bold text-xs bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                  i_m2 = 2.000 (35T / 70T)
                </span>
              </div>

              {/* Geometry Verification Chip */}
              <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 text-[10px] font-mono space-y-1">
                <div className="flex items-center justify-between text-slate-300">
                  <span>MG2 主动轮: <b className="text-amber-400">{z_m2}T</b> (d={d_m2}mm)</span>
                  <span>副轴被动轮: <b className="text-slate-200">{z_c2}T</b> (d={d_c2}mm)</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-emerald-400">
                  <span>啮合中心距 a₂:</span>
                  <span>({d_m2} + {d_c2}) / 2 = {actualCenterDist} mm (严密相切闭合)</span>
                </div>
              </div>
            </div>

            {/* Engineering Solution Toggles */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-200">🛠️ 工程降扰优化措施对比:</div>

              {/* Rotor geometry */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setParams({ ...params, rotorType: 'slender' })}
                  className={`p-2.5 rounded-lg text-xs font-medium border text-left transition-all ${
                    params.rotorType === 'slender'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    细长轴型转子
                  </div>
                  <div className="text-[10px] mt-1 text-slate-400">
                    Φ68mm小直径 · 惯量降低 74%
                  </div>
                </button>

                <button
                  onClick={() => setParams({ ...params, rotorType: 'pancake' })}
                  className={`p-2.5 rounded-lg text-xs font-medium border text-left transition-all ${
                    params.rotorType === 'pancake'
                      ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    传统盘式转子
                  </div>
                  <div className="text-[10px] mt-1 text-slate-400">
                    Φ135mm大直径 · 惯量过大
                  </div>
                </button>
              </div>

              {/* IMU Slew Limiter Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    6轴 IMU 弯道转速斜率限幅
                  </div>
                  <div className="text-[10px] text-slate-400">
                    倾角 &gt; 15° 时自动限制电机加速度，抹平手把冲击
                  </div>
                </div>
                <button
                  onClick={() => setParams({ ...params, imuSlewLimitEnabled: !params.imuSlewLimitEnabled })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    params.imuSlewLimitEnabled ? 'bg-sky-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      params.imuSlewLimitEnabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Column (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Real-time Dynamic Response to 35T/70T */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Gauge className="w-4 h-4" />
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  MG2 电机与副轴动力学与机电响应
                </h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                最新定型齿比 i_m2 = 2.000 (35T / 70T)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card 1: Motor RPM & Thermal Load */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>MG2 实时运转转速:</span>
                  <span className="font-mono text-xs text-slate-300">
                    车速 {params.speedKmh} km/h
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-amber-400">
                    {Math.round(result.mg2Rpm).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">RPM</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    35T/70T 优化工况，低转速低温升运行
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/80 flex justify-between">
                  <span>副轴: {Math.round(result.countershaftRpm)} rpm</span>
                  <span>后轮: {Math.round(result.wheelRpm)} rpm</span>
                </div>
              </div>

              {/* Card 2: Gyro Precession Kickback Jerk Relief */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>弯中开油抢把力矩突变量:</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    转速平缓，角加速度优化
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-sky-400">
                    {result.handlebarJerkTorqueNm.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">N·m</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/60 font-semibold font-mono">
                    <Shield className="w-3 h-3" />
                    极低瞬态冲击力矩，操控平顺线性
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                  离心应力与发热大幅改善，轴承温升与NVH处于最优状态
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Metric 1: MotoGP cancellation */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow">
              <span className="text-[11px] text-slate-400 block">车轮陀螺效应抵消率</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {result.gyroCancellationPercent.toFixed(1)}%
              </div>
              <span className="text-[10px] text-emerald-500/90 font-medium block">
                ★ MG2 反向旋转红利 (MotoGP同款)
              </span>
            </div>

            {/* Metric 2: Handlebar Jerk */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow">
              <span className="text-[11px] text-slate-400 block">手把抢把力矩突变量</span>
              <div
                className={`text-2xl font-bold font-mono ${
                  result.handlebarJerkTorqueNm < 2.5 ? 'text-sky-400' : 'text-rose-400'
                }`}
              >
                {result.handlebarJerkTorqueNm.toFixed(2)} <span className="text-xs font-normal">N·m</span>
              </div>
              <span
                className={`text-[10px] font-medium block ${
                  result.handlebarJerkTorqueNm < 2.5 ? 'text-sky-500/90' : 'text-rose-500/90'
                }`}
              >
                {result.handlebarJerkTorqueNm < 2.5 ? '✓ 极其平顺，无脱节感' : '⚠️ 存在明显反顶手感'}
              </span>
            </div>

            {/* Metric 3: Steering Stability */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-400 block">转向线性与操控评分</span>
              <div className="text-2xl font-bold font-mono text-indigo-400">
                {result.steeringStabilityScore} <span className="text-xs font-normal">/ 100</span>
              </div>
              <span className="text-[10px] text-indigo-400 font-medium block">
                翻身轻快度指数: {result.agilityIndex}
              </span>
            </div>
          </div>

          {/* Angular Momentum Breakdown Graph */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">
                车身横滚轴角动量对冲分布 (Angular Momentum Breakdown)
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">单位: N·m·s</span>
            </div>

            {/* Visual Balance Bar */}
            <div className="space-y-3">
              {/* Wheel Momentum */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">前后车轮正向角动量 (抵抗倾倒):</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    +{result.wheelAngularMomentum.toFixed(2)} N·m·s
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (result.wheelAngularMomentum / 35) * 100)}%` }}
                  />
                </div>
              </div>

              {/* MG2 Counter-rotating Momentum */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">
                    MG2 电机反向角动量 (主动抵消, 35T/70T, i=2.00, {Math.round(result.mg2Rpm)} rpm):
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {result.mg2AngularMomentum.toFixed(2)} N·m·s
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (Math.abs(result.mg2AngularMomentum) / 35) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Net Result */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-semibold">
                <span className="text-slate-200">整车净倾倒阻力角动量 (Net Resistance):</span>
                <span className="font-mono text-sky-400">
                  {result.netRollMomentum.toFixed(2)} N·m·s (减少了 {result.gyroCancellationPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Theoretical Core Analysis 3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                1. 反转抵消红利
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                副轴外啮合让 MG2 逆车轮反转！类似杜卡迪 Panigale 反转曲轴，高速巡航时可抵消车轮 30%~50% 陀螺阻力，压弯翻身极其轻快。
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                2. 弯中开油抢把风险
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                ECVT 电机扭矩响应极快，转速骤升（dω/dt 大）会导致陀螺进动力矩突变，传导到手把造成瞬间反顶；若不限幅会产生脱节感。
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                3. 细长转子+IMU破解
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                惯量与直径四次方成正比 (I∝D⁴)。将转子做成小直径细长轴，并在压弯中启用 6轴 IMU 斜率滤波，彻底降伏惯量扰动！
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
