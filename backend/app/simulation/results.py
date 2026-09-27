def extract_results(net):
    buses = []

    for index, row in net.res_bus.iterrows():

        buses.append({
            "id": net.bus.loc[index, "name"],
            "voltage_pu": float(row.vm_pu),
            "angle_deg": float(row.va_degree),
        })

    lines = []

    for index, row in net.res_line.iterrows():

        lines.append({
            "id": net.line.loc[index, "name"],
            "loading_percent": float(row.loading_percent),
            "p_from_mw": float(row.p_from_mw),
            "p_to_mw": float(row.p_to_mw),
            "loss_kw": float(row.pl_mw) * 1000,
        })

    transformers = []

    for index, row in net.res_trafo.iterrows():

        transformers.append({
            "id": net.trafo.loc[index, "name"],
            "loading_percent": float(row.loading_percent),
            "p_hv_mw": float(row.p_hv_mw),
            "p_lv_mw": float(row.p_lv_mw),
            "loss_kw": float(row.pl_mw) * 1000,
        })

    generators = []
    for index, row in net.sgen.iterrows():
        generators.append({
            "id": net.sgen.loc[index, "name"],
            "power_kw": float(row.p_mw) * 1000,
        })

    storage = []
    for index, row in net.storage.iterrows():
        storage.append({
            "id": net.storage.loc[index, "name"],
            "power_kw": float(row.p_mw) * 1000,
            "soc_percent": float(row.soc_percent),
        })

    loads = []
    for index, row in net.load.iterrows():
        loads.append({
            "id": net.load.loc[index, "name"],
            "power_kw": float(row.p_mw) * 1000,
        })

    return {
        "buses": buses,
        "lines": lines,
        "transformers": transformers,
        "generators": generators,
        "storage": storage,
        "loads": loads,
    }
