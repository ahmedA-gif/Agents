import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import {
  Brain,
  Camera,
  CheckCircle2,
  Clapperboard,
  Clock,
  CloudRain,
  Compass,
  Eye,
  FastForward,
  Flag,
  Gauge,
  Layers,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Truck,
  Video,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Route, Scenario } from '../types';

interface CityScene3DProps {
  scenario: Scenario | null;
  selectedRouteId: string | null;
  agentId: string;
  agentColor: string;
  agentName: string;
  currentStepIndex: number;
  totalSteps: number;
  onStepChange?: (index: number) => void;
  etaMin?: number | null;
  deadlineMin?: number;
  onTime?: boolean | null;
  autoPlayTrigger?: number;
}

// Scratch reusable vectors for zero-allocation 60 FPS animation loop
const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _futurePoint = new THREE.Vector3();
const _futureTangent = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _exhaustPos1 = new THREE.Vector3();
const _exhaustPos2 = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

export const CityScene3D: React.FC<CityScene3DProps> = ({
  scenario,
  selectedRouteId,
  agentId,
  agentColor,
  agentName,
  currentStepIndex,
  totalSteps,
  onStepChange,
  etaMin,
  deadlineMin,
  onTime,
  autoPlayTrigger = 0,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Core Three.js persistent references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const vehicleGroupRef = useRef<THREE.Group | null>(null);
  const chassisMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const emblemMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const underglowLightRef = useRef<THREE.PointLight | null>(null);
  const wheelsRef = useRef<THREE.Mesh[]>([]);
  const rainSystemRef = useRef<THREE.Points | null>(null);
  const groundMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Route & Visual structures
  const routeCurvesRef = useRef<Map<string, THREE.CatmullRomCurve3>>(new Map());
  const routeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const energyPulseBeadsRef = useRef<THREE.Mesh[]>([]);
  const destinationBeaconRef = useRef<THREE.Group | null>(null);
  const agentLogicGroupRef = useRef<THREE.Group | null>(null);
  const arrivalBurstRef = useRef<THREE.Mesh | null>(null);
  const arrivalBeamRef = useRef<THREE.Mesh | null>(null);

  // Particles
  const trailPointsRef = useRef<THREE.Points | null>(null);
  const trailPositionsRef = useRef<Float32Array | null>(null);
  const trailMatRef = useRef<THREE.PointsMaterial | null>(null);

  // State
  const [animProgress, setAnimProgress] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<'fast' | 'normal' | 'instant'>('fast');
  const [cameraView, setCameraView] = useState<'cinematic' | 'follow' | 'heli' | 'iso'>('cinematic');
  const [telemetrySpeed, setTelemetrySpeed] = useState(0);
  const [telemetryGForce, setTelemetryGForce] = useState(0);

  // Mirror refs for zero-lag render loop (read in RAF without re-mounting)
  const isSimulatingRef = useRef(false);
  const simSpeedRef = useRef(simSpeed);
  const cameraViewRef = useRef(cameraView);
  const selectedRouteIdRef = useRef(selectedRouteId);
  const agentIdRef = useRef(agentId);
  const agentColorRef = useRef(agentColor);
  const animProgressRef = useRef(1);

  // Spherical camera orbit coords
  const sphericalRef = useRef({ radius: 52, theta: 0.1, phi: Math.PI / 3.2 });
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });

  // Sync refs when props or states change
  useEffect(() => {
    isSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
    updateRouteHighlights();
  }, [selectedRouteId, agentColor]);

  useEffect(() => {
    agentIdRef.current = agentId;
    agentColorRef.current = agentColor;
    updateAgentLogicStructures();
    updateVehicleAppearance();
  }, [agentId, agentColor]);

  // Trigger automatic animated ride on decision update
  useEffect(() => {
    if (selectedRouteId) {
      startRideAnimation();
    }
  }, [autoPlayTrigger, selectedRouteId, scenario?.id, agentId]);

  const startRideAnimation = () => {
    if (simSpeedRef.current === 'instant') {
      animProgressRef.current = 1;
      setAnimProgress(1);
      setIsSimulating(false);
      isSimulatingRef.current = false;
      return;
    }
    animProgressRef.current = 0;
    setAnimProgress(0);
    setIsSimulating(true);
    isSimulatingRef.current = true;
  };

  // -------------------------------------------------------------
  // UPDATE VISUALS IN-PLACE WITHOUT REBUILDING SCENE (NO LAG)
  // -------------------------------------------------------------
  const updateRouteHighlights = () => {
    const curSelected = selectedRouteIdRef.current;
    const curColor = agentColorRef.current || '#4ade80';

    routeMeshesRef.current.forEach((mesh, rId) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isChosen = rId === curSelected;
      if (isChosen) {
        mat.color.setStyle(curColor);
        mat.emissive.setStyle(curColor);
        mat.emissiveIntensity = 0.95;
        mesh.scale.set(1.15, 1.15, 1.15);
      } else {
        mat.emissiveIntensity = 0.15;
        mesh.scale.set(1.0, 1.0, 1.0);
      }
    });
  };

  const updateVehicleAppearance = () => {
    const colorHex = agentColorRef.current || '#4ade80';
    if (chassisMatRef.current) {
      chassisMatRef.current.color.setStyle(colorHex);
    }
    if (emblemMatRef.current) {
      emblemMatRef.current.color.setStyle(colorHex);
    }
    if (underglowLightRef.current) {
      underglowLightRef.current.color.setStyle(colorHex);
    }
    if (trailMatRef.current) {
      trailMatRef.current.color.setStyle(colorHex);
    }
  };

  const updateAgentLogicStructures = () => {
    const group = agentLogicGroupRef.current;
    if (!group) return;

    // Clear old structures cleanly
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    }

    const curAgent = agentIdRef.current;
    const curRoute = selectedRouteIdRef.current;
    const curves = routeCurvesRef.current;
    const currentScenario = scenario;

    if (curAgent === 'goal_based') {
      // 3D Laser Barrier Gates: Green laser if route <= deadline; Red pulsed laser if > deadline
      const deadline = currentScenario?.deadline_min ?? 40;
      currentScenario?.routes?.forEach((route) => {
        const curve = curves.get(route.id);
        if (!curve) return;
        const gatePos = curve.getPoint(0.38);
        const isLate = route.travel_time_min > deadline;
        const gateColor = isLate ? 0xef4444 : 0x22c55e;

        const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 4.5, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
        const post1 = new THREE.Mesh(postGeo, postMat);
        post1.position.set(gatePos.x - 1.6, gatePos.y + 2.2, gatePos.z);
        const post2 = new THREE.Mesh(postGeo, postMat);
        post2.position.set(gatePos.x + 1.6, gatePos.y + 2.2, gatePos.z);

        const beamGeo = new THREE.BoxGeometry(3.4, 0.25, 0.25);
        const beamMat = new THREE.MeshBasicMaterial({ color: gateColor });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(gatePos.x, gatePos.y + 3.6, gatePos.z);

        group.add(post1);
        group.add(post2);
        group.add(beam);
      });
    } else if (curAgent === 'utility_based') {
      // 3D Mathematical Utility Trade-off Billboards
      currentScenario?.routes?.forEach((route) => {
        const curve = curves.get(route.id);
        if (!curve) return;
        const pos = curve.getPoint(0.65);
        const boardGeo = new THREE.BoxGeometry(4.0, 1.8, 0.2);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.set(pos.x, pos.y + 3.0, pos.z);

        const stemGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(pos.x, pos.y + 1.4, pos.z);

        group.add(board);
        group.add(stem);
      });
    } else if (curAgent === 'hierarchical') {
      // 6 Sequential Operational Checkpoint Gates
      const activeCurve = (curRoute && curves.get(curRoute)) || curves.get('A') || curves.values().next().value;
      if (activeCurve) {
        for (let s = 1; s <= 6; s++) {
          const t = s / 7;
          const pos = activeCurve.getPoint(t);
          const archGeo = new THREE.TorusGeometry(1.6, 0.12, 8, 24, Math.PI);
          const archMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
          const arch = new THREE.Mesh(archGeo, archMat);
          arch.position.set(pos.x, pos.y + 0.5, pos.z);
          arch.rotation.y = Math.PI / 4;
          group.add(arch);
        }
      }
    } else if (curAgent === 'contextual') {
      // Contextual Rain & Friction Energy Fields
      const activeCurve = (curRoute && curves.get(curRoute)) || curves.get('A') || curves.values().next().value;
      if (activeCurve) {
        [0.25, 0.5, 0.75].forEach((t) => {
          const pos = activeCurve.getPoint(t);
          const ringGeo = new THREE.TorusGeometry(1.8, 0.14, 8, 32);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(pos.x, pos.y + 1.2, pos.z);
          group.add(ring);
        });
      }
    } else if (curAgent === 'learning') {
      // Historical Ghost Trails of Past Deliveries
      currentScenario?.routes?.forEach((route) => {
        const curve = curves.get(route.id);
        if (!curve) return;
        const ghostGeo = new THREE.TubeGeometry(curve, 48, 0.3, 6, false);
        const ghostMat = new THREE.MeshBasicMaterial({
          color: 0xf472b6,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        group.add(ghost);
      });
    }
  };

  // -------------------------------------------------------------
  // INITIALIZE 3D CANVAS & ASSETS ONCE (ZERO LAG REBUILDS)
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 480;

    const isRain = scenario?.weather === 'rain';

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isRain ? 0x091419 : 0x0a1612);
    scene.fog = new THREE.FogExp2(isRain ? 0x091419 : 0x0a1612, 0.012);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 34, 46);
    camera.lookAt(0, 0, 0);

    // 3. Renderer (High performance, antialiased, PCF soft shadows)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Vibrant Lighting
    const ambientLight = new THREE.AmbientLight(isRain ? 0x829eb5 : 0x93b7a2, isRain ? 1.8 : 2.3);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(isRain ? 0xa5cded : 0xfffaed, isRain ? 2.3 : 3.2);
    sunLight.position.set(32, 58, 28);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 140;
    sunLight.shadow.camera.left = -45;
    sunLight.shadow.camera.right = 45;
    sunLight.shadow.camera.top = 45;
    sunLight.shadow.camera.bottom = -45;
    scene.add(sunLight);

    const cyanFill = new THREE.DirectionalLight(0x38bdf8, 1.2);
    cyanFill.position.set(-30, 25, -28);
    scene.add(cyanFill);

    // 5. City Ground Plane with Sidewalk Curbs
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isRain ? 0x0c1716 : 0x11231c,
      roughness: isRain ? 0.22 : 0.72,
      metalness: isRain ? 0.4 : 0.12,
    });
    groundMatRef.current = groundMat;
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(110, 55, 0x1d4732, 0x143123);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 6. Modern Colorful Architectural Buildings
    const buildingsGroup = new THREE.Group();
    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.3, metalness: 0.6 }), // Blue Glass Tower
      new THREE.MeshStandardMaterial({ color: 0x2e4053, roughness: 0.5, metalness: 0.3 }), // Modern Slate
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.2 }), // Ivory Concrete
      new THREE.MeshStandardMaterial({ color: 0x1e4334, roughness: 0.4, metalness: 0.5 }), // Emerald Tech Hub
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 }), // High-rise Lofts
      new THREE.MeshStandardMaterial({ color: 0x2c2638, roughness: 0.4, metalness: 0.4 }), // Obsidian Plaza
    ];

    const cyanWinMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 });
    const warmWinMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.8 });
    const greenWinMat = new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.85 });

    const buildingCoords: [number, number, number, number, number][] = [
      [-30, -20, 7, 18, 0],
      [-22, -26, 8, 24, 1],
      [-14, -25, 6, 16, 2],
      [-34, 6, 8, 20, 3],
      [-28, 18, 7, 14, 4],
      [26, -22, 8, 22, 0],
      [32, -10, 7, 17, 1],
      [24, 16, 7, 19, 2],
      [30, 24, 8, 26, 3],
      [14, -26, 7, 15, 4],
      [-7, -27, 8, 21, 5],
      [-4, 25, 9, 16, 1],
      [12, 26, 7, 18, 0],
      [-22, 28, 6, 13, 2],
      [22, -32, 7, 17, 3],
    ];

    buildingCoords.forEach(([bx, bz, bw, bh, mIdx], bIndex) => {
      const bMat = buildingMaterials[mIdx % buildingMaterials.length];
      const bGeo = new THREE.BoxGeometry(bw, bh, bw);
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.set(bx, bh / 2, bz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      buildingsGroup.add(bMesh);

      // Floor windows
      const floors = Math.floor(bh / 2.8);
      for (let f = 1; f < floors; f++) {
        const wGeo = new THREE.BoxGeometry(bw * 0.82, 0.55, bw + 0.15);
        const winMat = (bIndex + f) % 3 === 0 ? cyanWinMat : (bIndex + f) % 3 === 1 ? warmWinMat : greenWinMat;
        const wMesh = new THREE.Mesh(wGeo, winMat);
        wMesh.position.set(bx, f * 2.8, bz);
        buildingsGroup.add(wMesh);
      }

      if (bh > 18) {
        const antennaGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
        const antennaMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(bx, bh + 2, bz);
        buildingsGroup.add(antenna);

        const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(bx, bh + 4.1, bz);
        buildingsGroup.add(beacon);
      }
    });

    // Decorative sidewalk trees
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24 });
    const foliageGeo = new THREE.ConeGeometry(1.2, 2.5, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });

    [
      [-16, 3], [-14, 5], [-12, 4],
      [14, 3], [16, 5], [12, -4],
      [0, -12], [-4, -13], [4, -13],
      [0, 12], [-4, 13], [4, 13],
    ].forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 0.7, tz);
      trunk.castShadow = true;
      buildingsGroup.add(trunk);

      const fol = new THREE.Mesh(foliageGeo, foliageMat);
      fol.position.set(tx, 2.4, tz);
      fol.castShadow = true;
      buildingsGroup.add(fol);
    });

    scene.add(buildingsGroup);

    // 7. Kitchen Hub Depot Station (Start Platform)
    const depotGroup = new THREE.Group();
    depotGroup.position.set(-20, 0, 0);

    const depotPlatformGeo = new THREE.CylinderGeometry(5, 5.5, 0.9, 32);
    const depotPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x166534,
      roughness: 0.4,
      metalness: 0.4,
    });
    const depotPlatform = new THREE.Mesh(depotPlatformGeo, depotPlatformMat);
    depotPlatform.position.y = 0.45;
    depotPlatform.receiveShadow = true;
    depotGroup.add(depotPlatform);

    const restGeo = new THREE.BoxGeometry(5.2, 4.8, 5.2);
    const restMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.3 });
    const restMesh = new THREE.Mesh(restGeo, restMat);
    restMesh.position.y = 3.2;
    restMesh.castShadow = true;
    depotGroup.add(restMesh);

    const depotRingGeo = new THREE.RingGeometry(4.2, 4.9, 32);
    const depotRingMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
    const depotRing = new THREE.Mesh(depotRingGeo, depotRingMat);
    depotRing.rotation.x = Math.PI / 2;
    depotRing.position.y = 0.92;
    depotGroup.add(depotRing);

    scene.add(depotGroup);

    // 8. Customer Destination Hub (Target Platform)
    const destGroup = new THREE.Group();
    destGroup.position.set(20, 0, 0);
    destinationBeaconRef.current = destGroup;

    const destPlatformGeo = new THREE.CylinderGeometry(5, 5.5, 0.9, 32);
    const destPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.4,
      metalness: 0.4,
    });
    const destPlatform = new THREE.Mesh(destPlatformGeo, destPlatformMat);
    destPlatform.position.y = 0.45;
    destPlatform.receiveShadow = true;
    destGroup.add(destPlatform);

    const houseGeo = new THREE.ConeGeometry(3.6, 5, 4);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });
    const houseMesh = new THREE.Mesh(houseGeo, houseMat);
    houseMesh.position.y = 3.6;
    houseMesh.rotation.y = Math.PI / 4;
    destGroup.add(houseMesh);

    const pinGeo = new THREE.SphereGeometry(1.1, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.y = 7.6;
    destGroup.add(pinMesh);

    const pinStemGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    const pinStem = new THREE.Mesh(pinStemGeo, pinMat);
    pinStem.position.y = 5.9;
    destGroup.add(pinStem);

    // Blockbuster Arrival Shockwave Ring
    const burstGeo = new THREE.RingGeometry(0.5, 1.2, 32);
    const burstMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const burstMesh = new THREE.Mesh(burstGeo, burstMat);
    burstMesh.rotation.x = -Math.PI / 2;
    burstMesh.position.y = 0.95;
    destGroup.add(burstMesh);
    arrivalBurstRef.current = burstMesh;

    // Vertical Sky Arrival Beam
    const beamGeo = new THREE.CylinderGeometry(0.4, 0.4, 30, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const skyBeam = new THREE.Mesh(beamGeo, beamMat);
    skyBeam.position.set(0, 15, 0);
    destGroup.add(skyBeam);
    arrivalBeamRef.current = skyBeam;

    scene.add(destGroup);

    // 9. Candidate Highway Curves
    const curves = new Map<string, THREE.CatmullRomCurve3>();
    const routeMeshes = new Map<string, THREE.Mesh>();
    const routesGroup = new THREE.Group();

    const curveA = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.45, 0),
      new THREE.Vector3(-10, 0.45, -6),
      new THREE.Vector3(0, 0.45, -8.5),
      new THREE.Vector3(10, 0.45, -5.5),
      new THREE.Vector3(19, 0.45, 0),
    ]);

    const curveB = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.45, 0),
      new THREE.Vector3(-10, 3.2, 7.5),
      new THREE.Vector3(0, 4.0, 10.0),
      new THREE.Vector3(10, 3.2, 7.0),
      new THREE.Vector3(19, 0.45, 0),
    ]);

    const curveC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.45, 0),
      new THREE.Vector3(-12, 0.45, -15),
      new THREE.Vector3(0, 0.45, -18),
      new THREE.Vector3(12, 0.45, -14),
      new THREE.Vector3(19, 0.45, 0),
    ]);

    const curveD = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.45, 0),
      new THREE.Vector3(-8, 0.45, 16),
      new THREE.Vector3(0, 0.45, 19),
      new THREE.Vector3(10, 0.45, 15),
      new THREE.Vector3(19, 0.45, 0),
    ]);

    const curveLibrary: Record<string, THREE.CatmullRomCurve3> = { A: curveA, B: curveB, C: curveC, D: curveD };

    const routesList = scenario?.routes || [
      { id: 'A', name: 'Route A', distance_km: 3, travel_time_min: 15, traffic_level: 'light', cost: 100, available: true },
      { id: 'B', name: 'Route B', distance_km: 5, travel_time_min: 20, traffic_level: 'light', cost: 130, available: true },
    ];

    routesList.forEach((route, idx) => {
      const curve = curveLibrary[route.id] || (idx === 0 ? curveA : curveB);
      curves.set(route.id, curve);

      let roadBaseColor = 0x22c55e;
      if (route.traffic_level === 'moderate') roadBaseColor = 0xf59e0b;
      if (route.traffic_level === 'heavy') roadBaseColor = 0xef4444;
      if (route.available === false) roadBaseColor = 0x64748b;

      const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.72, 12, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: roadBaseColor,
        emissive: roadBaseColor,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.5,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      routesGroup.add(tubeMesh);
      routeMeshes.set(route.id, tubeMesh);

      // Elevated pillars for Route B
      if (route.id === 'B') {
        const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 3.6, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        [-8, 0, 8].forEach((px) => {
          const p = new THREE.Mesh(pillarGeo, pillarMat);
          p.position.set(px, 1.8, 8.8);
          p.castShadow = true;
          routesGroup.add(p);
        });
      }
    });

    scene.add(routesGroup);
    routeCurvesRef.current = curves;
    routeMeshesRef.current = routeMeshes;

    // 10. Agent Logic 3D Container
    const agentLogicGroup = new THREE.Group();
    scene.add(agentLogicGroup);
    agentLogicGroupRef.current = agentLogicGroup;

    // 11. Delivery Courier Vehicle with Blockbuster Headlights & Underglow
    const vehicleGroup = new THREE.Group();
    vehicleGroupRef.current = vehicleGroup;

    const curColor = agentColorRef.current || '#4ade80';

    // Vehicle Chassis
    const chassisGeo = new THREE.BoxGeometry(2.3, 0.85, 1.25);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(curColor),
      roughness: 0.2,
      metalness: 0.7,
    });
    chassisMatRef.current = chassisMat;
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.75;
    chassis.castShadow = true;
    vehicleGroup.add(chassis);

    // Insulated Food Delivery Box
    const boxGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(-0.6, 1.4, 0);
    boxMesh.castShadow = true;
    vehicleGroup.add(boxMesh);

    // Glowing Agent Emblem Strip
    const emblemGeo = new THREE.BoxGeometry(1.12, 0.45, 1.12);
    const emblemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(curColor) });
    emblemMatRef.current = emblemMat;
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.set(-0.6, 1.4, 0);
    vehicleGroup.add(emblem);

    // Cockpit
    const cabGeo = new THREE.BoxGeometry(0.9, 0.75, 0.95);
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const cabin = new THREE.Mesh(cabGeo, cabMat);
    cabin.position.set(0.42, 1.25, 0);
    vehicleGroup.add(cabin);

    // Volumetric Headlight Cones (Blockbuster night drive effect)
    const coneGeo = new THREE.ConeGeometry(0.9, 6.0, 16);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    const leftCone = new THREE.Mesh(coneGeo, coneMat);
    leftCone.rotation.z = -Math.PI / 2;
    leftCone.position.set(3.9, 0.7, 0.38);
    vehicleGroup.add(leftCone);

    const rightCone = new THREE.Mesh(coneGeo, coneMat);
    rightCone.rotation.z = -Math.PI / 2;
    rightCone.position.set(3.9, 0.7, -0.38);
    vehicleGroup.add(rightCone);

    // Vehicle Headlight Spotlight
    const spotLight = new THREE.SpotLight(0xfffaed, 6.5, 24, Math.PI / 4.5, 0.35);
    spotLight.position.set(1.3, 0.75, 0);
    spotLight.target.position.set(8, 0.2, 0);
    vehicleGroup.add(spotLight);
    vehicleGroup.add(spotLight.target);

    // Vibrant Neon Underglow light
    const underglow = new THREE.PointLight(new THREE.Color(curColor), 4.0, 6.5);
    underglow.position.set(0, 0.2, 0);
    vehicleGroup.add(underglow);
    underglowLightRef.current = underglow;

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const wheels: THREE.Mesh[] = [];

    [
      [0.72, 0.38, 0.62],
      [0.72, 0.38, -0.62],
      [-0.72, 0.38, 0.62],
      [-0.72, 0.38, -0.62],
    ].forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.rotation.x = Math.PI / 2;
      wMesh.position.set(wx, wy, wz);
      wMesh.castShadow = true;
      vehicleGroup.add(wMesh);
      wheels.push(wMesh);
    });
    wheelsRef.current = wheels;

    const initialCurve = curves.get(selectedRouteIdRef.current || 'A') || curveA;
    vehicleGroup.position.copy(initialCurve.getPoint(0.01));
    scene.add(vehicleGroup);

    // 12. Dual Exhaust Plasma Particle System
    const trailCount = 60;
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(trailCount * 3);
    for (let i = 0; i < trailCount * 3; i++) {
      trailPositions[i] = -19;
    }
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.PointsMaterial({
      color: new THREE.Color(curColor),
      size: 0.42,
      transparent: true,
      opacity: 0.85,
    });
    trailMatRef.current = trailMat;
    const trailPoints = new THREE.Points(trailGeo, trailMat);
    scene.add(trailPoints);
    trailPointsRef.current = trailPoints;
    trailPositionsRef.current = trailPositions;

    // 13. Weather Rain Particles
    if (isRain) {
      const rainCount = 1500;
      const rainGeo = new THREE.BufferGeometry();
      const rainPos = new Float32Array(rainCount * 3);
      for (let i = 0; i < rainCount * 3; i += 3) {
        rainPos[i] = (Math.random() - 0.5) * 90;
        rainPos[i + 1] = Math.random() * 50;
        rainPos[i + 2] = (Math.random() - 0.5) * 90;
      }
      rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
      const rainMat = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.28,
        transparent: true,
        opacity: 0.75,
      });
      const rainSystem = new THREE.Points(rainGeo, rainMat);
      scene.add(rainSystem);
      rainSystemRef.current = rainSystem;
    }

    // Populate Agent Logic Structures initially
    updateAgentLogicStructures();
    updateRouteHighlights();

    // -----------------------------------------------------------
    // 14. 60 FPS ZERO-ALLOCATION CONTINUOUS RENDER LOOP
    // -----------------------------------------------------------
    let animationId: number;
    let clock = new THREE.Clock();
    let trailIndex = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.05); // Clamp to avoid physics explosion
      const time = clock.getElapsedTime();

      // Vehicle Progression along curve
      if (isSimulatingRef.current) {
        const speedMultiplier = simSpeedRef.current === 'fast' ? 0.62 : 0.32;
        animProgressRef.current = Math.min(1.0, animProgressRef.current + delta * speedMultiplier);
        setAnimProgress(animProgressRef.current);

        // Telemetry Speed calculation
        const currentSpeedKmh = Math.round(
          Math.sin(animProgressRef.current * Math.PI) * (simSpeedRef.current === 'fast' ? 58 : 38)
        );
        setTelemetrySpeed(currentSpeedKmh);

        // Ride arrival trigger
        if (animProgressRef.current >= 1.0) {
          isSimulatingRef.current = false;
          setIsSimulating(false);
          setTelemetrySpeed(0);

          // Trigger Blockbuster Shockwave & Confetti
          if (arrivalBurstRef.current) {
            arrivalBurstRef.current.scale.set(1, 1, 1);
            (arrivalBurstRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0;
          }
          if (arrivalBeamRef.current) {
            (arrivalBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.9;
          }
          confetti({
            particleCount: 45,
            spread: 70,
            origin: { y: 0.65 },
            colors: [curColor, '#38bdf8', '#fbbf24'],
          });
        }
      }

      // Update Vehicle Position, Banking, and Direction
      const curvesMap = routeCurvesRef.current;
      const vehicle = vehicleGroupRef.current;
      const activeRouteId = selectedRouteIdRef.current;

      if (vehicle && curvesMap.size > 0) {
        const activeCurve = activeRouteId
          ? curvesMap.get(activeRouteId) || curvesMap.values().next().value
          : curvesMap.values().next().value;

        if (activeCurve) {
          const t = Math.max(0.001, Math.min(0.999, animProgressRef.current));
          activeCurve.getPoint(t, _point);
          activeCurve.getTangent(t, _tangent);

          vehicle.position.copy(_point);

          // Head towards tangent
          _lookTarget.copy(_point).add(_tangent);
          vehicle.lookAt(_lookTarget);

          // Dynamic Cornering Banking (Chassis banks into curves)
          const futureT = Math.min(0.999, t + 0.025);
          activeCurve.getTangent(futureT, _futureTangent);
          const curveTurn = _tangent.x * _futureTangent.z - _tangent.z * _futureTangent.x;
          vehicle.rotation.z = -curveTurn * 4.2;
          vehicle.rotation.x = isSimulatingRef.current ? -0.04 : 0; // Pitch squat

          setTelemetryGForce(Math.abs(Math.round(curveTurn * 15 * 10) / 10));

          // Twin Exhaust Particles
          if (trailPositionsRef.current && trailPointsRef.current) {
            const arr = trailPositionsRef.current;
            _exhaustPos1.copy(_point).sub(_tempVec.copy(_tangent).multiplyScalar(1.2));

            arr[trailIndex * 3] = _exhaustPos1.x + (Math.random() - 0.5) * 0.25;
            arr[trailIndex * 3 + 1] = _exhaustPos1.y + 0.35 + (Math.random() - 0.5) * 0.2;
            arr[trailIndex * 3 + 2] = _exhaustPos1.z + (Math.random() - 0.5) * 0.25;

            trailIndex = (trailIndex + 1) % trailCount;
            trailPointsRef.current.geometry.attributes.position.needsUpdate = true;
          }

          // Spin wheels during motion
          if (isSimulatingRef.current) {
            wheelsRef.current.forEach((w) => {
              w.rotation.y += delta * 26;
            });
          }

          // -------------------------------------------------------
          // BLOCKBUSTER CINEMATOGRAPHY MODES
          // -------------------------------------------------------
          if (cameraRef.current) {
            const mode = cameraViewRef.current;

            if (mode === 'cinematic') {
              // 3-Stage Blockbuster Director Camera:
              // Phase 1 (0 to 0.25): Low heroic front 3/4 tracking shot
              // Phase 2 (0.25 to 0.85): Sweeping dynamic orbit with cinematic tilt
              // Phase 3 (0.85 to 1.0): Dramatic slow-motion dolly zoom facing destination
              if (t < 0.25) {
                _camPos.copy(_point).add(_tempVec.set(8, 3.8, 8));
                _camTarget.copy(_point).add(_tempVec.set(0, 1.2, 0));
              } else if (t < 0.85) {
                const orbitAngle = time * 0.45;
                const dist = 14 + Math.sin(time) * 2;
                _camPos
                  .copy(_point)
                  .add(_tempVec.set(Math.cos(orbitAngle) * dist, 7.5 + Math.sin(time * 0.8) * 1.5, Math.sin(orbitAngle) * dist));
                _camTarget.copy(_point).add(_tempVec.set(0, 1.4, 0));
              } else {
                // Final Arrival Frame
                _camPos.set(28, 12, 14);
                _camTarget.set(20, 3, 0);
              }
              cameraRef.current.position.lerp(_camPos, 0.065);
              cameraRef.current.lookAt(_camTarget);
            } else if (mode === 'follow') {
              // High-octane Need for Speed chase camera behind vehicle
              _camPos.copy(_point).sub(_tempVec.copy(_tangent).multiplyScalar(10.5)).add(_tempVec.set(0, 4.8, 0));
              _camTarget.copy(_point).add(_tempVec.set(0, 1.2, 0));
              cameraRef.current.position.lerp(_camPos, 0.09);
              cameraRef.current.lookAt(_camTarget);
            } else if (mode === 'heli') {
              // Helicopter News Tracker from overhead
              _camPos.copy(_point).add(_tempVec.set(-6, 26, 12));
              _camTarget.copy(_point);
              cameraRef.current.position.lerp(_camPos, 0.05);
              cameraRef.current.lookAt(_camTarget);
            } else if (mode === 'iso') {
              // Mouse controlled orbit
              const sph = sphericalRef.current;
              cameraRef.current.position.x = sph.radius * Math.sin(sph.phi) * Math.sin(sph.theta);
              cameraRef.current.position.y = sph.radius * Math.cos(sph.phi);
              cameraRef.current.position.z = sph.radius * Math.sin(sph.phi) * Math.cos(sph.theta);
              cameraRef.current.lookAt(0, 0, 0);
            }
          }
        }
      }

      // Fade Arrival Shockwave
      if (arrivalBurstRef.current) {
        const mat = arrivalBurstRef.current.material as THREE.MeshBasicMaterial;
        if (mat.opacity > 0) {
          mat.opacity = Math.max(0, mat.opacity - delta * 1.6);
          arrivalBurstRef.current.scale.addScalar(delta * 12);
        }
      }

      // Fade Sky Beam
      if (arrivalBeamRef.current) {
        const bMat = arrivalBeamRef.current.material as THREE.MeshBasicMaterial;
        if (bMat.opacity > 0) {
          bMat.opacity = Math.max(0, bMat.opacity - delta * 0.9);
        }
      }

      // Rain Particles animation
      if (rainSystemRef.current) {
        const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 42 * delta;
          if (positions[i] < 0) positions[i] = 50;
        }
        rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    // -----------------------------------------------------------
    // 15. SMOOTH MOUSE ORBIT CONTROLS FOR 'ISO' VIEW
    // -----------------------------------------------------------
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || cameraViewRef.current !== 'iso') return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      const sph = sphericalRef.current;
      sph.theta -= dx * 0.007;
      sph.phi = Math.max(0.2, Math.min(Math.PI / 2.2, sph.phi - dy * 0.007));
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraViewRef.current !== 'iso') return;
      sphericalRef.current.radius = Math.max(20, Math.min(95, sphericalRef.current.radius + e.deltaY * 0.05));
      e.preventDefault();
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const rw = entry.contentRect.width;
        const rh = entry.contentRect.height;
        if (rw > 0 && rh > 0) {
          camera.aspect = rw / rh;
          camera.updateProjectionMatrix();
          renderer.setSize(rw, rh);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [scenario?.id]);

  return (
    <div className="city-3d-wrapper">
      <div ref={mountRef} className="city-3d-canvas" />

      {/* Blockbuster Cinematic Director Overlay Stamp */}
      <div className="cine-director-tag">
        <span className="rec-dot" />
        <span className="rec-text">LIVE 4K · 60FPS</span>
        <span className="cine-divider">|</span>
        <span className="cine-agent" style={{ color: agentColor || '#4ade80' }}>
          {agentName.toUpperCase()}
        </span>
      </div>

      {/* Top HUD Overlay */}
      <div className="city-3d-hud">
        <div className="hud-badge agent-hud" style={{ borderColor: agentColor }}>
          <span className="hud-dot" style={{ background: agentColor }} />
          <b>{agentName}</b>
          <span className="hud-mode">{selectedRouteId ? `Route ${selectedRouteId}` : 'Awaiting Route'}</span>
        </div>

        <div className="hud-badge weather-hud">
          {scenario?.weather === 'rain' ? (
            <>
              <CloudRain size={16} className="weather-icon rain" />
              <span>Rain Storm (+20% delay)</span>
            </>
          ) : (
            <>
              <Sun size={16} className="weather-icon sun" />
              <span>Clear Sky (Optimal)</span>
            </>
          )}
        </div>

        {selectedRouteId && (
          <div className="hud-badge timer-hud">
            <Clock size={14} />
            <span>
              ETA: <b>{etaMin ?? '—'}m</b>
            </span>
            <span className="hud-divider">/</span>
            <span>
              Target: <b>{deadlineMin ?? '—'}m</b>
            </span>
            {onTime !== undefined && onTime !== null && (
              <span className={`hud-status ${onTime ? 'good' : 'bad'}`}>
                {onTime ? '✓ ON TIME' : '⚠ LATE RISK'}
              </span>
            )}
          </div>
        )}

        {/* Dynamic Telemetry Display (Speed & G-Force) */}
        {isSimulating && (
          <div className="hud-badge telemetry-hud">
            <Gauge size={14} className="telemetry-icon" />
            <span>{telemetrySpeed} km/h</span>
            <span className="hud-divider">·</span>
            <span>{telemetryGForce}G</span>
          </div>
        )}

        {/* Multi-Angle Cinematic Camera Controller */}
        <div className="camera-switch-row">
          <button
            className={`cam-btn ${cameraView === 'cinematic' ? 'active' : ''}`}
            onClick={() => setCameraView('cinematic')}
            title="Blockbuster Dynamic Director Cam"
          >
            <Clapperboard size={14} />
            <span>Director</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'follow' ? 'active' : ''}`}
            onClick={() => setCameraView('follow')}
            title="Pursuit Chase Cam"
          >
            <Truck size={14} />
            <span>Pursuit</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'heli' ? 'active' : ''}`}
            onClick={() => setCameraView('heli')}
            title="Helicopter Sky Cam"
          >
            <Eye size={14} />
            <span>Sky Cam</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'iso' ? 'active' : ''}`}
            onClick={() => setCameraView('iso')}
            title="3D Free Orbit"
          >
            <Compass size={14} />
            <span>Orbit</span>
          </button>
        </div>
      </div>

      {/* Bottom Live Progress & Fast Controls */}
      <div className="city-3d-footer">
        <div className="dispatch-progress-group">
          <span className="hub-marker depot">Kitchen Hub</span>
          <div className="dispatch-track">
            <div
              className="dispatch-fill"
              style={{
                width: `${Math.round(animProgress * 100)}%`,
                background: `linear-gradient(90deg, ${agentColor || '#4ade80'}, #38bdf8)`,
              }}
            />
            <div
              className="dispatch-runner"
              style={{
                left: `${Math.round(animProgress * 100)}%`,
                borderColor: agentColor || '#4ade80',
              }}
            >
              <Truck size={13} />
            </div>
          </div>
          <span className="hub-marker customer">Customer Door</span>
        </div>

        {/* Speed & Replay Controls */}
        <div className="speed-action-controls">
          <button className="hud-play-btn replay" onClick={startRideAnimation} title="Replay 3D delivery ride">
            <RotateCcw size={14} />
            <span>{isSimulating ? 'Restart' : 'Replay Ride'}</span>
          </button>

          <div className="sim-speed-selector">
            <button
              className={`speed-btn ${simSpeed === 'fast' ? 'active' : ''}`}
              onClick={() => setSimSpeed('fast')}
              title="Fast simulation ride"
            >
              <FastForward size={13} />
              <span>Fast</span>
            </button>
            <button
              className={`speed-btn ${simSpeed === 'normal' ? 'active' : ''}`}
              onClick={() => setSimSpeed('normal')}
              title="Standard simulation ride"
            >
              <Play size={13} />
              <span>Normal</span>
            </button>
            <button
              className={`speed-btn ${simSpeed === 'instant' ? 'active' : ''}`}
              onClick={() => {
                setSimSpeed('instant');
                animProgressRef.current = 1;
                setAnimProgress(1);
                setIsSimulating(false);
                isSimulatingRef.current = false;
              }}
              title="Instant finish"
            >
              <Zap size={13} />
              <span>Instant</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
