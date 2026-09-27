VOLTAGE_MIN = 0.95
VOLTAGE_MAX = 1.05

LINE_LOADING_LIMIT = 100.0
TRANSFORMER_LOADING_LIMIT = 100.0


def detect_violations(net, timestamp):
    violations = []

    # --------------------------------------------
    # BUS VOLTAGE
    # --------------------------------------------

    for index, row in net.res_bus.iterrows():

        bus_id = net.bus.loc[index, "name"]
        voltage = float(row.vm_pu)

        if voltage > VOLTAGE_MAX:

            violations.append({
                "component": "bus",
                "id": bus_id,
                "timestamp": timestamp,
                "type": "HIGH_VOLTAGE",
                "value": voltage,
                "limit": VOLTAGE_MAX,
                "severity": "critical",
            })

        elif voltage < VOLTAGE_MIN:

            violations.append({
                "component": "bus",
                "id": bus_id,
                "timestamp": timestamp,
                "type": "LOW_VOLTAGE",
                "value": voltage,
                "limit": VOLTAGE_MIN,
                "severity": "critical",
            })

    # --------------------------------------------
    # LINE LOADING
    # --------------------------------------------

    for index, row in net.res_line.iterrows():

        line_id = net.line.loc[index, "name"]
        loading = float(row.loading_percent)

        if loading > LINE_LOADING_LIMIT:

            violations.append({
                "component": "line",
                "id": line_id,
                "timestamp": timestamp,
                "type": "LINE_OVERLOAD",
                "value": loading,
                "limit": LINE_LOADING_LIMIT,
                "severity": "critical",
            })

    # --------------------------------------------
    # TRANSFORMER
    # --------------------------------------------

    for index, row in net.res_trafo.iterrows():

        trafo_id = net.trafo.loc[index, "name"]
        loading = float(row.loading_percent)

        if loading > TRANSFORMER_LOADING_LIMIT:

            violations.append({
                "component": "transformer",
                "id": trafo_id,
                "timestamp": timestamp,
                "type": "TRANSFORMER_OVERLOAD",
                "value": loading,
                "limit": TRANSFORMER_LOADING_LIMIT,
                "severity": "critical",
            })

    return violations