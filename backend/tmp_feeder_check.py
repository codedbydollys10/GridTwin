import pandapower as pp
from app.simulation.network import create_grid

for length in [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12, 0.15]:
    net = create_grid()
    for i in range(len(net.line)):
        net.line.at[i, 'length_km'] = length
    try:
        pp.runpp(net, algorithm='nr', init='auto', calculate_voltage_angles=True)
        print('length', length, 'OK', float(net.res_bus.vm_pu.min()), float(net.res_bus.vm_pu.max()), float(net.res_line.loading_percent.max()))
    except Exception as exc:
        print('length', length, 'FAIL', type(exc).__name__, exc)
