"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type BrainThought = {
  id: string;
  title: string;
  x: number;
  y: number;
  links: string[];
};

type Props = {
  thoughts: BrainThought[];
  selected: string | null;
  onSelect: (id: string) => void;
};

function brainSurface(u: number, v: number, scale = 1) {
  const phi = (v - 0.5) * Math.PI;
  const theta = u * Math.PI * 2;
  const fold = 1 + 0.035 * Math.sin(theta * 11 + Math.sin(phi * 7)) * Math.cos(phi * 9)
    + 0.018 * Math.sin(theta * 17 - phi * 5);
  return new THREE.Vector3(
    Math.cos(phi) * Math.cos(theta) * 1.28 * fold * scale,
    Math.sin(phi) * 0.98 * fold * scale,
    Math.cos(phi) * Math.sin(theta) * 0.88 * fold * scale
  );
}

function makeLabel(text: string, active: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "500 34px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = active ? "#e8faff" : "#a9cbd4";
    ctx.shadowColor = active ? "#70dfff" : "#397f94";
    ctx.shadowBlur = active ? 18 : 8;
    ctx.fillText(text.slice(0, 25), 256, 76);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.39, 1);
  return sprite;
}

export default function BrainScene({ thoughts, selected, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      host.dataset.webgl = "unavailable";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.className = "brain-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional holographic brain. Drag to rotate, pinch or scroll to zoom.");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 100);
    camera.position.set(0, 0.25, 7.8);
    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0x9ad9e9, 1.05));
    const keyLight = new THREE.PointLight(0x69dfff, 42, 18);
    keyLight.position.set(-3, 3, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xb18a52, 30, 16);
    rimLight.position.set(3, -2, -3);
    scene.add(rimLight);

    const brainGroup = new THREE.Group();
    root.add(brainGroup);

    const geometry = new THREE.SphereGeometry(1, 100, 76);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = p.clone().normalize();
      const theta = Math.atan2(n.z, n.x);
      const phi = Math.asin(n.y);
      const fold = 1 + 0.035 * Math.sin(theta * 11 + Math.sin(phi * 7)) * Math.cos(phi * 9)
        + 0.018 * Math.sin(theta * 17 - phi * 5);
      p.x *= 1.28 * fold;
      p.y *= 0.98 * fold;
      p.z *= 0.88 * fold;
      const groove = Math.exp(-Math.pow(p.x / 0.11, 2)) * 0.075;
      p.z -= groove;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals();

    const brainMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x277d98,
      emissive: 0x073747,
      emissiveIntensity: 1.25,
      metalness: 0.24,
      roughness: 0.29,
      transparent: true,
      opacity: 0.83,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide
    });
    const brainMesh = new THREE.Mesh(geometry, brainMaterial);
    brainGroup.add(brainMesh);

    const wire = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshBasicMaterial({ color: 0x8beaff, wireframe: true, transparent: true, opacity: 0.13 })
    );
    brainGroup.add(wire);

    const foldMaterial = new THREE.MeshBasicMaterial({ color: 0x8cecff, transparent: true, opacity: 0.63 });
    for (let i = 0; i < 30; i++) {
      const points: THREE.Vector3[] = [];
      const base = (i + 0.5) / 30;
      for (let j = 0; j <= 90; j++) {
        const u = j / 90;
        const v = THREE.MathUtils.clamp(base + 0.025 * Math.sin(u * Math.PI * 4 + i), 0.05, 0.95);
        points.push(brainSurface(u, v, 1.006));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      brainGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 100, 0.008, 5, false), foldMaterial));
    }

    const midlinePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 50; i++) {
      const v = i / 50;
      const p = brainSurface(0.25, v, 1.015);
      p.x = 0;
      midlinePoints.push(p);
    }
    brainGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midlinePoints), 60, 0.009, 5, false),
      new THREE.MeshBasicMaterial({ color: 0xc1f5ff, transparent: true, opacity: 0.7 })
    ));

    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x5ecbe8, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.48, 48, 32), haloMaterial);
    halo.scale.set(1.1, 0.78, 0.76);
    brainGroup.add(halo);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x75d8ee, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05 + i * 0.13, 0.006, 8, 160), ringMaterial);
      ring.rotation.x = Math.PI * (0.32 + i * 0.18);
      ring.rotation.y = Math.PI * (0.12 + i * 0.21);
      root.add(ring);
    }

    const stars = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const radius = 2.6 + Math.random() * 3.6;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      stars[i * 3] = radius * Math.sin(b) * Math.cos(a);
      stars[i * 3 + 1] = radius * Math.cos(b);
      stars[i * 3 + 2] = radius * Math.sin(b) * Math.sin(a);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x8eddf0, size: 0.018, transparent: true, opacity: 0.68 })));

    const positions = new Map<string, THREE.Vector3>();
    const nodeObjects = new Map<string, THREE.Mesh>();
    const hitObjects: THREE.Object3D[] = [];
    const nodeMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9deeff, emissive: 0x1785a5, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.18 });
    const activeMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffd99a, emissive: 0x9b6320, emissiveIntensity: 2.4, metalness: 0.25, roughness: 0.2 });
    const labelObjects: THREE.Sprite[] = [];

    const coords = (t: BrainThought) => {
      if (t.id === "origin") return new THREE.Vector3(0, 0, 0);
      const angle = Math.atan2(t.y, t.x);
      const radius = 2.0 + Math.min(0.8, Math.hypot(t.x, t.y) / 900);
      return new THREE.Vector3(Math.cos(angle) * radius, -Math.sin(angle) * radius * 0.72, Math.sin(angle * 1.7) * 0.78);
    };

    for (const t of thoughts) positions.set(t.id, coords(t));
    for (const t of thoughts) {
      if (t.id === "origin") continue;
      const from = positions.get(t.id)!;
      for (const link of t.links) {
        const to = positions.get(link);
        if (!to) continue;
        const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.18, 0)), to);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.006, 5, false), new THREE.MeshBasicMaterial({ color: 0x75c8dd, transparent: true, opacity: 0.36 })));
      }
    }

    for (const t of thoughts) {
      const point = positions.get(t.id)!;
      const active = selected === t.id;
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(t.id === "origin" ? 0.12 : 0.075, 2), active ? activeMaterial : nodeMaterial);
      mesh.position.copy(point);
      root.add(mesh);
      nodeObjects.set(t.id, mesh);
      hitObjects.push(mesh);
      if (t.id !== "origin") {
        const label = makeLabel(t.title, active);
        label.position.copy(point).add(new THREE.Vector3(0, -0.23, 0));
        root.add(label);
        labelObjects.push(label);
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; time: number } | null = null;
    let rotation = { x: -0.12, y: 0.22 };
    let zoom = 7.8;
    let pinchStart: { distance: number; zoom: number } | null = null;
    let frame = 0;
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resize.observe(host);

    const pointFromEvent = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onDown = (e: PointerEvent) => {
      renderer.domElement.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, time: performance.now() };
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchStart = { distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const previous = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2 && pinchStart) {
        const pts = [...pointers.values()];
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        zoom = THREE.MathUtils.clamp(pinchStart.zoom * pinchStart.distance / Math.max(1, distance), 5.2, 12);
      } else {
        rotation.y += (e.clientX - previous.x) * 0.006;
        rotation.x = THREE.MathUtils.clamp(rotation.x + (e.clientY - previous.y) * 0.005, -1.1, 1.1);
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 && performance.now() - down.time < 450) {
        pointFromEvent(e);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hitObjects, false)[0];
        if (hit) {
          const entry = [...nodeObjects.entries()].find(([, obj]) => obj === hit.object);
          if (entry) selectRef.current(entry[0]);
        }
      }
      down = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.004, 5.2, 12);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      if (pointers.size === 0) rotation.y += 0.0008;
      root.rotation.set(rotation.x, rotation.y, 0);
      brainGroup.rotation.y = Math.sin(elapsed * 0.18) * 0.08;
      brainGroup.scale.setScalar(1 + Math.sin(elapsed * 1.1) * 0.008);
      camera.position.z += (zoom - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);
      for (const [id, obj] of nodeObjects) {
        const pulse = 1 + Math.sin(elapsed * 2.1 + id.length) * 0.08;
        obj.scale.setScalar(pulse);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material.dispose();
        }
      });
      labelObjects.forEach(label => {
        const map = (label.material as THREE.SpriteMaterial).map;
        map?.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, [thoughts, selected]);

  return <div className="brain-scene" ref={hostRef} role="img" aria-label="Three-dimensional interactive holographic brain" />;
}
