import { GearParam, OperatingPoint } from '../types';

export const SYSTEM_CENTER_DISTANCE = 105.0; // mm (严格闭合中心距)

export const GEAR_SPECIFICATIONS: GearParam[] = [
  {
    name: '内燃机输入主动齿轮',
    code: 'z_ice',
    teeth: 48,
    module: 2.0,
    pitchDiameter: 96.0,
    width: 20.0,
    location: 'ICE 曲轴中置输出端 (X=0)',
    description: '合理加大至 48T (分度圆直径 d = 96.0mm，齿顶圆半径 50mm)，安装于双缸曲轴中央深井，顶部安全处于气缸底板下方(无气缸干涉)；中心距 a_ice = 120.0mm，初级速比 i₀ = 72/48 = 1.500'
  },
  {
    name: '主轴行星架输入从动齿轮',
    code: 'z_c_in',
    teeth: 72,
    module: 2.0,
    pitchDiameter: 144.0,
    width: 20.0,
    location: '主轴中间层空心套管 (居中 X=0)',
    description: '缩小定型至 72T (分度圆直径 d = 144.0mm，齿顶圆半径 74mm)，距平行中间轴 (Z=105mm) 留有 31.0mm 宽裕物理空气间隙，彻底消除与中间轴及传动部件的重叠冲突；初级速比 i₀ = 72/48 = 1.500'
  },
  {
    name: '行星排太阳轮',
    code: 'z_s',
    teeth: 18,
    module: 1.5,
    pitchDiameter: 27.0,
    width: 16.0,
    location: 'MG1 实心中心轴端部',
    description: '直连左侧 MG1 电机，负责调控发动机转速实现无级调速并平衡力矩；齿数进一步缩减至 18T (分度圆直径 d = 27.0mm, m=1.5)'
  },
  {
    name: '行星轮 (3个均布120°)',
    code: 'z_p',
    teeth: 18,
    module: 1.5,
    pitchDiameter: 27.0,
    width: 15.0,
    location: '行星架销轴 (分布圆直径 54.0mm)',
    description: '由行星架支承，自转同时绕太阳轮公转，内啮合齿圈内齿，外啮合太阳轮；齿数定型为 18T (分度圆直径 d = 27.0mm, m=1.5)'
  },
  {
    name: '行星排内齿圈',
    code: 'z_ri',
    teeth: 54,
    module: 1.5,
    pitchDiameter: 81.0,
    width: 22.0,
    location: '齿圈套筒内壁',
    description: '与 3 个行星轮内啮合。齿数进一步缩减至 54T，特性分流比 ρ = 54/18 = 3.000，满足均布装配整数条件 (18+54)/3=24'
  },
  {
    name: '行星齿圈外齿输出轮',
    code: 'z_ro',
    teeth: 60,
    module: 1.75,
    pitchDiameter: 105.0,
    width: 22.0,
    location: '齿圈套筒外壁',
    description: '向平行副轴输出分流机械动力。齿数缩减至 60T，齿宽为 22.0mm，外齿与内齿单边刚性壁厚达 12.0mm，刚度与承载力极高'
  },
  {
    name: '副轴受动小齿轮',
    code: 'z_c1',
    teeth: 60,
    module: 1.75,
    pitchDiameter: 105.0,
    width: 22.0,
    location: '平行副轴左中段',
    description: '齿数相应增加至 60T，齿宽为 22.0mm，啮合中心距 a₁ = (105.0 + 105.0) / 2 = 105.0 mm 绝对严格对齐，传动比 i_r_c = 60/60 = 1.000'
  },
  {
    name: 'MG2 主动减速小齿轮',
    code: 'z_m2',
    teeth: 35,
    module: 2.0,
    pitchDiameter: 70.0,
    width: 22.0,
    location: '右侧 MG2 独立输出小轴',
    description: '进一步加大至 35T (分度圆直径 d = 70.0 mm)，大幅提高齿根抗弯刚度并降低啮合线速度与高转运转噪音'
  },
  {
    name: '副轴被动大齿轮',
    code: 'z_c2',
    teeth: 70,
    module: 2.0,
    pitchDiameter: 140.0,
    width: 22.0,
    location: '平行副轴右段',
    description: '啮合中心距 a₂ = (70.0 + 140.0) / 2 = 105.0 mm 保持严丝合缝紧密啮合！MG2 独立减速比降至 i_m2 = 70/35 = 2.000'
  },
  {
    name: '终传主动小链轮',
    code: 'z_sprocket',
    teeth: 12,
    module: 0,
    pitchDiameter: 61.3,
    width: 8.0,
    location: '平行副轴最左悬臂端',
    description: '525 规格滚子链条主动小链轮，采用紧凑型 12T (分度圆半径 r=30.7mm)，极大优化副轴端部空间'
  },
  {
    name: '后轮从动大链轮',
    code: 'z_rear',
    teeth: 48,
    module: 0,
    pitchDiameter: 242.7,
    width: 8.0,
    location: '摩托车后轮毂左侧',
    description: '终传链条减速比增至 i_chain = 48/12 = 4.000 (12T小链轮与48T大齿盘配合)，后轮输出扭矩较此前大幅提升，起步推背感极致充沛'
  }
];

