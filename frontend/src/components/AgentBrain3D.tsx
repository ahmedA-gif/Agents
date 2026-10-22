import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Activity, Brain, CheckCircle2, ChevronRight, Info, Layers, Sparkles } from 'lucide-react';
import type { Architecture, TraceStep } from '../types';

interface AgentBrain3DProps {
  architecture: Architecture | null;
  currentStep?: TraceStep;
  trace: TraceStep[];
  agentColor: string;
  agentName: string;
}

export const AgentBrain3D: React.FC<AgentBrain3DProps> = ({
  architecture,
  currentStep,
  trace,
  agentColor,
  agentName,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMeshesRef = useRef<Map<string, { mesh: THREE.Mesh; halo: THREE.Mesh; light: THREE.PointLight; textSprite?: THREE.Sprite }>>(new Map());
  const pulseParticlesRef = useRef<{ particle: THREE.Mesh; curve: THREE.CatmullRomCurve3; progress: number }[]>([]);

  const [hoveredNode, setHoveredNode] = useState<{ id: string; label: string; detail: string; type: string } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !architecture) return;

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 360;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x07110e);
    scene.fog = new THREE.FogExp2(0x07110e, 0.012);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 15, 36);
    camera.lookAt(0, 0, 0);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x64748b, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(10, 30, 20);
    scene.add(dirLight);

    // Holographic floor grid
    const grid = new THREE.GridHelper(50, 25, 0x1e3a2b, 0x0f241a);
    grid.position.y = -6;
    scene.add(grid);

    // Center holographic brain core
    const coreGeo = new THREE.IcosahedronGeometry(2.5, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: agentColor ? new THREE.Color(agentColor) : 0x4ade80,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 0, 0);
    scene.add(coreMesh);

    // Map 2D architecture coordinates to centered 3D space
    const nodes = architecture.nodes;
    if (!nodes.length) return;

    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x + n.w));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y + n.h));

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);

    const nodePositions = new Map<string, THREE.Vector3>();

    nodes.forEach((n, idx) => {
      // Normalize X to -16..16, Y to 7..-7, with slight spherical Z curve
      const normX = ((n.x + n.w / 2 - minX) / spanX - 0.5) * 32;
      const normY = (0.5 - (n.y + n.h / 2 - minY) / spanY) * 14;
      const normZ = Math.sin((normX / 16) * Math.PI * 0.5) * 3.5 + ((idx % 2 === 0) ? 1.0 : -1.0);
      nodePositions.set(n.id, new THREE.Vector3(normX, normY, normZ));
    });

    // Create 3D Nodes
    const nodeMeshes = new Map<string, { mesh: THREE.Mesh; halo: THREE.Mesh; light: THREE.PointLight; textSprite?: THREE.Sprite }>();

    nodes.forEach(n => {
      const pos = nodePositions.get(n.id)!;
      const group = new THREE.Group();
      group.position.copy(pos);

      // Node Sphere
      const sphereGeo = new THREE.SphereGeometry(1.2, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0f172a,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.7,
      });
      const nodeSphere = new THREE.Mesh(sphereGeo, sphereMat);
      nodeSphere.userData = { id: n.id, label: n.label, detail: n.detail, type: n.type };
      group.add(nodeSphere);

      // Outer Halo Ring
      const haloGeo = new THREE.RingGeometry(1.4, 1.7, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: agentColor ? new THREE.Color(agentColor) : 0x4ade80,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      group.add(haloMesh);

      // Point Light for active glow
      const nodeLight = new THREE.PointLight(agentColor ? new THREE.Color(agentColor) : 0x4ade80, 0, 8);
      group.add(nodeLight);

      // Text Canvas Sprite for 3D label
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 22px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.label.slice(0, 18), 128, 40);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 1.9, 0);
      sprite.scale.set(4.5, 1.1, 1);
      group.add(sprite);

      scene.add(group);
      nodeMeshes.set(n.id, { mesh: nodeSphere, halo: haloMesh, light: nodeLight, textSprite: sprite });
    });
    nodeMeshesRef.current = nodeMeshes;

    // Create 3D Connective Synapse Edges & Pulses
    const pulseParticles: { particle: THREE.Mesh; curve: THREE.CatmullRomCurve3; progress: number }[] = [];

    architecture.edges.forEach(edge => {
      const p1 = nodePositions.get(edge.source);
      const p2 = nodePositions.get(edge.target);
      if (!p1 || !p2) return;

      // Curved spline between nodes with intermediate arc
      const mid = p1.clone().lerp(p2, 0.5);
      mid.y += (p2.x <= p1.x ? -2.5 : 1.2);
      mid.z += 1.0;

      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.12, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: edge.dashed ? 0.35 : 0.65,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);

      // Energy pulse bead traveling along the edge
      const beadGeo = new THREE.SphereGeometry(0.32, 12, 12);
      const beadMat = new THREE.MeshBasicMaterial({ color: agentColor ? new THREE.Color(agentColor) : 0x38bdf8 });
      const bead = new THREE.Mesh(beadGeo, beadMat);
      scene.add(bead);

      pulseParticles.push({
        particle: bead,
        curve,
        progress: Math.random(),
      });
    });
    pulseParticlesRef.current = pulseParticles;

    // Raycaster for Hover detection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const interactiveMeshes = Array.from(nodeMeshes.values()).map(v => v.mesh);
      const intersects = raycaster.intersectObjects(interactiveMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object.userData;
        setHoveredNode(hit as any);
      } else {
        setHoveredNode(null);
      }
    };

    renderer.domElement.addEventListener('mousemove', onPointerMove);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Rotate central core
      coreMesh.rotation.x = time * 0.2;
      coreMesh.rotation.y = time * 0.25;

      // Animate edge pulses
      pulseParticles.forEach(p => {
        p.progress = (p.progress + delta * 0.4) % 1;
        const pt = p.curve.getPoint(p.progress);
        p.particle.position.copy(pt);
      });

      // Halo billboarding
      nodeMeshes.forEach(({ halo }) => {
        halo.quaternion.copy(camera.quaternion);
      });

      renderer.render(scene, camera);
    };

    animate();

    // Mouse drag rotation
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      camera.position.x -= dx * 0.05;
      camera.position.y += dy * 0.05;
      camera.lookAt(0, 0, 0);
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Resize
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
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousemove', onPointerMove);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [architecture?.agent_id, agentColor]);

  // Highlight active step node in 3D
  useEffect(() => {
    if (!architecture) return;
    const activeNodeId = currentStep?.node_id;
    const meshes = nodeMeshesRef.current;

    meshes.forEach((item, id) => {
      const isActive = id === activeNodeId;
      const mat = item.mesh.material as THREE.MeshStandardMaterial;

      if (isActive) {
        mat.color.set(agentColor || '#4ade80');
        mat.emissive.set(agentColor || '#4ade80');
        mat.emissiveIntensity = 0.9;
        item.halo.scale.set(1.5, 1.5, 1.5);
        item.light.intensity = 3.5;
      } else {
        mat.color.set(0x1e293b);
        mat.emissive.set(0x0f172a);
        mat.emissiveIntensity = 0.3;
        item.halo.scale.set(1.0, 1.0, 1.0);
        item.light.intensity = 0;
      }
    });
  }, [currentStep?.node_id, architecture, agentColor]);

  return (
    <div className="agent-brain-3d-wrapper">
      <div ref={mountRef} className="brain-3d-canvas" />

      {/* Floating HUD info */}
      <div className="brain-hud-top">
        <div className="brain-badge">
          <Brain size={16} style={{ color: agentColor }} />
          <span>3D Neural Architecture: <b>{architecture?.title ?? agentName}</b></span>
        </div>
        <span className="brain-hud-hint">Hover spheres to inspect cognitive nodes · Drag to pan</span>
      </div>

      {/* Active or Hovered Node Callout */}
      {(hoveredNode || currentStep) && (
        <div className="brain-step-callout">
          <div className="callout-header">
            <span className="callout-dot" style={{ background: agentColor }} />
            <b>{hoveredNode ? hoveredNode.label : currentStep?.label}</b>
            <span className="callout-phase">{hoveredNode ? hoveredNode.type : currentStep?.phase}</span>
          </div>
          <p className="callout-detail">{hoveredNode ? hoveredNode.detail : currentStep?.detail}</p>
        </div>
      )}
    </div>
  );
};
