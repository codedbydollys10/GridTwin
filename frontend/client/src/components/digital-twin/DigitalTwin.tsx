import { CameraControls, Environment, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { CameraControls as CameraControlsImpl } from "@react-three/drei";
import * as THREE from "three";
import type { ElectricalResults } from "@/lib/api";
import { GLBAsset } from "./GLBAsset";
import { GridBuses, type BusVisual } from "./GridBuses";
import { GridLines, type LineVisual } from "./GridLines";

type DigitalTwinProps = {
  results?: ElectricalResults;
  violations: { component: string; severity?: "warning" | "critical" }[];
  direction: "import" | "export";
  selectedComponent: string;
  onSelectComponent: (id: string) => void;
  resetSignal?: number;
};

const buses: BusVisual[] = [
  { id: "bus_01", position: [-3.1, 0, 0] },
  { id: "bus_02", position: [-1.85, 0, 0] },
  { id: "bus_03", position: [-0.6, 0, 0] },
  { id: "bus_04", position: [0.65, 0, 0] },
  { id: "bus_05", position: [1.9, 0, 0] },
  { id: "bus_06", position: [3.15, 0, 0] },
];
const lines: LineVisual[] = buses.slice(0, -1).map((bus, index) => ({ id: `line_0${index + 1}`, from: bus.id, to: buses[index + 1].id }));

function AssetLabel({ id, value, color = "#d8eee8", height = 0.82 }: { id: string; value?: string; color?: string; height?: number }) {
  return <group position={[0, height, 0]}><Text fontSize={0.072} color={color} anchorX="center" outlineWidth={0.004} outlineColor="#091722">{id.toUpperCase()}</Text>{value && <Text position={[0, -0.11, 0]} fontSize={0.055} color={color} anchorX="center" outlineWidth={0.003} outlineColor="#091722">{value}</Text>}</group>;
}

const focusPositions: Record<string, [number, number, number]> = {
  grid_01: [-5.7, 0, 0], trafo_01: [-4.15, 0, 0], bus_01: [-3.1, 0, 0], bus_02: [-1.85, 0, 0], bus_03: [-0.6, 0, 0], bus_04: [0.65, 0, 0], bus_05: [1.9, 0, 0], bus_06: [3.15, 0, 0],
  solar_01: [-0.6, 0, 1.15], solar_02: [1.9, 0, 1.15], load_01: [-1.85, 0, -1.15], load_02: [0.65, 0, -1.15], load_03: [3.15, 0, -1.15], battery_01: [0.65, 0, 1.15],
  line_01: [-2.475, 0, 0], line_02: [-1.225, 0, 0], line_03: [0.025, 0, 0], line_04: [1.275, 0, 0], line_05: [2.525, 0, 0],
};

function CameraRig({ controls, selectedComponent, resetSignal }: { controls: React.RefObject<CameraControlsImpl | null>; selectedComponent: string; resetSignal?: number }) {
  useEffect(() => {
    const camera = controls.current;
    if (!camera) return;
    if (!selectedComponent) {
      camera.setLookAt(0, 4.3, 8.6, -0.7, 0, 0, true);
      return;
    }
    const [x, y, z] = focusPositions[selectedComponent] ?? [0, 0, 0];
    camera.setLookAt(x + 2.25, y + 1.75, z + 3.35, x, y + 0.12, z, true);
  }, [controls, selectedComponent, resetSignal]);
  return null;
}

/** Branch conductors are procedural geometry and inherit their connected component ID. */
function AssetLink({ componentId, from, to }: { componentId: string; from: [number, number, number]; to: [number, number, number] }) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const midpoint = start.clone().lerp(end, 0.5);
  const length = start.distanceTo(end);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return <mesh name={componentId} userData={{ componentId }} position={midpoint} quaternion={rotation}>
    <cylinderGeometry args={[0.014, 0.014, length, 8]} />
    <meshStandardMaterial color="#426a70" emissive="#2b5557" emissiveIntensity={0.45} />
  </mesh>;
}