export const TYPICAL_OPERATING_POINTS: OperatingPoint[] = [
  {
    id: 'EV_LAUNCH',
    title: '纯电起步 / 极速弹射 (0 - 45 km/h)',
    vehicleSpeedKmh: 35,
    iceRpm: 0,
    iceTorqueNm: 0,
    mg1Rpm: -3570,
    mg1TorqueNm: 0,
    mg2Rpm: 2381,
    mg2TorqueNm: 68,
    countershaftRpm: 1190,
    wheelRpm: 298,
    rearWheelTorqueNm: 544,
    powerSplitMode: 'EV',
    description: '发动机静止停机 (行星架固定)，MG2 单独输出 68 N·m 峰值扭矩，经 2.00 独立减速与 4.000 (48/12) 终传链条放大，后轮平顺爆发 544 N·m 强劲推力！'
  },
  {
    id: 'ECO_CRUISE_100',
    title: '高效经济巡航 (100 km/h 稳态巡航)',
    vehicleSpeedKmh: 100,
    iceRpm: 3400,
    iceTorqueNm: 28,
    mg1Rpm: -1135,
    mg1TorqueNm: -9.8,
    mg2Rpm: 6803,
    mg2TorqueNm: 21,
    countershaftRpm: 3401,
    wheelRpm: 850,
    rearWheelTorqueNm: 168,
    powerSplitMode: 'SERIES_PARALLEL',
    description: '发动机稳定在 3400 rpm 最优热效率岛 (BSFC < 235 g/kWh)，在 1.50 初级速比、3.000 行星特性比与 4.000 (48/12) 终传比下，百公里巡航时 MG2 转速为 6,803 rpm，处于高效电机转速区间！'
  },
  {
    id: 'MAX_ACCEL_FULL',
    title: '全门全力并联加速 (80 - 130 km/h 超车)',
    vehicleSpeedKmh: 110,
    iceRpm: 5500,
    iceTorqueNm: 31,
    mg1Rpm: 3445,
    mg1TorqueNm: -10.9,
    mg2Rpm: 7483,
    mg2TorqueNm: 55,
    countershaftRpm: 3741,
    wheelRpm: 935,
    rearWheelTorqueNm: 440,
    powerSplitMode: 'MAX_ACCEL',
    description: 'ICE 输出 17.8 kW 机械功率，电池与 MG1 发电共同支撑 MG2 释放 55 N·m 补扭，经 4.000 (48/12) 终传比在后轮爆发 440 N·m 强悍推力。'
  },
  {
    id: 'TOP_SPEED_160',
    title: '高速冲刺巡航 (130 km/h 工况校核)',
    vehicleSpeedKmh: 130,
    iceRpm: 6000,
    iceTorqueNm: 29.4,
    mg1Rpm: 2738,
    mg1TorqueNm: -10.3,
    mg2Rpm: 8843,
    mg2TorqueNm: 27,
    countershaftRpm: 4422,
    wheelRpm: 1105,
    rearWheelTorqueNm: 216,
    powerSplitMode: 'HIGH_SPEED_CRUISE',
    description: '终传比为 4.000 (48/12) 时，130 km/h 巡航下 MG2 转速为 8,843 rpm，在 9,000 rpm 极限红线内平稳运转，兼备极其狂暴的低中速轮端提速爆发力！'
  },
  {
    id: 'EV_REVERSE',
    title: '纯电倒车挡 (Reverse Mode 3 km/h)',
    vehicleSpeedKmh: -3,
    iceRpm: 0,
    iceTorqueNm: 0,
    mg1Rpm: 306,
    mg1TorqueNm: 0,
    mg2Rpm: -204,
    mg2TorqueNm: 25,
    countershaftRpm: -102,
    wheelRpm: -26,
    rearWheelTorqueNm: 200,
    powerSplitMode: 'REVERSE',
    description: '传统重型巡航摩托车最痛的倒车难题迎刃而解：MG2 反向低速运转，实现平顺低速倒车，彻底免去手动推车烦恼。'
  }
];
