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
  const [controlMode, setControlMode] = useState<'preset' | 'manual'>('preset');
  const [manualVehicleSpeedKmh, setManualVehicleSpeedKmh] = useState(60); // 0 - 180 km/h
  const [manualIceRpm, setManualIceRpm] = useState(3000);                 // 0 - 8500 rpm
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  // Ref to hold live speed / engine RPM for high-performance animation loop
  const kinRef = useRef({
    controlMode: 'preset' as 'preset' | 'manual',
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
    rearWheel?: THREE.Group;
    chain?: THREE.Mesh;
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
    const PLANETARY_X = -44.0; // Left-offset planetary gearset with complete spatial clearance from ICE crankweb

    // Materials
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.25 });
    const darkAlloyMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.35 });
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
    const tireRubberMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.05, roughness: 0.92 });
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.75, roughness: 0.3 });
    const aluMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.82, roughness: 0.22 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.35 });

    // ---------------- 1. ICE Front Unit & Central-Drive Crankshaft (350cc Twin-Cylinder) ----------------
    // Position the entire iceGroup at ICE_CRANK_Z = -120.0 (with complete spatial clearance!)
    const iceGroup = new THREE.Group();
    iceGroup.position.set(0, 0, ICE_CRANK_Z);

    // Crankshaft Rotating Assembly Group (Rotates at local Z = 0 inside iceGroup)
    const crankshaftAssembly = new THREE.Group();
    crankshaftAssembly.position.set(0, 0, 0);

    // 1.1 Central 48T Output Gear (z_ice = 48, m=2.0, d=96mm, radius=48.0mm, width=20mm)
    // Firmly machined and located in the EXACT CENTER of the crankshaft at X = 0!
    // Tip radius = 50.0mm safely stays well below cylinder bottom deck (Y = +55mm), completely collision-free!
    // Offset phase by Math.PI / 48 (half tooth pitch) for conjugate tooth-in-valley meshing with 72T gear
    const iceGearGroup = createGearMesh(48.0, 20, 48, 0x94a3b8, 14);
    iceGearGroup.position.set(0, 0, 0); // local to crankshaftAssembly
    iceGearGroup.rotation.x = Math.PI / 48; // Half-pitch phase offset for conjugate meshing!
    crankshaftAssembly.add(iceGearGroup);

    // Crankshaft Heavy-Duty Main Journal (Φ30mm, radius 15mm, length 176mm)
    // Smooth cylinder spans through X = [-88, +88]
    const crankMainBar = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 176, 28), steelMat);
    crankMainBar.rotateZ(Math.PI / 2);
    crankshaftAssembly.add(crankMainBar);

    // Dual Central Main Bearing Journals flanking the 35T output gear (X = -15.5mm & +15.5mm)
    for (const bx of [-15.5, 15.5]) {
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(19.0, 19.0, 10, 24), steelMat);
      bearing.rotateZ(Math.PI / 2);
      bearing.position.set(bx, 0, 0);
      crankshaftAssembly.add(bearing);
    }

    // 1.2 Forged Knife-Edge Crankwebs & Crankpins (180° Parallel-Twin, Stroke S = 55.0mm, R_crank = 27.5mm)
    // Compact 84mm Bore Pitch: Cylinder 1 at X = -42.0mm, Cylinder 2 at X = +42.0mm
    // Aerodynamic profiled counterweights eliminate oil windage with smooth high-speed dynamic balance
    const webShape = new THREE.Shape();
    // Crankpin head boss arc at Y = 27.5mm, radius 18.5mm
    webShape.absarc(0, 27.5, 18.5, 0, Math.PI, false);
    // Narrow waist transition down towards shaft axis
    webShape.lineTo(-16.5, 4);
    // Dynamic counterweight fan lobe (radius 34mm, center at Y = -12mm, bottom reaches Y = -46mm)
    webShape.absarc(0, -12, 34, Math.PI, 0, true);
    webShape.lineTo(16.5, 4);
    webShape.closePath();

    const webGeom = new THREE.ExtrudeGeometry(webShape, {
      depth: 10, // 10mm thick forged web
      bevelEnabled: true,
      bevelSize: 0.8,
      bevelThickness: 0.8
    });
    webGeom.translate(0, 0, -5.0);
    webGeom.rotateY(Math.PI / 2);

    // Left Crank Throw (Cylinder 1 at X = -42.0mm) - 0° orientation (Pin at Y = +27.5, Web at Y = -12)
    // Inner web webL1 is centered at X = -27.5mm
    // Outer web webL2 is centered at X = -56.5mm
    const webL1 = new THREE.Mesh(webGeom, steelMat);
    webL1.position.set(-27.5, 0, 0);
    crankshaftAssembly.add(webL1);

    const webL2 = new THREE.Mesh(webGeom, steelMat);
    webL2.position.set(-56.5, 0, 0);
    crankshaftAssembly.add(webL2);

    // Left Crankpin (Φ28mm, length 16mm at Y = +27.5mm, centered at X = -42.0mm)
    const crankPinL = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 24), steelMat);
    crankPinL.rotateZ(Math.PI / 2);
    crankPinL.position.set(-42.0, 27.5, 0);
    crankshaftAssembly.add(crankPinL);

    // Right Crank Throw (Cylinder 2 at X = +42.0mm) - 180° OPPOSITE orientation (Pin at Y = -27.5, Web at Y = +12)
    // Inner web webR1 is centered at X = +27.5mm
    // Outer web webR2 is centered at X = +56.5mm
    const webR1 = new THREE.Mesh(webGeom, steelMat);
    webR1.position.set(27.5, 0, 0);
    webR1.rotation.x = Math.PI; // 180 degrees difference
    crankshaftAssembly.add(webR1);

    const webR2 = new THREE.Mesh(webGeom, steelMat);
    webR2.position.set(56.5, 0, 0);
    webR2.rotation.x = Math.PI; // 180 degrees difference
    crankshaftAssembly.add(webR2);

    // Right Crankpin (Φ28mm, length 16mm at Y = -27.5mm, centered at X = +42.0mm)
    const crankPinR = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 24), steelMat);
    crankPinR.rotateZ(Math.PI / 2);
    crankPinR.position.set(42.0, -27.5, 0); // 180 degrees opposite
    crankshaftAssembly.add(crankPinR);

    // Outer Main Bearing Journals (X = -69mm & +69mm)
    for (const bx of [-69, 69]) {
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(19.0, 19.0, 10, 24), steelMat);
      bearing.rotateZ(Math.PI / 2);
      bearing.position.set(bx, 0, 0);
      crankshaftAssembly.add(bearing);
    }

    // Torsional Damper on right end of crankshaft (X = +82mm, Φ68mm x 14mm)
    const damper = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 14, 32), steelMat);
    damper.rotateZ(Math.PI / 2);
    damper.position.set(82, 0, 0);
    crankshaftAssembly.add(damper);

    // Magneto Flywheel on left end of crankshaft (X = -82mm, Φ68mm x 14mm)
    const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 14, 32), darkAlloyMat);
    flywheel.rotateZ(Math.PI / 2);
    flywheel.position.set(-82, 0, 0);
    crankshaftAssembly.add(flywheel);

    iceGroup.add(crankshaftAssembly);

    // 1.3 Authentic Forged H-Beam Connecting Rod Builder Function
    // Center-to-center distance L = 96.0mm.
    // Integrated single-piece forging with crankpin through-hole (Φ28mm) and wrist pin through-hole (Φ16mm).
    // Eliminates all floating rings, solid discs, or prototype artifacts.
    const createAuthenticConRod = (rodLength = 96.0) => {
      const conRodAssembly = new THREE.Group();

      const rodShape = new THREE.Shape();
      // Outer Big-End contour (arc around 0, 0, radius 18.5mm)
      rodShape.absarc(0, 0, 18.5, Math.PI * 0.72, Math.PI * 0.28, true);
      // Right bolt boss
      rodShape.lineTo(17.0, 2);
      rodShape.lineTo(16.0, 12);
      // Shank taper up to neck
      rodShape.lineTo(6.0, 22);
      rodShape.lineTo(5.0, rodLength - 16);
      // Small-end right transition
      rodShape.lineTo(11.5, rodLength - 4);
      // Small-end outer top cap arc (center 0, rodLength, radius 11.5mm)
      rodShape.absarc(0, rodLength, 11.5, 0, Math.PI, false);
      // Small-end left transition
      rodShape.lineTo(-11.5, rodLength - 4);
      rodShape.lineTo(-5.0, rodLength - 16);
      // Shank taper down
      rodShape.lineTo(-6.0, 22);
      // Left bolt boss
      rodShape.lineTo(-16.0, 12);
      rodShape.lineTo(-17.0, 2);
      rodShape.closePath();

      // Big-End Crankpin Bore Hole: Φ28.0mm (radius 14.0mm) at (0, 0)
      const bigHole = new THREE.Path();
      bigHole.absarc(0, 0, 14.0, 0, Math.PI * 2, true);
      rodShape.holes.push(bigHole);

      // Small-End Wrist Pin Bore Hole: Φ16.0mm (radius 8.0mm) at (0, rodLength)
      const smallHole = new THREE.Path();
      smallHole.absarc(0, rodLength, 8.0, 0, Math.PI * 2, true);
      rodShape.holes.push(smallHole);

      const rodGeom = new THREE.ExtrudeGeometry(rodShape, {
        depth: 16.0, // 16mm forging width along engine X-axis
        bevelEnabled: true,
        bevelSize: 0.6,
        bevelThickness: 0.6,
        curveSegments: 32
      });
      rodGeom.translate(0, 0, -8.0);
      rodGeom.rotateY(Math.PI / 2); // Coordinate mapping: depth aligns to world X, length along Y, width along Z

      const rodMesh = new THREE.Mesh(rodGeom, steelMat);
      conRodAssembly.add(rodMesh);

      // Cap studs & hex nuts (2 titanium studs)
      for (const bz of [-14.0, 14.0]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 16, 12), darkAlloyMat);
        stud.position.set(0, 3, bz);
        conRodAssembly.add(stud);

        const nut = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 3, 6), steelMat);
        nut.position.set(0, -9, bz);
        conRodAssembly.add(nut);
      }

      // Authentic H-Beam Flute Recesses (machined lightening groove on both flanks)
      for (const sideX of [-8.2, 8.2]) {
        const flute = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, rodLength - 46, 5.5),
          darkAlloyMat
        );
        flute.position.set(sideX, rodLength / 2 + 2, 0);
        conRodAssembly.add(flute);
      }

      return conRodAssembly;
    };

    // 1.4 Twin Cylinders, Pistons & Connecting Rods
    // Authentic Compact 84mm Bore Pitch:
    // Cylinder 1 (Left: X = -42.0mm, initial TDC, Pin at Y = +27.5)
    // Cylinder 2 (Right: X = +42.0mm, initial BDC, Pin at Y = -27.5)
    // Bore B = 63.5mm, Stroke S = 55.0mm, Con-Rod Length L = 96.0mm (L/S = 1.745)
    // Symmetrical Front-Facing Technical Cutaway Window:
    // Centered at theta = 180° (Front -Z), with solid wall spanning 225° (thetaStart = 1.375 * Math.PI, thetaLength = 1.25 * Math.PI)
    // Opens a 135° window directly facing forward (-Z), providing 100% bilateral symmetry across X = 0!
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

    for (const cx of [-42.0, 42.0]) {
      // --- Cylinder Barrel with Front Symmetrical Cutaway Window ---
      const cylBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(36, 36, 110, 32, 1, false, Math.PI * 1.375, Math.PI * 1.25),
        cylBarrelMat
      );
      cylBarrel.position.set(cx, 106, 0);
      cylBarrel.castShadow = true;
      iceGroup.add(cylBarrel);

      // Polished Cylinder Inner Sleeve Liner (Bore 63.5mm, radius 31.75mm)
      // Exactly concentric and sharing the identical symmetrical front opening
      const cylLiner = new THREE.Mesh(
        new THREE.CylinderGeometry(31.75, 31.75, 108, 32, 1, true, Math.PI * 1.375, Math.PI * 1.25),
        cylLinerMat
      );
      cylLiner.position.set(cx, 106, 0);
      iceGroup.add(cylLiner);

      // Machined Cylinder Cooling Fins (radius 39.5mm -> leaves 5.0mm clean space between cylinders)
      for (let fy = 72; fy <= 152; fy += 8) {
        const fin = new THREE.Mesh(
          new THREE.CylinderGeometry(39.5, 39.5, 2.2, 28, 1, false, Math.PI * 1.375, Math.PI * 1.25),
          aluMat
        );
        fin.position.set(cx, fy, 0);
        iceGroup.add(fin);
      }

      // Spark plug hex and porcelain insulator for each cylinder
      const sparkPlug = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 18, 12), steelMat);
      sparkPlug.position.set(cx, 184, 0);
      iceGroup.add(sparkPlug);
    }

    // --- Unified DOHC 4-Valve Twin-Cylinder Head (authentic compact cast aluminum block, spans [-82, +82]) ---
    const cylHead = new THREE.Mesh(new THREE.BoxGeometry(164, 26, 76), darkAlloyMat);
    cylHead.position.set(0, 168, 0);
    cylHead.castShadow = true;
    iceGroup.add(cylHead);

    // Helper: Create Forged Aluminum Piston Assembly (Φ63.0mm, Compression Height 40mm)
    const createForgedPiston = () => {
      const pistonGroup = new THREE.Group();

      // Piston body (diameter 63.0mm, radius 31.5mm, height 40mm)
      const pistonBody = new THREE.Mesh(
        new THREE.CylinderGeometry(31.5, 31.5, 40, 32),
        aluMat
      );
      pistonGroup.add(pistonBody);

      // Piston Crown Valve Relief Indentations
      for (const rx of [-10, 10]) {
        const valveRelief = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 16), steelMat);
        valveRelief.position.set(rx, 20, 0);
        pistonGroup.add(valveRelief);
      }

      // Piston Rings (Top Compression, 2nd Scraper, Oil Control Ring)
      for (const ry of [14, 10, 6]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(31.6, 0.7, 8, 32),
          darkAlloyMat
        );
        ring.rotateX(Math.PI / 2);
        ring.position.set(0, ry, 0);
        pistonGroup.add(ring);
      }

      // Wrist Pin (Gudgeon Pin: Φ16mm, length 46mm at local Y = -5.0)
      const wristPin = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 46, 20), steelMat);
      wristPin.rotateZ(Math.PI / 2);
      wristPin.position.set(0, -5.0, 0);
      pistonGroup.add(wristPin);

      return pistonGroup;
    };

    // Build Piston 1 & Connecting Rod 1 (Left Cylinder: X = -42.0mm)
    const piston1 = createForgedPiston();
    piston1.position.set(-42.0, 27.5 + 96.0 + 5.0, 0);
    iceGroup.add(piston1);

    const conRod1 = createAuthenticConRod(96.0);
    conRod1.position.set(-42.0, 27.5, 0);
    iceGroup.add(conRod1);

    // Build Piston 2 & Connecting Rod 2 (Right Cylinder: X = +42.0mm)
    const piston2 = createForgedPiston();
    piston2.position.set(42.0, -27.5 + 96.0 + 5.0, 0);
    iceGroup.add(piston2);

    const conRod2 = createAuthenticConRod(96.0);
    conRod2.position.set(42.0, -27.5, 0);
    iceGroup.add(conRod2);

    // Cutaway lower crankcase cradle (X spans -84mm to +84mm, width 168mm)
    const crankcaseMesh = new THREE.Mesh(new THREE.BoxGeometry(168, 44, 90), darkAlloyMat);
    crankcaseMesh.position.set(0, -22, 0);
    crankcaseMesh.castShadow = true;
    iceGroup.add(crankcaseMesh);

    scene.add(iceGroup);

    // ---------------- 2. Main Shaft System (Axis 1, Z = 0) ----------------
    // 2.1 Resized Carrier Input Gear (z_c_in = 72, m=2.0, d=144mm, radius=72.0mm, width=20mm)
    // Arranged in the MIDDLE (X = 0) on Axis 1 (Z = 0)!
    // Contact at Z = -72.0mm with ICE gear (Z = -120.0 + 48.0 = -72.0mm) - 100% PERFECT ZERO-GAP MESH!
    // Clearance to Axis 2 (Z = 105.0mm): 105.0 - 74.0 = 31.0mm clear physical gap, eliminating all intermediate shaft conflict!
    const carrierInputGear = createGearMesh(72.0, 20, 72, 0x0284c7, 20);
    carrierInputGear.position.set(0, 0, AXIS1_Z);
    scene.add(carrierInputGear);

    // Hollow torque tube connecting carrier input gear (X = 0) to shifted planetary carrier (X = PLANETARY_X = -46mm)
    const tubeLength = Math.abs(PLANETARY_X) - 8;
    const torqueTube = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, tubeLength, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 })
    );
    torqueTube.rotateZ(Math.PI / 2);
    torqueTube.position.set(-tubeLength / 2 - 4, 0, AXIS1_Z);
    scene.add(torqueTube);

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

    // 2.3 Planetary Gear Set (Shifted left to PLANETARY_X = -46.0 mm)
    // 2.3.1 Sun Gear (z_s = 24, m=1.5, d=36.0mm, radius=18.0mm)
    // Radiant Amber/Gold metallic finish - high visual contrast, clearly visible in the center!
    const sunGearGroup = createGearMesh(18.0, 16, 24, 0xf59e0b, 7.5);
    sunGearGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // Sun gear central hub collar connected to central shaft
    const sunHub = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 20, 24), steelMat);
    sunHub.rotateZ(Math.PI / 2);
    sunGearGroup.add(sunHub);
    scene.add(sunGearGroup);

    // 2.3.2 3-Arm Star/Spider Planet Carrier Assembly (Blue)
    const carrierGroup = new THREE.Group();
    carrierGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // 3-Arm Spider Carrier Flange Generator with Hollow Center and Open Bays
    // Geometry is generated in 2D shape (X-Y), then rotated by rotateY(Math.PI / 2) into 3D:
    // In 3D: (X_3d = 0, Y_3d = Y_2d, Z_3d = -X_2d).
    // Therefore, to place an arm/pin at 3D position (0, py, pz) where py = sin(pa)*R, pz = cos(pa)*R:
    // We set 2D coordinates: X_2d = -pz = -cos(pa)*R, Y_2d = py = sin(pa)*R!
    const createSpiderFlange = () => {
      const cShape = new THREE.Shape();
      const outerR = 34.0;
      const innerR = 12.0; // Hollow center exposes sun gear!
      const pinR = 31.5;

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
        // Deep bay between arms to reveal central sun gear
        const pBayX = -Math.cos(bayAngle) * (innerR + 5);
        const pBayY = Math.sin(bayAngle) * (innerR + 5);

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

      // Center hole for MG1 central shaft clearance
      const cHole = new THREE.Path();
      cHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
      cShape.holes.push(cHole);

      // 3 Precision Pin/Bearing holes mathematically matching 3 planet gears
      for (let i = 0; i < 3; i++) {
        const pa = (i / 3) * Math.PI * 2;
        const hx = -Math.cos(pa) * pinR;
        const hy = Math.sin(pa) * pinR;
        const pHole = new THREE.Path();
        pHole.absarc(hx, hy, 4.4, 0, Math.PI * 2, true);
        cShape.holes.push(pHole);
      }

      const fGeom = new THREE.ExtrudeGeometry(cShape, {
        depth: 4.5,
        bevelEnabled: true,
        bevelSize: 0.4,
        bevelThickness: 0.4,
        bevelSegments: 1
      });
      fGeom.translate(0, 0, -2.25);
      fGeom.rotateY(Math.PI / 2);
      return fGeom;
    };

    const carrierMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });
    const spiderL = new THREE.Mesh(createSpiderFlange(), carrierMat);
    spiderL.position.set(-9, 0, 0);
    carrierGroup.add(spiderL);

    const spiderR = new THREE.Mesh(createSpiderFlange(), carrierMat);
    spiderR.position.set(9, 0, 0);
    carrierGroup.add(spiderR);

    // 2.3.3 3 Planet Gears (z_p = 18, m=1.5, d=27.0mm, radius=13.5mm, Steel) & Precision Needle Bearings
    // Mounted on pin circle radius 31.5 mm, surrounding the central Golden Sun Gear (24T)
    const planetGroups: THREE.Group[] = [];
    const pinRadius = 31.5;

    const bearingBronzeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const py = Math.sin(angle) * pinRadius;
      const pz = Math.cos(angle) * pinRadius;

      // Precision Planet Pin (Steel shaft connecting left and right spider carrier flanges)
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 22, 20), steelMat);
      pin.rotateZ(Math.PI / 2);
      pin.position.set(0, py, pz);
      carrierGroup.add(pin);

      // Planet Bearing Bronze Bushing / Needle Bearing Sleeves on Left & Right Flange Mounts
      for (const bSign of [-1, 1]) {
        const bearingSleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(5.4, 5.4, 5.0, 20),
          bearingBronzeMat
        );
        bearingSleeve.rotateZ(Math.PI / 2);
        bearingSleeve.position.set(bSign * 9, py, pz);
        carrierGroup.add(bearingSleeve);
      }

      // Planet Gear (hardened steel, 18 teeth, radius 13.5mm) mounted concentrically on pin
      const pg = createGearMesh(13.5, 15, 18, 0xcfd8dc, 3.5);
      pg.position.set(0, py, pz);
      carrierGroup.add(pg);
      planetGroups.push(pg);
    }
    scene.add(carrierGroup);

    // 2.4 Complete Ring Gear (Green) with both External 66T teeth and Internal 60T planetary teeth at PLANETARY_X = -46.0 mm
    // Full 360-degree closed circular gear assembly with 22mm width
    const ringGroup = new THREE.Group();
    ringGroup.position.set(PLANETARY_X, 0, AXIS1_Z);

    // 1) Complete Outer teeth (66T, m=1.75, radius 57.75mm, width 22.0mm) for meshing with countershaft 54T
    const ringOuterTeeth = createGearMesh(57.75, 22, 66, 0x16a34a, 48.0, true, 0);
    ringGroup.add(ringOuterTeeth);

    // 2) Internal teeth (60T, m=1.5, pitch radius 45.0mm, width 22.0mm) for meshing with 3 planet gears
    // Seamlessly welded into a single rigid ring gear drum
    const ringInternalTeeth = createInternalRingGearMesh(45.0, 52.0, 22, 60, 0x15803d, 1.5);
    ringGroup.add(ringInternalTeeth);

    scene.add(ringGroup);

    // 2.5 Right MG2 Motor (Gold) & 28T Pinion
    // Motor redesign: Shortened axial length (52mm vs 90mm), enlarged outer radius (68mm vs 56mm)
    // High-torque pancake configuration, lateral position shifted inward to X = 118mm
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

    // MG2 Pinion (z_m2 = 35, m=2.0, d=70mm, radius=35.0mm) at X = 65.0 mm (进一步加大)
    const mg2Pinion = createGearMesh(35.0, 20, 35, 0xeab308, 10);
    mg2Pinion.position.set(65, 0, AXIS1_Z);
    scene.add(mg2Pinion);

    // MG2 Drive Sleeve connecting pinion (X=65) to MG2 rotor (X=118)
    const mg2Shaft = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 28, 20), steelMat);
    mg2Shaft.rotateZ(Math.PI / 2);
    mg2Shaft.position.set(80, 0, AXIS1_Z);
    scene.add(mg2Shaft);

    // ---------------- 3. Parallel Countershaft (Axis 2, Z = 105.0 mm) ----------------
    const countershaftGroup = new THREE.Group();
    countershaftGroup.position.set(0, 0, AXIS2_Z);

    // Solid shaft
    const cShaft = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 200, 24), steelMat);
    cShaft.rotateZ(Math.PI / 2);
    cShaft.position.set(-8, 0, 0);
    countershaftGroup.add(cShaft);

    // Gear 1: Driven Pinion from Ring Gear (z_c1 = 54, m=1.75, radius 47.25mm, width 22.0mm)
    // Shifted to PLANETARY_X (-46.0 mm) to mesh with shifted Ring Gear 66T!
    // 57.75 + 47.25 = 105.0 mm !!
    const cGear1 = createGearMesh(47.25, 22, 54, 0x64748b, 11);
    cGear1.position.set(PLANETARY_X, 0, 0);
    countershaftGroup.add(cGear1);

    // Gear 2: Driven Reduction Gear from MG2 (z_c2 = 70, m=2.0, radius 70.0mm) (进一步减小)
    // At X = 65.0 mm to mesh with MG2 Pinion 35T!
    // 35.0 + 70.0 = 105.0 mm !! 保持两者仍然紧密啮合
    const cGear2 = createGearMesh(70.0, 22, 70, 0x64748b, 11);
    cGear2.position.set(65, 0, 0);
    countershaftGroup.add(cGear2);

    // Drive Sprocket 12T at X = -92.0 mm (Pitch radius 30.7 mm for 525 chain, d = 61.3 mm)
    const driveSprocket = createGearMesh(30.7, 8, 12, 0xea580c, 10);
    driveSprocket.position.set(-92, 0, 0);
    countershaftGroup.add(driveSprocket);
    scene.add(countershaftGroup);

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
    }

    // Realistic Directional Tread Sipes (24 pairs of angled water dispersal grooves)
    // Conforming smoothly to R = 311.0 mm sport tire curvature
    for (let g = 0; g < 24; g++) {
      const gAng = (g / 24) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const groove = new THREE.Mesh(
          new THREE.BoxGeometry(28, 2.5, 4.5),
          darkAlloyMat
        );
        const grooveR = 310.8;
        const grooveX = side * 30;
        groove.position.set(grooveX, Math.sin(gAng) * grooveR, Math.cos(gAng) * grooveR);
        groove.rotation.x = gAng - Math.PI / 2;
        groove.rotation.y = side * 0.38; // Directional chevron angle
        groove.rotation.z = side * 0.18; // Conform to shoulder curvature
        rearWheelGroup.add(groove);
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

    // 525 Chain loop aligned at X = -92.0 mm, matching 12T (r = 30.7mm) and 48T (r = 121.4mm)
    // Swingarm center distance a_chain = 550.0 mm
    const chainCurve = new THREE.CurvePath<THREE.Vector3>();
    const cpF1 = new THREE.Vector3(-92, 30.7, AXIS2_Z);
    const cpR1 = new THREE.Vector3(-92, 121.4, REAR_Z);
    const cpR2 = new THREE.Vector3(-92, -121.4, REAR_Z);
    const cpF2 = new THREE.Vector3(-92, -30.7, AXIS2_Z);

    chainCurve.add(new THREE.LineCurve3(cpF1, cpR1));
    chainCurve.add(new THREE.LineCurve3(cpR1, cpR2));
    chainCurve.add(new THREE.LineCurve3(cpR2, cpF2));
    chainCurve.add(new THREE.LineCurve3(cpF2, cpF1));

    const chainMesh = new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 100, 3.2, 10, true), chainMat);
    scene.add(chainMesh);

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
      rearWheel: rearWheelGroup,
      chain: chainMesh
    };

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (isPlaying) {
        let omegaCounter: number;
        let omegaCarrier: number;

        if (kinRef.current.controlMode === 'manual') {
          // --- 物理速度与发动机转速联动运动学 (MANUAL CONTROL KINEMATICS) ---
          // 摩托车轮径 ~630mm, 周长 ~1.98m.
          // 60 km/h = 16.67 m/s -> 车轮转速 = 16.67 / 1.98 = 8.42 rev/s
          // 终传比 i_chain = 48 / 12 = 4.000 -> 副轴转速 = 8.42 * 4.000 = 33.68 rev/s
          // 设定 60 km/h 对应副轴基准角速度 ~ 1.8 rad/s (平顺清晰视觉转速)
          const normSpeedFactor = (kinRef.current.vehicleSpeedKmh / 60) * 1.8;
          omegaCounter = delta * normSpeedFactor * playbackSpeed;

          // 发动机转速 3000 RPM 对应基准角速度 ~ 4.2 rad/s
          // 曲轴与行星架从动齿轮传动比: i_ice = 72 / 48 = 1.50 -> omega_carrier = omega_ice / 1.50
          const normIceFactor = (kinRef.current.iceRpm / 3000) * 4.2;
          const omegaIce = delta * normIceFactor * playbackSpeed;
          omegaCarrier = omegaIce / (72 / 48);
        } else {
          // --- 预设模式速度与恒定速比运动学 ---
          const speedBase = delta * 2.2 * playbackSpeed * currentModeSpeedMultiplier;
          omegaCounter = speedBase;
          omegaCarrier = omegaCounter * 0.80;
        }

        // --- 正向前进行驶运动学 (FORWARD PROPULSION KINEMATICS) ---
        // 摩托车前进方向为 -Z，轮胎着地点向后(+Z)推地，车轮顶部向前(-Z)滚动：
        // 绕 +X 轴旋转为负方向 (Negative rotation)

        // 1. 平行副轴 (Axis 2, Z = 105.0):
        // 通过 12T 驱动链条与后轮 48T 链轮同向旋转 (负方向)
        if (rotatingPartsRef.current.countershaftGroup) {
          rotatingPartsRef.current.countershaftGroup.rotation.x -= omegaCounter;
        }

        // 2. 摩托车后轮 (Z = 655.0):
        // 终传比 i_chain = 48 / 12 = 4.000
        // 链传动同向旋转，车轮向前滚动，转角为负方向
        if (rotatingPartsRef.current.rearWheelGroup) {
          rotatingPartsRef.current.rearWheelGroup.rotation.x -= omegaCounter * (12 / 48);
        }

        // 3. 齿圈 (Axis 1, Z = 0):
        // 齿圈 66T 外齿与副轴 54T 齿轮为外齿柱齿轮啮合，旋转方向相反 -> 正方向 (Positive)
        const omegaRing = omegaCounter * (54 / 66);
        if (rotatingPartsRef.current.ringGroup) {
          rotatingPartsRef.current.ringGroup.rotation.x += omegaRing;
        }

        // 4. MG2 电机及主动齿轮 (Axis 1, Z = 0):
        // 与副轴齿轮外齿啮合，与副轴转向相反 -> 正方向 (速比严格按照最新定型 35T/70T = 2.000 计算)
        const omegaMG2 = omegaCounter * (70 / 35);
        if (rotatingPartsRef.current.mg2Group) {
          rotatingPartsRef.current.mg2Group.rotation.x += omegaMG2;
        }
        if (rotatingPartsRef.current.mg2Pinion) {
          rotatingPartsRef.current.mg2Pinion.rotation.x += omegaMG2;
        }

        // 5. 行星架、空心扭矩管与定型 72T 从动输入齿轮 (Axis 1, Z = 0):
        // 正向旋转 (Positive)
        if (rotatingPartsRef.current.carrierGroup) {
          rotatingPartsRef.current.carrierGroup.rotation.x += omegaCarrier;
        }
        if (carrierInputGear) {
          carrierInputGear.rotation.x += omegaCarrier;
        }
        if (torqueTube) {
          torqueTube.rotation.x += omegaCarrier;
        }

        // 6. 发动机曲轴与中置 48T 输出齿轮 (Axis 0, Z = -120.0):
        // 与行星架从动 72T 齿轮外齿直啮硬连接，转向相反 -> 负方向 (Negative, 速比 72/48 = 1.50)
        if (crankshaftAssembly) {
          crankshaftAssembly.rotation.x -= omegaCarrier * (72 / 48);
        }

        // 双缸曲柄连杆机构真实空间运动学联动 (Dynamic Slider-Crank Kinematics)
        const thetaCrank = crankshaftAssembly ? crankshaftAssembly.rotation.x : 0;
        // 左缸 (Cylinder 1: cx = -42.0, 0° 初始相位, TDC)
        const yPin1 = 27.5 * Math.cos(thetaCrank);
        const zPin1 = 27.5 * Math.sin(thetaCrank);
        const yWrist1 = yPin1 + Math.sqrt(Math.max(0, 96.0 * 96.0 - zPin1 * zPin1));
        const phi1 = Math.asin(-zPin1 / 96.0);

        if (rotatingPartsRef.current.conRod1) {
          rotatingPartsRef.current.conRod1.position.set(-42.0, yPin1, zPin1);
          rotatingPartsRef.current.conRod1.rotation.x = phi1;
        }
        if (rotatingPartsRef.current.piston1) {
          rotatingPartsRef.current.piston1.position.set(-42.0, yWrist1 + 5.0, 0);
        }

        // 右缸 (Cylinder 2: cx = +42.0, 180° 相位差, BDC)
        const yPin2 = -27.5 * Math.cos(thetaCrank);
        const zPin2 = -27.5 * Math.sin(thetaCrank);
        const yWrist2 = yPin2 + Math.sqrt(Math.max(0, 96.0 * 96.0 - zPin2 * zPin2));
        const phi2 = Math.asin(-zPin2 / 96.0);

        if (rotatingPartsRef.current.conRod2) {
          rotatingPartsRef.current.conRod2.position.set(42.0, yPin2, zPin2);
          rotatingPartsRef.current.conRod2.rotation.x = phi2;
        }
        if (rotatingPartsRef.current.piston2) {
          rotatingPartsRef.current.piston2.position.set(42.0, yWrist2 + 5.0, 0);
        }

        // 7. 太阳轮与 MG1 电机 (Axis 1, Z = 0):
        // 行星排运动学基本方程 (Planetary Gear Set Kinematic Equation):
        // rho = z_ring / z_sun = 60 / 24 = 2.500 (1 + rho = 3.500)
        // omega_sun = (1 + rho) * omega_carrier - rho * omega_ring
        const omegaSun = 3.500 * omegaCarrier - 2.500 * omegaRing;
        if (rotatingPartsRef.current.sunGroup) {
          rotatingPartsRef.current.sunGroup.rotation.x += omegaSun;
        }
        if (rotatingPartsRef.current.mg1Group) {
          rotatingPartsRef.current.mg1Group.rotation.x += omegaSun;
        }

        // 8. 行星轮自转 (围绕行星架销轴):
        for (const pg of rotatingPartsRef.current.planetGroups) {
          pg.rotation.x -= (omegaSun - omegaCarrier) * (24 / 18);
        }
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
    if (parts.torqueTube) parts.torqueTube.position.x = -23.0;
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
      // Close-up on the Planetary Gear Set core & Golden Sun Gear
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

      {/* Top Overlay Status Bar */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between pointer-events-none gap-2">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-lg pointer-events-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide">
            3D 机械剖切解剖视窗
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 font-mono border border-sky-800/60">
            中心距 a = {SYSTEM_CENTER_DISTANCE} mm 绝对吻合
          </span>
        </div>

        {/* Screenshot / Download button */}
        <button
          id="btn-export-png"
          onClick={handleExportPNG}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg transition-all pointer-events-auto hover:shadow-emerald-600/30 ml-auto"
          title="直接从当前 3D 视角无损导出高清晰度 PNG 渲染截图"
        >
          <Download className="w-3.5 h-3.5" />
          <span>导出 3D PNG 截图</span>
        </button>
      </div>

      {/* Interactive Speed & Engine RPM Dynamic Control Panel (手动调节车速和发动机转速控制面板) */}
      <div className="absolute top-14 right-3 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/70 shadow-2xl overflow-hidden w-80 sm:w-96 text-xs text-slate-200 transition-all z-10">
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
              const liveRingRpm = liveCounterRpm * (54 / 66);
              const liveCarrierRpm = manualIceRpm / 1.50;
              const liveSunRpm = (1 + 60 / 24) * liveCarrierRpm - (60 / 24) * liveRingRpm;
              const liveMg2Rpm = liveCounterRpm * 2.0;

              return (
                <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">后轮 (48T)</div>
                    <div className="font-mono text-slate-200 font-semibold mt-0.5">
                      {liveWheelRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">副轴 (12T/i=4.0)</div>
                    <div className="font-mono text-cyan-400 font-semibold mt-0.5">
                      {liveCounterRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">齿圈 / 54T</div>
                    <div className="font-mono text-emerald-400 font-semibold mt-0.5">
                      {liveRingRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">行星架 (i=1.5)</div>
                    <div className="font-mono text-sky-400 font-semibold mt-0.5">
                      {liveCarrierRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">太阳轮 / MG1</div>
                    <div className="font-mono text-rose-400 font-semibold mt-0.5">
                      {liveSunRpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-400 text-[9px]">MG2 (i=2.0)</div>
                    <div className="font-mono text-yellow-400 font-semibold mt-0.5">
                      {liveMg2Rpm.toFixed(0)} <span className="text-[8px] font-normal text-slate-500">rpm</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick preset buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400">快速工况:</span>
              <button
                onClick={() => {
                  setControlMode('manual');
                  setManualVehicleSpeedKmh(35);
                  setManualIceRpm(0);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
              >
                纯电 (35km/0)
              </button>
              <button
                onClick={() => {
                  setControlMode('manual');
                  setManualVehicleSpeedKmh(100);
                  setManualIceRpm(3400);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
              >
                巡航 (100km/3400)
              </button>
              <button
                onClick={() => {
                  setControlMode('manual');
                  setManualVehicleSpeedKmh(130);
                  setManualIceRpm(6000);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
              >
                极速 (130km/6000)
              </button>
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
          <div className="flex items-center gap-1 text-xs text-slate-300">
            <span>转速:</span>
            <button
              onClick={() => setPlaybackSpeed(0.5)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                playbackSpeed === 0.5 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              0.5x
            </button>
            <button
              onClick={() => setPlaybackSpeed(1.0)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                playbackSpeed === 1.0 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              1.0x
            </button>
            <button
              onClick={() => setPlaybackSpeed(2.0)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                playbackSpeed === 2.0 ? 'bg-sky-700 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              2.0x
            </button>
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
