import { useMemo } from "react";
import * as THREE from "three";

type ProceduralHumanModelProps = {
  color?: string;
};

function Limb({ start, end, radius, color }: { start: THREE.Vector3; end: THREE.Vector3; radius: number; color: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const direction = end.clone().sub(start);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    return { position: midpoint, quaternion: orientation, length: direction.length() };
  }, [end, start]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
      <capsuleGeometry args={[radius, length - radius * 2, 8, 16]} />
      <meshStandardMaterial color={color} roughness={0.52} metalness={0.22} />
    </mesh>
  );
}

export function ProceduralHumanModel({ color = "#d7e3eb" }: ProceduralHumanModelProps) {
  const skin = color;
  const shadow = "#aebdca";
  const joint = "#8ad9ef";

  return (
    <group>
      <mesh position={[0, 2.62, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.31, 32, 24]} />
        <meshStandardMaterial color={skin} roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 2.29, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.14, 0.17, 0.26, 24]} />
        <meshStandardMaterial color={shadow} roughness={0.5} metalness={0.18} />
      </mesh>
      <mesh position={[0, 1.72, 0]} scale={[0.68, 0.82, 0.4]} castShadow receiveShadow>
        <capsuleGeometry args={[0.62, 0.72, 8, 24]} />
        <meshStandardMaterial color={skin} roughness={0.48} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.04, 0]} scale={[0.49, 0.34, 0.33]} castShadow receiveShadow>
        <capsuleGeometry args={[0.5, 0.42, 8, 20]} />
        <meshStandardMaterial color={shadow} roughness={0.5} metalness={0.18} />
      </mesh>

      <Limb start={new THREE.Vector3(-0.53, 2.05, 0)} end={new THREE.Vector3(-0.87, 1.45, 0)} radius={0.17} color={skin} />
      <Limb start={new THREE.Vector3(-0.87, 1.42, 0)} end={new THREE.Vector3(-0.94, 0.84, 0.02)} radius={0.15} color={shadow} />
      <Limb start={new THREE.Vector3(0.53, 2.05, 0)} end={new THREE.Vector3(0.87, 1.45, 0)} radius={0.17} color={skin} />
      <Limb start={new THREE.Vector3(0.87, 1.42, 0)} end={new THREE.Vector3(0.94, 0.84, 0.02)} radius={0.15} color={shadow} />

      <Limb start={new THREE.Vector3(-0.28, 0.92, 0)} end={new THREE.Vector3(-0.33, 0.22, 0.02)} radius={0.22} color={skin} />
      <Limb start={new THREE.Vector3(-0.33, 0.18, 0.02)} end={new THREE.Vector3(-0.36, -0.52, 0.04)} radius={0.17} color={shadow} />
      <Limb start={new THREE.Vector3(0.28, 0.92, 0)} end={new THREE.Vector3(0.33, 0.22, 0.02)} radius={0.22} color={skin} />
      <Limb start={new THREE.Vector3(0.33, 0.18, 0.02)} end={new THREE.Vector3(0.36, -0.52, 0.04)} radius={0.17} color={shadow} />

      {[
        [-0.87, 1.43, 0],
        [0.87, 1.43, 0],
        [-0.33, 0.2, 0.02],
        [0.33, 0.2, 0.02],
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} castShadow>
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshStandardMaterial color={joint} emissive={joint} emissiveIntensity={0.2} roughness={0.3} />
        </mesh>
      ))}

      <mesh position={[-0.38, -0.68, 0.04]} scale={[1, 0.42, 1.35]} castShadow>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color={shadow} roughness={0.52} metalness={0.18} />
      </mesh>
      <mesh position={[0.38, -0.68, 0.04]} scale={[1, 0.42, 1.35]} castShadow>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color={shadow} roughness={0.52} metalness={0.18} />
      </mesh>
    </group>
  );
}
