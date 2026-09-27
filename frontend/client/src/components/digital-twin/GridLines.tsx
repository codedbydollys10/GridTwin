import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { BusVisual } from "./GridBuses";

export type LineVisual = { id: string; from: string; to: string };
type GridLinesProps = {
  buses: BusVisual[];
  lines: LineVisual[];
  loadings: Map<string, { loading: number; pFrom: number }>;
  violationStatus: Map<string, "warning" | "critical">;
  selectedId: string;
  direction: "import" | "export";
  hasResults: boolean;
  onSelect: (id: string) => void;
};

function lineColor(status: "warning" | "critical" | undefined) {
  if (status === "critical") return "#ef8b77";
  if (status === "warning") return "#e3b46c";
  return "#4bd8bf";
}

function FlowSegments({ from, to, color, reverse }: { from: THREE.Vector3; to: THREE.Vector3; color: string; reverse: boolean }) {
  const group = useRef<THREE.Group>(null);
  const distance = from.distanceTo(to);
  const midpoint = from.clone().lerp(to, 0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
  const dashSpacing = 0.22;
  const dashes = Array.from({ length: Math.ceil(distance / dashSpacing) + 3 }, (_, index) => index);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.z = (clock.getElapsedTime() * (reverse ? -1 : 1) * 0.42) % dashSpacing;
  });
  return <group position={midpoint} quaternion={rotation}><group ref={group} position={[0, 0, -distance / 2 - dashSpacing]}>{dashes.map(index => <mesh key={index} position={[0, 0, index * dashSpacing]}><boxGeometry args={[0.028, 0.028, 0.115]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} toneMapped={false} /></mesh>)}</group></group>;
}

export function GridLines({ buses, lines, loadings, violationStatus, selectedId, direction, hasResults, onSelect }: GridLinesProps) {
  const positions = useMemo(() => new Map(buses.map(bus => [bus.id, new THREE.Vector3(...bus.position)])), [buses]);
  return lines.map(line => {
    const from = positions.get(line.from)!;
    const to = positions.get(line.to)!;
    const result = loadings.get(line.id);
    const color = lineColor(violationStatus.get(line.id));
    const midpoint = from.clone().lerp(to, 0.5);
    const length = from.distanceTo(to);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return <group key={line.id} name={line.id} userData={{ componentId: line.id }} onClick={event => { event.stopPropagation(); onSelect(line.id); }}>
      {hasResults ? <FlowSegments from={from} to={to} color={color} reverse={result ? result.pFrom < 0 : direction === "export"} /> : <mesh position={midpoint} quaternion={rotation}><cylinderGeometry args={[0.012, 0.012, length, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} /></mesh>}
      <Text position={[midpoint.x, midpoint.y + 0.13, midpoint.z]} fontSize={0.052} color={color} anchorX="center" outlineWidth={0.003} outlineColor="#091722">{result ? `${line.id.toUpperCase()}  ${result.loading.toFixed(0)}%` : line.id.toUpperCase()}</Text>
    </group>;
  });
}
