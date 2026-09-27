import threading
#importing the necessary libraries for handling file paths, creating a FastAPI application, handling file uploads, and managing CORS
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .services.csv_service import align_profiles, read_csv_file
from .services.weather import get_weather
from .simulation.results import extract_results
from .simulation.violations import detect_violations

app = FastAPI(
    title="GridTwin API",
    description="Physics-based renewable distribution grid digital twin",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = {
    "solar": None, "load": None, "profile": None, "net": None,
    "index": -1, "selected_index": -1, "history": [], "last": None,
    "total_loss_energy_kwh": 0.0, "line_loss_energy_kwh": {},
}
simulation_lock = threading.RLock()

def _simulation_dependencies():
    """Load Pandapower only for routes that actually execute a power flow.

    Uploads and weather must remain available when a local SciPy/Pandapower
    installation is unavailable or blocked by workstation policy.
    """
    try:
        from .simulation.network import create_grid
        from .simulation.timestep import run_timestep
        from .simulation.whatif import run_what_if
        return create_grid, run_timestep, run_what_if
    except (ImportError, OSError) as exc:
        raise HTTPException(
            503,
            "Simulation engine is unavailable. Verify the Pandapower/SciPy installation and local application-control policy.",
        ) from exc

def _require_profile():
    if state["profile"] is None:
        raise HTTPException(409, "Upload matching solar and load CSV profiles first.")


def _load_demo_profile():
    demo_dir = Path(__file__).resolve().parent.parent / "data" / "demo"
    solar_path = demo_dir / "solar.csv"
    load_path = demo_dir / "load.csv"
    if not solar_path.exists() or not load_path.exists():
        raise HTTPException(404, "Demo solar/load CSV files were not found.")

    state["solar"] = read_csv_file(solar_path.read_bytes(), "solar")
    state["load"] = read_csv_file(load_path.read_bytes(), "load")
    state["profile"] = align_profiles(state["solar"], state["load"])
    state.update(net=None, index=-1, selected_index=-1, history=[], last=None, total_loss_energy_kwh=0.0, line_loss_energy_kwh={})
    return state["profile"]


def _timestep_duration_hours(index):
    """Return the actual interval represented by this profile point."""
    profile = state["profile"]
    if len(profile) < 2:
        return 0.0
    if index < len(profile) - 1:
        interval = profile.iloc[index + 1]["Time"] - profile.iloc[index]["Time"]
    else:
        # Profiles have no closing timestamp; carry the preceding real interval.
        interval = profile.iloc[index]["Time"] - profile.iloc[index - 1]["Time"]
    return max(0.0, interval.total_seconds() / 3600)


def _violation_history(violations):
    """Summarize the existing violation detector output without new limits."""
    by_type = {
        "LOW_VOLTAGE": [], "HIGH_VOLTAGE": [],
        "LINE_OVERLOAD": [], "TRANSFORMER_OVERLOAD": [],
    }
    for violation in violations:
        if violation["type"] in by_type:
            by_type[violation["type"]].append(violation["id"])
    affected_buses = by_type["LOW_VOLTAGE"] + by_type["HIGH_VOLTAGE"]
    return {
        "low_voltage_count": len(by_type["LOW_VOLTAGE"]),
        "high_voltage_count": len(by_type["HIGH_VOLTAGE"]),
        "line_overload_count": len(by_type["LINE_OVERLOAD"]),
        "transformer_overload_count": len(by_type["TRANSFORMER_OVERLOAD"]),
        "total_violations": len(violations),
        "affected_buses": affected_buses,
        "affected_lines": by_type["LINE_OVERLOAD"],
        "affected_transformers": by_type["TRANSFORMER_OVERLOAD"],
    }


def _record(timestamp, battery):
    results = extract_results(state["net"])
    feeder_bus_ids = ("bus_01", "bus_02", "bus_03", "bus_04", "bus_05", "bus_06")
    bus_voltages = {
        bus["id"]: bus["voltage_pu"]
        for bus in results["buses"]
        if bus["id"] in feeder_bus_ids
    }
    min_voltage_bus = min(bus_voltages, key=bus_voltages.get)
    max_voltage_bus = max(bus_voltages, key=bus_voltages.get)
    net_flow_kw = abs(float(state["net"].res_ext_grid["p_mw"].sum()) * 1000)
    duration_hours = _timestep_duration_hours(state["index"])
    violations = detect_violations(state["net"], timestamp)
    line_losses = []
    for line in results["lines"]:
        loss_kw = line["loss_kw"]
        energy_loss_kwh = loss_kw * duration_hours
        state["line_loss_energy_kwh"][line["id"]] = (
            state["line_loss_energy_kwh"].get(line["id"], 0.0) + energy_loss_kwh
        )
        violation = next((item for item in violations if item["id"] == line["id"]), None)
        line_losses.append({
            "id": line["id"], "loss_kw": loss_kw,
            "energy_loss_kwh": energy_loss_kwh,
            "total_energy_loss_kwh": state["line_loss_energy_kwh"][line["id"]],
            "loading_percent": line["loading_percent"],
            "power_flow_kw": line["p_from_mw"] * 1000,
            "status": "CRITICAL" if violation else "NORMAL",
        })
    total_loss_kw = sum(line["loss_kw"] for line in line_losses)
    timestep_energy_loss_kwh = total_loss_kw * duration_hours
    state["total_loss_energy_kwh"] += timestep_energy_loss_kwh
    return {"timestamp": timestamp, "results": results, "violations": violations, "violation_history": _violation_history(violations), "voltage_profile": {
        "bus_voltages": bus_voltages,
        "min_voltage_pu": bus_voltages[min_voltage_bus],
        "min_voltage_bus": min_voltage_bus,
        "max_voltage_pu": bus_voltages[max_voltage_bus],
        "max_voltage_bus": max_voltage_bus,
        "average_voltage_pu": sum(bus_voltages.values()) / len(bus_voltages),
    }, "summary": {
        "max_voltage_pu": max(bus["voltage_pu"] for bus in results["buses"]),
        "min_voltage_pu": min(bus["voltage_pu"] for bus in results["buses"]),
        "max_line_loading_percent": max((line["loading_percent"] for line in results["lines"]), default=0),
        "transformer_loading_percent": max((trafo["loading_percent"] for trafo in results["transformers"]), default=0),
        "net_flow_kw": net_flow_kw,
        "direction": "import" if float(state["net"].res_ext_grid["p_mw"].sum()) >= 0 else "export",
        "battery_soc_percent": battery["battery_soc_percent"],
    }, "battery": battery, "losses": {
        "total_loss_kw": total_loss_kw,
        "timestep_energy_loss_kwh": timestep_energy_loss_kwh,
        "total_energy_loss_kwh": state["total_loss_energy_kwh"],
        "lines": line_losses,
    }}


@app.get("/")
def root():
    return {
        "name": "GridTwin",
        "status": "online",
        "description": "Physics-based distribution grid simulation API",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/data/{data_type}")
async def upload_data(data_type: str, file: UploadFile = File(...)):
    if data_type not in {"solar", "load"}:
        raise HTTPException(404, "Data type must be solar or load.")
    try:
        df = read_csv_file(await file.read(), data_type)
        state[data_type] = df
        state["profile"] = align_profiles(state["solar"], state["load"]) if state["solar"] is not None and state["load"] is not None else None
        return {"status": "validated", "data_type": data_type, "filename": file.filename, "rows": len(df), "timestamps": df["Time"].dt.strftime("%H:%M").tolist(), "aligned": state["profile"] is not None}
    except ValueError as exc:
        raise HTTPException(422, str(exc))

@app.get("/data/status")
def data_status():
    return {"solar_uploaded": state["solar"] is not None, "load_uploaded": state["load"] is not None, "aligned": state["profile"] is not None, "timesteps": len(state["profile"]) if state["profile"] is not None else 0}

@app.get("/grid")
def grid():
    create_grid, _, _ = _simulation_dependencies()
    net = create_grid()
    return {"buses": net.bus["name"].tolist(), "lines": net.line["name"].tolist(), "transformers": net.trafo["name"].tolist(), "storage": net.storage["name"].tolist(), "metadata": net.user_pf_options}

@app.post("/simulation/start")
def start_simulation():
    with simulation_lock:
        _require_profile()
        create_grid, _, _ = _simulation_dependencies()
        state.update(net=create_grid(), index=-1, selected_index=-1, history=[], last=None, total_loss_energy_kwh=0.0, line_loss_energy_kwh={})
        while state["index"] + 1 < len(state["profile"]):
            _calculate_next()
        return state["last"]

@app.post("/simulation/reset")
def reset_simulation():
    with simulation_lock:
        state.update(net=None, index=-1, selected_index=-1, history=[], last=None, total_loss_energy_kwh=0.0, line_loss_energy_kwh={})
        return {"status": "reset"}

@app.post("/simulation/demo")
def load_demo_scenario():
    with simulation_lock:
        profile = _load_demo_profile()
        return {
            "status": "loaded",
            "timesteps": len(profile),
            "timestamps": profile["Time"].dt.strftime("%H:%M").tolist(),
        }

def _calculate_next():
    """Calculate exactly one new profile row and retain its complete result."""
    if state["index"] + 1 >= len(state["profile"]): raise HTTPException(409, "Simulation has reached the final timestep.")
    _, run_timestep, _ = _simulation_dependencies()
    state["index"] += 1
    row = state["profile"].iloc[state["index"]]
    timestamp = row["Time"].strftime("%H:%M")
    flow = run_timestep(state["net"], float(row.solar_kw), float(row.load_kw), _timestep_duration_hours(state["index"]))
    record = {"index": state["index"], "timestamp": timestamp, "solar_kw": float(row.solar_kw), "load_kw": float(row.load_kw), **flow}
    if flow["converged"]: record.update(_record(timestamp, flow["battery"]))
    state["history"].append(record)
    state["selected_index"] = state["index"]
    state["last"] = record
    return record

@app.post("/simulation/step")
def step_simulation():
    with simulation_lock:
        _require_profile()
        if state["net"] is None: raise HTTPException(409, "Start the simulation before stepping.")
        next_index = state["selected_index"] + 1
        if next_index <= state["index"]:
            return select_timestep(next_index)
        return _calculate_next()

@app.post("/simulation/complete")
def complete_simulation():
    """Calculate and retain every remaining uploaded profile row."""
    with simulation_lock:
        _require_profile()
        if state["net"] is None:
            raise HTTPException(409, "Start the simulation before completing the history.")
        while state["index"] + 1 < len(state["profile"]):
            _calculate_next()
        return {"history": state["history"]}

@app.post("/simulation/select/{target_index}")
def select_timestep(target_index: int):
    """Restore one already-calculated result; inspection must never run power flow."""
    with simulation_lock:
        _require_profile()
        if state["net"] is None: raise HTTPException(409, "Start the simulation before selecting a timestep.")
        if target_index < 0 or target_index >= len(state["profile"]):
            raise HTTPException(422, "Timestep index is outside the uploaded profile.")
        if target_index > state["index"]:
            raise HTTPException(409, "Timestep has not been calculated yet.")
        state["selected_index"] = target_index
        state["last"] = state["history"][target_index]
        return state["last"]

@app.get("/simulation/state")
def simulation_state():
    return {"running": state["net"] is not None, "index": state["selected_index"], "calculated_index": state["index"], "timesteps": len(state["profile"]) if state["profile"] is not None else 0, "timestamps": state["profile"]["Time"].dt.strftime("%H:%M").tolist() if state["profile"] is not None else [], "state": state["last"]}

@app.get("/simulation/history")
def simulation_history(): return {"history": state["history"]}

@app.get("/analytics/losses")
def loss_analytics():
    """Power-loss data calculated only by converged pandapower runs."""
    records = [record for record in state["history"] if record.get("converged") and record.get("losses")]
    latest = records[-1]["losses"] if records else None
    return {
        "total_loss_kw": latest["total_loss_kw"] if latest else None,
        "total_energy_loss_kwh": latest["total_energy_loss_kwh"] if latest else None,
        "lines": latest["lines"] if latest else [],
        "history": [
            {
                "timestamp": record["timestamp"],
                "total_loss_kw": record["losses"]["total_loss_kw"],
                "energy_loss_kwh": record["losses"]["timestep_energy_loss_kwh"],
                "lines": {
                    line["id"]: line for line in record["losses"]["lines"]
                },
            }
            for record in records
        ],
    }

@app.get("/analytics/voltage-profile")
def voltage_profile_analytics():
    """Feeder-bus voltages taken from successful pandapower power flows."""
    return {"history": [
        {"timestamp": record["timestamp"], **record["voltage_profile"]}
        for record in state["history"]
        if record.get("converged") and record.get("voltage_profile")
    ]}

@app.get("/analytics/battery")
def battery_analytics():
    """Automatic dispatch and SOC recorded from successful timesteps."""
    return {"history": [
        {"timestamp": record["timestamp"], **record["battery"]}
        for record in state["history"]
        if record.get("converged") and record.get("battery")
    ]}

@app.get("/analytics/baseline-comparison")
def baseline_comparison():
    """Run baseline and DER cases on isolated copies of the uploaded profile."""
    _require_profile()
    create_grid, run_timestep, _ = _simulation_dependencies()
    from .simulation.comparison import run_profile_comparison
    durations = [_timestep_duration_hours(index) for index in range(len(state["profile"]))]
    return run_profile_comparison(state["profile"], durations, create_grid, run_timestep)

@app.get("/analytics/violations")
def violation_analytics():
    """History of the existing detector's actual converged-timestep output."""
    return {"history": [
        {"timestamp": record["timestamp"], **record["violation_history"]}
        for record in state["history"]
        if record.get("converged") and record.get("violation_history")
    ]}
@app.get("/violations")
def violations(): return {"violations": state["last"].get("violations", []) if state["last"] else []}

class WhatIfRequest(BaseModel):
    action: str
    power_kw: float

@app.post("/simulation/what-if")
def what_if(request: WhatIfRequest):
    if state["net"] is None or state["last"] is None: raise HTTPException(409, "Run a converged timestep before What-If analysis.")
    _, _, run_what_if = _simulation_dependencies()
    return run_what_if(state["net"], request.action, request.power_kw, state["last"]["timestamp"])

@app.get("/weather")
def weather(): return get_weather()
