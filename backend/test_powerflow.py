from app.simulation.network import create_grid
from app.simulation.powerflow import run_power_flow


net = create_grid()

result = run_power_flow(net)

print("Power flow result:")
print(result)

if result["converged"]:
    print("\nBUS VOLTAGES")

    for index, row in net.res_bus.iterrows():
        print(
            net.bus.loc[index, "name"],
            "->",
            round(row.vm_pu, 4),
            "pu"
        )

    print("\nLINE LOADING")

    for index, row in net.res_line.iterrows():
        print(
            net.line.loc[index, "name"],
            "->",
            round(row.loading_percent, 2),
            "%"
        )

    print("\nTRANSFORMER LOADING")

    for index, row in net.res_trafo.iterrows():
        print(
            net.trafo.loc[index, "name"],
            "->",
            round(row.loading_percent, 2),
            "%"
        )