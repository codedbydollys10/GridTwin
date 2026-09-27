import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";

export type BusVisual = { id: string; position: [number, number, number] };

type GridBusesProps = {
  buses: BusVisual[];
  voltages: Map<string, number>;
  violationStatus: Map<string, "warning" | "critical">;
  selectedId: string;
  onSelect: (id: string) => void;
};

function busColor(status: "warning" | "critical" | undefined) {
  if (status === "critical") return "#ef8b77";
  if (status === "warning") return "#e3b46c";
  return "#4bd8bf";
}

export function GridBuses({ buses, voltages, violationStatus, selectedId, onSelect }: GridBusesProps) {
  const select = (event: ThreeEvent<MouseEvent>, id: string) => {
    event.stopPropagation();
    onSelect(id);
  };
  return buses.map(bus => {
    const voltage = voltages.get(bus.id);
    const color = busColor(violationStatus.get(bus.id));
    return (
      <group key={bus.id} name={bus.id} position={bus.position} userData={{ componentId: bus.id }} onClick={event => select(event, bus.id)}>
        <mesh castShadow>
          <sphereGeometry args={[0.045, 20, 20]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selectedId === bus.id ? 1.4 : 0.45} />
        </mesh>
        {selectedId === bus.id && <mesh scale={2.1}><sphereGeometry args={[0.045, 20, 20]} /><meshBasicMaterial color="#d9fff5" wireframe transparent opacity={0.75} /></mesh>}
        <Text position={[0, 0.25, 0]} fontSize={0.06} color="#d8eee8" anchorX="center" outlineWidth={0.004} outlineColor="#091722">{bus.id.toUpperCase()}</Text>
        {voltage !== undefined && <Text position={[0, 0.16, 0]} fontSize={0.048} color={color} anchorX="center" outlineWidth={0.003} outlineColor="#091722">{`${voltage.toFixed(3)} pu`}</Text>}
      </group>
    );
  });
}
