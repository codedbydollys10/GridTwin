"""Pandapower baseline-versus-DER profile comparison."""
from .results import extract_results
from .violations import detect_violations


def run_profile_comparison(profile, durations, create_grid, run_timestep):
    baseline = _run_case(profile, durations, create_grid, run_timestep, False, False)
    der = _run_case(profile, durations, create_grid, run_timestep, True, True)
    return {
        "baseline": baseline,
        "der": der,
        "change": {
            key: der[key] - baseline[key]
            for key in baseline
            if isinstance(baseline[key], (int, float)) and isinstance(der[key], (int, float))
        },
    }


def _run_case(profile, durations, create_grid, run_timestep, enable_solar, enable_battery_dispatch):
    net = create_grid()
    metrics = {
        "minimum_voltage_pu": None, "maximum_voltage_pu": None,
        "voltage_violation_count": 0, "maximum_line_loading_percent": 0.0,
        "transformer_loading_percent": 0.0, "total_active_power_loss_kwh": 0.0,
        "grid_import_energy_kwh": 0.0, "grid_export_energy_kwh": 0.0,
        "converged_timesteps": 0,
    }
    total_duration_hours = 0.0
    for index, row in profile.iterrows():
        duration_hours = durations[index]
        flow = run_timestep(
            net, float(row.solar_kw), float(row.load_kw), duration_hours,
            enable_solar=enable_solar, enable_battery_dispatch=enable_battery_dispatch,
        )
        if not flow["converged"]:
            continue
        metrics["converged_timesteps"] += 1
        total_duration_hours += duration_hours
        timestamp = row["Time"].strftime("%H:%M")
        results = extract_results(net)
        feeder_voltages = [bus["voltage_pu"] for bus in results["buses"] if bus["id"].startswith("bus_")]
        step_min, step_max = min(feeder_voltages), max(feeder_voltages)
        metrics["minimum_voltage_pu"] = step_min if metrics["minimum_voltage_pu"] is None else min(metrics["minimum_voltage_pu"], step_min)
        metrics["maximum_voltage_pu"] = step_max if metrics["maximum_voltage_pu"] is None else max(metrics["maximum_voltage_pu"], step_max)
        violations = detect_violations(net, timestamp)
        metrics["voltage_violation_count"] += sum(item["type"] in ("LOW_VOLTAGE", "HIGH_VOLTAGE") for item in violations)
        metrics["maximum_line_loading_percent"] = max(metrics["maximum_line_loading_percent"], max((line["loading_percent"] for line in results["lines"]), default=0.0))
        metrics["transformer_loading_percent"] = max(metrics["transformer_loading_percent"], max((trafo["loading_percent"] for trafo in results["transformers"]), default=0.0))
        metrics["total_active_power_loss_kwh"] += sum(line["loss_kw"] for line in results["lines"]) * duration_hours
        grid_kw = float(net.res_ext_grid["p_mw"].sum()) * 1000
        if grid_kw >= 0:
            metrics["grid_import_energy_kwh"] += grid_kw * duration_hours
        else:
            metrics["grid_export_energy_kwh"] += abs(grid_kw) * duration_hours
    metrics["total_active_power_loss_kw"] = metrics["total_active_power_loss_kwh"] / total_duration_hours if total_duration_hours else None
    return metrics