function Scene({ results, violations, direction, selectedComponent, onSelectComponent }: DigitalTwinProps) {
  const violationStatus = useMemo(
    () => new Map(violations.map(violation => [violation.component, violation.severity ?? "critical"])),
    [violations]
  );
  const voltages = useMemo(() => new Map(results?.buses.map(bus => [bus.id, bus.voltage_pu]) ?? []), [results]);
  const loadings = useMemo(() => new Map(results?.lines.map(line => [line.id, { loading: line.loading_percent, pFrom: line.p_from_mw }]) ?? []), [results]);
  const transformer = results?.transformers.find(item => item.id === "trafo_01");
  const battery = results?.storage.find(item => item.id === "battery_01");
  const solar = new Map(results?.generators.map(item => [item.id, item.power_kw]) ?? []);
  const loads = new Map(results?.loads.map(item => [item.id, item.power_kw]) ?? []);
  const assetColor = (id: string) => violationStatus.get(id) === "critical" ? "#ef8b77" : violationStatus.get(id) === "warning" ? "#e3b46c" : "#d8eee8";
  const selectable = (id: string) => ({ onSelect: onSelectComponent, selected: selectedComponent === id });

  return <>
    <color attach="background" args={["#0b1822"]} />
    <ambientLight intensity={0.65} />
    <hemisphereLight args={["#9ee8ff", "#071117", 1.25]} />
    <directionalLight position={[4, 7, 5]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} />
    <pointLight position={[-3.5, 2.8, 2]} color="#4bd8bf" intensity={12} distance={7} />
    <pointLight position={[2.5, 1.8, -2]} color="#5b8de3" intensity={5} distance={6} />
    <gridHelper args={[11, 22, "#285560", "#142b34"]} position={[0, -0.015, 0]} />
    <GridLines buses={buses} lines={lines} loadings={loadings} violationStatus={violationStatus} selectedId={selectedComponent} direction={direction} hasResults={Boolean(results)} onSelect={onSelectComponent} />
    <GridBuses buses={buses} voltages={voltages} violationStatus={violationStatus} selectedId={selectedComponent} onSelect={onSelectComponent} />
    <AssetLink componentId="grid_01" from={[-5.7, 0, 0]} to={[-4.15, 0, 0]} />
    <AssetLink componentId="trafo_01" from={[-4.15, 0, 0]} to={[-3.1, 0, 0]} />
    <AssetLink componentId="solar_01" from={[-0.6, 0, 0]} to={[-0.6, 0, 1.15]} />
    <AssetLink componentId="solar_02" from={[1.9, 0, 0]} to={[1.9, 0, 1.15]} />
    <AssetLink componentId="load_01" from={[-1.85, 0, 0]} to={[-1.85, 0, -1.15]} />
    <AssetLink componentId="load_02" from={[0.65, 0, 0]} to={[0.65, 0, -1.15]} />
    <AssetLink componentId="load_03" from={[3.15, 0, 0]} to={[3.15, 0, -1.15]} />
    <AssetLink componentId="battery_01" from={[0.65, 0, 0]} to={[0.65, 0, 1.15]} />

    <group position={[-5.7, 0, 0]} name="grid_01" userData={{ componentId: "grid_01" }}>
      <GLBAsset componentId="grid_01" url="/models/substation.glb" scale={1.05} {...selectable("grid_01")} />
      <AssetLabel id="grid_01" value={direction === "export" ? "EXPORT" : "IMPORT"} color={assetColor("grid_01")} height={1.16} />
    </group>
    <group position={[-4.15, 0, 0]} name="trafo_01" userData={{ componentId: "trafo_01" }}>
      <GLBAsset componentId="trafo_01" url="/models/transformer.glb" scale={0.82} {...selectable("trafo_01")} />
      <AssetLabel id="trafo_01" value={transformer ? `${transformer.loading_percent.toFixed(1)}%` : undefined} color={assetColor("trafo_01")} height={0.93} />
    </group>
    <AssetBranch id="solar_01" position={[-0.6, 0, 1.15]} url="/models/solar_farm.glb" value={solar.get("solar_01")} unit="kW" selected={selectedComponent === "solar_01"} color={assetColor("solar_01")} onSelect={onSelectComponent} scale={0.95} />
    <AssetBranch id="solar_02" position={[1.9, 0, 1.15]} url="/models/solar_farm.glb" value={solar.get("solar_02")} unit="kW" selected={selectedComponent === "solar_02"} color={assetColor("solar_02")} onSelect={onSelectComponent} scale={0.95} />
    <AssetBranch id="load_01" position={[-1.85, 0, -1.15]} url="/models/house.glb" value={loads.get("load_01")} unit="kW" selected={selectedComponent === "load_01"} color={assetColor("load_01")} onSelect={onSelectComponent} scale={0.65} />
    <AssetBranch id="load_02" position={[0.65, 0, -1.15]} url="/models/house.glb" value={loads.get("load_02")} unit="kW" selected={selectedComponent === "load_02"} color={assetColor("load_02")} onSelect={onSelectComponent} scale={0.65} />
    <AssetBranch id="load_03" position={[3.15, 0, -1.15]} url="/models/house.glb" value={loads.get("load_03")} unit="kW" selected={selectedComponent === "load_03"} color={assetColor("load_03")} onSelect={onSelectComponent} scale={0.65} />
    <AssetBranch id="battery_01" position={[0.65, 0, 1.15]} url="/models/battery.glb" value={battery?.soc_percent} unit="% SOC" selected={selectedComponent === "battery_01"} color={assetColor("battery_01")} onSelect={onSelectComponent} scale={0.78} />
    <Environment preset="city" />
  </>;
}

