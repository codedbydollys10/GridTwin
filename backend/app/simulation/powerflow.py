import pandapower as pp


def run_power_flow(net):
    try:
        pp.runpp(
            net,
            algorithm="nr",
            init="auto",
            calculate_voltage_angles=True,
        )

        return {
            "converged": True,
            "error": None,
        }

    except Exception as exc:
        return {
            "converged": False,
            "error": str(exc),
        }