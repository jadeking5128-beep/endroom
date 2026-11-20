"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type ThoughtNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  links: string[];
};

type Props = {
  thoughts: ThoughtNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  highlightedIds?: string[];
  highlightedLinks?: string[];
};

function labelSprite(title: string, active: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = "500 30px Arial";
    context.textAlign = "center";
    context.fillStyle = active ? "#f1d7a5" : "#c3cbd0";
    context.shadowColor = active ? "#b88b4b" : "#8799a5";
    context.shadowBlur = 12;
    context.fillText(title.slice(0, 28), 256, 58);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.45, 0.27, 1);
  return sprite;
}

export default function BrainScene({ thoughts, selected, onSelect, highlightedIds = [], highlightedLinks = [] }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const highlightedIdSet = new Set(highlightedIds);
  const highlightedLinkSet = new Set(highlightedLinks);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "brain-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional thought node network. Drag to rotate, pinch or scroll to zoom.");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 100);
    camera.position.set(0, 0, 7.2);
    const graph = new THREE.Group();
    scene.add(graph);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);
    const light = new THREE.PointLight(0xd6b77f, 16, 20);
    light.position.set(-3, 3, 5);
    scene.add(light);

    const positions = new Map<string, THREE.Vector3>();
    thoughts.forEach((thought, index) => {
      const depth = ((index % 5) - 2) * 0.19;
      positions.set(thought.id, new THREE.Vector3(thought.x * 0.008, -thought.y * 0.008, depth));
    });

    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x82909a, transparent: true, opacity: 0.38 });
    const edges = new Set<string>();
    thoughts.forEach(thought => {
      const from = positions.get(thought.id);
      if (!from) return;
      thought.links.forEach(linkId => {
        const to = positions.get(linkId);
        if (!to) return;
        const key = [thought.id, linkId].sort().join(":");
        if (edges.has(key)) return;
        edges.add(key);
        const isHighlighted = highlightedLinkSet.has(key);
        const material = isHighlighted
          ? new THREE.LineBasicMaterial({ color: 0xe0bd7d, transparent: true, opacity: 0.98 })
          : edgeMaterial;
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        graph.add(new THREE.Line(geometry, material));
      });
    });

    const hitTargets: THREE.Mesh[] = [];
    const nodeLookup = new Map<THREE.Mesh, string>();
    const labelSprites: THREE.Sprite[] = [];
    thoughts.forEach(thought => {
      const recalled = highlightedIdSet.has(thought.id);
      const active = thought.id === selected || recalled;
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(thought.id === "origin" ? 0.105 : 0.075, 24, 20),
        new THREE.MeshStandardMaterial({
          color: recalled ? 0xf2d49b : active ? 0xe4bd79 : 0xc7d0d6,
          emissive: recalled ? 0xb98536 : active ? 0x8b5c22 : 0x53616c,
          emissiveIntensity: recalled ? 2.1 : active ? 1.4 : 0.55,
          metalness: 0.55,
          roughness: 0.24
        })
      );
      node.position.copy(positions.get(thought.id)!);
      graph.add(node);
      hitTargets.push(node);
      nodeLookup.set(node, thought.id);

      const label = labelSprite(thought.title, active);
      label.position.copy(node.position).add(new THREE.Vector3(0, -0.22, 0));
      graph.add(label);
      labelSprites.push(label);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    let rotationX = -0.08;
    let rotationY = 0.12;
    let zoom = 7.2;
    let pinch: { distance: number; zoom: number } | null = null;
    let down: { x: number; y: number; time: number } | null = null;
    let frame = 0;

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resize.observe(host);

    const onDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      down = { x: event.clientX, y: event.clientY, time: performance.now() };
      if (activePointers.size === 2) {
        const points = [...activePointers.values()];
        pinch = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom };
      }
    };
    const onMove = (event: PointerEvent) => {
      const previous = activePointers.get(event.pointerId);
      if (!previous) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size > 1 && pinch) {
        const points = [...activePointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        zoom = THREE.MathUtils.clamp(pinch.zoom * pinch.distance / Math.max(distance, 1), 4.4, 11);
      } else {
        rotationY += (event.clientX - previous.x) * 0.006;
        rotationX = THREE.MathUtils.clamp(rotationX + (event.clientY - previous.y) * 0.005, -1.2, 1.2);
      }
    };
    const onUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinch = null;
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 7 && performance.now() - down.time < 450) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hitTargets, false)[0];
        if (hit) {
          const id = nodeLookup.get(hit.object as THREE.Mesh);
          if (id) selectRef.current(id);
        }
      }
      down = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.004, 4.4, 11);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (activePointers.size === 0) rotationY += 0.00035;
      graph.rotation.set(rotationX, rotationY, 0);
      camera.position.z += (zoom - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);
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
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach(item => item.dispose());
          else material.dispose();
        }
      });
      labelSprites.forEach(label => (label.material as THREE.SpriteMaterial).map?.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, [thoughts, selected, highlightedIds, highlightedLinks]);

  return <div className="brain-scene" ref={hostRef} role="img" aria-label="Three-dimensional thought node network" />;
}