function AssetBranch({ id, position, url, value, unit, selected, color, onSelect, scale }: { id: string; position: [number, number, number]; url: string; value?: number; unit: string; selected: boolean; color: string; onSelect: (id: string) => void; scale: number }) {
  return <group position={position} name={id} userData={{ componentId: id }}>
    <GLBAsset componentId={id} url={url} scale={scale} selected={selected} onSelect={onSelect} />
    <AssetLabel id={id} value={value === undefined ? undefined : `${value.toFixed(1)} ${unit}`} color={color} />
  </group>;
}

export function DigitalTwin(props: DigitalTwinProps) {
  const controls = useRef<CameraControlsImpl>(null);
  return <div className="digital-twin-canvas" aria-label="Interactive 3D digital twin of the radial distribution feeder">
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 4.8, 10], fov: 34 }} onPointerMissed={() => props.onSelectComponent("")}>
      <Suspense fallback={null}>
        <Scene {...props} />
        <CameraControls ref={controls} makeDefault smoothTime={0.55} draggingSmoothTime={0.12} minDistance={2.8} maxDistance={12} minPolarAngle={Math.PI / 5.4} maxPolarAngle={Math.PI / 2.08} />
        <CameraRig controls={controls} selectedComponent={props.selectedComponent} resetSignal={props.resetSignal} />
      </Suspense>
    </Canvas>
  </div>;
}

const previewAssets: Record<string, { url: string; scale: number }> = {
  grid_01: { url: "/models/substation.glb", scale: 1.4 },
  trafo_01: { url: "/models/transformer.glb", scale: 1.25 },
  solar_01: { url: "/models/solar_farm.glb", scale: 1.45 }, solar_02: { url: "/models/solar_farm.glb", scale: 1.45 },
  load_01: { url: "/models/house.glb", scale: 1.15 }, load_02: { url: "/models/house.glb", scale: 1.15 }, load_03: { url: "/models/house.glb", scale: 1.15 },
  battery_01: { url: "/models/battery.glb", scale: 1.25 },
};

/** Compact live 3D preview for the existing component inspector. */
export function SelectedComponentPreview({ id }: { id: string }) {
  const asset = previewAssets[id];
  return <div className="selected-model-preview" aria-label={`${id} 3D preview`}>
    <Canvas dpr={[1, 1.5]} camera={{ position: [2.5, 1.9, 3.4], fov: 38 }}>
      <color attach="background" args={["#0b1922"]} />
      <ambientLight intensity={1.25} /><directionalLight position={[3, 4, 3]} intensity={2.5} /><pointLight position={[-2, 1, 2]} color="#4bd8bf" intensity={5} />
      <Suspense fallback={null}>
        {asset ? <GLBAsset componentId={id} url={asset.url} scale={asset.scale} onSelect={() => undefined} selected /> : id.startsWith("bus") ? <mesh><sphereGeometry args={[0.48, 32, 32]} /><meshStandardMaterial color="#4bd8bf" emissive="#4bd8bf" emissiveIntensity={0.65} /></mesh> : <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.09, 0.09, 1.9, 12]} /><meshStandardMaterial color="#4bd8bf" emissive="#4bd8bf" emissiveIntensity={0.45} /></mesh>}
        <Environment preset="city" />
        <CameraControls makeDefault minDistance={2.5} maxDistance={5.5} />
      </Suspense>
    </Canvas>
  </div>;
}
