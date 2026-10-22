import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Brain,
  Camera,
  CheckCircle2,
  Clock,
  CloudRain,
  Compass,
  Eye,
  FastForward,
  Flag,
  Layers,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Truck,
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
  autoPlayTrigger?: number; // increments when a new run starts to auto-trigger animation
}

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
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const vehicleGroupRef = useRef<THREE.Group | null>(null);
  const wheelsRef = useRef<THREE.Mesh[]>([]);
  const rainSystemRef = useRef<THREE.Points | null>(null);
  const routeCurvesRef = useRef<Map<string, THREE.CatmullRomCurve3>>(new Map());
  const pulseBeamsRef = useRef<THREE.Mesh[]>([]);
  const destinationBeaconRef = useRef<THREE.Group | null>(null);
  const agentLogicGroupRef = useRef<THREE.Group | null>(null);

  // Animation controller state
  const [animProgress, setAnimProgress] = useState(1); // 0 to 1
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<'fast' | 'normal' | 'instant'>('fast');
  const [cameraView, setCameraView] = useState<'iso' | 'follow' | 'top'>('iso');
  const animProgressRef = useRef(1);

  const isRain = scenario?.weather === 'rain';

  // Trigger automatic animated ride whenever autoPlayTrigger changes or new decision arrives
  useEffect(() => {
    if (selectedRouteId) {
      startRideAnimation();
    }
  }, [autoPlayTrigger, selectedRouteId, scenario?.id, agentId]);

  const startRideAnimation = () => {
    if (simSpeed === 'instant') {
      animProgressRef.current = 1;
      setAnimProgress(1);
      setIsSimulating(false);
      return;
    }
    animProgressRef.current = 0;
    setAnimProgress(0);
    setIsSimulating(true);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 440;

    // 1. Scene setup with rich, modern atmospheric lighting (NOT pitch black)
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isRain ? 0x0c1b20 : 0x0e1f18);
    scene.fog = new THREE.FogExp2(isRain ? 0x0c1b20 : 0x0e1f18, 0.012);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 36, 46);
    camera.lookAt(0, 0, 0);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Vibrant Lighting
    const ambientLight = new THREE.AmbientLight(isRain ? 0x6b889d : 0x82a690, isRain ? 1.6 : 2.0);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(isRain ? 0xa8c8e6 : 0xfff3db, isRain ? 2.0 : 3.0);
    sunLight.position.set(25, 50, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.camera.left = -40;
    sunLight.shadow.camera.right = 40;
    sunLight.shadow.camera.top = 40;
    sunLight.shadow.camera.bottom = -40;
    scene.add(sunLight);

    // Secondary soft fill light from opposite corner
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
    fillLight.position.set(-25, 20, -25);
    scene.add(fillLight);

    // Agent signature spotlight
    const agentSpot = new THREE.PointLight(agentColor ? new THREE.Color(agentColor) : 0x4ade80, 2.5, 45);
    agentSpot.position.set(-18, 8, -6);
    scene.add(agentSpot);

    // 5. City Ground Plane with Sidewalks & Curbs
    const groundGeo = new THREE.PlaneGeometry(110, 110);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isRain ? 0x0e1b18 : 0x142820,
      roughness: isRain ? 0.3 : 0.8,
      metalness: isRain ? 0.3 : 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Elegant City Grid Pattern
    const gridHelper = new THREE.GridHelper(100, 50, 0x224a35, 0x173124);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 6. Modern Colorful Buildings (Architectural glass, slate, copper & lit windows)
    const buildingsGroup = new THREE.Group();

    // Palette of realistic, high-contrast modern architectural materials
    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.3, metalness: 0.6 }), // Blue Glass Tower
      new THREE.MeshStandardMaterial({ color: 0x2d3e50, roughness: 0.5, metalness: 0.3 }), // Modern Slate
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.2 }), // Ivory Concrete
      new THREE.MeshStandardMaterial({ color: 0x1f3d2f, roughness: 0.4, metalness: 0.5 }), // Emerald Tech Hub
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 }), // High-rise Lofts
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.4, metalness: 0.4 }), // Obsidian Plaza
    ];

    const cyanWindowMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 });
    const warmWindowMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.8 });
    const greenWindowMat = new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.85 });

    const buildingCoords: [number, number, number, number, number][] = [
      // [x, z, width, height, matIndex]
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

      // Add luminous window strips
      const floors = Math.floor(bh / 2.8);
      for (let f = 1; f < floors; f++) {
        const wGeo = new THREE.BoxGeometry(bw * 0.8, 0.55, bw + 0.15);
        const chosenWinMat = (bIndex + f) % 3 === 0 ? cyanWindowMat : (bIndex + f) % 3 === 1 ? warmWindowMat : greenWindowMat;
        const wMesh = new THREE.Mesh(wGeo, chosenWinMat);
        wMesh.position.set(bx, f * 2.8, bz);
        buildingsGroup.add(wMesh);
      }

      // Rooftop structures (antennas & beacons)
      if (bh > 18) {
        const antennaGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
        const antennaMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(bx, bh + 2, bz);
        buildingsGroup.add(antenna);

        // Blinking beacon atop antenna
        const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(bx, bh + 4.1, bz);
        buildingsGroup.add(beacon);
      }
    });

    // Decorative City Trees along sidewalks
    const treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8);
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24 });
    const treeFoliageGeo = new THREE.ConeGeometry(1.2, 2.5, 8);
    const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });

    [
      [-16, 3], [-14, 5], [-12, 4],
      [14, 3], [16, 5], [12, -4],
      [0, -12], [-4, -13], [4, -13],
      [0, 12], [-4, 13], [4, 13],
    ].forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
      trunk.position.set(tx, 0.7, tz);
      trunk.castShadow = true;
      buildingsGroup.add(trunk);

      const foliage = new THREE.Mesh(treeFoliageGeo, treeFoliageMat);
      foliage.position.set(tx, 2.4, tz);
      foliage.castShadow = true;
      buildingsGroup.add(foliage);
    });

    scene.add(buildingsGroup);

    // 7. Kitchen Hub (Depot Station at Origin)
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

    // Restaurant Building Structure
    const restGeo = new THREE.BoxGeometry(5.2, 4.8, 5.2);
    const restMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.3 });
    const restMesh = new THREE.Mesh(restGeo, restMat);
    restMesh.position.y = 3.2;
    restMesh.castShadow = true;
    depotGroup.add(restMesh);

    // Glowing Green Halo Ring around Depot
    const depotRingGeo = new THREE.RingGeometry(4.2, 4.9, 32);
    const depotRingMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
    const depotRing = new THREE.Mesh(depotRingGeo, depotRingMat);
    depotRing.rotation.x = Math.PI / 2;
    depotRing.position.y = 0.92;
    depotGroup.add(depotRing);

    // 3D Illuminated Kitchen Signboard
    const signGeo = new THREE.BoxGeometry(4.2, 1.4, 0.5);
    const signMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 6.4, 2.7);
    depotGroup.add(signMesh);

    scene.add(depotGroup);

    // 8. Customer Destination Hub
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

    // Destination House/Office
    const houseGeo = new THREE.ConeGeometry(3.6, 5, 4);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });
    const houseMesh = new THREE.Mesh(houseGeo, houseMat);
    houseMesh.position.y = 3.6;
    houseMesh.rotation.y = Math.PI / 4;
    destGroup.add(houseMesh);

    // Glowing Target Pin
    const pinGeo = new THREE.SphereGeometry(1.1, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.y = 7.6;
    destGroup.add(pinMesh);

    const pinStemGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    const pinStem = new THREE.Mesh(pinStemGeo, pinMat);
    pinStem.position.y = 5.9;
    destGroup.add(pinStem);

    // Pulsing Destination Rings
    const pulseGeo = new THREE.RingGeometry(3.2, 4.0, 32);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    pulseRing.rotation.x = Math.PI / 2;
    pulseRing.position.y = 0.93;
    destGroup.add(pulseRing);
    pulseBeamsRef.current.push(pulseRing);

    scene.add(destGroup);

    // 9. Candidate Routes (3D Curved Highway Ribbons)
    const routesGroup = new THREE.Group();
    const routeCurves = new Map<string, THREE.CatmullRomCurve3>();

    // Route curves with elevation and realistic bends
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

    const routes = scenario?.routes || [
      { id: 'A', name: 'Route A', distance_km: 3, travel_time_min: 15, traffic_level: 'light', cost: 100, available: true },
      { id: 'B', name: 'Route B', distance_km: 5, travel_time_min: 20, traffic_level: 'light', cost: 130, available: true },
    ];

    routes.forEach((route, idx) => {
      const curve = curveLibrary[route.id] || (idx === 0 ? curveA : curveB);
      routeCurves.set(route.id, curve);

      const isChosen = selectedRouteId === route.id;
      const isAvailable = route.available !== false;

      // Color coding: Light (Emerald), Moderate (Amber), Heavy (Crimson Red)
      let roadColor = 0x22c55e;
      if (route.traffic_level === 'moderate') roadColor = 0xf59e0b;
      if (route.traffic_level === 'heavy') roadColor = 0xef4444;
      if (!isAvailable) roadColor = 0x64748b;

      // 3D Road Ribbon Tube
      const tubeGeo = new THREE.TubeGeometry(curve, 72, isChosen ? 0.95 : 0.6, 12, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: isChosen ? (agentColor ? new THREE.Color(agentColor) : roadColor) : roadColor,
        emissive: isChosen ? (agentColor ? new THREE.Color(agentColor) : roadColor) : roadColor,
        emissiveIntensity: isChosen ? 0.9 : 0.35,
        roughness: 0.25,
        metalness: 0.6,
        transparent: !isAvailable,
        opacity: isAvailable ? 1.0 : 0.4,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      routesGroup.add(tubeMesh);

      // Support pillars for elevated arch route B
      if (route.id === 'B') {
        const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 3.6, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        [-8, 0, 8].forEach(px => {
          const p = new THREE.Mesh(pillarGeo, pillarMat);
          p.position.set(px, 1.8, 8.8);
          p.castShadow = true;
          routesGroup.add(p);
        });
      }

      // 3D Route Identifier Signboard floating over midpoint
      const mid = curve.getPoint(0.5);
      const signGroup = new THREE.Group();
      signGroup.position.set(mid.x, mid.y + 1.6, mid.z);

      const signBgGeo = new THREE.BoxGeometry(3.0, 1.0, 0.3);
      const signBgMat = new THREE.MeshStandardMaterial({
        color: isChosen ? (agentColor ? new THREE.Color(agentColor) : 0x22c55e) : 0x0f172a,
        emissive: isChosen ? (agentColor ? new THREE.Color(agentColor) : 0x22c55e) : 0x000000,
        emissiveIntensity: isChosen ? 0.4 : 0,
      });
      const signBg = new THREE.Mesh(signBgGeo, signBgMat);
      signGroup.add(signBg);

      routesGroup.add(signGroup);
    });

    scene.add(routesGroup);
    routeCurvesRef.current = routeCurves;

    // 10. Dynamic 3D Agent Logic Visualizations (Unique to each agent architecture!)
    const agentLogicGroup = new THREE.Group();
    agentLogicGroupRef.current = agentLogicGroup;

    if (agentId === 'goal_based') {
      // Goal-Based: Visualizes deadline countdown ring & laser barrier gates over routes exceeding deadline!
      routes.forEach(route => {
        const curve = routeCurves.get(route.id);
        if (!curve) return;
        const gatePos = curve.getPoint(0.35);
        const isLate = route.travel_time_min > (scenario?.deadline_min ?? 40);

        const gatePostGeo = new THREE.CylinderGeometry(0.2, 0.2, 3.5, 8);
        const gatePostMat = new THREE.MeshStandardMaterial({ color: isLate ? 0xef4444 : 0x22c55e });
        const post1 = new THREE.Mesh(gatePostGeo, gatePostMat);
        post1.position.set(gatePos.x - 1.2, gatePos.y + 1.7, gatePos.z);
        const post2 = new THREE.Mesh(gatePostGeo, gatePostMat);
        post2.position.set(gatePos.x + 1.2, gatePos.y + 1.7, gatePos.z);

        const beamGeo = new THREE.BoxGeometry(2.6, 0.3, 0.3);
        const beamMat = new THREE.MeshBasicMaterial({ color: isLate ? 0xef4444 : 0x22c55e });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(gatePos.x, gatePos.y + 2.8, gatePos.z);

        agentLogicGroup.add(post1);
        agentLogicGroup.add(post2);
        agentLogicGroup.add(beam);
      });
    } else if (agentId === 'utility_based') {
      // Utility-Based: Floating balance scales & mathematical trade-off billboards
      routes.forEach((route, idx) => {
        const curve = routeCurves.get(route.id);
        if (!curve) return;
        const scorePos = curve.getPoint(0.65);
        const boardGeo = new THREE.BoxGeometry(3.6, 1.6, 0.25);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.set(scorePos.x, scorePos.y + 2.6, scorePos.z);
        agentLogicGroup.add(board);
      });
    } else if (agentId === 'hierarchical') {
      // Hierarchical: 6 sequential checkpoint stations in 3D
      const activeCurve = selectedRouteId ? routeCurves.get(selectedRouteId) || curveA : curveA;
      for (let s = 1; s <= 6; s++) {
        const t = s / 7;
        const cpPos = activeCurve.getPoint(t);
        const flagGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8);
        const flagMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(cpPos.x, cpPos.y + 1.2, cpPos.z + 1.2);

        const bannerGeo = new THREE.BoxGeometry(0.8, 0.5, 0.1);
        const bannerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(cpPos.x + 0.4, cpPos.y + 2.1, cpPos.z + 1.2);

        agentLogicGroup.add(flag);
        agentLogicGroup.add(banner);
      }
    } else if (agentId === 'contextual') {
      // Contextual: Rain friction wave rings and turbo boost zones
      const activeCurve = selectedRouteId ? routeCurves.get(selectedRouteId) || curveA : curveA;
      [0.3, 0.5, 0.7].forEach(t => {
        const pos = activeCurve.getPoint(t);
        const ringGeo = new THREE.TorusGeometry(1.4, 0.15, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, pos.y + 1.0, pos.z);
        agentLogicGroup.add(ring);
      });
    } else if (agentId === 'learning') {
      // Learning: Historical ghost trails of past deliveries
      routes.forEach(route => {
        const curve = routeCurves.get(route.id);
        if (!curve) return;
        const ghostGeo = new THREE.TubeGeometry(curve, 36, 0.25, 6, false);
        const ghostMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, wireframe: true, transparent: true, opacity: 0.6 });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        agentLogicGroup.add(ghost);
      });
    }

    scene.add(agentLogicGroup);

    // 11. Delivery Courier Vehicle (3D Scooter / Bike with Headlight)
    const vehicleGroup = new THREE.Group();
    vehicleGroupRef.current = vehicleGroup;

    // Vehicle Chassis
    const chassisGeo = new THREE.BoxGeometry(2.2, 0.85, 1.2);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: agentColor ? new THREE.Color(agentColor) : 0x22c55e,
      roughness: 0.2,
      metalness: 0.7,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.75;
    chassis.castShadow = true;
    vehicleGroup.add(chassis);

    // Branded Delivery Cargo Box
    const boxGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(-0.6, 1.35, 0);
    boxMesh.castShadow = true;
    vehicleGroup.add(boxMesh);

    // Glowing Agent Emblem on Cargo Box
    const emblemGeo = new THREE.BoxGeometry(1.02, 0.45, 1.02);
    const emblemMat = new THREE.MeshBasicMaterial({ color: agentColor ? new THREE.Color(agentColor) : 0x4ade80 });
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.set(-0.6, 1.35, 0);
    vehicleGroup.add(emblem);

    // Windshield & Cockpit
    const cabGeo = new THREE.BoxGeometry(0.85, 0.75, 0.9);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, transparent: true, opacity: 0.8 });
    const cabin = new THREE.Mesh(cabGeo, cabMat);
    cabin.position.set(0.4, 1.25, 0);
    vehicleGroup.add(cabin);

    // Headlight Lens
    const lightLensGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const lightLensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lightLens = new THREE.Mesh(lightLensGeo, lightLensMat);
    lightLens.position.set(1.15, 0.75, 0);
    vehicleGroup.add(lightLens);

    // Headlight Beam
    const spotLight = new THREE.SpotLight(0xffffff, 5, 18, Math.PI / 5, 0.3);
    spotLight.position.set(1.2, 0.75, 0);
    spotLight.target.position.set(6, 0.2, 0);
    vehicleGroup.add(spotLight);
    vehicleGroup.add(spotLight.target);

    // Rotating Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const wheels: THREE.Mesh[] = [];

    [
      [0.7, 0.38, 0.6],
      [0.7, 0.38, -0.6],
      [-0.7, 0.38, 0.6],
      [-0.7, 0.38, -0.6],
    ].forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.rotation.x = Math.PI / 2;
      wMesh.position.set(wx, wy, wz);
      wMesh.castShadow = true;
      vehicleGroup.add(wMesh);
      wheels.push(wMesh);
    });
    wheelsRef.current = wheels;

    const initialCurve = selectedRouteId ? routeCurves.get(selectedRouteId) || curveA : curveA;
    vehicleGroup.position.copy(initialCurve.getPoint(0.01));
    scene.add(vehicleGroup);

    // 12. Dynamic Weather Particle System
    if (isRain) {
      const rainCount = 1400;
      const rainGeo = new THREE.BufferGeometry();
      const rainPos = new Float32Array(rainCount * 3);
      for (let i = 0; i < rainCount * 3; i += 3) {
        rainPos[i] = (Math.random() - 0.5) * 85;
        rainPos[i + 1] = Math.random() * 45;
        rainPos[i + 2] = (Math.random() - 0.5) * 85;
      }
      rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));

      const rainMat = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.25,
        transparent: true,
        opacity: 0.75,
      });

      const rainSystem = new THREE.Points(rainGeo, rainMat);
      scene.add(rainSystem);
      rainSystemRef.current = rainSystem;
    }

    // 13. Fast Smooth Animation Loop
    let animationId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Continuous Vehicle Travel along selected route
      if (isSimulating && selectedRouteId) {
        const speedMultiplier = simSpeed === 'fast' ? 0.65 : 0.35; // fast = 1.5s total ride, normal = 3s
        animProgressRef.current = Math.min(1.0, animProgressRef.current + delta * speedMultiplier);
        setAnimProgress(animProgressRef.current);

        if (animProgressRef.current >= 1.0) {
          setIsSimulating(false);
        }
      }

      // Update vehicle position along curve
      const curves = routeCurvesRef.current;
      const vehicle = vehicleGroupRef.current;
      if (vehicle && curves.size > 0) {
        const activeCurve = selectedRouteId ? curves.get(selectedRouteId) || curves.values().next().value : curves.values().next().value;
        if (activeCurve) {
          const t = Math.max(0.001, Math.min(0.999, animProgressRef.current));
          const point = activeCurve.getPoint(t);
          const tangent = activeCurve.getTangent(t);

          vehicle.position.copy(point);
          const lookTarget = point.clone().add(tangent);
          vehicle.lookAt(lookTarget);

          // Spin wheels during active simulation
          if (isSimulating) {
            wheelsRef.current.forEach(w => {
              w.rotation.y += delta * 25;
            });
          }

          // Camera Follow Driver Mode
          if (cameraView === 'follow' && cameraRef.current) {
            const camPos = point.clone().sub(tangent.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 5, 0));
            cameraRef.current.position.copy(camPos);
            cameraRef.current.lookAt(point.clone().add(new THREE.Vector3(0, 1.2, 0)));
          }
        }
      }

      // Rain animation
      if (rainSystemRef.current) {
        const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 36 * delta;
          if (positions[i] < 0) positions[i] = 45;
        }
        rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Pulsing destination rings
      pulseBeamsRef.current.forEach(ring => {
        const scale = 1 + (Math.sin(time * 3.5) + 1) * 0.22;
        ring.scale.set(scale, scale, 1);
      });

      // Destination Beacon float
      if (destinationBeaconRef.current) {
        destinationBeaconRef.current.position.y = Math.sin(time * 2.5) * 0.2;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 14. Orbit & Mouse Drag Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 56, theta: 0, phi: Math.PI / 3.4 };

    const updateCameraSpherical = () => {
      if (cameraView !== 'iso') return;
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 0, 0);
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || cameraView !== 'iso') return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      spherical.theta -= dx * 0.007;
      spherical.phi = Math.max(0.2, Math.min(Math.PI / 2.2, spherical.phi - dy * 0.007));
      updateCameraSpherical();
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraView !== 'iso') return;
      spherical.radius = Math.max(20, Math.min(90, spherical.radius + e.deltaY * 0.05));
      updateCameraSpherical();
      e.preventDefault();
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Resize Observer
    const resizeObserver = new ResizeObserver(entries => {
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
  }, [scenario?.id, scenario?.weather, selectedRouteId, agentId, isSimulating, simSpeed, cameraView]);

  return (
    <div className="city-3d-wrapper">
      <div ref={mountRef} className="city-3d-canvas" />

      {/* Top HUD Overlay */}
      <div className="city-3d-hud">
        <div className="hud-badge agent-hud" style={{ borderColor: agentColor }}>
          <span className="hud-dot" style={{ background: agentColor }} />
          <b>{agentName}</b>
          <span className="hud-mode">{selectedRouteId ? `Dispatching Route ${selectedRouteId}` : 'Awaiting Route'}</span>
        </div>

        <div className="hud-badge weather-hud">
          {isRain ? (
            <>
              <CloudRain size={16} className="weather-icon rain" />
              <span>Rainy (+20% weather delay)</span>
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
            <span>ETA: <b>{etaMin ?? '—'}m</b></span>
            <span className="hud-divider">/</span>
            <span>Target: <b>{deadlineMin ?? '—'}m</b></span>
            {onTime !== undefined && onTime !== null && (
              <span className={`hud-status ${onTime ? 'good' : 'bad'}`}>
                {onTime ? '✓ ON TIME' : '⚠ LATE RISK'}
              </span>
            )}
          </div>
        )}

        {/* View Angle Switcher */}
        <div className="camera-switch-row">
          <button
            className={`cam-btn ${cameraView === 'iso' ? 'active' : ''}`}
            onClick={() => {
              setCameraView('iso');
              if (cameraRef.current) {
                cameraRef.current.position.set(0, 36, 46);
                cameraRef.current.lookAt(0, 0, 0);
              }
            }}
            title="3D City Orbit"
          >
            <Compass size={14} />
            <span>3D Orbit</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'follow' ? 'active' : ''}`}
            onClick={() => setCameraView('follow')}
            title="Follow Delivery Courier"
          >
            <Truck size={14} />
            <span>Driver Cam</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'top' ? 'active' : ''}`}
            onClick={() => {
              setCameraView('top');
              if (cameraRef.current) {
                cameraRef.current.position.set(0, 60, 0);
                cameraRef.current.lookAt(0, 0, 0);
              }
            }}
            title="Top-Down Radar"
          >
            <Eye size={14} />
            <span>Radar</span>
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
          <button
            className="hud-play-btn replay"
            onClick={startRideAnimation}
            title="Replay 3D delivery ride"
          >
            <RotateCcw size={14} />
            <span>{isSimulating ? 'Restart' : 'Replay Ride'}</span>
          </button>

          <div className="sim-speed-selector">
            <button
              className={`speed-btn ${simSpeed === 'fast' ? 'active' : ''}`}
              onClick={() => setSimSpeed('fast')}
              title="Fast simulation ride (1.5s)"
            >
              <FastForward size={13} />
              <span>Fast</span>
            </button>
            <button
              className={`speed-btn ${simSpeed === 'normal' ? 'active' : ''}`}
              onClick={() => setSimSpeed('normal')}
              title="Standard simulation ride (3s)"
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
