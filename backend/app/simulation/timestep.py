import math

import pandapower as pp
from .battery import commit_battery_soc, dispatch_battery


def apply_timestep(net, solar_kw, load_kw, enable_solar=True):
    # --------------------------------------------------
    # DISTRIBUTED SOLAR
    # --------------------------------------------------

    solar_01_index = net.sgen[
        net.sgen["name"] == "solar_01"
    ].index[0]

    solar_02_index = net.sgen[
        net.sgen["name"] == "solar_02"
    ].index[0]

    solar_01 = solar_kw * 0.55 if enable_solar else 0.0
    solar_02 = solar_kw * 0.45 if enable_solar else 0.0

    net.sgen.at[solar_01_index, "p_mw"] = solar_01 / 1000
    net.sgen.at[solar_02_index, "p_mw"] = solar_02 / 1000

    # --------------------------------------------------
    # DISTRIBUTED LOAD
    # --------------------------------------------------

    load_distribution = {
        "load_01": 0.30,
        "load_02": 0.35,
        "load_03": 0.35,
    }

    for name, fraction in load_distribution.items():

        index = net.load[
            net.load["name"] == name
        ].index[0]

        p_kw = load_kw * fraction

        net.load.at[index, "p_mw"] = p_kw / 1000

        # Approximate fixed power factor.
        net.load.at[index, "q_mvar"] = (
            p_kw * 0.3 / 1000
        )


def run_timestep(net, solar_kw, load_kw, duration_hours, enable_solar=True, enable_battery_dispatch=True):
    apply_timestep(
        net,
        solar_kw,
        load_kw, enable_solar,
    )
    dispatch = dispatch_battery(net, solar_kw, load_kw, duration_hours) if enable_battery_dispatch else None
    if not enable_battery_dispatch:
        battery_index = net.storage[net.storage["name"] == "battery_01"].index[0]
        net.storage.at[battery_index, "p_mw"] = 0.0

    try:
        pp.runpp(
            net,
            algorithm="nr",
            init="auto",
            calculate_voltage_angles=True,
        )

        # A solved Pandapower run can still contain NaN/Inf result fields for
        # an invalid operating point. Those values are not valid electrical
        # results and FastAPI correctly refuses to serialize them as JSON.
        # Surface the timestep as non-converged instead of fabricating output.
        result_tables = (net.res_bus, net.res_line, net.res_trafo)
        if any(
            not math.isfinite(float(value))
            for table in result_tables
            for value in table.select_dtypes(include="number").to_numpy().ravel()
        ):
            return {
                "converged": False,
                "error": "Power flow returned non-finite electrical results.",
                "battery": None,
            }

        return {
            "converged": True,
            "error": None,
            "battery": commit_battery_soc(net, dispatch) if dispatch else None,
        }

    except Exception as exc:
        return {
            "converged": False,
            "error": str(exc),
            "battery": None,
        }
