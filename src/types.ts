/**
 * 摩托车功率分流混动架构 (Motorcycle Power-Split Hybrid ECVT) 核心数据类型定义
 */

export interface GearParam {
  name: string;
  code: string;
  teeth: number;
  module: number;
  pitchDiameter: number; // 分度圆直径 (mm)
  width: number;         // 齿宽 (mm)
  location: string;
  description: string;
}

export interface OperatingPoint {
  id: string;
  title: string;
  vehicleSpeedKmh: number;
  iceRpm: number;
  iceTorqueNm: number;
  mg1Rpm: number;
  mg1TorqueNm: number;
  mg2Rpm: number;
  mg2TorqueNm: number;
  countershaftRpm: number;
  wheelRpm: number;
  rearWheelTorqueNm: number;
  powerSplitMode: 'EV' | 'SERIES_PARALLEL' | 'HIGH_SPEED_CRUISE' | 'MAX_ACCEL' | 'REVERSE';
  description: string;
}

export interface GyroSimulationParams {
  speedKmh: number;
  leanAngleDeg: number;       // 压弯倾角 (0 - 55 deg)
  rollRateDegPerSec: number;  // 翻身倾倒角速度 (deg/s)
  throttleRampRateRpmS: number; // 电机转速瞬态爬升率 (rpm/s, 0 - 50,000)
  rotorType: 'slender' | 'pancake'; // 细长轴型 vs 传统盘式
  imuSlewLimitEnabled: boolean;     // 6轴 IMU 倾角斜率限制
}

export interface GyroSimulationResult {
  wheelAngularMomentum: number; // N·m·s
  mg2AngularMomentum: number;   // N·m·s (负值，反转抵消)
  mg1AngularMomentum: number;   // N·m·s
  netRollMomentum: number;      // 净角动量
  gyroCancellationPercent: number; // MotoGP 翻身轻巧度增益 %
  handlebarJerkTorqueNm: number;   // 瞬态抢把/反顶力矩 (N·m)
  steeringStabilityScore: number;  // 转向稳定性指数 0 - 100
  agilityIndex: number;            // 倾倒灵活性指数 0 - 100
  antiSquatPitchJerkNm: number;    // 后避震俯仰冲击力矩
  wheelRpm: number;                // 后轮实时转速
  countershaftRpm: number;         // 副轴实时转速
  mg2Rpm: number;                  // MG2 实时转速 (35T/70T, 2.000比)
}
