import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Camera, CloudRain, Compass, Eye, Play, RotateCcw, Sun, Truck, Volume2, VolumeX, Zap } from 'lucide-react';
import type { Route, Scenario } from '../types';

interface CityScene3DProps {
  scenario: Scenario | null;
  selectedRouteId: string | null;
  agentColor: string;
  agentName: string;
  progressPercent: number; // 0 to 100
  isPlaying: boolean;
  onTogglePlay?: () => void;
  etaMin?: number | null;
  deadlineMin?: number;
  onTime?: boolean | null;
}

export const CityScene3D: React.FC<CityScene3DProps> = ({
  scenario,
  selectedRouteId,
  agentColor,
  agentName,
  progressPercent,
  isPlaying,
  onTogglePlay,
  etaMin,
  deadlineMin,
  onTime,
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

  const [cameraView, setCameraView] = useState<'iso' | 'follow' | 'top'>('iso');
  const [showTrafficBadges, setShowTrafficBadges] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Weather condition
  const isRain = scenario?.weather === 'rain';

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 420;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isRain ? 0x081014 : 0x091410);
    scene.fog = new THREE.FogExp2(isRain ? 0x081014 : 0x091410, 0.015);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 32, 42);
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

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(isRain ? 0x4f6a7d : 0x6e8e7a, isRain ? 1.0 : 1.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(isRain ? 0x88aacc : 0xfffaed, isRain ? 1.5 : 2.4);
    dirLight.position.set(20, 45, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(agentColor ? new THREE.Color(agentColor) : 0x22c55e, 2, 40);
    accentLight.position.set(-15, 6, -10);
    scene.add(accentLight);

    // 5. City Ground Plane
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isRain ? 0x071112 : 0x0c1813,
      roughness: isRain ? 0.2 : 0.85,
      metalness: isRain ? 0.4 : 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid Floor Overlay
    const gridHelper = new THREE.GridHelper(90, 45, 0x1d3a2b, 0x12241b);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 6. City Buildings (Procedural skyline)
    const buildingsGroup = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x14231b,
      roughness: 0.7,
      metalness: 0.2,
    });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x3df0a0, transparent: true, opacity: 0.7 });
    const warmWindowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 });

    const buildingCoords: [number, number, number, number][] = [
      // [x, z, width, height]
      [-28, -18, 6, 16],
      [-24, -26, 7, 22],
      [-16, -24, 6, 14],
      [-32, 5, 8, 18],
      [-26, 16, 7, 12],
      [24, -20, 8, 20],
      [30, -10, 7, 15],
      [22, 14, 6, 17],
      [28, 22, 8, 24],
      [14, -25, 7, 13],
      [-8, -26, 8, 19],
      [-5, 24, 9, 14],
      [10, 26, 7, 16],
    ];

    buildingCoords.forEach(([bx, bz, bw, bh], idx) => {
      const bGeo = new THREE.BoxGeometry(bw, bh, bw);
      const bMesh = new THREE.Mesh(bGeo, buildingMat);
      bMesh.position.set(bx, bh / 2, bz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      buildingsGroup.add(bMesh);

      // Add glowing windows on faces
      const numWindows = Math.floor(bh / 3);
      for (let w = 1; w < numWindows; w++) {
        const winGeo = new THREE.BoxGeometry(bw * 0.75, 0.6, bw + 0.1);
        const winMesh = new THREE.Mesh(winGeo, (idx + w) % 2 === 0 ? windowMat : warmWindowMat);
        winMesh.position.set(bx, w * 3, bz);
        buildingsGroup.add(winMesh);
      }
    });
    scene.add(buildingsGroup);

    // 7. Restaurant Origin Depot (Kitchen Hub)
    const depotGroup = new THREE.Group();
    depotGroup.position.set(-20, 0, 0);

    const depotPlatformGeo = new THREE.CylinderGeometry(4.5, 5, 0.8, 32);
    const depotPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x1b3524,
      roughness: 0.5,
      metalness: 0.4,
    });
    const depotPlatform = new THREE.Mesh(depotPlatformGeo, depotPlatformMat);
    depotPlatform.position.y = 0.4;
    depotPlatform.receiveShadow = true;
    depotGroup.add(depotPlatform);

    // Restaurant Building
    const restGeo = new THREE.BoxGeometry(4.5, 4.5, 4.5);
    const restMat = new THREE.MeshStandardMaterial({ color: 0x224a32, roughness: 0.4 });
    const restMesh = new THREE.Mesh(restGeo, restMat);
    restMesh.position.y = 3;
    restMesh.castShadow = true;
    depotGroup.add(restMesh);

    // Glowing Depot Ring
    const depotRingGeo = new THREE.RingGeometry(3.6, 4.3, 32);
    const depotRingMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
    const depotRing = new THREE.Mesh(depotRingGeo, depotRingMat);
    depotRing.rotation.x = Math.PI / 2;
    depotRing.position.y = 0.82;
    depotGroup.add(depotRing);

    // Glowing Sign atop Restaurant
    const signGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.4, 16);
    const signMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.y = 5.8;
    depotGroup.add(signMesh);

    scene.add(depotGroup);

    // 8. Destination Hub (Customer Home / Delivery Beacon)
    const destGroup = new THREE.Group();
    destGroup.position.set(20, 0, 0);
    destinationBeaconRef.current = destGroup;

    const destPlatformGeo = new THREE.CylinderGeometry(4.5, 5, 0.8, 32);
    const destPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x283842,
      roughness: 0.5,
      metalness: 0.4,
    });
    const destPlatform = new THREE.Mesh(destPlatformGeo, destPlatformMat);
    destPlatform.position.y = 0.4;
    destPlatform.receiveShadow = true;
    destGroup.add(destPlatform);

    // Customer House
    const houseGeo = new THREE.ConeGeometry(3, 4.5, 4);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const houseMesh = new THREE.Mesh(houseGeo, houseMat);
    houseMesh.position.y = 3.2;
    houseMesh.rotation.y = Math.PI / 4;
    destGroup.add(houseMesh);

    // Pin Beacon
    const pinGeo = new THREE.SphereGeometry(0.9, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.y = 7;
    destGroup.add(pinMesh);

    const pinStemGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8);
    const pinStem = new THREE.Mesh(pinStemGeo, pinMat);
    pinStem.position.y = 5.6;
    destGroup.add(pinStem);

    // Expanding pulsing rings at destination
    const pulseGeo = new THREE.RingGeometry(2.5, 3.2, 32);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    pulseRing.rotation.x = Math.PI / 2;
    pulseRing.position.y = 0.85;
    destGroup.add(pulseRing);
    pulseBeamsRef.current.push(pulseRing);

    scene.add(destGroup);

    // 9. Routes (3D Curves & Roads)
    const routesGroup = new THREE.Group();
    const routeCurves = new Map<string, THREE.CatmullRomCurve3>();

    // Route path templates
    // Route A: Direct road via downtown with gentle arch
    const curveA = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.4, 0),
      new THREE.Vector3(-10, 0.4, -6),
      new THREE.Vector3(0, 0.4, -8),
      new THREE.Vector3(10, 0.4, -5),
      new THREE.Vector3(19, 0.4, 0),
    ]);

    // Route B: Elevated expressway / arch route
    const curveB = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.4, 0),
      new THREE.Vector3(-10, 2.8, 7),
      new THREE.Vector3(0, 3.5, 9),
      new THREE.Vector3(10, 2.8, 6),
      new THREE.Vector3(19, 0.4, 0),
    ]);

    // Route C: Scenic Parkway
    const curveC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.4, 0),
      new THREE.Vector3(-12, 0.4, -14),
      new THREE.Vector3(0, 0.4, -16),
      new THREE.Vector3(12, 0.4, -12),
      new THREE.Vector3(19, 0.4, 0),
    ]);

    // Route D: Southern bypass
    const curveD = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-19, 0.4, 0),
      new THREE.Vector3(-8, 0.4, 15),
      new THREE.Vector3(0, 0.4, 18),
      new THREE.Vector3(10, 0.4, 14),
      new THREE.Vector3(19, 0.4, 0),
    ]);

    const routeCurveLibrary: Record<string, THREE.CatmullRomCurve3> = {
      A: curveA,
      B: curveB,
      C: curveC,
      D: curveD,
    };

    const routes = scenario?.routes || [
      { id: 'A', name: 'Route A', distance_km: 3, travel_time_min: 15, traffic_level: 'light', cost: 100, available: true },
      { id: 'B', name: 'Route B', distance_km: 5, travel_time_min: 20, traffic_level: 'light', cost: 130, available: true },
    ];

    routes.forEach((route, idx) => {
      const curve = routeCurveLibrary[route.id] || (idx === 0 ? curveA : curveB);
      routeCurves.set(route.id, curve);

      const isSelected = selectedRouteId === route.id;
      const isRouteAvailable = route.available !== false;

      // Color coding by traffic & selection
      let roadColor = 0x22c55e; // Light
      if (route.traffic_level === 'moderate') roadColor = 0xf59e0b;
      if (route.traffic_level === 'heavy') roadColor = 0xef4444;
      if (!isRouteAvailable) roadColor = 0x475569;

      // 3D Road Ribbon Tube
      const tubeGeo = new THREE.TubeGeometry(curve, 64, isSelected ? 0.85 : 0.5, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: isSelected ? (agentColor ? new THREE.Color(agentColor) : roadColor) : roadColor,
        emissive: isSelected ? (agentColor ? new THREE.Color(agentColor) : roadColor) : roadColor,
        emissiveIntensity: isSelected ? 0.75 : 0.25,
        roughness: 0.3,
        metalness: 0.5,
        transparent: !isRouteAvailable,
        opacity: isRouteAvailable ? 1.0 : 0.45,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      routesGroup.add(tubeMesh);

      // Support pillars for elevated route B
      if (route.id === 'B') {
        const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        [-8, 0, 8].forEach(px => {
          const p = new THREE.Mesh(pillarGeo, pillarMat);
          p.position.set(px, 1.5, 8);
          routesGroup.add(p);
        });
      }

      // Add route name marker in 3D
      const midPoint = curve.getPoint(0.5);
      const markerGeo = new THREE.BoxGeometry(2.4, 0.8, 0.4);
      const markerMat = new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : roadColor });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);
      markerMesh.position.set(midPoint.x, midPoint.y + 1.2, midPoint.z);
      routesGroup.add(markerMesh);
    });

    scene.add(routesGroup);
    routeCurvesRef.current = routeCurves;

    // 10. Delivery Courier Vehicle (3D Motorbike / Drone / Cart)
    const vehicleGroup = new THREE.Group();
    vehicleGroupRef.current = vehicleGroup;

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(2.0, 0.8, 1.1);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: agentColor ? new THREE.Color(agentColor) : 0x22c55e,
      roughness: 0.3,
      metalness: 0.6,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.7;
    chassis.castShadow = true;
    vehicleGroup.add(chassis);

    // Food Delivery Box (Cargo)
    const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(-0.55, 1.25, 0);
    boxMesh.castShadow = true;
    vehicleGroup.add(boxMesh);

    // Glowing Dispatch Logo on Box
    const logoGeo = new THREE.BoxGeometry(0.92, 0.4, 0.92);
    const logoMat = new THREE.MeshBasicMaterial({ color: agentColor ? new THREE.Color(agentColor) : 0x4ade80 });
    const logoMesh = new THREE.Mesh(logoGeo, logoMat);
    logoMesh.position.set(-0.55, 1.25, 0);
    vehicleGroup.add(logoMesh);

    // Windshield & Courier cabin
    const cabGeo = new THREE.BoxGeometry(0.8, 0.7, 0.85);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, transparent: true, opacity: 0.7 });
    const cabin = new THREE.Mesh(cabGeo, cabMat);
    cabin.position.set(0.35, 1.2, 0);
    vehicleGroup.add(cabin);

    // Headlight
    const lightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headlight = new THREE.Mesh(lightGeo, lightMat);
    headlight.position.set(1.05, 0.7, 0);
    vehicleGroup.add(headlight);

    // Headlight cone beam
    const spotLight = new THREE.SpotLight(0xffffff, 4, 15, Math.PI / 6, 0.4);
    spotLight.position.set(1.1, 0.7, 0);
    spotLight.target.position.set(5, 0.2, 0);
    vehicleGroup.add(spotLight);
    vehicleGroup.add(spotLight.target);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const wheels: THREE.Mesh[] = [];

    const wheelPositions = [
      [0.65, 0.35, 0.55],
      [0.65, 0.35, -0.55],
      [-0.65, 0.35, 0.55],
      [-0.65, 0.35, -0.55],
    ];

    wheelPositions.forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.rotation.x = Math.PI / 2;
      wMesh.position.set(wx, wy, wz);
      wMesh.castShadow = true;
      vehicleGroup.add(wMesh);
      wheels.push(wMesh);
    });
    wheelsRef.current = wheels;

    // Set initial vehicle location
    const initialCurve = selectedRouteId ? routeCurves.get(selectedRouteId) || curveA : curveA;
    const initialPos = initialCurve.getPoint(0);
    vehicleGroup.position.copy(initialPos);
    scene.add(vehicleGroup);

    // 11. Weather Particles (Dynamic Rain / Sunshine)
    if (isRain) {
      const rainCount = 1200;
      const rainGeo = new THREE.BufferGeometry();
      const rainPos = new Float32Array(rainCount * 3);

      for (let i = 0; i < rainCount * 3; i += 3) {
        rainPos[i] = (Math.random() - 0.5) * 80;
        rainPos[i + 1] = Math.random() * 40;
        rainPos[i + 2] = (Math.random() - 0.5) * 80;
      }
      rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));

      const rainMat = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.22,
        transparent: true,
        opacity: 0.7,
      });

      const rainSystem = new THREE.Points(rainGeo, rainMat);
      scene.add(rainSystem);
      rainSystemRef.current = rainSystem;
    }

    // 12. Animation Loop & Camera controls
    let animationId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Rain animation
      if (rainSystemRef.current) {
        const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 32 * delta;
          if (positions[i] < 0) {
            positions[i] = 40;
          }
        }
        rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Pulsing destination rings
      pulseBeamsRef.current.forEach(ring => {
        const scale = 1 + (Math.sin(time * 3) + 1) * 0.2;
        ring.scale.set(scale, scale, 1);
      });

      // Destination pin float
      if (destinationBeaconRef.current) {
        destinationBeaconRef.current.position.y = Math.sin(time * 2) * 0.15;
      }

      // Spin wheels when moving
      if (isPlaying) {
        wheelsRef.current.forEach(w => {
          w.rotation.y += delta * 15;
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // 13. Interactive Orbit / Mouse drag controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 52, theta: 0, phi: Math.PI / 3.4 };

    const updateCameraFromSpherical = () => {
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
      updateCameraFromSpherical();
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraView !== 'iso') return;
      spherical.radius = Math.max(20, Math.min(85, spherical.radius + e.deltaY * 0.05));
      updateCameraFromSpherical();
      e.preventDefault();
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Handle Resize
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

    // Cleanup
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
  }, [scenario?.id, scenario?.weather, selectedRouteId]);

  // Update vehicle position along curve when progressPercent or selectedRoute changes
  useEffect(() => {
    const curves = routeCurvesRef.current;
    const vehicle = vehicleGroupRef.current;
    if (!vehicle || curves.size === 0) return;

    const activeCurve = selectedRouteId ? curves.get(selectedRouteId) || curves.values().next().value : curves.values().next().value;
    if (!activeCurve) return;

    const t = Math.max(0.001, Math.min(0.999, progressPercent / 100));
    const point = activeCurve.getPoint(t);
    const tangent = activeCurve.getTangent(t);

    vehicle.position.copy(point);

    // Orient vehicle along route direction
    const lookTarget = point.clone().add(tangent);
    vehicle.lookAt(lookTarget);

    // Camera follow mode
    if (cameraView === 'follow' && cameraRef.current) {
      const camPos = point.clone().sub(tangent.clone().multiplyScalar(9)).add(new THREE.Vector3(0, 4.5, 0));
      cameraRef.current.position.copy(camPos);
      cameraRef.current.lookAt(point.clone().add(new THREE.Vector3(0, 1.2, 0)));
    } else if (cameraView === 'top' && cameraRef.current) {
      cameraRef.current.position.set(0, 55, 0);
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [progressPercent, selectedRouteId, cameraView]);

  return (
    <div className="city-3d-wrapper">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="city-3d-canvas" />

      {/* Top HUD Overlay */}
      <div className="city-3d-hud">
        <div className="hud-badge agent-hud" style={{ borderColor: agentColor }}>
          <span className="hud-dot" style={{ background: agentColor }} />
          <b>{agentName}</b>
          <span className="hud-mode">{selectedRouteId ? `Route ${selectedRouteId}` : 'Awaiting Route'}</span>
        </div>

        <div className="hud-badge weather-hud">
          {isRain ? (
            <>
              <CloudRain size={16} className="weather-icon rain" />
              <span>Rainy (+20% delay)</span>
            </>
          ) : (
            <>
              <Sun size={16} className="weather-icon sun" />
              <span>Clear Weather</span>
            </>
          )}
        </div>

        {selectedRouteId && (
          <div className="hud-badge timer-hud">
            <Zap size={14} />
            <span>ETA: <b>{etaMin ?? '—'}m</b></span>
            <span className="hud-divider">/</span>
            <span>Target: <b>{deadlineMin ?? '—'}m</b></span>
            {onTime !== undefined && onTime !== null && (
              <span className={`hud-status ${onTime ? 'good' : 'bad'}`}>
                {onTime ? 'ON TIME' : 'LATE'}
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
                cameraRef.current.position.set(0, 32, 42);
                cameraRef.current.lookAt(0, 0, 0);
              }
            }}
            title="Isometric 3D City View"
          >
            <Compass size={14} />
            <span>3D Orbit</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'follow' ? 'active' : ''}`}
            onClick={() => setCameraView('follow')}
            title="Follow Delivery Bike"
          >
            <Truck size={14} />
            <span>Driver Cam</span>
          </button>
          <button
            className={`cam-btn ${cameraView === 'top' ? 'active' : ''}`}
            onClick={() => {
              setCameraView('top');
              if (cameraRef.current) {
                cameraRef.current.position.set(0, 55, 0);
                cameraRef.current.lookAt(0, 0, 0);
              }
            }}
            title="Top-down Radar View"
          >
            <Eye size={14} />
            <span>Radar</span>
          </button>
        </div>
      </div>

      {/* Bottom Live Progress Controls */}
      <div className="city-3d-footer">
        <div className="dispatch-progress-group">
          <span className="hub-marker depot">Kitchen Hub</span>
          <div className="dispatch-track">
            <div
              className="dispatch-fill"
              style={{
                width: `${progressPercent}%`,
                background: `linear-gradient(90deg, ${agentColor || '#4ade80'}, #38bdf8)`,
              }}
            />
            <div
              className="dispatch-runner"
              style={{
                left: `${progressPercent}%`,
                borderColor: agentColor || '#4ade80',
              }}
            >
              <Truck size={12} />
            </div>
          </div>
          <span className="hub-marker customer">Customer Door</span>
        </div>

        <div className="playback-actions">
          {onTogglePlay && (
            <button className="hud-play-btn" onClick={onTogglePlay}>
              <Play size={14} fill={isPlaying ? 'currentColor' : 'none'} />
              <span>{isPlaying ? 'Pause' : 'Simulate Ride'}</span>
            </button>
          )}
          <span className="hud-drag-tip">
            <RotateCcw size={13} /> Click & drag in 3D to rotate city
          </span>
        </div>
      </div>
    </div>
  );
};
