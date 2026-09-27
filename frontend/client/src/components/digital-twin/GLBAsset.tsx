import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

type GLBAssetProps = {
  componentId: string;
  url: string;
  selected?: boolean;
  onSelect: (id: string) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Longest model dimension in scene units; source GLB units are normalized. */
  scale?: number;
};

/** A reusable, independently cloned GLB instance with a stable network ID. */
export function GLBAsset({
  componentId,
  url,
  selected = false,
  onSelect,
  position,
  rotation,
  scale,
}: GLBAssetProps) {
  const { scene } = useGLTF(url);
  const { model, offset, normalizedScale } = useMemo(() => {
    const cloned = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(cloned);
    const size = bounds.getSize(new THREE.Vector3());
    const longestSide = Math.max(size.x, size.y, size.z) || 1;
    const factor = (scale ?? 1) / longestSide;
    const center = bounds.getCenter(new THREE.Vector3());
    return {
      model: cloned,
      normalizedScale: factor,
      // Centre on X/Z and rest the asset on the feeder plane regardless of GLB units.
      offset: new THREE.Vector3(-center.x * factor, -bounds.min.y * factor, -center.z * factor),
    };
  }, [scene, scale]);

  return (
    <group
      position={position}
      rotation={rotation}
      scale={selected ? 1.12 : 1}
      name={componentId}
      userData={{ componentId }}
      onClick={event => {
        event.stopPropagation();
        onSelect(componentId);
      }}
    >
      <primitive object={model} position={offset} scale={normalizedScale} />
      {selected && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[(scale ?? 1) * 0.57, (scale ?? 1) * 0.64, 40]} />
          <meshBasicMaterial color="#9fffe9" transparent opacity={0.82} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload("/models/house.glb");
useGLTF.preload("/models/transformer.glb");
useGLTF.preload("/models/solar_farm.glb");
useGLTF.preload("/models/battery.glb");
useGLTF.preload("/models/substation.glb");
