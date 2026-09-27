"""Deterministic normal-operation dispatch for the existing battery_01."""

BATTERY_NAME = "battery_01"
CHARGE_EFFICIENCY = 0.95
DISCHARGE_EFFICIENCY = 0.95


def dispatch_battery(net, solar_kw, load_kw, duration_hours):
    """Set one charge, discharge, or idle setpoint within existing limits."""
    index = net.storage[net.storage["name"] == BATTERY_NAME].index[0]
    storage = net.storage.loc[index]
    capacity_kwh = float(storage["max_e_mwh"]) * 1000
    minimum_kwh = float(storage["min_e_mwh"]) * 1000
    stored_kwh = capacity_kwh * float(storage["soc_percent"]) / 100
    max_charge_kw = float(storage["max_p_mw"]) * 1000
    max_discharge_kw = abs(float(storage["min_p_mw"]) * 1000)
    power_kw = 0.0
    mode = "IDLE"

    if duration_hours > 0 and solar_kw > load_kw and stored_kwh < capacity_kwh:
        surplus_kw = solar_kw - load_kw
        capacity_limited_kw = (capacity_kwh - stored_kwh) / (duration_hours * CHARGE_EFFICIENCY)
        power_kw = min(surplus_kw, max_charge_kw, capacity_limited_kw)
        mode = "CHARGING" if power_kw > 0 else "IDLE"
    elif duration_hours > 0 and load_kw > solar_kw and stored_kwh > minimum_kwh:
        deficit_kw = load_kw - solar_kw
        energy_limited_kw = (stored_kwh - minimum_kwh) * DISCHARGE_EFFICIENCY / duration_hours
        power_kw = -min(deficit_kw, max_discharge_kw, energy_limited_kw)
        mode = "DISCHARGING" if power_kw < 0 else "IDLE"

    net.storage.at[index, "p_mw"] = power_kw / 1000
    return {
        "index": index, "power_kw": power_kw, "mode": mode,
        "capacity_kwh": capacity_kwh, "minimum_kwh": minimum_kwh,
        "stored_kwh": stored_kwh, "duration_hours": duration_hours,
    }


def commit_battery_soc(net, dispatch):
    """Commit energy state only after a successful power-flow solution."""
    power_kw = dispatch["power_kw"]
    duration_hours = dispatch["duration_hours"]
    stored_kwh = dispatch["stored_kwh"]
    if power_kw > 0:
        stored_kwh += power_kw * duration_hours * CHARGE_EFFICIENCY
    elif power_kw < 0:
        stored_kwh += power_kw * duration_hours / DISCHARGE_EFFICIENCY
    stored_kwh = min(dispatch["capacity_kwh"], max(dispatch["minimum_kwh"], stored_kwh))
    soc_percent = stored_kwh / dispatch["capacity_kwh"] * 100
    net.storage.at[dispatch["index"], "soc_percent"] = soc_percent
    return {"battery_power_kw": power_kw, "battery_mode": dispatch["mode"], "battery_soc_percent": soc_percent, "battery_energy_kwh": stored_kwh}
