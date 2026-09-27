"""Temporary pandapower What-If studies; the baseline is never mutated."""
from copy import deepcopy
from datetime import datetime, timezone
from .powerflow import run_power_flow
from .results import extract_results
from .violations import detect_violations

def _snapshot(net, timestamp):
    pf = run_power_flow(net)
    if not pf["converged"]: return {"converged": False, "error": pf["error"], "results": None, "violations": []}
    results = extract_results(net)
    maxima = _maxima(results)
    grid_power_mw = float(net.res_ext_grid["p_mw"].sum())
    maxima.update({"net_flow_kw": abs(grid_power_mw * 1000), "direction": "import" if grid_power_mw >= 0 else "export"})
    return {"converged": True, "error": None, "results": results, "violations": detect_violations(net, timestamp), "summary": maxima}

def _maxima(results):
    return {"max_voltage_pu": max((b["voltage_pu"] for b in results["buses"]), default=None), "min_voltage_pu": min((b["voltage_pu"] for b in results["buses"]), default=None), "max_line_loading_percent": max((l["loading_percent"] for l in results["lines"]), default=None), "transformer_loading_percent": max((t["loading_percent"] for t in results["transformers"]), default=None)}

def run_what_if(baseline_net, action, power_kw, timestamp=None):
    timestamp = timestamp or datetime.now(timezone.utc).isoformat(); baseline = _snapshot(deepcopy(baseline_net), timestamp)
    response = {"action": {"type": action, "power_kw": power_kw}, "baseline": baseline, "feasible": False, "reason": None, "scenario": None, "changes": None}
    if not baseline["converged"]: response["reason"] = "Baseline power flow did not converge."; return response
    net = deepcopy(baseline_net)
    if power_kw < 0: response["reason"] = "Power must be non-negative."; return response
    if action in ("battery_charge", "battery_discharge"):
        if power_kw > 50: response["reason"] = "Battery maximum charge/discharge power is 50 kW."; return response
        storage = net.storage[net.storage["name"] == "battery_01"]
        if storage.empty: response["reason"] = "battery_01 is not available."; return response
        index = storage.index[0]; soc = float(net.storage.at[index, "soc_percent"])
        if action == "battery_charge" and soc + power_kw > 100: response["reason"] = "Battery capacity would be exceeded."; return response
        if action == "battery_discharge" and soc - power_kw < 10: response["reason"] = "Battery minimum SOC would be breached."; return response
        net.storage.at[index, "p_mw"] = (power_kw if action == "battery_charge" else -power_kw) / 1000
    elif action == "solar_curtailment":
        available_kw = float(net.sgen["p_mw"].sum() * 1000)
        if power_kw > available_kw: response["reason"] = f"Curtailment exceeds available solar generation ({available_kw:.2f} kW)."; return response
        net.sgen.loc[:, "p_mw"] *= (available_kw - power_kw) / available_kw if available_kw else 0
    elif action == "feeder_reconfiguration": response["reason"] = "No valid alternative topology exists in the configured feeder."; return response
    else: response["reason"] = "Unsupported action."; return response
    scenario = _snapshot(net, timestamp); response["scenario"] = scenario
    if not scenario["converged"]: response["reason"] = "Scenario power flow did not converge: " + (scenario["error"] or "unknown error"); return response
    before, after = _maxima(baseline["results"]), _maxima(scenario["results"]); response["changes"] = {k: after[k] - before[k] for k in before}; response["feasible"] = not scenario["violations"]
    if not response["feasible"]: response["reason"] = "Action was applied, but the scenario still violates configured electrical limits."
    return response
