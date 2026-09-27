import pandapower as pp


def create_grid():
    """
    Create the GridTwin virtual 6-bus radial distribution feeder.

    Topology:

        External Grid (11 kV)
                |
            Transformer
                |
             BUS 01
                |
             LINE 01
                |
             BUS 02
                |
             LINE 02
                |
             BUS 03
                |
             LINE 03
                |
             BUS 04
                |
             LINE 04
                |
             BUS 05
                |
             LINE 05
                |
             BUS 06

    Distributed resources:

        solar_01   -> BUS 03
        solar_02   -> BUS 05

        load_01    -> BUS 02
        load_02    -> BUS 04
        load_03    -> BUS 06

        battery_01 -> BUS 04

    This is a virtual/test distribution network.
    It does NOT represent a real utility feeder.
    """

    # ============================================================
    # CREATE EMPTY NETWORK
    # ============================================================

    net = pp.create_empty_network(
        name="GridTwin Virtual Distribution Feeder"
    )

    # ============================================================
    # HIGH-VOLTAGE GRID BUS
    # ============================================================

    hv_bus = pp.create_bus(
        net,
        vn_kv=11.0,
        name="grid_hv_bus",
    )

    # ============================================================
    # LOW-VOLTAGE DISTRIBUTION BUSES
    # ============================================================

    bus_01 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_01",
    )

    bus_02 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_02",
    )

    bus_03 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_03",
    )

    bus_04 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_04",
    )

    bus_05 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_05",
    )

    bus_06 = pp.create_bus(
        net,
        vn_kv=0.415,
        name="bus_06",
    )

    # ============================================================
    # EXTERNAL GRID
    # ============================================================

    pp.create_ext_grid(
        net,
        bus=hv_bus,
        vm_pu=1.0,
        name="grid_01",
    )

    # ============================================================
    # TRANSFORMER
    # 11 kV -> 415 V
    # Rated power = 250 kVA
    # ============================================================

    pp.create_transformer_from_parameters(
        net,
        hv_bus=hv_bus,
        lv_bus=bus_01,
        sn_mva=0.25,
        vn_hv_kv=11.0,
        vn_lv_kv=0.415,
        vk_percent=4.0,
        vkr_percent=1.0,
        pfe_kw=0.5,
        i0_percent=0.1,
        shift_degree=0,
        name="trafo_01",
    )

    # ============================================================
    # DISTRIBUTION LINE PARAMETERS
    # ============================================================

    line_params = {
        "length_km": 0.10,
        "r_ohm_per_km": 0.642,
        "x_ohm_per_km": 0.083,
        "c_nf_per_km": 210.0,
        "max_i_ka": 0.40,
    }

    # ============================================================
    # DISTRIBUTION LINES
    # ============================================================

    pp.create_line_from_parameters(
        net,
        from_bus=bus_01,
        to_bus=bus_02,
        name="line_01",
        **line_params,
    )

    pp.create_line_from_parameters(
        net,
        from_bus=bus_02,
        to_bus=bus_03,
        name="line_02",
        **line_params,
    )

    pp.create_line_from_parameters(
        net,
        from_bus=bus_03,
        to_bus=bus_04,
        name="line_03",
        **line_params,
    )

    pp.create_line_from_parameters(
        net,
        from_bus=bus_04,
        to_bus=bus_05,
        name="line_04",
        **line_params,
    )

    pp.create_line_from_parameters(
        net,
        from_bus=bus_05,
        to_bus=bus_06,
        name="line_05",
        **line_params,
    )

    # ============================================================
    # DISTRIBUTED LOADS
    # ============================================================

    # Load 01 -> BUS 02
    pp.create_load(
        net,
        bus=bus_02,
        p_mw=0.030,
        q_mvar=0.009,
        name="load_01",
    )

    # Load 02 -> BUS 04
    pp.create_load(
        net,
        bus=bus_04,
        p_mw=0.040,
        q_mvar=0.012,
        name="load_02",
    )

    # Load 03 -> BUS 06
    pp.create_load(
        net,
        bus=bus_06,
        p_mw=0.050,
        q_mvar=0.015,
        name="load_03",
    )

    # ============================================================
    # DISTRIBUTED SOLAR GENERATORS
    # ============================================================

    # Solar 01 -> BUS 03
    pp.create_sgen(
        net,
        bus=bus_03,
        p_mw=0.050,
        q_mvar=0.0,
        name="solar_01",
    )

    # Solar 02 -> BUS 05
    pp.create_sgen(
        net,
        bus=bus_05,
        p_mw=0.050,
        q_mvar=0.0,
        name="solar_02",
    )

    # ============================================================
    # BATTERY
    #
    # Capacity       = 100 kWh
    # Maximum power  = 50 kW
    # Initial SOC    = 60%
    # Minimum SOC    = 10%
    # Maximum SOC    = 100%
    # ============================================================

    pp.create_storage(
    net,
    bus=bus_04,
    p_mw=0.0,
    max_e_mwh=0.100,
    soc_percent=60.0,
    min_e_mwh=0.010,
    max_p_mw=0.050,
    min_p_mw=-0.050,
    name="battery_01",
)

    # ============================================================
    # GRIDTWIN NETWORK METADATA
    # ============================================================

    net.user_pf_options = {
        "voltage_limits": {
            "min_pu": 0.95,
            "max_pu": 1.05,
        },
        "line_loading_limit_percent": 100.0,
        "transformer_loading_limit_percent": 100.0,
        "network_type": "virtual_test_feeder",
        "description": (
            "GridTwin 6-bus radial distribution feeder "
            "for physics-based digital-twin simulation."
        ),
    }

    return net