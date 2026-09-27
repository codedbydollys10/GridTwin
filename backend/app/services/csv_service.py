from io import BytesIO
# importing the pandas library for data manipulation and analysis
import pandas as pd


def read_csv_file(contents: bytes, data_type: str):
    df = pd.read_csv(BytesIO(contents))

    required_column = "solar_kw" if data_type == "solar" else "load_kw"

    required = {"Time", required_column}

    missing = required - set(df.columns)

    if missing:
        raise ValueError(
            f"Missing required columns: {', '.join(sorted(missing))}"
        )

    df["Time"] = pd.to_datetime(
        df["Time"],
        format="%H:%M",
        errors="coerce",
    )

    if df["Time"].isna().any():
        raise ValueError("Invalid timestamp found in CSV.")

    if df["Time"].duplicated().any():
        raise ValueError("Duplicate timestamps found.")

    df[required_column] = pd.to_numeric(
        df[required_column],
        errors="coerce",
    )

    if df[required_column].isna().any():
        raise ValueError(
            f"Non-numeric values found in {required_column}."
        )

    if (df[required_column] < 0).any():
        raise ValueError(
            f"Negative values found in {required_column}."
        )

    df = df.sort_values("Time").reset_index(drop=True)

    return df
def align_profiles(solar_df, load_df):
    solar = solar_df[["Time", "solar_kw"]]
    load = load_df[["Time", "load_kw"]]

    merged = pd.merge(
        solar,
        load,
        on="Time",
        how="inner",
    )

    if merged.empty:
        raise ValueError(
            "Solar and load profiles have no matching timestamps."
        )

    if len(merged) != len(solar) or len(merged) != len(load):
        raise ValueError(
            "Solar and load profiles do not contain identical timestamps."
        )

    return merged