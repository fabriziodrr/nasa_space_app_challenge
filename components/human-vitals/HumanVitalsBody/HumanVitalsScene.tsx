import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BodyVariant, VitalZone, VitalZoneId } from "./types";
import { defaultModelPath, femaleModelPath } from "./modelAsset";
import { createFemaleMarkerPositions } from "./femaleMarkerPositions";
import { maleMarkerPositions } from "./maleMarkerPositions";

type HumanVitalsSceneProps = {
  zones: VitalZone[];
  selectedZone: VitalZoneId;
  hoveredZone: VitalZoneId | null;
  setHoveredZone: (zone: VitalZoneId | null) => void;
  onSelect: (zone: VitalZone) => void;
  autoRotate: boolean;
  modelPath: string;
  bodyVariant: BodyVariant;
};

type NormalizedBody = {
  model: THREE.Object3D;
  bounds: THREE.Box3;
};

function cloneBodyModel(scene: THREE.Object3D, bodyVariant: BodyVariant) {
  return bodyVariant === "female" ? cloneSkinnedScene(scene) : scene.clone(true);
}

function createMarkerPositions(bounds: THREE.Box3, bodyVariant: BodyVariant): Record<VitalZoneId, [number, number, number]> {
  return bodyVariant === "male" ? maleMarkerPositions : createFemaleMarkerPositions(bounds);
}

const cameraViews: Record<VitalZoneId, { position: [number, number, number]; target: [number, number, number] }> = {
  overview: { position: [0, 1.2, 4.15], target: [0, 1.08, 0] },
  head: { position: [0, 2.08, 1.48], target: [0, 2.08, 0.1] },
  heart: { position: [-0.04, 1.42, 1.82], target: [-0.06, 1.42, 0.08] },
  lungs: { position: [0, 1.5, 1.9], target: [0, 1.5, 0.08] },
  abdomen: { position: [0, 0.98, 1.85], target: [0, 0.98, 0.08] },
  "left-arm": { position: [-0.42, 1.28, 2.15], target: [-0.44, 1.28, 0.02] },
  "right-arm": { position: [0.42, 1.28, 2.15], target: [0.44, 1.28, 0.02] },
  "left-leg": { position: [-0.12, 0.2, 2.05], target: [-0.14, 0.2, 0.08] },
  "right-leg": { position: [0.12, 0.2, 2.05], target: [0.14, 0.2, 0.08] },
  back: { position: [0, 1.46, -2.15], target: [0, 1.46, 0] },
};

function BodyRig({ zones, selectedZone, hoveredZone, setHoveredZone, onSelect, autoRotate, modelPath, bodyVariant }: HumanVitalsSceneProps) {
  const bodyRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(modelPath, false, true);
  const normalizedBody = useMemo<NormalizedBody>(() => {
    const clone = cloneBodyModel(scene, bodyVariant);
    clone.updateMatrixWorld(true);

    const sourceBounds = new THREE.Box3().setFromObject(clone);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const targetHeight = 2.85;
    const normalization = targetHeight / sourceSize.y;

    clone.scale.setScalar(normalization);
    clone.updateMatrixWorld(true);

    // Recenter from the transformed bounds. This keeps the male GLB centered
    // even though its source scene has a small X/Z offset in local space.
    const normalizedBounds = new THREE.Box3().setFromObject(clone);
    const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());
    clone.position.x -= normalizedCenter.x;
    clone.position.y -= normalizedBounds.min.y;
    clone.position.z -= normalizedCenter.z;
    clone.updateMatrixWorld(true);

    return { model: clone, bounds: new THREE.Box3().setFromObject(clone) };
  }, [scene, bodyVariant]);
  const model = normalizedBody.model;
  const markerPositions = useMemo(() => createMarkerPositions(normalizedBody.bounds, bodyVariant), [normalizedBody.bounds, bodyVariant]);

  const outlineModel = useMemo(() => {
    const clone = cloneBodyModel(model, bodyVariant);
    clone.scale.multiplyScalar(1.006);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.renderOrder = 0;
      object.material = new THREE.MeshBasicMaterial({
        color: "#5bd7ff",
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.1,
      });
    });
    return clone;
  }, [model, bodyVariant]);

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const material = new THREE.MeshStandardMaterial({
        color: "#59656d",
        emissive: "#111a20",
        emissiveIntensity: 0.08,
        metalness: 0.1,
        roughness: 0.52,
        transparent: false,
        opacity: 1,
      });
      object.material = material;
    });
  }, [model]);

  useFrame((state, delta) => {
    if (!bodyRef.current) return;
    const idleOffset = autoRotate && selectedZone === "overview" ? state.clock.elapsedTime * 0.08 : 0;
    bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, 0, 5, delta);
    bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, 0, 5, delta);
    bodyRef.current.rotation.y = THREE.MathUtils.damp(bodyRef.current.rotation.y, idleOffset, 5, delta);
  });

  return (
    <group ref={bodyRef} position={[0, -0.34, 0]}>
      <primitive object={outlineModel} />
      <primitive object={model} />
      {zones.filter((zone) => zone.id !== "overview").map((zone) => (
        <ZoneMarker
          key={zone.id}
          zone={zone}
          selected={zone.id === selectedZone}
          hovered={zone.id === hoveredZone}
          onHover={setHoveredZone}
           onSelect={onSelect}
            position={markerPositions[zone.id]}
         />
      ))}
    </group>
  );
}

