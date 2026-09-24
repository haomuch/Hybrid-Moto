import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Play, Pause, Download, RotateCcw, Eye, Layers, Sliders, Gauge, RotateCw, Cog } from 'lucide-react';
import { SYSTEM_CENTER_DISTANCE } from '../data/engineeringData';

interface ThreeCutawayViewerProps {
  currentModeSpeedMultiplier?: number;
  highlightedComponent?: string | null;
  onSelectComponent?: (name: string) => void;
}

export const ThreeCutawayViewer: React.FC<ThreeCutawayViewerProps> = ({
  currentModeSpeedMultiplier = 1.0,
  highlightedComponent,
  onSelectComponent
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Animation & Viewport states
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [cameraPreset, setCameraPreset] = useState<'isometric' | 'top' | 'planetary' | 'mesh' | 'chain'>('isometric');
  const [showHousing, setShowHousing] = useState(false);
  const [explodeRatio, setExplodeRatio] = useState(0);

  // --- 手动动力学交互控制面板状态 (Interactive Speed & RPM Control Panel) ---
  const [controlMode, setControlMode] = useState<'preset' | 'manual'>('manual');
  const [manualVehicleSpeedKmh, setManualVehicleSpeedKmh] = useState(60); // 0 - 180 km/h
  const [manualIceRpm, setManualIceRpm] = useState(3000);                 // 0 - 8500 rpm
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  // Ref to hold live speed / engine RPM for high-performance animation loop
  const kinRef = useRef({
    controlMode: 'manual' as 'preset' | 'manual',
    vehicleSpeedKmh: 60,
    iceRpm: 3000
  });

  // Keep kinRef synced with React state
  useEffect(() => {
    kinRef.current.controlMode = controlMode;
    kinRef.current.vehicleSpeedKmh = manualVehicleSpeedKmh;
    kinRef.current.iceRpm = manualIceRpm;
  }, [controlMode, manualVehicleSpeedKmh, manualIceRpm]);

  // Rotating parts references for kinematics
  const rotatingPartsRef = useRef<{
    iceGroup?: THREE.Group;
    conRod1?: THREE.Group;
    conRod2?: THREE.Group;
    piston1?: THREE.Group;
    piston2?: THREE.Group;
    carrierGroup?: THREE.Group;
    carrierInput?: THREE.Group;
    torqueTube?: THREE.Mesh;
    sunGroup?: THREE.Group;
    planetGroups: THREE.Group[];
    ringGroup?: THREE.Group;
    mg1Group?: THREE.Group;
    mg2Group?: THREE.Group;
    mg2Pinion?: THREE.Group;
    countershaftGroup?: THREE.Group;
    rearWheelGroup?: THREE.Group;
  }>({
    planetGroups: []
  });

  // Explodable groups references
  const explodablePartsRef = useRef<{
    mg1?: THREE.Group;
    ice?: THREE.Group;
    carrier?: THREE.Group;
    carrierInput?: THREE.Group;
    torqueTube?: THREE.Mesh;
    sun?: THREE.Group;
    ring?: THREE.Group;
    mg2?: THREE.Group;
    countershaft?: THREE.Group;
    countershaftBearing?: THREE.Group;
    rearWheel?: THREE.Group;
    chain?: THREE.Group | THREE.Mesh;
  }>({});

  // Procedural true-circular gear creator with involute-profile extruded geometry
  // Mathematically true circle in polar coordinates to guarantee zero elliptical distortion
  const createGearMesh = useCallback((
    pitchRadius: number,
    width: number,
    teeth: number,
    color: number,
    boreRadius = 6,
    isHollow = false,
    cutawaySpanAngle = 0 // radians: if > 0, cuts away sector to expose internal gears
  ) => {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.88,
      roughness: 0.25
    });

    const shape = new THREE.Shape();
    const m = (2 * pitchRadius) / teeth;
    const rAddendum = pitchRadius + 0.85 * m;
    const rDedendum = Math.max(pitchRadius - 1.15 * m, boreRadius + 1.5);
    const dTheta = (Math.PI * 2) / teeth;

    if (cutawaySpanAngle > 0) {
      // Cutaway gear sector (leaves window open around top)
      const halfCut = cutawaySpanAngle / 2;
      const startAngle = halfCut;
      const endAngle = Math.PI * 2 - halfCut;
      const startTooth = Math.ceil(startAngle / dTheta);
      const endTooth = Math.floor(endAngle / dTheta);

      const rInner = Math.max(boreRadius, rDedendum * 0.72);
      shape.moveTo(Math.cos(startAngle) * rInner, Math.sin(startAngle) * rInner);
      shape.lineTo(Math.cos(startAngle) * rDedendum, Math.sin(startAngle) * rDedendum);

      for (let i = startTooth; i <= endTooth; i++) {
        const t0 = i * dTheta;
        const a1 = t0 - dTheta * 0.28;
        shape.lineTo(Math.cos(a1) * rDedendum, Math.sin(a1) * rDedendum);
        const a2 = t0 - dTheta * 0.18;
        shape.lineTo(Math.cos(a2) * pitchRadius, Math.sin(a2) * pitchRadius);
        const a3 = t0 - dTheta * 0.10;
        shape.lineTo(Math.cos(a3) * rAddendum, Math.sin(a3) * rAddendum);
        const a4 = t0 + dTheta * 0.10;
        shape.lineTo(Math.cos(a4) * rAddendum, Math.sin(a4) * rAddendum);
        const a5 = t0 + dTheta * 0.18;
        shape.lineTo(Math.cos(a5) * pitchRadius, Math.sin(a5) * pitchRadius);
        const a6 = t0 + dTheta * 0.28;
        shape.lineTo(Math.cos(a6) * rDedendum, Math.sin(a6) * rDedendum);
      }

      shape.lineTo(Math.cos(endAngle) * rInner, Math.sin(endAngle) * rInner);
      shape.absarc(0, 0, rInner, endAngle, startAngle, true);
      shape.closePath();
    } else {
      // Complete circular gear profile (360 degrees)
      const a0 = -dTheta * 0.28;
      shape.moveTo(Math.cos(a0) * rDedendum, Math.sin(a0) * rDedendum);

      for (let i = 0; i < teeth; i++) {
        const t0 = i * dTheta;
        const a1 = t0 - dTheta * 0.28;
        shape.lineTo(Math.cos(a1) * rDedendum, Math.sin(a1) * rDedendum);
        const a2 = t0 - dTheta * 0.18;
        shape.lineTo(Math.cos(a2) * pitchRadius, Math.sin(a2) * pitchRadius);
        const a3 = t0 - dTheta * 0.10;
        shape.lineTo(Math.cos(a3) * rAddendum, Math.sin(a3) * rAddendum);
        const a4 = t0 + dTheta * 0.10;
        shape.lineTo(Math.cos(a4) * rAddendum, Math.sin(a4) * rAddendum);
        const a5 = t0 + dTheta * 0.18;
        shape.lineTo(Math.cos(a5) * pitchRadius, Math.sin(a5) * pitchRadius);
        const a6 = t0 + dTheta * 0.28;
        shape.lineTo(Math.cos(a6) * rDedendum, Math.sin(a6) * rDedendum);
      }
      shape.closePath();

      // Bore hole
      if (boreRadius > 0) {
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
        shape.holes.push(holePath);
      }

      // Weight reduction circular pockets for larger gears
      if (pitchRadius > 44 && !isHollow) {
        const numPockets = pitchRadius > 60 ? 6 : 4;
        const pocketR = (rDedendum - boreRadius) * 0.22;
        const orbitR = boreRadius + (rDedendum - boreRadius) * 0.54;
        for (let p = 0; p < numPockets; p++) {
          const pa = (p / numPockets) * Math.PI * 2;
          const hp = new THREE.Path();
          hp.absarc(Math.cos(pa) * orbitR, Math.sin(pa) * orbitR, pocketR, 0, Math.PI * 2, true);
          shape.holes.push(hp);
        }
      }
    }

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: width,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.5,
      bevelThickness: 0.5
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center width and align along X axis (transverse motorcycle axis)
    geom.translate(0, 0, -width / 2);
    geom.rotateY(Math.PI / 2);

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Inner hub reinforcement collar if not hollow
    if (!isHollow && boreRadius > 0 && cutawaySpanAngle === 0) {
      const hubGeom = new THREE.CylinderGeometry(boreRadius + 3.5, boreRadius + 3.5, width * 1.08, 28);
      hubGeom.rotateZ(Math.PI / 2);
      const hubMesh = new THREE.Mesh(hubGeom, material);
      group.add(hubMesh);
    }

    return group;
  }, []);

  // Procedural internal ring gear generator with true inward-pointing involute teeth and external cylindrical shell
  // Generates internal teeth (78T, m=1.75, pitch diameter 136.5mm) and hollow outer boundary (radius 75.0mm)
  const createInternalRingGearMesh = useCallback((
    pitchRadius: number = 68.25, // d_ring / 2 = 136.5 / 2 = 68.25 mm
    outerRimRadius: number = 75.0, // External wall radius
    width: number = 18,
    teeth: number = 78,
    color: number = 0x16a34a,
    extModule: number = 1.75
  ) => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.78,
      roughness: 0.22,
      side: THREE.DoubleSide
    });

    const dedendum = 1.25 * extModule; // 2.1875 mm
    const addendum = 1.0 * extModule;  // 1.75 mm
    const rootRadius = pitchRadius + dedendum; // 70.4375 mm (outer base of internal tooth space)
    const tipRadius = pitchRadius - addendum;  // 66.50 mm (inner tip of internal tooth)

    const shape = new THREE.Shape();
    // Outer contour: Outer cylindrical shell (smooth counterclockwise circle)
    shape.absarc(0, 0, outerRimRadius, 0, Math.PI * 2, false);

    // Inner hole with internal teeth pointing radially inward (clockwise hole to subtract material)
    const holePath = new THREE.Path();
    const toothAngle = (Math.PI * 2) / teeth;
    let isFirst = true;

    for (let i = 0; i < teeth; i++) {
      const a0 = i * toothAngle;
      // Clockwise traversal around the center
      const aRoot1 = a0;
      const aTip1 = a0 + toothAngle * 0.26;
      const aTip2 = a0 + toothAngle * 0.54;
      const aRoot2 = a0 + toothAngle * 0.80;

      const p0x = Math.cos(aRoot1) * rootRadius;
      const p0y = Math.sin(aRoot1) * rootRadius;
      const p1x = Math.cos(aTip1) * tipRadius;
      const p1y = Math.sin(aTip1) * tipRadius;
      const p2x = Math.cos(aTip2) * tipRadius;
      const p2y = Math.sin(aTip2) * tipRadius;
      const p3x = Math.cos(aRoot2) * rootRadius;
      const p3y = Math.sin(aRoot2) * rootRadius;

      if (isFirst) {
        holePath.moveTo(p0x, p0y);
        isFirst = false;
      } else {
        holePath.lineTo(p0x, p0y);
      }
      holePath.lineTo(p1x, p1y);
      holePath.lineTo(p2x, p2y);
      holePath.lineTo(p3x, p3y);
    }
    holePath.closePath();
    shape.holes.push(holePath);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: width,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.35,
      bevelThickness: 0.35
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.translate(0, 0, -width / 2);
    geom.rotateY(Math.PI / 2);

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Sizing: Ensure non-zero
    const initialWidth = container.clientWidth > 50 ? container.clientWidth : 960;
    const initialHeight = container.clientHeight > 50 ? container.clientHeight : 680;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    sceneRef.current = scene;

    // 2. Camera: Default to high-clarity 3D isometric cutaway view
    const camera = new THREE.PerspectiveCamera(38, initialWidth / initialHeight, 1, 5000);
    camera.position.set(450, 480, 680);
    camera.up.set(0, 1, 0);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;

    // Clear any previous canvas
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -40, 260);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxDistance = 2500;
    controls.minDistance = 80;
    controlsRef.current = controls;

    // 5. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.8);
    mainLight.position.set(200, 500, 250);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const blueFillLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    blueFillLight.position.set(-250, 280, -150);
    scene.add(blueFillLight);

    const goldFillLight = new THREE.DirectionalLight(0xf59e0b, 1.2);
    goldFillLight.position.set(250, -100, -150);
    scene.add(goldFillLight);

    const topFill = new THREE.DirectionalLight(0xffffff, 1.0);
    topFill.position.set(0, 400, 0);
    scene.add(topFill);

    // Floor Grid Helper (Positioned at motorcycle tire ground contact plane Y = -312.0 mm)
    const gridHelper = new THREE.GridHelper(1600, 40, 0x334155, 0x1e293b);
    gridHelper.position.set(0, -312, 300);
    scene.add(gridHelper);

    // ================= Coordinate Setup =================
    // X = Left/Right (MG1 is Left, Planetary Shifted Left, Middle is ICE-Carrier Input, MG2 is Right)
    // Y = Vertical height
    // Z = Front/Back (Negative Z = Front/ICE, Positive Z = Rear/Wheel)
    const AXIS1_Z = 0;
    const AXIS2_Z = SYSTEM_CENTER_DISTANCE; // strictly 105.0 mm
    // Carrier input gear resized to 72T (m=2.0, r=72.0mm, pitch dia 144mm).
    // ICE crank pinion reasonably enlarged to 48T (m=2.0, r=48.0mm, pitch dia 96mm).
    // Sum of pitch radii: r_ice(48.0) + r_c_in(72.0) = 120.0 mm!
    // Engine crankshaft positioned at ICE_CRANK_Z = -120.0 mm.
    // 74T Ring Gear has outer pitch radius 64.75mm (tip radius ~66.5mm) centered at Z = 0.
    // 350cc Twin-Cylinder ICE Front Unit:
    // Engine Crankshaft Axis (Axis 0): Y = 0.0mm, Z = -120.0mm.
    // Center distance to Main Shaft (Axis 1, Z = 0) is a_ice = 120.0mm.
    // Radial separation: distance from crank axis (-120mm) to ring gear tip (-66.5mm) is 53.5mm.
    // Max crankweb sweep radius <= 46mm, leaving 7.5mm clear radial air gap: ZERO COLLISION in 3D!
    // Carrier input gear (72T, tip radius 74.0mm) to Axis 2 (Z = 105.0mm) clearance: 105 - 74 = 31.0mm!
    // Spatial conflict with intermediate shaft is 100% eliminated!
    // Dual cylinders maintain authentic compact motorcycle parallel-twin bore pitch of 84.0mm (X = -42mm and +42mm)!
    const ICE_CRANK_Z = -120.0;
    const ICE_BLOCK_Z = -162.0;
    // Authentic motorcycle swingarm & rear axle distance:
    // Axis 2 (countershaft) is at Z = 105.0 mm. Swingarm center distance a_chain = 550.0 mm.
    // REAR_Z = 105.0 + 550.0 = 655.0 mm.
    // Rear tire R = 312.0 mm reaches frontmost at Z = 655.0 - 312.0 = 343.0 mm.
    // Leaves 238.0 mm realistic clearance for engine rear casing, swingarm pivot, monoshock, and tire hugger!
    const REAR_Z = 655.0;
    const PLANETARY_X = -46.0; // Left-offset planetary gearset (strictly -46.0mm) with complete spatial clearance from ICE crankweb

    // Materials
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.25 });
    const darkAlloyMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.35 });
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
    const tireRubberMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.05, roughness: 0.92 });
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.75, roughness: 0.3 });
    const aluMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.82, roughness: 0.22 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.35 });
    const polishedSteelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.12 });
    const forgedSteelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.35,
      side: THREE.DoubleSide
    });
    const sinteredTungstenMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.22,
      side: THREE.DoubleSide
    });
    const retentionRingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.90,
      roughness: 0.40,
      side: THREE.DoubleSide
    });
    const castCrankcaseMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.82,
      roughness: 0.42,
      side: THREE.DoubleSide
    });
    const bearingBronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.9,
      roughness: 0.2
    });

    // ---------------- 1. ICE Front Unit & Central-Drive Crankshaft (Authentic 500cc Twin-Cylinder DOHC 8V) ----------------
    // Realistic 500cc Parallel-Twin Architecture (Honda 500cc CB/CBR benchmark proportions):
    // - Bore B = 67.0mm (radius 33.5mm), Stroke S = 66.8mm (crank throw radius R = 33.4mm)
    // - Exact Displacement: 2 * (π/4 * 67.0² * 66.8) = 471cc (industry standard 500cc motorcycle parallel twin)
    // - Bore Pitch: 108.0mm (Cylinder 1 at X = -54.0mm, Cylinder 2 at X = +54.0mm)
    //   Provides generous 16mm air gap between cylinder barrels and a spacious 56mm central gear/bearing bay!
    // - Con-rod center-to-center length: L = 120.0mm (L/S ratio = 1.796, optimal for 9,000+ rpm high-rev dynamic balance)
    // - Central 48T gear at X = 0 (radius 48.0mm, width 20mm) drives 72T input gear at a_ice = 120.0mm with 100% conjugate mesh!
    const iceGroup = new THREE.Group();
    iceGroup.position.set(0, 0, ICE_CRANK_Z);

    // Crankshaft Rotating Assembly Group (Rotates at local Z = 0 inside iceGroup)
    const crankshaftAssembly = new THREE.Group();
    crankshaftAssembly.position.set(0, 0, 0);

    // 1.1 Central 48T Output Gear (z_ice = 48, m=2.0, d=96mm, radius=48.0mm, width=20mm)
    // Located at the exact axial center (X = 0), tip radius 50.0mm safely clears cylinder bottom deck (Y = +56mm)
    // Offset phase by Math.PI / 48 (half tooth pitch) for conjugate tooth-in-valley meshing with 72T gear
    const iceGearGroup = createGearMesh(48.0, 20, 48, 0x94a3b8, 14);
    iceGearGroup.position.set(0, 0, 0);
    iceGearGroup.rotation.x = Math.PI / 48;
    crankshaftAssembly.add(iceGearGroup);

    // 1.1 Continuous Forged Central Main Shaft (spanning X = -31.5mm to +31.5mm, Φ35mm, width 63.0mm)
    // Directly and solidly connects Cylinder 1 inner web (X = -31.5mm), left main bearing (X = -20.5mm),
    // central 48T output gear (X = 0), right main bearing (X = +20.5mm), and Cylinder 2 inner web (X = +31.5mm)!
    // 100% monolithic, completely eliminating any floating gear effect!
    const centerMainShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(17.5, 17.5, 63.0, 32),
      polishedSteelMat
    );
    centerMainShaft.rotateZ(Math.PI / 2);
    centerMainShaft.position.set(0, 0, 0);
    centerMainShaft.castShadow = true;
    crankshaftAssembly.add(centerMainShaft);

    // Integral Gear Mounting Hub Shoulders / Collars flanking 48T gear (radius 19.5mm, width 4.0mm)
    for (const side of [-1, 1]) {
      const gearHubCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(19.5, 19.5, 4.0, 28),
        polishedSteelMat
      );
      gearHubCollar.rotateZ(Math.PI / 2);
      gearHubCollar.position.set(side * 12.0, 0, 0);
      crankshaftAssembly.add(gearHubCollar);

      // Realistic slim shell main bearing (width 6.5mm, radius 20.5mm, centered at X = ±20.5mm)
      const centerBearing = new THREE.Mesh(
        new THREE.CylinderGeometry(20.5, 20.5, 6.5, 28),
        steelMat
      );
      centerBearing.rotateZ(Math.PI / 2);
      centerBearing.position.set(side * 20.5, 0, 0);
      crankshaftAssembly.add(centerBearing);
    }

    // Outer Main Bearing Journals (outer side of Cyl 1 & Cyl 2 outer webs at X = ±83.0mm, width 10mm)
    // Shaft ends safely at X = ±88.0mm, leaving a generous 5.0mm axial clearance to side covers (X = ±93mm inner)
    for (const side of [-1, 1]) {
      const outerJournal = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 17.5, 10.0, 28), polishedSteelMat);
      outerJournal.rotateZ(Math.PI / 2);
      outerJournal.position.set(side * 83.0, 0, 0);
      crankshaftAssembly.add(outerJournal);

      const outerBearing = new THREE.Mesh(new THREE.CylinderGeometry(20.5, 20.5, 8.0, 28), steelMat);
      outerBearing.rotateZ(Math.PI / 2);
      outerBearing.position.set(side * 83.0, 0, 0);
      crankshaftAssembly.add(outerBearing);
    }

    // 1.2 Forged Knife-Edge Crankwebs with Mechanically Embedded Tungsten Balance Slugs (500cc, S = 66.8mm, R_crank = 33.4mm)
    // 108mm Bore Pitch: Cylinder 1 at X = -54.0mm, Cylinder 2 at X = +54.0mm
    // STRICT NON-SELF-INTERSECTING COUNTER-CLOCKWISE POLYGON:
    // Crankpin head boss (Y = 33.4mm, R = 15.0mm) transitions smoothly into dynamic fan lobe (center Y = -8.0mm, R = 40.0mm)
    // Dynamic swept radius strictly limited to R_max = 48.4mm (comfortably clears 53mm inner crankcase with zero clipping!)
    // Completely solid and opaque with non-inverted normals
    const webShape = new THREE.Shape();
    webShape.absarc(0, 33.4, 15.0, 0, Math.PI, false);
    webShape.lineTo(-17.0, 2.0);
    webShape.absarc(0, -8.0, 40.0, 2.75, 0.39, false);
    webShape.lineTo(17.0, 2.0);
    webShape.closePath();

    const webGeom = new THREE.ExtrudeGeometry(webShape, {
      depth: 11.0, // 11mm thick solid forged web
      bevelEnabled: true,
      bevelSize: 0.8,
      bevelThickness: 0.8,
      curveSegments: 36
    });
    webGeom.translate(0, 0, -5.5);
    webGeom.rotateY(Math.PI / 2); // local 3D: X axial, Y vertical, Z fore-aft

    // Helper: Build precision forged crank web with mechanically embedded tungsten balance slugs
    // Completely solid, opaque, with CNC stepped counterbores, flush-ground sintered tungsten slugs,
    // retaining snap-rings, and lathe center points.
    const createForgedCrankWeb = () => {
      const webGroup = new THREE.Group();
      const mainWeb = new THREE.Mesh(webGeom, forgedSteelMat);
      mainWeb.castShadow = true;
      webGroup.add(mainWeb);

      // Lightening pockets on both sides of the web forging
      for (const sideX of [-5.6, 5.6]) {
        const pocket = new THREE.Mesh(
          new THREE.CylinderGeometry(11.0, 11.0, 0.8, 24),
          retentionRingMat
        );
        pocket.rotateZ(Math.PI / 2);
        pocket.position.set(sideX, -16, 0);
        webGroup.add(pocket);
      }

      // Two precision interference-fit sintered tungsten-alloy balance slugs per web (at Y = -30.0mm, Z = ±14.0mm)
      // Solidly embedded inside forged steel cheek (depth bounds well within counterweight lobe)
      for (const zOffset of [-14.0, 14.0]) {
        const slugY = -30.0;
        const slugZ = zOffset;

        // 1. Machined CNC Stepped Counterbore Chamfer Ring (Shows precision boring in forged steel)
        for (const faceX of [-5.55, 5.55]) {
          const boreChamfer = new THREE.Mesh(
            new THREE.RingGeometry(6.0, 7.5, 24),
            retentionRingMat
          );
          boreChamfer.rotateY(Math.PI / 2);
          boreChamfer.position.set(faceX, slugY, slugZ);
          webGroup.add(boreChamfer);

          // Precision press-fit retaining steel snap-ring / staking groove
          const retainingRing = new THREE.Mesh(
            new THREE.TorusGeometry(6.0, 0.45, 8, 24),
            steelMat
          );
          retainingRing.rotateY(Math.PI / 2);
          retainingRing.position.set(faceX, slugY, slugZ);
          webGroup.add(retainingRing);

          // Hardened anti-rotation dowel pin / staking key (pressed tangentially into web-slug joint)
          const dowelKey = new THREE.Mesh(
            new THREE.CylinderGeometry(0.9, 0.9, 1.2, 8),
            polishedSteelMat
          );
          dowelKey.rotateZ(Math.PI / 2);
          dowelKey.position.set(faceX, slugY + 5.9, slugZ);
          webGroup.add(dowelKey);
        }

        // 2. High-Density Sintered Tungsten Cylinder Slug (Φ12.0mm, axial length 11.2mm - flush with web faces)
        const slug = new THREE.Mesh(
          new THREE.CylinderGeometry(6.0, 6.0, 11.2, 28),
          sinteredTungstenMat
        );
        slug.rotateZ(Math.PI / 2);
        slug.position.set(0, slugY, slugZ);
        webGroup.add(slug);

        // 3. Center lathe locating dimple on tungsten face from precision dynamic balancing
        for (const dimpleX of [-5.6, 5.6]) {
          const dimple = new THREE.Mesh(
            new THREE.ConeGeometry(1.3, 1.0, 12),
            retentionRingMat
          );
          dimple.rotateZ(dimpleX > 0 ? -Math.PI / 2 : Math.PI / 2);
          dimple.position.set(dimpleX, slugY, slugZ);
          webGroup.add(dimple);
        }
      }

      return webGroup;
    };

    // Helper: Hollow Drilled Crankpin (Φ30mm, ground length 24mm, hollow bore Φ14mm)
    const createDrilledCrankpin = (posX: number, posY: number) => {
      const pinGroup = new THREE.Group();
      pinGroup.position.set(posX, posY, 0);

      // Micro-ground high-tensile crankpin journal
      const pinBody = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 24, 32), polishedSteelMat);
      pinBody.rotateZ(Math.PI / 2);
      pinGroup.add(pinBody);

      // Ground fillet shoulders at web joints
      for (const fx of [-11.5, 11.5]) {
        const fillet = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1.5, 28), polishedSteelMat);
        fillet.rotateZ(Math.PI / 2);
        fillet.position.set(fx, 0, 0);
        pinGroup.add(fillet);
      }

      // Hollow lightening bore through crankpin (Φ14mm)
      const pinBore = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 24.4, 24), darkAlloyMat);
      pinBore.rotateZ(Math.PI / 2);
      pinGroup.add(pinBore);

      // Pressurized cross-drilled oil feed hole
      const oilHole = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 3.2, 12), darkAlloyMat);
      oilHole.position.set(0, 14.5, 0);
      pinGroup.add(oilHole);

      return pinGroup;
    };

    // Left Crank Throw (Cylinder 1 at X = -54.0mm) - 0° orientation (Pin at Y = +33.4, Web at Y = -16)
    // Inner web centered at X = -37.0mm, outer web centered at X = -71.0mm
    const webL1 = createForgedCrankWeb();
    webL1.position.set(-37.0, 0, 0);
    crankshaftAssembly.add(webL1);

    const webL2 = createForgedCrankWeb();
    webL2.position.set(-71.0, 0, 0);
    crankshaftAssembly.add(webL2);

    const crankPinL = createDrilledCrankpin(-54.0, 33.4);
    crankshaftAssembly.add(crankPinL);

    // Right Crank Throw (Cylinder 2 at X = +54.0mm) - 180° OPPOSITE orientation (Pin at Y = -33.4, Web at Y = +16)
    // Inner web centered at X = +37.0mm, outer web centered at X = +71.0mm
    const webR1 = createForgedCrankWeb();
    webR1.position.set(37.0, 0, 0);
    webR1.rotation.x = Math.PI;
    crankshaftAssembly.add(webR1);

    const webR2 = createForgedCrankWeb();
    webR2.position.set(71.0, 0, 0);
    webR2.rotation.x = Math.PI;
    crankshaftAssembly.add(webR2);

    const crankPinR = createDrilledCrankpin(54.0, -33.4);
    crankshaftAssembly.add(crankPinR);

    // (Flywheel mass is integrally provided by the central 48T ICE primary output gear at X = 0)
    iceGroup.add(crankshaftAssembly);

    // 1.3 Authentic 500cc Forged H-Beam Connecting Rod (L = 120.0mm, Width 18mm)
    // Streamlined big-end cap radius R=17.2mm strictly constrains rod swing within crankcase front/rear bounds (Z in [-46.4, +46.4]mm)
    const createAuthenticConRod = (rodLength = 120.0) => {
      const conRodAssembly = new THREE.Group();

      const rodShape = new THREE.Shape();
      rodShape.absarc(0, 0, 17.2, Math.PI * 0.74, Math.PI * 0.26, true);
      rodShape.lineTo(14.0, 2);
      rodShape.lineTo(13.0, 14);
      rodShape.lineTo(6.5, 26);
      rodShape.lineTo(5.5, rodLength - 18);
      rodShape.lineTo(12.0, rodLength - 4);
      rodShape.absarc(0, rodLength, 12.0, 0, Math.PI, false);
      rodShape.lineTo(-12.0, rodLength - 4);
      rodShape.lineTo(-5.5, rodLength - 18);
      rodShape.lineTo(-6.5, 26);
      rodShape.lineTo(-13.0, 14);
      rodShape.lineTo(-14.0, 2);
      rodShape.closePath();

      // Big-End Crankpin Bore: Φ30.0mm (radius 15.0mm) at (0, 0)
      const bigHole = new THREE.Path();
      bigHole.absarc(0, 0, 15.0, 0, Math.PI * 2, true);
      rodShape.holes.push(bigHole);

      // Small-End Wrist Pin Bore: Φ17.0mm (radius 8.5mm) at (0, rodLength)
      const smallHole = new THREE.Path();
      smallHole.absarc(0, rodLength, 8.5, 0, Math.PI * 2, true);
      rodShape.holes.push(smallHole);

      const rodGeom = new THREE.ExtrudeGeometry(rodShape, {
        depth: 18.0,
        bevelEnabled: true,
        bevelSize: 0.5,
        bevelThickness: 0.5,
        curveSegments: 32
      });
      rodGeom.translate(0, 0, -9.0);
      rodGeom.rotateY(Math.PI / 2);

      const rodMesh = new THREE.Mesh(rodGeom, steelMat);
      conRodAssembly.add(rodMesh);

      // Compact Cap Studs & Nuts (2 high-tensile ARP-spec bolts, bz = ±11.5mm)
      for (const bz of [-11.5, 11.5]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 15, 12), darkAlloyMat);
        stud.position.set(0, 3, bz);
        conRodAssembly.add(stud);

        const nut = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 3.5, 6), steelMat);
        nut.position.set(0, -7.0, bz);
        conRodAssembly.add(nut);
      }

      // H-Beam Flute Recesses
      for (const sideX of [-9.2, 9.2]) {
        const flute = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, rodLength - 50, 6.0),
          darkAlloyMat
        );
        flute.position.set(sideX, rodLength / 2 + 2, 0);
        conRodAssembly.add(flute);
      }

      return conRodAssembly;
    };

    // 1.4 Twin 500cc Cylinders, Pistons & Connecting Rods (Bore 67.0mm, Stroke 66.8mm, Pitch 108mm)
    const cylLinerMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide
    });
    const cylBarrelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.35,
      side: THREE.DoubleSide
    });

    // Helper: Create a solid annular sector shape spanning uncut angle from thetaStart to thetaEnd
    const createSectorShape = (rIn: number, rOut: number, thetaStart: number, thetaEnd: number, segs = 36) => {
      const shape = new THREE.Shape();
      // 1. Cut face at thetaStart: from rIn to rOut
      shape.moveTo(rIn * Math.sin(thetaStart), rIn * Math.cos(thetaStart));
      shape.lineTo(rOut * Math.sin(thetaStart), rOut * Math.cos(thetaStart));

      // 2. Outer arc from thetaStart to thetaEnd
      for (let i = 1; i <= segs; i++) {
        const t = thetaStart + (i / segs) * (thetaEnd - thetaStart);
        shape.lineTo(rOut * Math.sin(t), rOut * Math.cos(t));
      }

      // 3. Cut face at thetaEnd: from rOut to rIn
      shape.lineTo(rIn * Math.sin(thetaEnd), rIn * Math.cos(thetaEnd));

      // 4. Inner arc from thetaEnd back to thetaStart
      for (let i = segs - 1; i >= 0; i--) {
        const t = thetaStart + (i / segs) * (thetaEnd - thetaStart);
        shape.lineTo(rIn * Math.sin(t), rIn * Math.cos(t));
      }

      shape.closePath();
      return shape;
    };

    // Symmetrical 135° front cutaway opening: uncut cylinder barrel spans 225° around sides & rear
    // theta = 0 is Rear (+Z), theta = ±PI is Front (-Z). Uncut arc: from -112.5° (-0.625*PI) to +112.5° (+0.625*PI)
    const arcStart = -Math.PI * 0.625;
    const arcEnd = Math.PI * 0.625;

    // A. Solid Polished Cylinder Inner Sleeve Liner (Radius 33.5mm to 36.0mm, thickness 2.5mm centrifugally cast alloy)
    const linerShape = createSectorShape(33.5, 36.0, arcStart, arcEnd, 36);
    const linerGeom = new THREE.ExtrudeGeometry(linerShape, {
      depth: 132.0,
      bevelEnabled: false
    });
    linerGeom.translate(0, 0, -66.0);
    linerGeom.rotateX(Math.PI / 2);

    // B. Solid Cast Aluminum Cylinder Block Jacket (Radius 36.0mm to 41.0mm, thickness 5.0mm)
    // 100% Solid & seamlessly filled from r=36.0 to r=41.0: perfectly bonds with liner (r=33.5 to 36.0) with ZERO void/gap!
    const barrelShape = createSectorShape(36.0, 41.0, arcStart, arcEnd, 36);
    const barrelGeom = new THREE.ExtrudeGeometry(barrelShape, {
      depth: 132.0,
      bevelEnabled: false
    });
    barrelGeom.translate(0, 0, -66.0);
    barrelGeom.rotateX(Math.PI / 2);

    // C. Machined Cylinder Cooling Fins (Inner r=41.0mm to outer r=47.0mm, thickness 2.2mm)
    // Completely wraps around 100% of the uncut outer cylinder barrel facade (full 225° from -112.5° to +112.5°)!
    // Ends exactly flush at the cutaway margins, leaving the 135° front showcase opening 100% clean and unobstructed!
    const finShape = createSectorShape(41.0, 47.0, arcStart, arcEnd, 36);
    const finGeom = new THREE.ExtrudeGeometry(finShape, {
      depth: 2.2,
      bevelEnabled: false
    });
    finGeom.translate(0, 0, -1.1);
    finGeom.rotateX(Math.PI / 2);

    for (const cx of [-54.0, 54.0]) {
      // 1. Polished Cylinder Liner (Bore 67.0mm, inner radius 33.5mm, 100% hollow bore with zero bottom sheet)
      const cylLiner = new THREE.Mesh(linerGeom, cylLinerMat);
      cylLiner.position.set(cx, 122, 0);
      cylLiner.castShadow = true;
      iceGroup.add(cylLiner);

      // 2. Solid Cylinder Barrel (Outer block, radius 36.0mm to 41.0mm, solid wall thickness)
      const cylBarrel = new THREE.Mesh(barrelGeom, cylBarrelMat);
      cylBarrel.position.set(cx, 122, 0);
      cylBarrel.castShadow = true;
      iceGroup.add(cylBarrel);

      // 3. Annular Cooling Fins (15 fins wrapping 100% of un-cut cylinder barrel outer facade)
      for (let fy = 66; fy <= 178; fy += 8) {
        const fin = new THREE.Mesh(finGeom, aluMat);
        fin.position.set(cx, fy, 0);
        iceGroup.add(fin);
      }

      // Spark plugs
      const sparkPlug = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 20, 12), steelMat);
      sparkPlug.position.set(cx, 222, 0);
      iceGroup.add(sparkPlug);
    }

    // Unified 500cc DOHC 4-Valve Twin-Cylinder Head (width 228mm, spans [-114, +114], Y = 188 to 220)
    const cylHead = new THREE.Mesh(new THREE.BoxGeometry(228, 32, 92), darkAlloyMat);
    cylHead.position.set(0, 204, 0);
    cylHead.castShadow = true;
    iceGroup.add(cylHead);

    // Twin Camshaft Cover Humps
    for (const camZ of [-22, 22]) {
      const camCover = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 224, 24), darkAlloyMat);
      camCover.rotateZ(Math.PI / 2);
      camCover.position.set(0, 218, camZ);
      iceGroup.add(camCover);
    }

    // Helper: Create 500cc Forged Aluminum Piston Assembly (Φ66.4mm, Compression Height 44mm)
    const createForgedPiston = () => {
      const pistonGroup = new THREE.Group();

      // Piston body (diameter 66.4mm, radius 33.2mm, height 44mm)
      const pistonBody = new THREE.Mesh(
        new THREE.CylinderGeometry(33.2, 33.2, 44, 32),
        aluMat
      );
      pistonGroup.add(pistonBody);

      // Piston Crown Valve Relief Indentations (4 valves per cylinder)
      for (const rx of [-11, 11]) {
        for (const rz of [-8, 8]) {
          const valveRelief = new THREE.Mesh(new THREE.CylinderGeometry(8.0, 8.0, 2, 16), steelMat);
          valveRelief.position.set(rx, 22, rz);
          pistonGroup.add(valveRelief);
        }
      }

      // Piston Rings
      for (const ry of [16, 12, 8]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(33.3, 0.7, 8, 32),
          darkAlloyMat
        );
        ring.rotateX(Math.PI / 2);
        ring.position.set(0, ry, 0);
        pistonGroup.add(ring);
      }

      // Wrist Pin (Φ17mm, length 56mm at local Y = -5.0)
      const wristPin = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 56, 20), steelMat);
      wristPin.rotateZ(Math.PI / 2);
      wristPin.position.set(0, -5.0, 0);
      pistonGroup.add(wristPin);

      return pistonGroup;
    };

    // Piston 1 & Con-Rod 1 (Left: X = -54.0mm, TDC)
    const piston1 = createForgedPiston();
    piston1.position.set(-54.0, 33.4 + 120.0 + 5.0, 0);
    iceGroup.add(piston1);

    const conRod1 = createAuthenticConRod(120.0);
    conRod1.position.set(-54.0, 33.4, 0);
    iceGroup.add(conRod1);

    // Piston 2 & Con-Rod 2 (Right: X = +54.0mm, BDC)
    const piston2 = createForgedPiston();
    piston2.position.set(54.0, -33.4 + 120.0 + 5.0, 0);
    iceGroup.add(piston2);

    const conRod2 = createAuthenticConRod(120.0);
    conRod2.position.set(54.0, -33.4, 0);
    iceGroup.add(conRod2);

    // 1.5 Authentic U-Cradle Monobloc Showcase Crankcase (经典U型深槽一体化铸铝曲轴箱 - 敞开式剖切展示结构)
    // - WIDE-OPEN FRONT SHOWCASE WINDOW: The entire front facade from Y = -47mm to Y = +56mm across the dual cylinders
    //   and central 48T gear is opened wide with CNC-machined highlight chamfer rims, allowing complete, unobstructed
    //   visibility of the crankshaft throws, balance slugs, swinging H-beam connecting rods, and the 48T output gear!
    // - ZERO-CLIPPING REAR & CRADLE: Rear vertical wall positioned at Z = +57.0mm (inner face Z = +54.75mm),
    //   providing a safe 4.15mm air gap from the maximum con-rod swing (Z = +50.6mm). Inner cradle radius R = 55.0mm
    //   clears crankweb sweep (R = 48.4mm) and con-rod big end at BDC (Y = -50.6mm) with zero penetration!
    // - CENTER BAY REAR TUNNEL: Leaves the rear half (X in [-26, +26], Z > 0) completely open with no cradle or wall,
    //   providing a 52mm-wide direct pass-through for the 48T crankshaft primary gear to mesh with the 72T carrier gear!
    // - 100% FULLY SEALED SIDES: Symmetrically reduced outer bearing bays (Z in [-28.5, +28.5]mm) with full-height
    //   transition bulkheads at X = ±82mm (inner face X = ±80mm, clearing outer crankweb at X = ±77.3mm by 2.7mm).
    //   Solid, opaque cast aluminum side covers at X = ±96mm cover from Y = +56mm down to Y = -66mm (matching oil pan bottom),
    //   leaving a generous 5.0mm axial air gap to crankshaft ends (X = ±88mm) with zero holes, zero slits, and zero friction!
    const crankcaseGroup = new THREE.Group();

    // 1. Dual Cylinder Bays U-Casing (X in [-80.5, -26] and [26, 80.5])
    // Monobloc extruded cross-section: curves under crankshaft from front cutaway lip (Z = -28mm, Y = -47.3mm)
    // around bottom (Y = -55mm) to rear vertical wall (Z = +57mm, Y = +56mm)
    const wallThick = 4.5;
    const rIn = 55.0;
    const rOut = rIn + wallThick; // 59.5mm
    const frontZ = -28.0;
    const frontY_out = -Math.sqrt(rOut * rOut - frontZ * frontZ);
    const frontY_in = -Math.sqrt(rIn * rIn - frontZ * frontZ);

    const uCradleShape = new THREE.Shape();
    uCradleShape.moveTo(rOut, 56.0); // rear outer top at deck
    uCradleShape.lineTo(rOut, 0.0);  // down rear outer vertical
    uCradleShape.absarc(0, 0, rOut, 0, -Math.PI + Math.acos(-frontZ / rOut), true); // curve under cradle bottom
    uCradleShape.lineTo(frontZ, frontY_in); // front cutaway lip edge
    uCradleShape.absarc(0, 0, rIn, -Math.PI + Math.acos(-frontZ / rIn), 0, false); // curve back inner cradle
    uCradleShape.lineTo(rIn, 56.0); // rear inner vertical up to top deck flange
    uCradleShape.closePath();

    for (const [startX, endX] of [[-80.5, -16.0], [16.0, 80.5]] as [number, number][]) {
      const segWidth = endX - startX; // 64.5mm
      const segMidX = (startX + endX) / 2;

      const cradleGeom = new THREE.ExtrudeGeometry(uCradleShape, {
        depth: segWidth,
        bevelEnabled: true,
        bevelSize: 0.5,
        bevelThickness: 0.5,
        curveSegments: 32
      });
      cradleGeom.translate(0, 0, -segWidth / 2);
      cradleGeom.rotateY(-Math.PI / 2); // depth along X, shape in (Z, Y)

      const cradleMesh = new THREE.Mesh(cradleGeom, castCrankcaseMat);
      cradleMesh.position.set(segMidX, 0, 0);
      cradleMesh.castShadow = true;
      crankcaseGroup.add(cradleMesh);

      // CNC Machined Aluminum Cutaway Highlight Rim along front showcase lip (Z = -28.0mm, Y = -48.0mm)
      const frontLipRim = new THREE.Mesh(
        new THREE.BoxGeometry(segWidth, 3.5, 4.5),
        aluMat
      );
      frontLipRim.position.set(segMidX, (frontY_in + frontY_out) / 2, frontZ);
      crankcaseGroup.add(frontLipRim);

      // Front Upper Deck Support Apron Lip (slim top border at Y = 53.5mm, Z = -54.0mm)
      const frontUpperLip = new THREE.Mesh(
        new THREE.BoxGeometry(segWidth, 5.0, 4.5),
        castCrankcaseMat
      );
      frontUpperLip.position.set(segMidX, 53.5, -54.0);
      frontUpperLip.castShadow = true;
      crankcaseGroup.add(frontUpperLip);

      // CNC Machined Aluminum Cutaway Highlight Rim along top front edge (Y = 51.0mm, Z = -54.0mm)
      const topLipRim = new THREE.Mesh(
        new THREE.BoxGeometry(segWidth, 2.5, 4.5),
        aluMat
      );
      topLipRim.position.set(segMidX, 51.0, -54.0);
      crankcaseGroup.add(topLipRim);
    }

    // 2. Dual Central Main Bearing Bulkhead Housings Flanking 48T Output Gear (Centered at X = ±20.5mm)
    // Clean, authentic single-wall architecture:
    // - ONLY the left and right two bulkheads closest to the central gear (at X = ±16.0mm) are retained!
    // - Central Gear Bay Opening: X in [-16, +16] (32mm wide) -> generous 6.0mm visible air gap on both sides of 48T gear!
    // - Slim Semicircular Bearing Saddle (width 6.5mm) & Compact Bearing Cap mounted directly on the outer side
    // - NO extra outer partition layers: provides wide-open, crystal-clear view into the crankshaft from cylinder bays!
    for (const side of [-1, 1]) {
      const bx = side * 20.5;     // Bearing axial center (matching central shaft bearing at X = ±20.5mm)
      const innerX = side * 16.0; // The single inner bulkhead flanking the 48T gear tunnel

      // A. Inner Gear Tunnel Bulkhead Wall (at X = ±16.0mm, thickness 2.0mm - ONLY inner layer kept!)
      const innerWallShape = new THREE.Shape();
      innerWallShape.moveTo(frontZ, 56.0);
      innerWallShape.lineTo(rOut, 56.0);
      innerWallShape.lineTo(rOut, 0.0);
      innerWallShape.absarc(0, 0, rOut, 0, -Math.PI + Math.acos(-frontZ / rOut), true);
      innerWallShape.lineTo(frontZ, frontY_out);
      innerWallShape.lineTo(frontZ, 56.0);
      innerWallShape.closePath();

      const journalHoleInner = new THREE.Path();
      journalHoleInner.absarc(0, 0, 18.5, 0, Math.PI * 2, true);
      innerWallShape.holes.push(journalHoleInner);

      const innerWallGeom = new THREE.ExtrudeGeometry(innerWallShape, {
        depth: 2.0,
        bevelEnabled: true,
        bevelSize: 0.3,
        bevelThickness: 0.3,
        curveSegments: 24
      });
      innerWallGeom.translate(0, 0, -1.0);
      innerWallGeom.rotateY(-Math.PI / 2);
      const innerWallMesh = new THREE.Mesh(innerWallGeom, castCrankcaseMat);
      innerWallMesh.position.set(innerX, 0, 0);
      innerWallMesh.castShadow = true;
      crankcaseGroup.add(innerWallMesh);

      // B. Slim Semicircular Bearing Saddle (下主轴承固定座, supporting bearing R=20.5 from Y=0 down to Y=-55mm, width 6.5mm)
      const saddleShape = new THREE.Shape();
      saddleShape.moveTo(-25.0, 0.0);
      saddleShape.lineTo(-25.0, -55.0);
      saddleShape.lineTo(25.0, -55.0);
      saddleShape.lineTo(25.0, 0.0);
      saddleShape.lineTo(20.6, 0.0);
      saddleShape.absarc(0, 0, 20.6, 0, -Math.PI, true);
      saddleShape.lineTo(-25.0, 0.0);
      saddleShape.closePath();

      const saddleGeom = new THREE.ExtrudeGeometry(saddleShape, {
        depth: 6.5,
        bevelEnabled: true,
        bevelSize: 0.4,
        bevelThickness: 0.4,
        curveSegments: 24
      });
      saddleGeom.translate(0, 0, -3.25);
      saddleGeom.rotateY(-Math.PI / 2);
      const saddleMesh = new THREE.Mesh(saddleGeom, castCrankcaseMat);
      saddleMesh.position.set(bx, 0, 0);
      saddleMesh.castShadow = true;
      crankcaseGroup.add(saddleMesh);

      // C. Compact Upper Machined Bearing Cap (上主轴承固定盖, clamping over bearing from Y=0 to Y=25.5mm, width 6.5mm)
      const capShape = new THREE.Shape();
      capShape.moveTo(25.0, 0.0);
      capShape.lineTo(25.0, 5.0);
      const archAng = Math.atan2(5.0, Math.sqrt(25.5 * 25.5 - 25));
      capShape.absarc(0, 0, 25.5, archAng, Math.PI - archAng, false);
      capShape.lineTo(-25.0, 5.0);
      capShape.lineTo(-25.0, 0.0);
      capShape.lineTo(-20.6, 0.0);
      capShape.absarc(0, 0, 20.6, Math.PI, 0, true);
      capShape.lineTo(25.0, 0.0);
      capShape.closePath();

      const capGeom = new THREE.ExtrudeGeometry(capShape, {
        depth: 6.5,
        bevelEnabled: true,
        bevelSize: 0.4,
        bevelThickness: 0.4,
        curveSegments: 24
      });
      capGeom.translate(0, 0, -3.25);
      capGeom.rotateY(-Math.PI / 2);
      const capMesh = new THREE.Mesh(capGeom, castCrankcaseMat);
      capMesh.position.set(bx, 0, 0);
      capMesh.castShadow = true;
      crankcaseGroup.add(capMesh);

      // D. Compact Main Bearing Cap Clamping Studs (2 x M8 Hex Studs per bearing at Z = ±17mm)
      for (const bz of [-17.0, 17.0]) {
        const boltHead = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 4.5, 6),
          darkAlloyMat
        );
        boltHead.position.set(bx, 7.5, bz);
        crankcaseGroup.add(boltHead);

        const washer = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.6, 0.8, 16),
          polishedSteelMat
        );
        washer.position.set(bx, 5.2, bz);
        crankcaseGroup.add(washer);
      }
    }

    // 2.1 Spacious Central 48T Primary Drive Bay (X in [-16, +16], width 32mm):
    // Leaves 6.0mm generous axial clearance on BOTH sides of the 20mm 48T gear!
    // Front half (Z < 0): WIDE OPEN to prominently display the central 48T output gear spinning!
    // Rear half (Z in [0, 58]): COMPLETELY BROKEN / OPEN for 48T-to-72T conjugate gear mesh!
    // Lower structural bridging cradle under primary gear (Y in [-60, -53], Z in [-32, -10])
    const centerBottomBridge = new THREE.Mesh(
      new THREE.BoxGeometry(32.0, 7.0, 22.0),
      castCrankcaseMat
    );
    centerBottomBridge.position.set(0, -56.5, -21.0);
    centerBottomBridge.castShadow = true;
    crankcaseGroup.add(centerBottomBridge);

    // Front showcase opening highlight rim for center bay
    const centerLipRim = new THREE.Mesh(
      new THREE.BoxGeometry(32.0, 3.0, 4.0),
      aluMat
    );
    centerLipRim.position.set(0, -53.0, -32.0);
    crankcaseGroup.add(centerLipRim);

    // Rear gear mesh opening highlight rim along broken casing edge at Z = 0, Y = -54mm
    const centerRearRim = new THREE.Mesh(
      new THREE.BoxGeometry(32.0, 3.0, 4.0),
      aluMat
    );
    centerRearRim.position.set(0, -53.0, -10.0);
    crankcaseGroup.add(centerRearRim);

    // 3. Symmetrically Reduced Outer End Bays (X in [-96, -80.5] and [80.5, 96]): 100% Fully Sealed!
    // Full-height transition bulkheads at X = ±82mm (centered at ±82mm, thickness 4.0mm -> inner face at ±80.0mm)
    // Safe clearance: outer crankwebs end at X = ±77.3mm, giving a guaranteed 2.7mm air gap: ZERO CLIPPING!
    for (const tx of [-82.0, 82.0]) {
      // Rear transition bulkhead (full height from oil pan bottom Y = -66 to top deck Y = 56, Z from 28 to 59.5)
      const rearTrans = new THREE.Mesh(
        new THREE.BoxGeometry(4.0, 122.0, 31.5),
        castCrankcaseMat
      );
      rearTrans.position.set(tx, -5.0, 43.75);
      rearTrans.castShadow = true;
      crankcaseGroup.add(rearTrans);

      // Front transition bulkhead (full height from oil pan bottom Y = -66 to top deck Y = 56, Z from -57 to -28)
      const frontTrans = new THREE.Mesh(
        new THREE.BoxGeometry(4.0, 122.0, 29.0),
        castCrankcaseMat
      );
      frontTrans.position.set(tx, -5.0, -42.5);
      frontTrans.castShadow = true;
      crankcaseGroup.add(frontTrans);
    }

    // Outer end casing walls (between X = ±80.5 and X = ±96, length 15.5mm, center at X = ±88.25)
    for (const endMidX of [-88.25, 88.25]) {
      // Front vertical wall (Z in [-28.25, -23.75], Y in [-52, 56])
      const endFront = new THREE.Mesh(
        new THREE.BoxGeometry(15.5, 108.0, 4.5),
        castCrankcaseMat
      );
      endFront.position.set(endMidX, 2.0, -26.0);
      endFront.castShadow = true;
      crankcaseGroup.add(endFront);

      // Rear vertical wall (Z in [23.75, 28.25], Y in [-52, 56])
      const endRear = new THREE.Mesh(
        new THREE.BoxGeometry(15.5, 108.0, 4.5),
        castCrankcaseMat
      );
      endRear.position.set(endMidX, 2.0, 26.0);
      endRear.castShadow = true;
      crankcaseGroup.add(endRear);

      // Outer bay bottom cradle trough under outer bearing (R = 50mm, Y down to -52mm)
      const endCradle = new THREE.Mesh(
        new THREE.BoxGeometry(15.5, 6.0, 48.0),
        castCrankcaseMat
      );
      endCradle.position.set(endMidX, -51.0, 0);
      endCradle.castShadow = true;
      crankcaseGroup.add(endCradle);
    }

    // 4. Symmetrical Top Cylinder Deck Mounting Flange (Y = +56mm)
    // Symmetrically transitions from Z = ±58mm in the cylinder zone to Z = ±28.5mm at both outer ends
    const deckShape = new THREE.Shape();
    deckShape.moveTo(-96.0, -28.5);
    deckShape.lineTo(-80.5, -57.0);
    deckShape.lineTo(80.5, -57.0);
    deckShape.lineTo(96.0, -28.5);
    deckShape.lineTo(96.0, 28.5);
    deckShape.lineTo(80.5, 59.5);
    deckShape.lineTo(-80.5, 59.5);
    deckShape.lineTo(-96.0, 28.5);
    deckShape.closePath();

    // Cylinder 1 through-hole (radius 41.5mm at X = -54.0mm, completely open passage for connecting rod & piston)
    const hole1 = new THREE.Path();
    hole1.absarc(-54.0, 0, 41.5, 0, Math.PI * 2, true);
    deckShape.holes.push(hole1);

    // Cylinder 2 through-hole (radius 41.5mm at X = +54.0mm, completely open passage for connecting rod & piston)
    const hole2 = new THREE.Path();
    hole2.absarc(54.0, 0, 41.5, 0, Math.PI * 2, true);
    deckShape.holes.push(hole2);

    const topDeckGeom = new THREE.ExtrudeGeometry(deckShape, {
      depth: 4.5,
      bevelEnabled: true,
      bevelSize: 0.5,
      bevelThickness: 0.5
    });
    topDeckGeom.rotateX(Math.PI / 2);
    const topDeckFlange = new THREE.Mesh(topDeckGeom, castCrankcaseMat);
    topDeckFlange.position.set(0, 56, 0);
    topDeckFlange.castShadow = true;
    crankcaseGroup.add(topDeckFlange);

    // 5. 100% Solid, Opaque, Sealed Side Covers at X = ±96.0mm (NO GAPS, ZERO HOLES!)
    // Completely solid opaque cast aluminum end covers perfectly matching outer bay and oil pan profile!
    // Extends from Y = +56mm down to Y = -66mm (meeting oil pan bottom) and Z in [-28.5, +28.5]mm.
    // Crankshaft outer journals end at X = ±88.0mm, leaving a generous 5.0mm axial clearance to side covers (X = ±93.0mm inner face)
    const sideUShape = new THREE.Shape();
    sideUShape.moveTo(-28.5, 56.0); // front top corner
    sideUShape.lineTo(28.5, 56.0);  // rear top corner
    sideUShape.lineTo(28.5, -45.0); // rear vertical edge
    sideUShape.quadraticCurveTo(28.5, -66.0, 15.0, -66.0); // lower rear corner
    sideUShape.lineTo(-15.0, -66.0); // flat bottom matching oil pan
    sideUShape.quadraticCurveTo(-28.5, -66.0, -28.5, -45.0); // lower front corner
    sideUShape.lineTo(-28.5, 56.0); // front vertical edge
    sideUShape.closePath();

    const sideCoverGeom = new THREE.ExtrudeGeometry(sideUShape, {
      depth: 5.0,
      bevelEnabled: true,
      bevelSize: 0.6,
      bevelThickness: 0.6,
      curveSegments: 24
    });
    sideCoverGeom.translate(0, 0, -2.5);
    sideCoverGeom.rotateY(-Math.PI / 2); // depth along X, shape in (Z, Y)

    for (const sideX of [-96, 96]) {
      const sideCover = new THREE.Mesh(sideCoverGeom, castCrankcaseMat);
      sideCover.position.set(sideX, 0, 0);
      sideCover.castShadow = true;
      crankcaseGroup.add(sideCover);

      // Exterior concentric bearing support boss
      const bossCap = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 22, 3.5, 24),
        aluMat
      );
      bossCap.rotateZ(Math.PI / 2);
      bossCap.position.set(sideX + (sideX > 0 ? 3.5 : -3.5), 0, 0);
      crankcaseGroup.add(bossCap);

      // Central hex inspection plug
      const plug = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 11, 2.0, 6),
        steelMat
      );
      plug.rotateZ(Math.PI / 2);
      plug.position.set(sideX + (sideX > 0 ? 5.0 : -5.0), 0, 0);
      crankcaseGroup.add(plug);

      // Perimeter clamping bolt pattern (6 hex bolts around side cover)
      for (let b = 0; b < 6; b++) {
        const angle = (b * Math.PI) / 3;
        const bz = Math.sin(angle) * 20;
        const by = Math.cos(angle) * 28 + 5;
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 2.5, 6),
          steelMat
        );
        bolt.rotateZ(Math.PI / 2);
        bolt.position.set(sideX + (sideX > 0 ? 3.5 : -3.5), by, bz);
        crankcaseGroup.add(bolt);
      }
    }

    // 6. Integrated Lower Oil Pan with Rear Middle Tunnel Clearance & Gapless Side Fit
    // Left sump under Cylinder 1 & left central bearing: X in [-96, -16] (matches X = -96 side cover and X = -16 bearing wall seamlessly!)
    const leftSump = new THREE.Mesh(
      new THREE.BoxGeometry(80.0, 12.0, 80.0),
      castCrankcaseMat
    );
    leftSump.position.set(-56.0, -60.0, 0);
    leftSump.castShadow = true;
    crankcaseGroup.add(leftSump);

    // Right sump under Cylinder 2 & right central bearing: X in [16, 96] (matches X = +96 side cover and X = +16 bearing wall seamlessly!)
    const rightSump = new THREE.Mesh(
      new THREE.BoxGeometry(80.0, 12.0, 80.0),
      castCrankcaseMat
    );
    rightSump.position.set(56.0, -60.0, 0);
    rightSump.castShadow = true;
    crankcaseGroup.add(rightSump);

    // Front center connecting bridge: X in [-16, 16], Z in [-40, -10]
    // Leaves rear middle (X in [-16, 16], Z in [-10, 58]) COMPLETELY OPEN for 48T to 72T gear mesh!
    const frontBridge = new THREE.Mesh(
      new THREE.BoxGeometry(32.0, 12.0, 30.0),
      castCrankcaseMat
    );
    frontBridge.position.set(0, -60.0, -25.0);
    frontBridge.castShadow = true;
    crankcaseGroup.add(frontBridge);

    // Underside longitudinal cooling fins on oil sumps (including fins directly under center bearing housings)
    for (const fx of [-75, -55, -35, -22, 22, 35, 55, 75]) {
      const sumpFin = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 3.0, 72.0),
        aluMat
      );
      sumpFin.position.set(fx, -67.0, 0);
      crankcaseGroup.add(sumpFin);
    }

    // Magnetic Oil Drain Plugs (M14 Hex) on sump bottoms
    for (const px of [-54, 54]) {
      const drainPlug = new THREE.Mesh(
        new THREE.CylinderGeometry(4.5, 4.5, 2.5, 6),
        darkAlloyMat
      );
      drainPlug.position.set(px, -67.0, 15.0);
      crankcaseGroup.add(drainPlug);
    }

    iceGroup.add(crankcaseGroup);

    scene.add(iceGroup);

    // ---------------- 2. Main Shaft System (Axis 1, Z = 0) ----------------
    // 2.1 Resized Carrier Input Gear (z_c_in = 72, m=2.0, d=144mm, radius=72.0mm, width=20mm)
    // Arranged in the MIDDLE (X = 0) on Axis 1 (Z = 0)!
    // Contact at Z = -72.0mm with ICE gear (Z = -120.0 + 48.0 = -72.0mm) - 100% PERFECT ZERO-GAP MESH!
    // Clearance to Axis 2 (Z = 105.0mm): 105.0 - 74.0 = 31.0mm clear physical gap, eliminating all intermediate shaft conflict!
    const carrierInputGear = createGearMesh(72.0, 20, 72, 0x0284c7, 20);
    carrierInputGear.position.set(0, 0, AXIS1_Z);
    scene.add(carrierInputGear);

    // Right Carrier Hub Support Sleeve (X in [10.0, 26.0], radius 15mm, supporting right carrier bearing)
    const carrierRightHub = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, 16, 24),
      polishedSteelMat
    );
    carrierRightHub.rotateZ(Math.PI / 2);
    carrierRightHub.position.set(18.0, 0, AXIS1_Z);
    scene.add(carrierRightHub);

    // Hollow torque tube connecting carrier input gear (left face X = -10.0mm) to shifted planetary carrier right flange (outer face X = -36.2mm)
    // Runs cleanly between X = -36.2mm and X = -10.0mm (length 26.2mm, center X = -23.1mm)
    // Leaves a generous 3.8mm clear air gap to the Sun Gear right face (at X = -40.0mm), completely eliminating any interference!
    const tubeLength = 26.2;
    const torqueTube = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, tubeLength, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 })
    );
    torqueTube.rotateZ(Math.PI / 2);
    torqueTube.position.set(-23.1, 0, AXIS1_Z);
    scene.add(torqueTube);

    // 2.1.1 Dual Deep-Groove Ball Bearings Flanking Carrier Input Gear (X = ±18.0 mm)
    // Symmetrically straddling the 72T central gear to handle ICE engine input torque & radial forces
    let carrierLeftBearingInner: THREE.Mesh | null = null;
    let carrierRightBearingInner: THREE.Mesh | null = null;

    for (const cSide of [-1, 1]) {
      const bx = cSide * 18.0;
      const carrierBearingGroup = new THREE.Group();
      carrierBearingGroup.position.set(bx, 0, AXIS1_Z);

      // 1) Rotating Inner Race (mounted on torque tube / right hub sleeve, radius 15.0 to 18.5mm, width 10mm)
      const cBInner = new THREE.Mesh(
        new THREE.CylinderGeometry(18.5, 18.5, 10.0, 28),
        polishedSteelMat
      );
      cBInner.rotateZ(Math.PI / 2);
      carrierBearingGroup.add(cBInner);
      if (cSide === -1) carrierLeftBearingInner = cBInner;
      else carrierRightBearingInner = cBInner;

      // 2) Stationary Outer Race (radius 23.5 to 27.5mm, width 10mm)
      const cBOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(27.5, 27.5, 10.0, 32),
        steelMat
      );
      cBOuter.rotateZ(Math.PI / 2);
      carrierBearingGroup.add(cBOuter);

      // 3) Bronze Retainer Ring / Cage
      const cBCage = new THREE.Mesh(
        new THREE.CylinderGeometry(21.0, 21.0, 8.5, 24, 1, true),
        bearingBronzeMat
      );
      cBCage.rotateZ(Math.PI / 2);
      carrierBearingGroup.add(cBCage);

      // 4) Chrome Steel Balls (10 balls on pitch circle R = 21.0mm)
      for (let b = 0; b < 10; b++) {
        const bAngle = (b * Math.PI * 2) / 10;
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(2.5, 16, 12),
          polishedSteelMat
        );
        ball.position.set(0, Math.sin(bAngle) * 21.0, Math.cos(bAngle) * 21.0);
        carrierBearingGroup.add(ball);
      }

      // 5) Rigid Cast Support Saddle / Pedestal (clamping outer race to crankcase bridge)
      const cBPedestal = new THREE.Mesh(
        new THREE.BoxGeometry(11.0, 24.0, 42.0),
        castCrankcaseMat
      );
      cBPedestal.position.set(0, -16.0, 0);
      cBPedestal.castShadow = true;
      carrierBearingGroup.add(cBPedestal);

      // Clamping Hex Bolts on Pedestal
      for (const bz of [-14, 14]) {
        const pBolt = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 14.0, 6),
          steelMat
        );
        pBolt.rotateX(Math.PI / 2);
        pBolt.position.set(0, -18.0, bz);
        carrierBearingGroup.add(pBolt);
      }

      scene.add(carrierBearingGroup);
    }

    // 2.2 Left MG1 Motor (Stator + Rotor + Solid Central Shaft)
    // Motor redesign: Shortened axial length (48mm vs 75mm), enlarged outer radius (65mm vs 52mm)
    // Flat pancake format offers higher torque density and compact lateral bike width!
    const mg1Group = new THREE.Group();
    mg1Group.position.set(-115, 0, AXIS1_Z);

    const mg1Casing = new THREE.Mesh(
      new THREE.CylinderGeometry(65, 65, 48, 40),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.25 })
    );
    mg1Casing.rotateZ(Math.PI / 2);
    mg1Casing.castShadow = true;
    mg1Group.add(mg1Casing);

    for (const sign of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(48, 5.5, 16, 32), copperMat);
      coil.rotateY(Math.PI / 2);
      coil.position.set(sign * 22, 0, 0);
      mg1Group.add(coil);
    }
    scene.add(mg1Group);

    // Solid central shaft going from MG1 (-115mm) to Sun Gear (PLANETARY_X = -46mm)
    const shaftLen = 115 - 46;
    const centralShaft = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, shaftLen, 20), steelMat);
    centralShaft.rotateZ(Math.PI / 2);
    centralShaft.position.set(-115 + shaftLen / 2, 0, AXIS1_Z);
    scene.add(centralShaft);

    // 2.2.1 MG1 Motor Inner Main Bearing Assembly (Axis 1, Z = 0, centered at X = -72.0 mm)
    // Symmetrically balances MG2 inner bearing at X = +72.0 mm!
    const mg1BearingGroup = new THREE.Group();
    mg1BearingGroup.position.set(-72.0, 0, AXIS1_Z);

    // 1) Rotating Inner Race (tight fit on MG1 central shaft, radius 7.5 to 11.5mm, width 12mm)
    const mg1BearingInner = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 11.5, 12.0, 24),
      polishedSteelMat
    );
    mg1BearingInner.rotateZ(Math.PI / 2);
    mg1BearingGroup.add(mg1BearingInner);

    // 2) Stationary Outer Race (radius 17.5 to 22.0mm, width 12mm)
    const mg1BearingOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(22.0, 22.0, 12.0, 28),
      steelMat
    );
    mg1BearingOuter.rotateZ(Math.PI / 2);
    mg1BearingGroup.add(mg1BearingOuter);

    // 3) Bronze Retainer Ring / Cage
    const mg1BearingCage = new THREE.Mesh(
      new THREE.CylinderGeometry(14.5, 14.5, 10.0, 24, 1, true),
      bearingBronzeMat
    );
    mg1BearingCage.rotateZ(Math.PI / 2);
    mg1BearingGroup.add(mg1BearingCage);

    // 4) Chrome Steel Bearing Balls (8 balls on pitch circle R = 14.5mm)
    for (let b = 0; b < 8; b++) {
      const bAngle = (b * Math.PI * 2) / 8;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(2.7, 16, 12),
        polishedSteelMat
      );
      ball.position.set(0, Math.sin(bAngle) * 14.5, Math.cos(bAngle) * 14.5);
      mg1BearingGroup.add(ball);
    }

    // 5) Rigid Cast Support Pedestal (anchoring MG1 bearing to transmission casing bulkhead)
    const mg1BearingPedestal = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 28.0, 46.0),
      castCrankcaseMat
    );
    mg1BearingPedestal.position.set(0, -18.0, 0);
    mg1BearingPedestal.castShadow = true;
    mg1BearingGroup.add(mg1BearingPedestal);

    // Clamping Hex Bolts on Pedestal
    for (const bz of [-15, 15]) {
      const pBolt = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 16.0, 6),
        steelMat
      );
      pBolt.rotateX(Math.PI / 2);
      pBolt.position.set(0, -20.0, bz);
      mg1BearingGroup.add(pBolt);
    }

    scene.add(mg1BearingGroup);

    // 2.3 Planetary Gear Set (Shifted left to PLANETARY_X = -46.0 mm)
    // 2.3.1 Sun Gear (z_s = 18, m=1.5, d=27.0mm, radius=13.5mm, width 12.0mm)
    // Unified Red metallic finish matching MG1 motor (color 0xdc2626) - mechanically linked directly to MG1 rotor!
    // Symmetrically spans local X in [-6.0, +6.0] mm (world X in [-52.0, -40.0] mm)
    const sunGearGroup = createGearMesh(13.5, 12.0, 18, 0xdc2626, 6.0);
    sunGearGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // Sun gear central hub collar connected to MG1 central shaft (unified MG1 Red)
    // ONLY extends to the left (-X direction, local X in [-12.0, 0] mm) towards MG1; flush on the right (+X) side with zero protrusion
    const sunHub = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 8.5, 12.0, 24),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.25 })
    );
    sunHub.rotateZ(Math.PI / 2);
    sunHub.position.set(-6.0, 0, 0);
    sunGearGroup.add(sunHub);
    scene.add(sunGearGroup);

    // 2.3.2 3-Arm Star/Spider Planet Carrier Assembly (Blue)
    const carrierGroup = new THREE.Group();
    carrierGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // 3-Arm Spider Carrier Flange Generator with Open Bays and Non-Interfering Cutouts
    // Left & right flanges flank the gears with a generous 0.6mm axial clearance (X = ±8.2mm, thickness 3.2mm)
    const createSpiderFlange = (isRightFlange: boolean) => {
      const cShape = new THREE.Shape();
      const outerR = 32.0;
      const innerR = isRightFlange ? 12.0 : 9.5; // Clears MG1 central shaft on left, matches torque tube bore on right
      const pinR = 27.0; // Pin circle radius = (d_s + d_p)/2 = (27 + 27)/2 = 27.0 mm

      for (let i = 0; i < 3; i++) {
        const pa = (i / 3) * Math.PI * 2;
        const armHalf = 0.35;
        const bayAngle = pa + Math.PI / 3;

        // Arm angles in polar coords
        const a1 = pa - armHalf;
        const a2 = pa;
        const a3 = pa + armHalf;

        // In 2D plane: (-cos(a) * R, sin(a) * R) maps after rotateY(PI/2) to 3D (0, sin(a)*R, cos(a)*R)
        const p1x = -Math.cos(a1) * (pinR * 0.7);
        const p1y = Math.sin(a1) * (pinR * 0.7);
        const p2x = -Math.cos(a1) * (outerR * 0.95);
        const p2y = Math.sin(a1) * (outerR * 0.95);
        const p3x = -Math.cos(a2) * outerR;
        const p3y = Math.sin(a2) * outerR;
        const p4x = -Math.cos(a3) * (outerR * 0.95);
        const p4y = Math.sin(a3) * (outerR * 0.95);
        const p5x = -Math.cos(a3) * (pinR * 0.7);
        const p5y = Math.sin(a3) * (pinR * 0.7);
        // Deep bay between arms: R = 16.5mm completely clears the 15.0mm Sun Gear tip radius!
        const pBayX = -Math.cos(bayAngle) * 16.5;
        const pBayY = Math.sin(bayAngle) * 16.5;

        if (i === 0) {
          cShape.moveTo(p1x, p1y);
        } else {
          cShape.lineTo(p1x, p1y);
        }
        cShape.lineTo(p2x, p2y);
        cShape.lineTo(p3x, p3y);
        cShape.lineTo(p4x, p4y);
        cShape.lineTo(p5x, p5y);
        cShape.lineTo(pBayX, pBayY);
      }
      cShape.closePath();

      // Center hole for shaft / torque tube clearance
      const cHole = new THREE.Path();
      cHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
      cShape.holes.push(cHole);

      // 3 Precision Pin/Bearing holes mathematically matching 3 planet gears
      for (let i = 0; i < 3; i++) {
        const pa = (i / 3) * Math.PI * 2;
        const hx = -Math.cos(pa) * pinR;
        const hy = Math.sin(pa) * pinR;
        const pHole = new THREE.Path();
        pHole.absarc(hx, hy, 4.0, 0, Math.PI * 2, true);
        cShape.holes.push(pHole);
      }

      const fGeom = new THREE.ExtrudeGeometry(cShape, {
        depth: 3.2,
        bevelEnabled: true,
        bevelSize: 0.3,
        bevelThickness: 0.3,
        bevelSegments: 1
      });
      fGeom.translate(0, 0, -1.6);
      fGeom.rotateY(Math.PI / 2);
      return fGeom;
    };

    const carrierMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });
    // Left flange at X = -8.2mm (spans X in [-9.8, -6.6] mm, leaving a clean 0.6mm gap to gears at X = -6.0mm)
    const spiderL = new THREE.Mesh(createSpiderFlange(false), carrierMat);
    spiderL.position.set(-8.2, 0, 0);
    carrierGroup.add(spiderL);

    // Right flange at X = +8.2mm (spans X in [+6.6, +9.8] mm, leaving a clean 0.6mm gap to gears at X = +6.0mm)
    const spiderR = new THREE.Mesh(createSpiderFlange(true), carrierMat);
    spiderR.position.set(8.2, 0, 0);
    carrierGroup.add(spiderR);

    // 2.3.3 3 Planet Gears (z_p = 18, m=1.5, d=27.0mm, radius=13.5mm, width 12.0mm, Steel)
    const planetGroups: THREE.Group[] = [];
    const pinRadius = 27.0;

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const py = Math.sin(angle) * pinRadius;
      const pz = Math.cos(angle) * pinRadius;

      // Precision Planet Pin connecting left and right spider carrier flanges (length 20.0mm)
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 20.0, 20), steelMat);
      pin.rotateZ(Math.PI / 2);
      pin.position.set(0, py, pz);
      carrierGroup.add(pin);

      // Planet Bearing Bronze Thrust Bushing Sleeves on Left & Right Flange Mounts (at X = ±7.4mm)
      for (const bSign of [-1, 1]) {
        const bearingSleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(4.8, 4.8, 1.8, 20),
          bearingBronzeMat
        );
        bearingSleeve.rotateZ(Math.PI / 2);
        bearingSleeve.position.set(bSign * 7.4, py, pz);
        carrierGroup.add(bearingSleeve);
      }

      // Planet Gear (hardened steel, 18 teeth, radius 13.5mm, width 12.0mm) mounted concentrically on pin
      const pg = createGearMesh(13.5, 12.0, 18, 0xcfd8dc, 3.2);
      pg.position.set(0, py, pz);
      carrierGroup.add(pg);
      planetGroups.push(pg);
    }
    scene.add(carrierGroup);

    // 2.4 Complete Ring Gear (Green) with both External 60T teeth and Internal 54T planetary teeth at PLANETARY_X = -46.0 mm
    // Full 360-degree closed circular gear assembly with 22mm width
    const ringGroup = new THREE.Group();
    ringGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // 1) Complete Outer teeth (60T, m=1.75, pitch radius 52.50mm, width 22.0mm) for meshing with countershaft 60T
    const ringOuterTeeth = createGearMesh(52.5, 22, 60, 0x16a34a, 44.0, true, 0);
    ringGroup.add(ringOuterTeeth);

    // 2) Internal teeth (54T, m=1.5, pitch radius 40.5mm, width 22.0mm) for meshing with 3 planet gears
    // Seamlessly welded into a single rigid ring gear drum
    const ringInternalTeeth = createInternalRingGearMesh(40.5, 47.0, 22, 54, 0x15803d, 1.5);
    ringGroup.add(ringInternalTeeth);

    scene.add(ringGroup);

    // 2.5 Right MG2 Motor (Gold) & Synchronized Output Gear Mesh
    // Motor redesign: Shortened axial length (52mm vs 90mm), enlarged outer radius (68mm vs 56mm)
    // High-torque pancake configuration, lateral position remains stationary at X = 118mm
    const mg2Group = new THREE.Group();
    mg2Group.position.set(118, 0, AXIS1_Z);

    const mg2Casing = new THREE.Mesh(
      new THREE.CylinderGeometry(68, 68, 52, 40),
      new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.75, roughness: 0.25 })
    );
    mg2Casing.rotateZ(Math.PI / 2);
    mg2Casing.castShadow = true;
    mg2Group.add(mg2Casing);

    for (const sign of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(52, 6, 16, 32), copperMat);
      coil.rotateY(Math.PI / 2);
      coil.position.set(sign * 24, 0, 0);
      mg2Group.add(coil);
    }
    scene.add(mg2Group);

    // Synchronized Gear Shift: MG2 Pinion & Countershaft Gear 2 shifted left to MG2_GEAR_X = 42.0 mm
    // (keeping MG2 motor stationary at X = 118 mm, leaving a generous 40mm axial clearance for bearings)
    const MG2_GEAR_X = 42.0;

    // MG2 Pinion (z_m2 = 35, m=2.0, d=70mm, radius=35.0mm, width 20mm) at X = MG2_GEAR_X (42.0 mm)
    const mg2Pinion = createGearMesh(35.0, 20, 35, 0xeab308, 10);
    mg2Pinion.position.set(MG2_GEAR_X, 0, AXIS1_Z);
    scene.add(mg2Pinion);

    // MG2 Output Drive Shaft: connects pinion (X = 42) into MG2 rotor (X = 118, inner face X = 92)
    // Runs from X = 50.0 to X = 95.0 mm (length 45mm, radius 10mm)
    const mg2Shaft = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 45, 24), polishedSteelMat);
    mg2Shaft.rotateZ(Math.PI / 2);
    mg2Shaft.position.set(72.5, 0, AXIS1_Z);
    scene.add(mg2Shaft);

    // MG2 Motor Inner Main Bearing Assembly (Axis 1, Z = 0, centered at X = 72.0 mm)
    // Deep groove precision ball bearing supporting the inner end of MG2 drive shaft
    const mg2BearingGroup = new THREE.Group();
    mg2BearingGroup.position.set(72.0, 0, AXIS1_Z);

    // 1) Bearing Inner Race (mounted on MG2 drive shaft, radius 10.0 to 14.0mm, width 12mm)
    const mg2BearingInner = new THREE.Mesh(
      new THREE.CylinderGeometry(14.0, 14.0, 12.0, 28),
      polishedSteelMat
    );
    mg2BearingInner.rotateZ(Math.PI / 2);
    mg2BearingGroup.add(mg2BearingInner);

    // 2) Bearing Outer Race (radius 20.5 to 25.0mm, width 12mm)
    const mg2BearingOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(25.0, 25.0, 12.0, 32),
      steelMat
    );
    mg2BearingOuter.rotateZ(Math.PI / 2);
    mg2BearingGroup.add(mg2BearingOuter);

    // 3) Bronze Retainer Ring / Cage
    const mg2BearingCage = new THREE.Mesh(
      new THREE.CylinderGeometry(17.5, 17.5, 10.0, 24, 1, true),
      bearingBronzeMat
    );
    mg2BearingCage.rotateZ(Math.PI / 2);
    mg2BearingGroup.add(mg2BearingCage);

    // 4) Chrome Steel Bearing Balls (10 balls on pitch circle R = 17.25mm)
    for (let b = 0; b < 10; b++) {
      const bAngle = (b * Math.PI * 2) / 10;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(2.7, 16, 12),
        polishedSteelMat
      );
      ball.position.set(0, Math.sin(bAngle) * 17.25, Math.cos(bAngle) * 17.25);
      mg2BearingGroup.add(ball);
    }

    // 5) Rigid Cast Support Pedestal / Carrier Bulkhead (anchoring bearing to transmission casing)
    const mg2BearingPedestal = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 28.0, 48.0),
      castCrankcaseMat
    );
    mg2BearingPedestal.position.set(0, -18.0, 0);
    mg2BearingPedestal.castShadow = true;
    mg2BearingGroup.add(mg2BearingPedestal);

    // Clamping Hex Bolts on Pedestal
    for (const bz of [-16, 16]) {
      const pBolt = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 16.0, 6),
        steelMat
      );
      pBolt.rotateX(Math.PI / 2);
      pBolt.position.set(0, -20.0, bz);
      mg2BearingGroup.add(pBolt);
    }

    scene.add(mg2BearingGroup);

    // ---------------- 3. Parallel Countershaft (Axis 2, Z = 105.0 mm) ----------------
    const countershaftGroup = new THREE.Group();
    countershaftGroup.position.set(0, 0, AXIS2_Z);

    // Solid shaft (length 200mm, extends from X = -108mm to +92mm)
    const cShaft = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 200, 24), steelMat);
    cShaft.rotateZ(Math.PI / 2);
    cShaft.position.set(-8, 0, 0);
    countershaftGroup.add(cShaft);

    // Gear 1: Driven Pinion from Ring Gear (z_c1 = 60, m=1.75, radius 52.50mm, width 22.0mm)
    // Shifted to PLANETARY_X (-46.0 mm) to mesh with shifted Ring Gear 60T!
    // 52.50 + 52.50 = 105.0 mm !! (严丝合缝水平与轴向绝对对齐)
    const cGear1 = createGearMesh(52.5, 22, 60, 0x64748b, 11);
    cGear1.position.set(PLANETARY_X, 0, 0);
    cGear1.rotation.x = Math.PI / 60; // 错开半个齿距相位 (3° = π/60 rad)，精确实现齿顶入齿槽的无隙共轭啮合
    countershaftGroup.add(cGear1);

    // Gear 2: Driven Reduction Gear from MG2 (z_c2 = 70, m=2.0, radius 70.0mm, width 22.0mm)
    // Synchronously shifted left to X = MG2_GEAR_X (42.0 mm) to mesh with MG2 Pinion 35T!
    // 35.0 + 70.0 = 105.0 mm !! 保持两者仍然紧密啮合，右侧留出 39mm 空间布置副轴右侧轴承
    const cGear2 = createGearMesh(70.0, 22, 70, 0x64748b, 11);
    cGear2.position.set(MG2_GEAR_X, 0, 0);
    countershaftGroup.add(cGear2);

    // Drive Sprocket 12T at X = -92.0 mm (Pitch radius 30.7 mm for 525 chain, d = 61.3 mm)
    const driveSprocket = createGearMesh(30.7, 8, 12, 0xea580c, 10);
    driveSprocket.position.set(-92, 0, 0);
    countershaftGroup.add(driveSprocket);

    // Rotating Bearing Inner Races mounted on countershaft journals:
    // Left bearing: immediately to the right of drive sprocket at X = -72.0 mm
    // Right bearing: immediately to the right of 70T reduction gear at X = +72.0 mm
    for (const bSide of [-1, 1]) {
      const bx = bSide * 72.0;
      const cBearingInner = new THREE.Mesh(
        new THREE.CylinderGeometry(15.0, 15.0, 12.0, 28),
        polishedSteelMat
      );
      cBearingInner.rotateZ(Math.PI / 2);
      cBearingInner.position.set(bx, 0, 0);
      countershaftGroup.add(cBearingInner);
    }

    // Countershaft Right End Lock Nut & Washer (at X = 89.0 mm)
    const shaftLockNut = new THREE.Mesh(
      new THREE.CylinderGeometry(14.0, 14.0, 5.0, 6),
      steelMat
    );
    shaftLockNut.rotateZ(Math.PI / 2);
    shaftLockNut.position.set(89.0, 0, 0);
    countershaftGroup.add(shaftLockNut);

    scene.add(countershaftGroup);

    // Stationary Countershaft Main Bearing Housings & Rollers (Axis 2, centered at X = ±72.0 mm)
    // Left housing: located to the right of the drive sprocket (X = -72.0 mm)
    // Right housing: located to the right of the reduction gear (X = +72.0 mm)
    // Mounted securely to transmission chassis structure, does not rotate with shaft
    const cBearingHousing = new THREE.Group();
    cBearingHousing.position.set(0, 0, AXIS2_Z);

    for (const bSide of [-1, 1]) {
      const bx = bSide * 72.0;
      const singleBearingGroup = new THREE.Group();
      singleBearingGroup.position.set(bx, 0, 0);

      // 1) Bearing Outer Race (radius 21.0 to 25.5mm, width 12mm)
      const cBearingOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(25.5, 25.5, 12.0, 32),
        steelMat
      );
      cBearingOuter.rotateZ(Math.PI / 2);
      singleBearingGroup.add(cBearingOuter);

      // 2) Bronze Retainer Ring / Roller Cage
      const cBearingCage = new THREE.Mesh(
        new THREE.CylinderGeometry(18.0, 18.0, 10.0, 24, 1, true),
        bearingBronzeMat
      );
      cBearingCage.rotateZ(Math.PI / 2);
      singleBearingGroup.add(cBearingCage);

      // 3) Cylindrical Rollers (10 rollers on pitch circle R = 18.0mm)
      for (let r = 0; r < 10; r++) {
        const rAngle = (r * Math.PI * 2) / 10;
        const roller = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.6, 8.5, 14),
          polishedSteelMat
        );
        roller.rotateZ(Math.PI / 2);
        roller.position.set(0, Math.sin(rAngle) * 18.0, Math.cos(rAngle) * 18.0);
        singleBearingGroup.add(roller);
      }

      // 4) Rigid Cast Support Bracket for Countershaft Bearing
      const cBearingPedestal = new THREE.Mesh(
        new THREE.BoxGeometry(14.0, 26.0, 46.0),
        castCrankcaseMat
      );
      cBearingPedestal.position.set(0, -18.0, 0);
      cBearingPedestal.castShadow = true;
      singleBearingGroup.add(cBearingPedestal);

      // Clamping Hex Bolts on Countershaft Pedestal
      for (const bz of [-15, 15]) {
        const pBolt = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 16.0, 6),
          steelMat
        );
        pBolt.rotateX(Math.PI / 2);
        pBolt.position.set(0, -19.0, bz);
        singleBearingGroup.add(pBolt);
      }

      cBearingHousing.add(singleBearingGroup);
    }

    scene.add(cBearingHousing);

    // ---------------- 4. Final Drive Chain & True-Scale 160/60 ZR17 Rear Wheel Assembly (Z = 655.0 mm) ----------------
    // Authentic 17-inch Motorcycle Sport Wheel Assembly:
    // - 17 x 4.5J drop-center forged alloy sport rim (bead seat radius R = 216.0 mm, outer flange R = 228.0 mm)
    // - 160/60 ZR17 radial sport motorcycle tire (width 160mm, aspect ratio 60%, outer radius R = 312.0 mm, outer diameter 624.0 mm)
    // - Center distance from Axis 2: a_chain = 655.0 - 105.0 = 550.0 mm (standard sport motorcycle swingarm span)
    // - High-precision 5-Y forged spoke architecture, CNC cush-drive hub, 42T rear sprocket, and ventilated rear brake disc
    const rearWheelGroup = new THREE.Group();
    rearWheelGroup.position.set(0, 0, REAR_Z);

    // Realistic Rear Wheel Materials
    const rimAlloyMat = new THREE.MeshStandardMaterial({
      color: 0x18202f, // Deep metallic gunmetal / satin black forged alloy
      metalness: 0.88,
      roughness: 0.28
    });
    const rimFlangeMat = new THREE.MeshStandardMaterial({
      color: 0x243247, // Machined diamond-cut highlight on rim outer lip
      metalness: 0.92,
      roughness: 0.20
    });
    const brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db, // Precision ground stainless steel brake rotor
      metalness: 0.95,
      roughness: 0.18
    });
    const brakeCarrierMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Anodized black CNC rotor inner carrier
      metalness: 0.85,
      roughness: 0.35
    });
    const treadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10, // Matte vulcanized synthetic silica sport tire compound
      roughness: 0.92,
      metalness: 0.04
    });
    const tireSidewallMat = new THREE.MeshStandardMaterial({
      color: 0x0d1017, // Satin tire sidewall with subtle sheen
      roughness: 0.82,
      metalness: 0.06
    });

    // 4.1 High-Tensile Steel Hollow Rear Axle with Threaded Hex Lock Nuts
    const rearAxle = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 240, 24), steelMat);
    rearAxle.rotateZ(Math.PI / 2);
    rearWheelGroup.add(rearAxle);

    // Axle End Caps & Titanium Lock Nuts (X = ±120 mm)
    for (const aSign of [-1, 1]) {
      const axleNut = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 12, 6), steelMat);
      axleNut.rotateZ(Math.PI / 2);
      axleNut.position.set(aSign * 120, 0, 0);
      rearWheelGroup.add(axleNut);
    }

    // 4.2 Central Wheel Hub (CNC Billet Machined Hub with Cush Drive & Brake Carrier)
    // Main hub barrel
    const hubBarrel = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 110, 32), rimAlloyMat);
    hubBarrel.rotateZ(Math.PI / 2);
    rearWheelGroup.add(hubBarrel);

    // Left Cush-drive Damper Housing (for rear sprocket shock isolation at X = -60 mm)
    const cushDriveHub = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 22, 32), rimAlloyMat);
    cushDriveHub.rotateZ(Math.PI / 2);
    cushDriveHub.position.set(-60, 0, 0);
    rearWheelGroup.add(cushDriveHub);

    // Right Wheel Hub Brake Mounting Flange at X = +55 mm
    const rightHubCollar = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 18, 32), rimAlloyMat);
    rightHubCollar.rotateZ(Math.PI / 2);
    rightHubCollar.position.set(55, 0, 0);
    rearWheelGroup.add(rightHubCollar);

    // Sealed Bearing Dust Rings (Left & Right)
    for (const bSign of [-1, 1]) {
      const bearingSeal = new THREE.Mesh(new THREE.RingGeometry(13.0, 28, 24), darkAlloyMat);
      bearingSeal.rotateY(Math.PI / 2);
      bearingSeal.position.set(bSign * 68, 0, 0);
      rearWheelGroup.add(bearingSeal);
    }

    // 4.3 Authentic 17-inch Motorcycle Drop-Center Alloy Rim (Lathe Revolved around Axle)
    // Bead seat radius = 216.0 mm (nominal 17-inch standard: 17 * 25.4 / 2 = 215.9 mm)
    // Outer flange radius = 228.0 mm, Drop center well base = 196.0 mm, Width = ±68 mm (total 136 mm)
    const rimPoints: THREE.Vector2[] = [
      new THREE.Vector2(196, -55), // Drop center well base left
      new THREE.Vector2(196, 55),  // Drop center well base right
      new THREE.Vector2(208, 60),  // Bead hump safety ridge right
      new THREE.Vector2(216, 64),  // Bead seat right (17-inch standard R = 216 mm)
      new THREE.Vector2(228, 68),  // Rim outer flange peak right (R = 228 mm)
      new THREE.Vector2(224, 71),  // Outer curled rim lip right
      new THREE.Vector2(212, 70),  // Outer rim contour right
      new THREE.Vector2(206, 54),  // Underside wall right
      new THREE.Vector2(198, 28),  // Spoke transition inner root right
      new THREE.Vector2(198, -28), // Spoke transition inner root left
      new THREE.Vector2(206, -54), // Underside wall left
      new THREE.Vector2(212, -70), // Outer rim contour left
      new THREE.Vector2(224, -71), // Outer curled rim lip left
      new THREE.Vector2(228, -68), // Rim outer flange peak left
      new THREE.Vector2(216, -64), // Bead seat left (17-inch standard R = 216 mm)
      new THREE.Vector2(208, -60), // Bead hump safety ridge left
      new THREE.Vector2(196, -55)  // Close loop
    ];
    // Revolve around Y then rotateZ(-90°) so revolving axis is along +X (transverse axle):
    const rimGeom = new THREE.LatheGeometry(rimPoints, 56);
    rimGeom.rotateZ(-Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeom, rimAlloyMat);
    rimMesh.castShadow = true;
    rearWheelGroup.add(rimMesh);

    // Rim Outer Edge Machined Highlight Rings
    for (const fSign of [-1, 1]) {
      const rimHighlight = new THREE.Mesh(new THREE.TorusGeometry(226, 2.0, 16, 64), rimFlangeMat);
      rimHighlight.rotateY(Math.PI / 2);
      rimHighlight.position.set(fSign * 69, 0, 0);
      rearWheelGroup.add(rimHighlight);
    }

    // 4.4 Sport 5-Y Forged Spokes (5 Primary Trunks splitting into 10 Tapered Blade Spokes)
    // Central Spoke Hub Star Mounting Collar
    const spokeCenterRing = new THREE.Mesh(
      new THREE.CylinderGeometry(44, 44, 36, 32),
      rimAlloyMat
    );
    spokeCenterRing.rotateZ(Math.PI / 2);
    rearWheelGroup.add(spokeCenterRing);

    // 5-Y Architecture: 5 evenly spaced main trunks (every 72°), each splitting into a Y-fork to rim
    for (let s = 0; s < 5; s++) {
      const baseAng = (s / 5) * Math.PI * 2; // 0°, 72°, 144°, 216°, 288°

      // Radii: Hub surface = 40mm, Y-split junction = 120mm, Rim bed connection = 196mm
      const rHub = 40.0;
      const rFork = 120.0;
      const rRim = 196.0;

      // 1. Root Trunk (from hub at rHub out to Y-fork junction at rFork)
      const pRootStart = new THREE.Vector3(0, Math.sin(baseAng) * rHub, Math.cos(baseAng) * rHub);
      const pForkMid = new THREE.Vector3(0, Math.sin(baseAng) * rFork, Math.cos(baseAng) * rFork);

      const trunkLen = pForkMid.distanceTo(pRootStart);
      const trunkMid = new THREE.Vector3().addVectors(pRootStart, pForkMid).multiplyScalar(0.5);
      const trunkDir = new THREE.Vector3().subVectors(pForkMid, pRootStart).normalize();

      // Forged aerodynamic blade trunk (wider across wheel width X, slim in rotation plane)
      const trunkGeom = new THREE.CylinderGeometry(7.5, 10.5, trunkLen, 16);
      trunkGeom.scale(1.25, 1.0, 0.75);
      const trunkMesh = new THREE.Mesh(trunkGeom, rimAlloyMat);
      trunkMesh.position.copy(trunkMid);
      trunkMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), trunkDir);
      rearWheelGroup.add(trunkMesh);

      // Y-Junction Reinforcement Node
      const junctionNode = new THREE.Mesh(
        new THREE.SphereGeometry(9.0, 16, 12),
        rimAlloyMat
      );
      junctionNode.scale.set(1.15, 0.85, 1.0);
      junctionNode.position.copy(pForkMid);
      rearWheelGroup.add(junctionNode);

      // 2. Left & Right Branch Spokes (branching outward by ±14° to the rim)
      for (const branchSign of [-1, 1]) {
        const branchAng = baseAng + branchSign * 0.244; // ~14 degrees fork angle

        // Rim attachment landing point
        const pRimEnd = new THREE.Vector3(0, Math.sin(branchAng) * rRim, Math.cos(branchAng) * rRim);

        const branchLen = pRimEnd.distanceTo(pForkMid);
        const branchMid = new THREE.Vector3().addVectors(pForkMid, pRimEnd).multiplyScalar(0.5);
        const branchDir = new THREE.Vector3().subVectors(pRimEnd, pForkMid).normalize();

        // Tapered sport blade spoke
        const branchGeom = new THREE.CylinderGeometry(5.2, 7.5, branchLen, 16);
        branchGeom.scale(1.2, 1.0, 0.7);
        const branchMesh = new THREE.Mesh(branchGeom, rimAlloyMat);
        branchMesh.position.copy(branchMid);
        branchMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), branchDir);
        rearWheelGroup.add(branchMesh);

        // Rim-landing Gusset Fillet
        const rimGusset = new THREE.Mesh(
          new THREE.CylinderGeometry(6.0, 8.5, 8, 12),
          rimAlloyMat
        );
        rimGusset.position.copy(pRimEnd);
        rimGusset.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), branchDir);
        rearWheelGroup.add(rimGusset);
      }
    }

    // 4.5 Authentic Full-Scale 160/60 ZR17 Radial Sport Motorcycle Tire
    // Continuous Revolved Profile (LatheGeometry Revolved 360° around +X axle)
    // Nominal width = 160 mm (X: -80 mm to +80 mm), Aspect ratio = 60%, Sidewall height = 96 mm
    // Total outer radius at crown apex = 312.0 mm (Outer diameter = 624.0 mm, matching kinematics wheelRadius = 0.312 m)
    const tireProfilePoints: THREE.Vector2[] = [
      new THREE.Vector2(216, -64), // Bead seat inside rim flange left
      new THREE.Vector2(228, -69), // Rim flange protector rib left
      new THREE.Vector2(252, -78), // Lower sidewall bulge left
      new THREE.Vector2(276, -80), // Maximum section width contour left (160mm width)
      new THREE.Vector2(296, -68), // Shoulder transition left
      new THREE.Vector2(308, -38), // Crown curve entry left
      new THREE.Vector2(312, 0),   // Center Apex Tread Contact Patch (Crown Peak R = 312 mm, Dia = 624 mm)
      new THREE.Vector2(308, 38),  // Crown curve entry right
      new THREE.Vector2(296, 68),  // Shoulder transition right
      new THREE.Vector2(276, 80),  // Maximum section width contour right (160mm width)
      new THREE.Vector2(252, 78),  // Lower sidewall bulge right
      new THREE.Vector2(228, 69),  // Rim flange protector rib right
      new THREE.Vector2(216, 64)   // Bead seat inside rim flange right
    ];
    const tireGeom = new THREE.LatheGeometry(tireProfilePoints, 64);
    tireGeom.rotateZ(-Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeom, treadMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    rearWheelGroup.add(tireMesh);

    // Tire Sidewall Spec Brand / Dimension Markings (160/60 ZR17 M/C 69W Ring Decals)
    for (const swSign of [-1, 1]) {
      const sidewallRing = new THREE.Mesh(
        new THREE.RingGeometry(242, 275, 64),
        tireSidewallMat
      );
      sidewallRing.rotateY(Math.PI / 2);
      sidewallRing.position.set(swSign * 80.5, 0, 0);
      rearWheelGroup.add(sidewallRing);

      // Molded Directional Rotation Arrows on Sidewalls
      for (const arrowAng of [0, Math.PI]) {
        const arrowMesh = new THREE.Mesh(
          new THREE.ConeGeometry(3.5, 8, 3),
          darkAlloyMat
        );
        arrowMesh.position.set(
          swSign * 80.8,
          Math.sin(arrowAng) * 258,
          Math.cos(arrowAng) * 258
        );
        arrowMesh.rotation.x = arrowAng + (swSign > 0 ? -Math.PI / 2 : Math.PI / 2);
        arrowMesh.rotation.y = swSign > 0 ? 0 : Math.PI;
        rearWheelGroup.add(arrowMesh);
      }
    }

    // Dual-Compound (2CT / Bi-Compound) Fine Demarcation Rings (X = ±52mm, separating center silica from shoulder carbon)
    for (const dcSign of [-1, 1]) {
      const compoundRing = new THREE.Mesh(
        new THREE.TorusGeometry(303.8, 0.4, 8, 64),
        darkAlloyMat
      );
      compoundRing.rotateY(Math.PI / 2);
      compoundRing.position.set(dcSign * 52.0, 0, 0);
      rearWheelGroup.add(compoundRing);
    }

    // Authentic High-Performance Directional Sport Radial Tread Pattern ("Fulmine" Lightning Sipes)
    // Deep recessed charcoal compound material for negative relief channels
    const treadGrooveMat = new THREE.MeshStandardMaterial({
      color: 0x030406,
      roughness: 0.98,
      metalness: 0.01
    });

    // Exact surface radius profile helper matching the lathe geometry curve:
    const getTireRadiusAtX = (x: number) => {
      const ax = Math.abs(x);
      if (ax <= 38) {
        return 312.0 - (ax / 38) * 4.0;
      } else if (ax <= 68) {
        return 308.0 - ((ax - 38) / 30) * 12.0;
      } else {
        return 296.0 - ((ax - 68) / 12) * 20.0;
      }
    };

    // Helper to create a smoothly embedded 3D curved groove segment connecting two points on the tire surface
    const createCurvedGrooveSegment = (
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      width = 3.6,
      depth = 3.8
    ) => {
      const len = p1.distanceTo(p2);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();

      const geom = new THREE.BoxGeometry(width, len, depth);
      const mesh = new THREE.Mesh(geom, treadGrooveMat);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      return mesh;
    };

    // 20 periodic directional pattern pitches around the 360° circumference
    const TREAD_PITCHES = 20;
    const pitchDTheta = (Math.PI * 2) / TREAD_PITCHES;

    for (let p = 0; p < TREAD_PITCHES; p++) {
      const theta0 = p * pitchDTheta;

      for (const side of [-1, 1]) {
        // --- 1. Primary Directional Lightning Sipe (3 Contiguous Hydrodynamic Curved Segments) ---
        // Sits on both left and right sides of the solid center slick strip (X: 12mm -> 68mm)
        // Segment 1: Inner crown exit (X: 12mm -> 32mm, sweeping forward)
        const x1 = side * 12.0;
        const x2 = side * 32.0;
        const t1 = theta0;
        const t2 = theta0 + 0.048;
        const r1 = getTireRadiusAtX(x1) - 0.4;
        const r2 = getTireRadiusAtX(x2) - 0.4;
        const pA = new THREE.Vector3(x1, Math.sin(t1) * r1, Math.cos(t1) * r1);
        const pB = new THREE.Vector3(x2, Math.sin(t2) * r2, Math.cos(t2) * r2);
        rearWheelGroup.add(createCurvedGrooveSegment(pA, pB, 3.8, 4.0));

        // Segment 2: Mid-shoulder lightning elbow (X: 32mm -> 52mm, angled forward)
        const x3 = side * 52.0;
        const t3 = theta0 + 0.112;
        const r3 = getTireRadiusAtX(x3) - 0.4;
        const pC = new THREE.Vector3(x3, Math.sin(t3) * r3, Math.cos(t3) * r3);
        rearWheelGroup.add(createCurvedGrooveSegment(pB, pC, 3.6, 3.8));

        // Segment 3: Outer shoulder water dispersal channel (X: 52mm -> 68mm)
        const x4 = side * 68.0;
        const t4 = theta0 + 0.148;
        const r4 = getTireRadiusAtX(x4) - 0.4;
        const pD = new THREE.Vector3(x4, Math.sin(t4) * r4, Math.cos(t4) * r4);
        rearWheelGroup.add(createCurvedGrooveSegment(pC, pD, 3.2, 3.5));

        // --- 2. Interleaved Secondary High-Angle Shoulder Sipes ---
        // Positioned at half-pitch offset (theta0 + pitchDTheta / 2), providing high-lean-angle grip (X: 36mm -> 64mm)
        const secT0 = theta0 + pitchDTheta * 0.5;
        const sx1 = side * 36.0;
        const sx2 = side * 64.0;
        const st1 = secT0;
        const st2 = secT0 + 0.062;
        const sr1 = getTireRadiusAtX(sx1) - 0.4;
        const sr2 = getTireRadiusAtX(sx2) - 0.4;
        const sp1 = new THREE.Vector3(sx1, Math.sin(st1) * sr1, Math.cos(st1) * sr1);
        const sp2 = new THREE.Vector3(sx2, Math.sin(st2) * sr2, Math.cos(st2) * sr2);
        rearWheelGroup.add(createCurvedGrooveSegment(sp1, sp2, 3.2, 3.5));

        // --- 3. Tread Wear Indicators (TWI) & Shoulder Wear Bar Markers ---
        // Placed at 5 evenly spaced locations (every 4 pitches)
        if (p % 4 === 0) {
          // Raised rubber TWI bar inside the mid-shoulder channel (at 1.6mm height)
          const twiMesh = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.2, 1.8),
            darkAlloyMat
          );
          twiMesh.position.set(
            side * 42.0,
            Math.sin(theta0 + 0.08) * (getTireRadiusAtX(42) - 1.2),
            Math.cos(theta0 + 0.08) * (getTireRadiusAtX(42) - 1.2)
          );
          rearWheelGroup.add(twiMesh);

          // Embossed TWI triangular arrow on outer shoulder margin pointing to wear bar
          const twiArrow = new THREE.Mesh(
            new THREE.ConeGeometry(2.0, 4.0, 3),
            aluMat
          );
          twiArrow.position.set(
            side * 74.0,
            Math.sin(theta0) * (getTireRadiusAtX(74) + 0.3),
            Math.cos(theta0) * (getTireRadiusAtX(74) + 0.3)
          );
          twiArrow.rotation.x = theta0;
          twiArrow.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          rearWheelGroup.add(twiArrow);
        }
      }
    }

    // High-Pressure Rubber 90-Degree Angled Valve Stem
    const valveBase = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 8, 12), darkAlloyMat);
    valveBase.position.set(38, Math.sin(0.4) * 202, Math.cos(0.4) * 202);
    valveBase.rotation.x = 0.4 - Math.PI / 2;
    valveBase.rotation.z = 0.5;
    rearWheelGroup.add(valveBase);

    const valveCap = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, 12), steelMat);
    valveCap.position.set(42, Math.sin(0.4) * 207, Math.cos(0.4) * 207);
    valveCap.rotation.z = 0.8;
    rearWheelGroup.add(valveCap);

    // 4.6 Right Side: Φ240mm Ventilated Sport Rear Brake Disc & Caliper Assembly
    // Stainless steel ventilated brake rotor at X = +68.0 mm
    const brakeDiscRotor = new THREE.Mesh(
      new THREE.RingGeometry(82, 120, 48),
      brakeDiscMat
    );
    brakeDiscRotor.rotateY(Math.PI / 2);
    brakeDiscRotor.position.set(68.0, 0, 0);
    rearWheelGroup.add(brakeDiscRotor);

    // Inner CNC Floating Carrier
    const brakeCarrier = new THREE.Mesh(
      new THREE.RingGeometry(52, 82, 32),
      brakeCarrierMat
    );
    brakeCarrier.rotateY(Math.PI / 2);
    brakeCarrier.position.set(67.5, 0, 0);
    rearWheelGroup.add(brakeCarrier);

    // Floating Bobbins (5 stainless drive pins connecting inner carrier and rotor)
    for (let f = 0; f < 5; f++) {
      const fAng = (f / 5) * Math.PI * 2;
      const bobbin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 6, 16), steelMat);
      bobbin.rotateZ(Math.PI / 2);
      bobbin.position.set(68.0, Math.sin(fAng) * 82, Math.cos(fAng) * 82);
      rearWheelGroup.add(bobbin);
    }

    // Ventilated Drilling Holes on Rotor Disc (32 holes)
    for (let h = 0; h < 32; h++) {
      const hAng = (h / 32) * Math.PI * 2;
      const hRadius = 94 + (h % 3) * 11;
      const drillHole = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 12), darkAlloyMat);
      drillHole.rotateZ(Math.PI / 2);
      drillHole.position.set(68.0, Math.sin(hAng) * hRadius, Math.cos(hAng) * hRadius);
      rearWheelGroup.add(drillHole);
    }

    // 4.7 Left Side: True-Scale Rear Sprocket 48T at X = -92.0 mm (Pitch Radius r = 121.4 mm, d = 242.7 mm)
    // Final Drive Ratio: i_chain = 48 / 12 = 4.000 (12T小链轮与48T大链盘，4.000大减速比带来充沛轮端扭矩)
    const rearSprocket = createGearMesh(121.4, 8, 48, 0xea580c, 36);
    rearSprocket.position.set(-92, 0, 0);
    rearWheelGroup.add(rearSprocket);

    // Sprocket mounting bolts (6 heavy-duty titanium sprocket studs on bolt circle R = 78.0 mm)
    for (let b = 0; b < 6; b++) {
      const bAng = (b / 6) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 14, 12), steelMat);
      bolt.rotateZ(Math.PI / 2);
      bolt.position.set(-92, Math.sin(bAng) * 78, Math.cos(bAng) * 78);
      rearWheelGroup.add(bolt);
    }

    scene.add(rearWheelGroup);

    // ---------------- 4.8 Physicalized Motorsport 525 Roller Drive Chain (实体化跟随链轮联动滚子链) ----------------
    // Continuous 525-specification roller chain loop with 100 links (50 outer links + 50 inner links)
    // Sprockets: Front 12T (r1 = 30.7mm at AXIS2_Z = 105.0mm) & Rear 48T (r2 = 121.4mm at REAR_Z = 655.0mm)
    // Lateral position: Aligned at X = -92.0 mm
    // Center distance C = 550.0mm, deltaR = 90.7mm
    const chainC = REAR_Z - AXIS2_Z; // 550.0 mm
    const chainR1 = 30.7; // Front 12T pitch radius
    const chainR2 = 121.4; // Rear 48T pitch radius
    const chainDeltaR = chainR2 - chainR1; // 90.7 mm
    const chainSinAlpha = chainDeltaR / chainC; // 0.16490909
    const chainAlpha = Math.asin(chainSinAlpha); // ~0.165683 rad
    const chainCosAlpha = Math.cos(chainAlpha); // ~0.9863088

    const chainL1 = chainC * chainCosAlpha; // Top straight run: 542.47 mm
    const chainL2 = chainR2 * (Math.PI + 2 * chainAlpha); // Rear wrap: 421.62 mm
    const chainL3 = chainL1; // Bottom straight run: 542.47 mm
    const chainL4 = chainR1 * (Math.PI - 2 * chainAlpha); // Front wrap: 86.27 mm
    const chainLTotal = chainL1 + chainL2 + chainL3 + chainL4; // 1592.83 mm

    const NUM_LINKS = 100; // Standard 525 motorcycle chain links
    const linkPitch = chainLTotal / NUM_LINKS; // ~15.928 mm (matches 5/8" standard pitch)

    const getChainPointAndTangent = (s: number) => {
      let normS = s % chainLTotal;
      if (normS < 0) normS += chainLTotal;

      if (normS < chainL1) {
        // Section 1: Top straight run (Forward to Rear, +Z direction)
        const t = normS / chainL1;
        const yStart = chainR1 * chainCosAlpha;
        const zStart = AXIS2_Z - chainR1 * chainSinAlpha;
        const yEnd = chainR2 * chainCosAlpha;
        const zEnd = REAR_Z - chainR2 * chainSinAlpha;
        return {
          y: yStart + t * (yEnd - yStart),
          z: zStart + t * (zEnd - zStart),
          Ty: chainSinAlpha,
          Tz: chainCosAlpha
        };
      } else if (normS < chainL1 + chainL2) {
        // Section 2: Rear sprocket wrap (around rear 48T sprocket, +Z apex)
        const u = normS - chainL1;
        const theta = -chainAlpha + (u / chainR2);
        return {
          y: chainR2 * Math.cos(theta),
          z: REAR_Z + chainR2 * Math.sin(theta),
          Ty: -Math.sin(theta),
          Tz: Math.cos(theta)
        };
      } else if (normS < chainL1 + chainL2 + chainL3) {
        // Section 3: Bottom straight run (Rear to Front, -Z direction)
        const t = (normS - (chainL1 + chainL2)) / chainL3;
        const yStart = -chainR2 * chainCosAlpha;
        const zStart = REAR_Z - chainR2 * chainSinAlpha;
        const yEnd = -chainR1 * chainCosAlpha;
        const zEnd = AXIS2_Z - chainR1 * chainSinAlpha;
        return {
          y: yStart + t * (yEnd - yStart),
          z: zStart + t * (zEnd - zStart),
          Ty: chainSinAlpha,
          Tz: -chainCosAlpha
        };
      } else {
        // Section 4: Front sprocket wrap (around front 12T sprocket, -Z apex)
        const u = normS - (chainL1 + chainL2 + chainL3);
        const theta = (Math.PI + chainAlpha) + (u / chainR1);
        return {
          y: chainR1 * Math.cos(theta),
          z: AXIS2_Z + chainR1 * Math.sin(theta),
          Ty: -Math.sin(theta),
          Tz: Math.cos(theta)
        };
      }
    };

    // Chain Link Plate Profile Geometry (Classic dog-bone waist shape with two pin holes)
    const plateShape = new THREE.Shape();
    const halfP = linkPitch / 2;
    const rEnd = 5.2;
    const hWaist = 4.0;
    plateShape.absarc(halfP, 0, rEnd, -Math.PI / 2, Math.PI / 2, false);
    plateShape.quadraticCurveTo(0, hWaist, -halfP, rEnd);
    plateShape.absarc(-halfP, 0, rEnd, Math.PI / 2, Math.PI * 1.5, false);
    plateShape.quadraticCurveTo(0, -hWaist, halfP, -rEnd);
    plateShape.closePath();

    for (const hx of [-halfP, halfP]) {
      const hole = new THREE.Path();
      hole.absarc(hx, 0, 2.2, 0, Math.PI * 2, true);
      plateShape.holes.push(hole);
    }

    const plateGeom = new THREE.ExtrudeGeometry(plateShape, {
      depth: 1.5,
      bevelEnabled: true,
      bevelSize: 0.3,
      bevelThickness: 0.3,
      curveSegments: 16
    });
    plateGeom.translate(0, 0, -0.75); // center thickness along Z
    plateGeom.rotateY(Math.PI / 2); // Align thickness to X, length to Z, height to Y

    // Chain Pin Geometry (Hardened steel rivet pins)
    const pinGeom = new THREE.CylinderGeometry(2.1, 2.1, 16.5, 14);
    pinGeom.rotateZ(Math.PI / 2); // Axis along X

    // Chain Roller Geometry (Hardened chrome ground rollers)
    const rollerGeom = new THREE.CylinderGeometry(5.0, 5.0, 7.0, 18);
    rollerGeom.rotateZ(Math.PI / 2); // Axis along X

    // Materials
    const goldChainMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Motorsport gold anodized outer plates
      metalness: 0.88,
      roughness: 0.24
    });

    const chainAssembly = new THREE.Group();
    // 100 pins and 100 rollers
    const pinsMesh = new THREE.InstancedMesh(pinGeom, steelMat, 100);
    pinsMesh.castShadow = true;
    chainAssembly.add(pinsMesh);

    const rollersMesh = new THREE.InstancedMesh(rollerGeom, polishedSteelMat, 100);
    rollersMesh.castShadow = true;
    chainAssembly.add(rollersMesh);

    // 50 outer links = 100 outer plates (2 plates per outer link)
    const outerPlatesMesh = new THREE.InstancedMesh(plateGeom, goldChainMat, 100);
    outerPlatesMesh.castShadow = true;
    chainAssembly.add(outerPlatesMesh);

    // 50 inner links = 100 inner plates (2 plates per inner link)
    const innerPlatesMesh = new THREE.InstancedMesh(plateGeom, darkAlloyMat, 100);
    innerPlatesMesh.castShadow = true;
    chainAssembly.add(innerPlatesMesh);

    scene.add(chainAssembly);

    let chainDistance = 0;

    // Save part references
    rotatingPartsRef.current = {
      iceGroup: crankshaftAssembly,
      conRod1,
      conRod2,
      piston1,
      piston2,
      carrierGroup,
      carrierInput: carrierInputGear,
      torqueTube,
      sunGroup: sunGearGroup,
      planetGroups,
      ringGroup,
      mg1Group,
      mg2Group,
      mg2Pinion,
      countershaftGroup,
      rearWheelGroup
    };

    explodablePartsRef.current = {
      mg1: mg1Group,
      ice: iceGroup,
      carrier: carrierGroup,
      carrierInput: carrierInputGear,
      torqueTube,
      sun: sunGearGroup,
      ring: ringGroup,
      mg2: mg2Group,
      countershaft: countershaftGroup,
      countershaftBearing: cBearingHousing,
      rearWheel: rearWheelGroup,
      chain: chainAssembly
    };

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (isPlaying) {
        // --- 严谨物理转速计算 (Exact Instantaneous Shaft RPMs) ---
        const vKmh = kinRef.current.vehicleSpeedKmh;
        const iceRpm = kinRef.current.iceRpm;

        // 1. 后轮转速 (160/60 ZR17 轮胎半径 R = 0.312m)
        const wheelRpm = (vKmh / 3.6 / 0.312) * 60 / (2 * Math.PI);
        // 2. 副轴转速 (12T 前主动链轮 -> 48T 后受动链轮，终传比 i = 4.000)
        const countershaftRpm = wheelRpm * (48 / 12);
        // 3. 行星排外齿圈转速 (60T 外齿 -> 60T 副轴齿轮，速比 60/60 = 1.000)
        const ringRpm = countershaftRpm * (60 / 60);
        // 4. MG2 电机转速 (35T MG2 主动 -> 70T 副轴从动，速比 70/35 = 2.000)
        const mg2Rpm = countershaftRpm * (70 / 35);
        // 5. 行星架输入转速 (48T 曲轴输出 -> 72T 行星架中置输入，速比 72/48 = 1.500)
        const carrierRpm = iceRpm / (72 / 48);
        // 6. 太阳轮 / MG1 转速 (Willis 经典行星排运动学：rho = 54/18 = 3.000)
        // (1 + rho)·n_c = n_s + rho·n_r => n_s = 4.000·n_c - 3.000·n_r
        const sunRpm = 4.000 * carrierRpm - 3.000 * ringRpm;
        const mg1Rpm = sunRpm;
        // 7. 行星轮相对自转 (围绕行星架销轴，太阳轮 18T，行星轮 18T)
        const planetRelRpm = - (sunRpm - carrierRpm) * (18 / 18);

        // 统一物理转速至 3D 视觉角速度缩放系数 (显示转速按实际物理转速 1/100 慢速拟真缩减)
        // 物理角速度 omega_real = RPM * (2*pi/60) rad/s
        // 3D 呈现角速度 omega_visual = omega_real / 100 = RPM * (2*pi / 6000) rad/s
        // 每帧转角 delta_theta = omega_visual * delta * playbackSpeed
        const visualScale = ((2 * Math.PI) / 6000) * playbackSpeed * delta;

        // 1. 平行副轴 (Axis 2, Z = 105.0):
        // 链传动驱动后轮向前滚动，负向旋转 (Negative)
        if (rotatingPartsRef.current.countershaftGroup) {
          rotatingPartsRef.current.countershaftGroup.rotation.x -= countershaftRpm * visualScale;
        }

        // 2. 摩托车后轮 (Z = 655.0):
        // 链传动同向旋转，车轮向前滚动 (Negative)
        if (rotatingPartsRef.current.rearWheelGroup) {
          rotatingPartsRef.current.rearWheelGroup.rotation.x -= wheelRpm * visualScale;
        }

        // 3. 齿圈 (Axis 1, Z = 0):
        // 齿圈 66T 外齿与副轴 54T 齿轮为外齿啮合，反向 -> 正方向 (Positive)
        if (rotatingPartsRef.current.ringGroup) {
          rotatingPartsRef.current.ringGroup.rotation.x += ringRpm * visualScale;
        }

        // 4. MG2 电机及主动 35T 齿轮 (Axis 1, Z = 0):
        // 与副轴 70T 齿轮外齿啮合，反向 -> 正方向 (Positive)
        if (rotatingPartsRef.current.mg2Group) {
          rotatingPartsRef.current.mg2Group.rotation.x += mg2Rpm * visualScale;
        }
        if (rotatingPartsRef.current.mg2Pinion) {
          rotatingPartsRef.current.mg2Pinion.rotation.x += mg2Rpm * visualScale;
        }
        if (mg2Shaft) {
          mg2Shaft.rotation.x += mg2Rpm * visualScale;
        }
        if (mg2BearingInner) {
          mg2BearingInner.rotation.x += mg2Rpm * visualScale;
        }

        // 5. 行星架、空心扭矩管与 72T 中置输入齿轮 (Axis 1, Z = 0):
        // 由曲轴驱动，正向旋转 (Positive)
        if (rotatingPartsRef.current.carrierGroup) {
          rotatingPartsRef.current.carrierGroup.rotation.x += carrierRpm * visualScale;
        }
        if (carrierInputGear) {
          carrierInputGear.rotation.x += carrierRpm * visualScale;
        }
        if (carrierRightHub) {
          carrierRightHub.rotation.x += carrierRpm * visualScale;
        }
        if (carrierLeftBearingInner) {
          carrierLeftBearingInner.rotation.x += carrierRpm * visualScale;
        }
        if (carrierRightBearingInner) {
          carrierRightBearingInner.rotation.x += carrierRpm * visualScale;
        }
        if (torqueTube) {
          torqueTube.rotation.x += carrierRpm * visualScale;
        }

        // 6. 发动机曲轴与中置 48T 输出齿轮 (Axis 0, Z = -120.0):
        // 与 72T 行星架从动齿轮外齿直啮硬连接，反向 -> 负方向 (Negative)
        if (crankshaftAssembly) {
          crankshaftAssembly.rotation.x -= iceRpm * visualScale;
        }

        // 500cc 直列双缸曲柄连杆机构真实空间运动学联动 (Dynamic Slider-Crank Kinematics for 500cc Twin)
        // 行程 S = 66.8mm (曲柄半径 R = 33.4mm), 连杆中心距 L = 120.0mm, 缸心距 108mm (左缸 -54.0mm, 右缸 +54.0mm)
        const thetaCrank = crankshaftAssembly ? crankshaftAssembly.rotation.x : 0;
        // 左缸 (Cylinder 1: cx = -54.0, 0° 初始相位, TDC)
        const yPin1 = 33.4 * Math.cos(thetaCrank);
        const zPin1 = 33.4 * Math.sin(thetaCrank);
        const yWrist1 = yPin1 + Math.sqrt(Math.max(0, 120.0 * 120.0 - zPin1 * zPin1));
        const phi1 = Math.asin(-zPin1 / 120.0);

        if (rotatingPartsRef.current.conRod1) {
          rotatingPartsRef.current.conRod1.position.set(-54.0, yPin1, zPin1);
          rotatingPartsRef.current.conRod1.rotation.x = phi1;
        }
        if (rotatingPartsRef.current.piston1) {
          rotatingPartsRef.current.piston1.position.set(-54.0, yWrist1 + 5.0, 0);
        }

        // 右缸 (Cylinder 2: cx = +54.0, 180° 相位差, BDC)
        const yPin2 = -33.4 * Math.cos(thetaCrank);
        const zPin2 = -33.4 * Math.sin(thetaCrank);
        const yWrist2 = yPin2 + Math.sqrt(Math.max(0, 120.0 * 120.0 - zPin2 * zPin2));
        const phi2 = Math.asin(-zPin2 / 120.0);

        if (rotatingPartsRef.current.conRod2) {
          rotatingPartsRef.current.conRod2.position.set(54.0, yPin2, zPin2);
          rotatingPartsRef.current.conRod2.rotation.x = phi2;
        }
        if (rotatingPartsRef.current.piston2) {
          rotatingPartsRef.current.piston2.position.set(54.0, yWrist2 + 5.0, 0);
        }

        // 7. 太阳轮与 MG1 电机 (Axis 1, Z = 0):
        // 严格带符号旋转：
        // 当 sunRpm > 0 (正值) 时：向正方向旋转 (Positive forward)
        // 当 sunRpm < 0 (负值，如纯电起步 -2435 rpm) 时：向反方向旋转 (Negative reverse)！
        // 当 sunRpm = 0 时：完全静止停转！
        if (rotatingPartsRef.current.sunGroup) {
          rotatingPartsRef.current.sunGroup.rotation.x += sunRpm * visualScale;
        }
        if (rotatingPartsRef.current.mg1Group) {
          rotatingPartsRef.current.mg1Group.rotation.x += mg1Rpm * visualScale;
        }
        if (centralShaft) {
          centralShaft.rotation.x += mg1Rpm * visualScale;
        }
        if (mg1BearingInner) {
          mg1BearingInner.rotation.x += mg1Rpm * visualScale;
        }

        // 8. 行星轮自转 (围绕行星架销轴):
        for (const pg of rotatingPartsRef.current.planetGroups) {
          pg.rotation.x += planetRelRpm * visualScale;
        }

        // 9. 525 滚子驱动链条空间实体化联动 (Synchronized 525 Roller Chain Motion)
        // 线速度与 48T 后链盘及 12T 主动小链轮齿顶圆周速度严密同步
        const chainLinearSpeed = wheelRpm * visualScale * 121.4;
        chainDistance = (chainDistance - chainLinearSpeed) % chainLTotal;
        if (chainDistance < 0) chainDistance += chainLTotal;

        const chainDummyMat = new THREE.Matrix4();
        for (let k = 0; k < 100; k++) {
          const sPin = (k * linkPitch + chainDistance) % chainLTotal;
          const pinData = getChainPointAndTangent(sPin);

          // 1. 放置销轴与精密滚子 (Pin & Roller)
          chainDummyMat.set(
            1, 0, 0, -92.0,
            0, pinData.Tz, pinData.Ty, pinData.y,
            0, -pinData.Ty, pinData.Tz, pinData.z,
            0, 0, 0, 1
          );
          pinsMesh.setMatrixAt(k, chainDummyMat);
          rollersMesh.setMatrixAt(k, chainDummyMat);

          // 2. 放置内/外链节板 (Link Plates at midpoint)
          const sMid = (sPin + linkPitch / 2) % chainLTotal;
          const midData = getChainPointAndTangent(sMid);

          if (k % 2 === 0) {
            // 外链节：竞技金色外链板 (X = -92.0 ± 6.8 mm)
            chainDummyMat.set(
              1, 0, 0, -92.0 - 6.8,
              0, midData.Tz, midData.Ty, midData.y,
              0, -midData.Ty, midData.Tz, midData.z,
              0, 0, 0, 1
            );
            outerPlatesMesh.setMatrixAt(k, chainDummyMat);

            chainDummyMat.set(
              1, 0, 0, -92.0 + 6.8,
              0, midData.Tz, midData.Ty, midData.y,
              0, -midData.Ty, midData.Tz, midData.z,
              0, 0, 0, 1
            );
            outerPlatesMesh.setMatrixAt(k + 1, chainDummyMat);
          } else {
            // 内链节：淬火深色内链板 (X = -92.0 ± 4.2 mm)
            chainDummyMat.set(
              1, 0, 0, -92.0 - 4.2,
              0, midData.Tz, midData.Ty, midData.y,
              0, -midData.Ty, midData.Tz, midData.z,
              0, 0, 0, 1
            );
            innerPlatesMesh.setMatrixAt(k - 1, chainDummyMat);

            chainDummyMat.set(
              1, 0, 0, -92.0 + 4.2,
              0, midData.Tz, midData.Ty, midData.y,
              0, -midData.Ty, midData.Tz, midData.z,
              0, 0, 0, 1
            );
            innerPlatesMesh.setMatrixAt(k, chainDummyMat);
          }
        }
        pinsMesh.instanceMatrix.needsUpdate = true;
        rollersMesh.instanceMatrix.needsUpdate = true;
        outerPlatesMesh.instanceMatrix.needsUpdate = true;
        innerPlatesMesh.instanceMatrix.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // ResizeObserver: Guaranteed responsive rendering and square pixel aspect ratio
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h, true);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animId);
      if (rendererRef.current?.domElement) {
        rendererRef.current.domElement.remove();
      }
      rendererRef.current?.dispose();
    };
  }, [createGearMesh, createInternalRingGearMesh, currentModeSpeedMultiplier, isPlaying, playbackSpeed]);

  // Handle Explode ratio update (clean single-tier positioning without double-offset)
  useEffect(() => {
    const parts = explodablePartsRef.current;
    if (!parts.mg1 || !parts.mg2) return;

    const explode = explodeRatio;
    // 1. Left/Right Motors explode laterally along motorcycle transverse axis (X)
    parts.mg1.position.x = -115 - explode * 70;
    parts.mg2.position.x = 118 + explode * 70;

    // 2. Engine moves forward (-Z)
    if (parts.ice) parts.ice.position.z = -120.0 - explode * 60;

    // 3. Planetary Gear Set & Input Gear integrity:
    // 爆炸分解时，整个行星齿轮组的所有零件（包括太阳轮、行星架、行星轮、齿圈、空心扭矩管与行星架输入齿轮）
    // 保持在原位，不产生任何左右 (X 轴) 移动！
    if (parts.carrier) parts.carrier.position.x = -46.0;
    if (parts.carrierInput) parts.carrierInput.position.x = 0;
    if (parts.torqueTube) parts.torqueTube.position.x = -23.1;
    if (parts.sun) parts.sun.position.x = -46.0;
    if (parts.ring) parts.ring.position.x = -46.0;

    // 4. Countershaft, Drive Chain & Rear Wheel move backward together (+Z):
    // 中间轴 (Axis 2)、驱动链条与后轮整体向后移动相同距离 (+Z)，确保轴距、链轮中心距绝对恒定，链条绝不断开！
    const rearExplodeZ = explode * 70;
    if (parts.rearWheel) parts.rearWheel.position.z = 655.0 + rearExplodeZ;
    if (parts.countershaft) {
      parts.countershaft.position.z = 105.0 + rearExplodeZ;
      parts.countershaft.position.y = 0;
    }
    if (parts.countershaftBearing) {
      parts.countershaftBearing.position.z = 105.0 + rearExplodeZ;
      parts.countershaftBearing.position.y = 0;
    }
    if (parts.chain) {
      parts.chain.position.z = rearExplodeZ;
      parts.chain.position.y = 0;
    }
  }, [explodeRatio]);

  // Handle Camera Presets with Gimbal-safe vectors
  const setCameraView = (preset: 'isometric' | 'top' | 'planetary' | 'mesh' | 'chain') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    setCameraPreset(preset);

    if (preset === 'top') {
      // Top-Down: Set up to (0, 0, -1) so front of bike points UP on screen!
      cam.up.set(0, 0, -1);
      cam.position.set(0, 1150, 260);
      ctrl.target.set(0, 0, 260);
    } else if (preset === 'isometric') {
      // 3D Technical isometric view framing full powertrain from engine front to rear tire
      cam.up.set(0, 1, 0);
      cam.position.set(450, 480, 680);
      ctrl.target.set(0, -40, 260);
    } else if (preset === 'planetary') {
      // Close-up on the Planetary Gear Set core & Red Sun Gear (unified with MG1)
      cam.up.set(0, 1, 0);
      cam.position.set(-46, 130, 145);
      ctrl.target.set(-46, 0, 0);
    } else if (preset === 'mesh') {
      // Close up of central input mesh (48T ➔ 72T) directly focused on the contact line at Z = -72.0mm
      cam.up.set(0, 1, 0);
      cam.position.set(60, 160, -20);
      ctrl.target.set(0, 0, -72);
    } else if (preset === 'chain') {
      // Rear chain drive and wheel perspective (viewing 550mm chain loop, 12T & 48T sprockets, 160/60 wheel)
      cam.up.set(0, 1, 0);
      cam.position.set(-450, 260, 560);
      ctrl.target.set(-92, 0, 380);
    }
    ctrl.update();
  };

  // 📸 Export High-Res PNG Screenshot
  const handleExportPNG = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const dataURL = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Motorcycle_Hybrid_ECVT_3D_${cameraPreset}.png`;
    link.href = dataURL;
    link.click();
  };

  return (
    <div className="relative w-full h-[620px] sm:h-[700px] bg-slate-950 select-none overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
      {/* 3D WebGL Canvas Container with Explicit Height */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Top Right Actions (Screenshot / Download button) */}
      <div className="absolute top-3 right-3 z-20 pointer-events-auto">
        <button
          id="btn-export-png"
          onClick={handleExportPNG}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg transition-all hover:shadow-emerald-600/30"
          title="直接从当前 3D 视角无损导出高清晰度 PNG 渲染截图"
        >
          <Download className="w-3.5 h-3.5" />
          <span>导出 3D PNG 截图</span>
        </button>
      </div>

      {/* Interactive Speed & Engine RPM Dynamic Control Panel (动力学交互调节面板 - 移动至左上角位置) */}
      <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/70 shadow-2xl overflow-hidden w-80 sm:w-96 text-xs text-slate-200 transition-all z-20">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700/60">
          <div className="flex items-center gap-1.5 font-semibold text-sky-400">
            <Sliders className="w-3.5 h-3.5" />
            <span>动力学交互调节面板</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setControlMode(controlMode === 'preset' ? 'manual' : 'preset')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                controlMode === 'manual'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'bg-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {controlMode === 'manual' ? '手动控制中' : '切换手动'}
            </button>
            <button
              onClick={() => setIsPanelExpanded(!isPanelExpanded)}
              className="text-slate-400 hover:text-white text-xs px-1"
              title={isPanelExpanded ? '折叠面板' : '展开面板'}
            >
              {isPanelExpanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {isPanelExpanded && (
          <div className="p-3 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto">
            {/* Control mode description banner */}
            <div className={`p-2 rounded-lg text-[11px] leading-relaxed border ${
              controlMode === 'manual'
                ? 'bg-amber-950/40 border-amber-800/50 text-amber-200'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
            }`}>
              {controlMode === 'manual' ? (
                <span>⚡ <b>已激活手动实时联动模式</b>：调节车速与发动机转速，通过 48T/72T 中置输入副 (a_ice=120mm)、行星排与 12T/48T 终传滚子链 (速比 4.000) 即时驱动 1:1 真实比例 160/60 ZR17 轮系运转！</span>
              ) : (
                <span>ℹ️ 当前跟随工况预设。点击右上角<b>“切换手动”</b>可自主调节车速与发动机转速。</span>
              )}
            </div>

            {/* Vehicle Speed Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-300 font-medium">
                  <Gauge className="w-3.5 h-3.5 text-sky-400" />
                  <span>摩托车车速 (Vehicle Speed):</span>
                </span>
                <span className="font-mono text-sky-400 font-bold text-sm">
                  {manualVehicleSpeedKmh} <span className="text-[10px] font-normal text-slate-400">km/h</span>
                </span>
              </div>
              <input
                id="slider-vehicle-speed"
                type="range"
                min="0"
                max="180"
                step="5"
                value={manualVehicleSpeedKmh}
                onChange={(e) => {
                  setManualVehicleSpeedKmh(parseFloat(e.target.value));
                  if (controlMode !== 'manual') setControlMode('manual');
                }}
                className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0 km/h (静止)</span>
                <span>60 (巡航)</span>
                <span>120 (高速)</span>
                <span>180 km/h</span>
              </div>
            </div>

            {/* Engine RPM Slider */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-300 font-medium">
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>发动机转速 (Engine ICE RPM):</span>
                </span>
                <span className="font-mono text-amber-400 font-bold text-sm">
                  {manualIceRpm} <span className="text-[10px] font-normal text-slate-400">RPM</span>
                </span>
              </div>
              <input
                id="slider-engine-rpm"
                type="range"
                min="0"
                max="8500"
                step="100"
                value={manualIceRpm}
                onChange={(e) => {
                  setManualIceRpm(parseFloat(e.target.value));
                  if (controlMode !== 'manual') setControlMode('manual');
                }}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0 (熄火纯电)</span>
                <span>1500 (怠速)</span>
                <span>4000 (高效)</span>
                <span>8500 (红线)</span>
              </div>
            </div>

            {/* Fixed Gear Specification Tags */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-[10px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Cog className="w-3 h-3 text-sky-400" />
                  <span>曲轴中置输入副:</span>
                </span>
                <span className="font-mono text-sky-300 font-semibold">
                  48T / 72T (速比 1.500, a_ice=120.0mm)
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-[10px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Cog className="w-3 h-3 text-amber-400" />
                  <span>MG2 减速传动副:</span>
                </span>
                <span className="font-mono text-amber-300 font-semibold">
                  35T / 70T (速比 2.000, a₂=105.0mm)
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-[10px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Cog className="w-3 h-3 text-emerald-400" />
                  <span>终传链条减速比:</span>
                </span>
                <span className="font-mono text-emerald-300 font-semibold">
                  12T / 48T (速比 4.000, r₁=30.7mm, r₂=121.4mm)
                </span>
              </div>
            </div>

            {/* Live Kinematic Outputs Summary */}
            {(() => {
              const liveWheelRpm = (manualVehicleSpeedKmh / 3.6 / 0.312) * 60 / (2 * Math.PI);
              const liveCounterRpm = liveWheelRpm * (48 / 12);
              const liveRingRpm = liveCounterRpm * (60 / 60);
              const liveCarrierRpm = manualIceRpm / (72 / 48);
              const liveSunRpm = (1 + 54 / 18) * liveCarrierRpm - (54 / 18) * liveRingRpm;
              const liveMg2Rpm = liveCounterRpm * 2.0;

              return (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>各轴系瞬时转速与转向 (Live Kinematics):</span>
                    <span className="font-mono text-emerald-400 text-[9px]">3D渲染方向100%同步</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px]">后轮 (48T)</div>
                      <div className="font-mono text-slate-200 font-semibold mt-0.5">
                        {liveWheelRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px]">副轴 (12T/i=4.0)</div>
                      <div className="font-mono text-cyan-400 font-semibold mt-0.5">
                        {liveCounterRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px]">齿圈 (60T/内54T)</div>
                      <div className="font-mono text-emerald-400 font-semibold mt-0.5">
                        {liveRingRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px]">行星架 (i=1.50)</div>
                      <div className="font-mono text-sky-400 font-semibold mt-0.5">
                        {liveCarrierRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px] flex items-center justify-between">
                        <span>太阳轮 / MG1</span>
                        <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${liveSunRpm < -1 ? 'bg-rose-950 text-rose-300' : liveSunRpm > 1 ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                          {liveSunRpm < -1 ? '反转' : liveSunRpm > 1 ? '正转' : '停转'}
                        </span>
                      </div>
                      <div className={`font-mono font-bold mt-0.5 ${liveSunRpm < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {liveSunRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                      <div className="text-slate-400 text-[9px]">MG2 (i=2.00)</div>
                      <div className="font-mono text-yellow-400 font-semibold mt-0.5">
                        {liveMg2Rpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick preset buttons */}
            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-slate-400 block font-medium">快速典型工况切换:</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(35);
                    setManualIceRpm(0);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  纯电起步 (35/0)
                </button>
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(0);
                    setManualIceRpm(1500);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  怠速发电 (0/1500)
                </button>
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(100);
                    setManualIceRpm(3400);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  经济巡航 (100/3400)
                </button>
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(110);
                    setManualIceRpm(5500);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  全力加速 (110/5500)
                </button>
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(130);
                    setManualIceRpm(6000);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  高速冲刺 (130/6000)
                </button>
                <button
                  onClick={() => {
                    setControlMode('manual');
                    setManualVehicleSpeedKmh(160);
                    setManualIceRpm(7000);
                  }}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition text-center"
                >
                  极速工况 (160/7000)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Animation Controls */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-700/60 shadow-xl gap-3">
        {/* Play / Pause & Speed */}
        <div className="flex items-center gap-2">
          <button
            id="btn-play-pause"
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-all shadow"
            title={isPlaying ? '暂停转动' : '开始动力学转动'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="text-slate-400">显示比例:</span>
            <span className="font-mono text-emerald-400 font-bold bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 rounded text-[10px]">
              1/100 实际转速
            </span>
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setPlaybackSpeed(0.25)}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  playbackSpeed === 0.25 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="超慢速 0.25x"
              >
                0.25x
              </button>
              <button
                onClick={() => setPlaybackSpeed(0.5)}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  playbackSpeed === 0.5 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="慢速 0.5x"
              >
                0.5x
              </button>
              <button
                onClick={() => setPlaybackSpeed(1.0)}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  playbackSpeed === 1.0 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="标准 1.0x (1/100 实际转速)"
              >
                1.0x
              </button>
              <button
                onClick={() => setPlaybackSpeed(2.0)}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  playbackSpeed === 2.0 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="加速 2.0x"
              >
                2.0x
              </button>
            </div>
          </div>
        </div>

        {/* Explode Slider */}
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">爆炸分解:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={explodeRatio}
              onChange={(e) => setExplodeRatio(parseFloat(e.target.value))}
              className="w-24 accent-sky-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
            <span className="font-mono text-[10px] w-8">{Math.round(explodeRatio * 100)}%</span>
          </div>
        </div>

        {/* Guidance tip */}
        <div className="hidden lg:flex items-center text-[11px] text-slate-400">
          <span>💡 鼠标左键按住拖拽可 360° 自由旋转视角，滚轮缩放</span>
        </div>
      </div>
    </div>
  );
};
