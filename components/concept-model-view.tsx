"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Expand, RotateCcw } from "lucide-react";
import type { ConceptModel } from "@/lib/concept-model";
import { Button } from "./ui/button";
import styles from "./concept-model.module.css";

type SceneControls = { highlight: (id: string | null) => void; explode: (value: boolean) => void; reset: () => void };

export function ConceptModelView({ model }: { model: ConceptModel }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<SceneControls | null>(null);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [problem, setProblem] = useState("");
  const [ready, setReady] = useState(false);
  const active = hovered || selected;
  const current = useRef({ active, exploded }); current.current = { active, exploded };
  const cameraMemory = useRef<{ id: string; position: number[]; target: number[] } | null>(null);
  const part = model.parts.find(item => item.id === active);

  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { runtime.current?.highlight(active); }, [active]);
  useEffect(() => { runtime.current?.explode(exploded); }, [exploded]);

  useEffect(() => {
    if (!visible || !host.current) return;
    let stopped = false;
    let cleanup = () => {};
    setReady(false); setProblem("");
    void (async () => {
      const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")]);
      if (stopped || !host.current) return;
      const container = host.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const canvas = renderer.domElement;
      canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", `Modello 3D interattivo: ${model.title}`);
      container.appendChild(canvas);
      const scene = new THREE.Scene();
      const group = new THREE.Group(); scene.add(group);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x60718f, 2.5));
      const light = new THREE.DirectionalLight(0xffffff, 3.5); light.position.set(4, 6, 7); scene.add(light);
      const rim = new THREE.DirectionalLight(0xc8dcff, 2); rim.position.set(-4, 2, -3); scene.add(rim);
      const camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(1, container.clientHeight), 0.01, 200);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = false;
      controls.enablePan = true;
      const meshes: import("three").Mesh<import("three").BufferGeometry, import("three").MeshStandardMaterial>[] = [];
      for (const item of model.parts) {
        const { x, y, z } = item.size;
        let geometry: import("three").BufferGeometry;
        if (item.shape === "box") geometry = new THREE.BoxGeometry(x, y, z);
        else if (item.shape === "cylinder") geometry = new THREE.CylinderGeometry(x, x, y, 28);
        else if (item.shape === "cone") geometry = new THREE.ConeGeometry(x, y, 28);
        else if (item.shape === "ring") geometry = new THREE.TorusGeometry(x, x * 0.14, 12, 48);
        else if (item.shape === "tube") geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(item.points.map(point => new THREE.Vector3(point.x, point.y, point.z))), Math.max(16, item.points.length * 12), x, 12, false);
        else geometry = new THREE.SphereGeometry(1, 32, 24);
        const material = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.46, metalness: 0.03 });
        const mesh = new THREE.Mesh(geometry, material);
        if (item.shape === "ellipsoid") mesh.scale.set(x, y, z);
        mesh.position.set(item.position.x, item.position.y, item.position.z);
        mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
        mesh.userData.part = item.id; mesh.userData.base = mesh.position.clone();
        group.add(mesh); meshes.push(mesh);
      }
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
      camera.far = Math.max(200, radius * 30);
      const initial = center.clone().add(new THREE.Vector3(0.6, 0.3, 4).normalize().multiplyScalar(radius * 3.5 / Math.min(1, camera.aspect)));
      camera.position.copy(initial); controls.target.copy(center); controls.minDistance = radius * 0.7; controls.maxDistance = radius * 8;
      if (cameraMemory.current?.id === model.id) { camera.position.fromArray(cameraMemory.current.position); controls.target.fromArray(cameraMemory.current.target); }
      controls.update();
      const render = () => { if (!stopped) renderer.render(scene, camera); };
      controls.addEventListener("change", render);
      const resize = () => {
        const width = container.clientWidth; const height = container.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
      };
      const observer = new ResizeObserver(resize); observer.observe(container);
      const highlight = (id: string | null) => {
        for (const mesh of meshes) {
          const chosen = mesh.userData.part === id;
          mesh.material.emissive.set(chosen ? 0x19304d : 0x000000);
          mesh.material.opacity = id && !chosen ? 0.38 : 1;
          mesh.material.transparent = !!id && !chosen;
          mesh.material.depthWrite = !id || chosen;
        }
        render();
      };
      const explode = (value: boolean) => {
        for (const mesh of meshes) {
          mesh.position.copy(mesh.userData.base);
          if (value) {
            const displacement = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).sub(center);
            mesh.position.add(displacement.normalize().multiplyScalar(radius * 0.28));
          }
        }
        render();
      };
      runtime.current = { highlight, explode, reset: () => { camera.position.copy(initial); controls.target.copy(center); controls.update(); render(); } };
      const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
      const pick = (event: PointerEvent) => {
        const bounds = canvas.getBoundingClientRect();
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        ray.setFromCamera(pointer, camera);
        return ray.intersectObjects(meshes, false)[0]?.object.userData.part as string | undefined;
      };
      let start = { x: 0, y: 0 };
      const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; };
      const move = (event: PointerEvent) => { if (event.buttons) return; const id = pick(event); setHovered(id || null); canvas.style.cursor = id ? "pointer" : "grab"; };
      const leave = () => setHovered(null);
      const up = (event: PointerEvent) => { if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) { setSelected(pick(event) || null); setHovered(null); } };
      const lost = (event: Event) => { event.preventDefault(); if (!stopped) setProblem("La vista 3D è stata sospesa dal browser. Puoi continuare a esplorare le parti dall'elenco."); };
      const restored = () => { if (!stopped) { setProblem(""); render(); } };
      canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("pointerup", up);
      canvas.addEventListener("webglcontextlost", lost); canvas.addEventListener("webglcontextrestored", restored);
      resize(); explode(current.current.exploded); highlight(current.current.active); setReady(true);
      cleanup = () => {
        cameraMemory.current = { id: model.id, position: camera.position.toArray(), target: controls.target.toArray() };
        runtime.current = null;
        observer.disconnect(); controls.dispose();
        canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored);
        for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
        renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      };
    })().catch(() => { if (!stopped) setProblem("La vista 3D non è disponibile su questo dispositivo. Nomi e spiegazioni restano esplorabili dall'elenco."); });
    return () => { stopped = true; cleanup(); };
  // Model data is immutable; rebuild only when this model enters the visible viewport.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id, visible]);

  return <section className={styles.model} aria-label={`Esplora ${model.title}`} data-model-id={model.id}>
    <header className={styles.heading}><Box size={18} /><strong>{model.title}</strong><span>3D interattivo</span></header>
    <p className={styles.summary}>{model.summary}</p>
    <div className={styles.viewport} ref={host} role="group" aria-label="Vista 3D">
      {!ready && !problem && <span className={styles.loading} role="status">Preparo il modello 3D…</span>}
      {problem && <p className={styles.fallback} role="status">{problem}</p>}
      {hovered && <span className={styles.hoverLabel} role="tooltip">{part?.name}</span>}
      <div className={styles.controls}><Button variant="outline" size="icon" aria-label="Ripristina vista 3D" disabled={!ready} onClick={() => runtime.current?.reset()}><RotateCcw size={14} /></Button><Button variant="outline" size="sm" aria-pressed={exploded} onClick={() => setExploded(value => !value)}><Expand size={14} /> Separa parti</Button></div>
    </div>
    <p className={styles.hint}>Trascina per ruotare · Pizzica o scorri per ingrandire · Tocca una parte</p>
    <div className={styles.parts} aria-label="Parti del modello">{model.parts.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => { setHovered(null); setSelected(item.id); }} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}><i style={{ background: item.color }} aria-hidden="true" />{item.name}</button>)}</div>
    <div className={styles.detail} role="status" aria-label="Spiegazione della parte" aria-live="polite">{part ? <><strong>{part.name}</strong><p>{part.description}</p></> : <p>Seleziona una parte del modello o un nome nell'elenco per leggerne la spiegazione.</p>}</div>
    <p className={styles.note}>{model.note}</p>
    {model.reference && <a className={styles.source} href={model.reference.url} target="_blank" rel="noreferrer">{model.reference.title}</a>}
  </section>;
}