function ZoneMarker({ zone, selected, hovered, onHover, onSelect, position }: {
  zone: VitalZone;
  selected: boolean;
  hovered: boolean;
  onHover: (zone: VitalZoneId | null) => void;
  onSelect: (zone: VitalZone) => void;
  position: [number, number, number];
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const visible = selected || hovered;
  const markerColor = visible ? zone.color : "#79a8bc";

  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const pulse = selected ? 1 + Math.sin(clock.elapsedTime * 4) * 0.1 : 1;
    pulseRef.current.scale.setScalar((selected ? 1.12 : hovered ? 1.04 : 0.82) * pulse);
  });

  return (
    <group position={position}>
      <mesh
        ref={pulseRef}
        onPointerOver={(event) => { event.stopPropagation(); onHover(zone.id); }}
        onPointerOut={(event) => { event.stopPropagation(); onHover(null); }}
        onClick={(event) => { event.stopPropagation(); onSelect(zone); }}
      >
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh scale={selected ? 1.12 : hovered ? 1.04 : 0.82} renderOrder={3}>
        <sphereGeometry args={[selected ? 0.052 : hovered ? 0.046 : 0.028, 18, 14]} />
        <meshBasicMaterial color={markerColor} transparent opacity={selected ? 1 : hovered ? 0.92 : 0.58} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={selected ? 1.12 : hovered ? 0.95 : 0.72} renderOrder={2}>
        <ringGeometry args={[0.064, 0.071, 32]} />
        <meshBasicMaterial color={markerColor} transparent opacity={selected ? 0.9 : hovered ? 0.62 : 0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CameraFocus({ selectedZone, controls }: { selectedZone: VitalZoneId; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const isFocusing = useRef(true);
  const view = cameraViews[selectedZone];
  const desiredPosition = useMemo(() => new THREE.Vector3(...view.position), [view]);
  const desiredTarget = useMemo(() => new THREE.Vector3(...view.target), [view]);

  useEffect(() => {
    isFocusing.current = true;
  }, [selectedZone]);

  useFrame((_, delta) => {
    if (!isFocusing.current || !controls.current) return;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredPosition.x, 5.5, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredPosition.y, 5.5, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredPosition.z, 5.5, delta);
    controls.current.target.x = THREE.MathUtils.damp(controls.current.target.x, desiredTarget.x, 5.5, delta);
    controls.current.target.y = THREE.MathUtils.damp(controls.current.target.y, desiredTarget.y, 5.5, delta);
    controls.current.target.z = THREE.MathUtils.damp(controls.current.target.z, desiredTarget.z, 5.5, delta);
    controls.current.update();

    if (camera.position.distanceToSquared(desiredPosition) < 0.001 && controls.current.target.distanceToSquared(desiredTarget) < 0.001) {
      isFocusing.current = false;
    }
  });

  return null;
}

function SceneContents(props: HumanVitalsSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  return (
    <>
      <color attach="background" args={["#dfe3e6"]} />
      <fog attach="fog" args={["#dfe3e6", 5.2, 9]} />
      <ambientLight intensity={1.5} color="#b8e6f6" />
      <directionalLight position={[-3, 5, 4]} intensity={3.3} color="#ffffff" castShadow />
      <pointLight position={[2.5, 1.8, 2.2]} intensity={4.2} distance={6} color="#43c5ff" />
      <pointLight position={[-2.4, 0.8, -1.5]} intensity={2.2} distance={5} color="#6b76ff" />
      <Suspense fallback={null}>
            <BodyRig {...props} />
      </Suspense>
      <CameraFocus selectedZone={props.selectedZone} controls={controls} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.37, 0]}>
        <ringGeometry args={[0.72, 0.75, 64]} />
        <meshBasicMaterial color="#2cafe2" transparent opacity={0.56} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.36, 0]}>
        <ringGeometry args={[1.05, 1.055, 64]} />
        <meshBasicMaterial color="#2cafe2" transparent opacity={0.2} />
      </mesh>
      <OrbitControls ref={controls} enablePan={false} enableZoom minDistance={1.25} maxDistance={5.4} minPolarAngle={Math.PI / 2 - 0.35} maxPolarAngle={Math.PI / 2 + 0.35} target={[0, 1.08, 0]} />
    </>
  );
}

export function HumanVitalsScene(props: HumanVitalsSceneProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.2, 4.15], fov: 38 }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearColor("#000000", 0)}>
      <SceneContents {...props} />
    </Canvas>
  );
}

useGLTF.preload(defaultModelPath, false, true);
useGLTF.preload(femaleModelPath, false, true);
