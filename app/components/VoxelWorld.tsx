"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import styles from "./VoxelWorld.module.css";
import { generateTerrain, keyFromPosition, type VoxelRegistryEntry } from "../../lib/voxelWorld";

const MOVE_SPEED = 12;
const SPRINT_MULTIPLIER = 2.1;
const GRAVITY = 30;
const JUMP_FORCE = 12;
const TERMINAL_VELOCITY = 48;

const clock = new THREE.Clock();

export default function VoxelWorld() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<PointerLockControls>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const animationRef = useRef<number>();
  const velocityRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const keysRef = useRef(new Set<string>());
  const voxelsRef = useRef<Map<string, VoxelRegistryEntry>>(new Map());
  const [locked, setLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [blockCount, setBlockCount] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const lastFrameRef = useRef(performance.now());
  const raycasterRef = useRef(new THREE.Raycaster());
  const contextMenuHandlerRef = useRef<(event: MouseEvent) => void>();

  const interactWithVoxel = useCallback(
    (mode: "add" | "remove") => {
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      const raycaster = raycasterRef.current;
      if (!camera || !scene) return;

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const intersects = raycaster.intersectObjects(scene.children, false);

      const intersect = intersects.find((hit) => hit.object.userData?.isVoxel);
      if (!intersect) return;

      const { face, object } = intersect;
      if (mode === "remove") {
        const { x, y, z } = object.userData.position;
        const key = keyFromPosition(x, y, z);
        if (y <= 0) return;
        scene.remove(object);
        voxelsRef.current.delete(key);
        setBlockCount(voxelsRef.current.size);
        return;
      }

      if (!face) return;
      const normal = face.normal.clone();
      const voxel = object.userData.position as THREE.Vector3;
      const targetPosition = voxel.clone().add(normal);
      const key = keyFromPosition(targetPosition.x, targetPosition.y, targetPosition.z);
      if (voxelsRef.current.has(key)) return;

      const entry = voxelsRef.current.get(keyFromPosition(voxel.x, voxel.y, voxel.z));
      const material = entry?.material ?? new THREE.MeshStandardMaterial({ color: 0x9ccf63 });
      const geometry = entry?.geometry ?? new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { isVoxel: true, position: mesh.position.clone(), materialKey: entry?.materialKey ?? "grass" };
      scene.add(mesh);
      voxelsRef.current.set(key, {
        mesh,
        geometry,
        material: mesh.material as THREE.Material,
        materialKey: entry?.materialKey ?? "grass",
      });
      setBlockCount(voxelsRef.current.size);
    },
    []
  );

  const updateMovement = useCallback((delta: number) => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const keys = keysRef.current;
    const velocity = velocityRef.current;
    const direction = directionRef.current;

    direction.set(0, 0, 0);

    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const moveMultiplier = sprint ? SPRINT_MULTIPLIER : 1;
    const speed = MOVE_SPEED * moveMultiplier;

    if (keys.has("KeyW")) direction.z -= 1;
    if (keys.has("KeyS")) direction.z += 1;
    if (keys.has("KeyA")) direction.x -= 1;
    if (keys.has("KeyD")) direction.x += 1;

    direction.normalize();

    if (direction.lengthSq() > 0) {
      velocity.x -= direction.x * speed * delta;
      velocity.z -= direction.z * speed * delta;
    }

    velocity.y = Math.max(velocity.y - GRAVITY * delta, -TERMINAL_VELOCITY);

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    camera.position.y += velocity.y * delta;

    if (camera.position.y < 3) {
      velocity.y = 0;
      camera.position.y = 3;
    }

    velocity.x -= velocity.x * 8 * delta;
    velocity.z -= velocity.z * 8 * delta;
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || rendererRef.current) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.id = "voxel-canvas";

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x0b1a33, 0.012);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 500);
    camera.position.set(0, 18, 24);

    const controls = new PointerLockControls(camera, renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xcfe3ff, 0x4c3422, 0.55);
    hemiLight.position.set(0, 150, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xf5f8ff, 0.85);
    dirLight.position.set(-80, 120, 80);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x13304b, shininess: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    scene.add(ground);

    const registry = generateTerrain(scene);
    voxelsRef.current = registry.voxelMap;
    setBlockCount(registry.voxelMap.size);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      setPromptVisible(!isLocked);
      if (!isLocked) {
        keysRef.current.clear();
        velocityRef.current.set(0, 0, 0);
      }
    };

    document.addEventListener("pointerlockchange", onPointerLockChange);

    const onResize = () => {
      const container = mountRef.current;
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth, clientHeight } = container;
      rendererRef.current.setSize(clientWidth, clientHeight);
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current.add(event.code);
      if (event.code === "Space" && Math.abs(velocityRef.current.y) < 0.05) {
        velocityRef.current.y = JUMP_FORCE;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
      }
      event.preventDefault();
      interactWithVoxel(event.button === 2 ? "add" : "remove");
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    const onContextMenu = (event: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        event.preventDefault();
      }
    };
    contextMenuHandlerRef.current = onContextMenu;
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);

      updateMovement(delta);
      renderer.render(scene, camera);

      const now = performance.now();
      const elapsed = now - lastFrameRef.current;
      if (elapsed >= 250) {
        const pos = camera.position;
        setFps(Math.round(1 / delta));
        setPosition({ x: pos.x, y: pos.y, z: pos.z });
        lastFrameRef.current = now;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    clock.start();
    animate();

    return () => {
      cancelAnimationFrame(animationRef.current ?? 0);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      if (contextMenuHandlerRef.current) {
        document.removeEventListener("contextmenu", contextMenuHandlerRef.current);
        contextMenuHandlerRef.current = undefined;
      }

      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object) => {
        if ((object as THREE.Mesh).geometry) {
          (object as THREE.Mesh).geometry.dispose();
        }
        if ((object as THREE.Mesh).material) {
          const material = (object as THREE.Mesh).material;
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material.dispose();
          }
        }
      });
    };
  }, [interactWithVoxel, updateMovement]);

  return (
    <div className={styles.wrapper}>
      <div ref={mountRef} className={styles.canvasContainer} />
      {promptVisible && (
        <div className="pointer-lock-prompt">
          <h2>VoxelCraft</h2>
          <p>Click to enter the world</p>
          <button className="pointer-lock-button" onClick={() => rendererRef.current?.domElement.requestPointerLock()}>
            Start Exploring
          </button>
        </div>
      )}
      <div className="overlay">
        <h1>VoxelCraft</h1>
        <p>A lightweight Minecraft-inspired sandbox</p>
      </div>
      <div className="stats">
        <div>FPS: {fps}</div>
        <div>
          Position: {position.x.toFixed(1)}, {position.y.toFixed(1)}, {position.z.toFixed(1)}
        </div>
        <div>Blocks: {blockCount}</div>
      </div>
      <div className="controls">
        <div>WASD: Move</div>
        <div>Space: Jump</div>
        <div>Shift: Sprint</div>
        <div>Left Click: Remove block</div>
        <div>Right Click: Place block</div>
        <div>Pointer Lock: {locked ? "Captured (Esc to release)" : "Click canvas"}</div>
      </div>
    </div>
  );
}
