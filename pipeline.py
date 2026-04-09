"""
Data Pipeline for Toronto Urban Safety Explorer (TUSE)
======================================================
Reads the raw major-crime-indicators.csv and produces JSON files
consumed by the D3 dashboard:

  1. spatial_data.json         – per-incident records (full detail)
  2. spatial_clusters.json     – neighbourhood-level centroids for the map
  3. temporal_data.json        – monthly time-series for the interactive timeline
  4. neighbourhood_data.json   – neighbourhood rankings with Day/Night split
"""

import json
import os
import pandas as pd

# -- paths -----------------------------------------------------------
RAW_CSV = os.path.join(os.path.dirname(__file__), "data", "major-crime-indicators.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "data", "processed")

# Month name -> number lookup for sorting
MONTH_NUM = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}


# -- helpers -----------------------------------------------------------
def classify_time_of_day(hour: int) -> str:
    """Return 'Day' for hours 6-17, 'Night' otherwise."""
    return "Day" if 6 <= hour <= 17 else "Night"


# -- Step 1: Load & Clean -----------------------------------------------
def load_and_clean(path: str) -> pd.DataFrame:
    """Load the raw CSV and apply common cleaning steps."""
    print(f"Loading {path} …")
    df = pd.read_csv(path)
    print(f"  Raw rows: {len(df):,}")

    # Drop rows with null occurrence dates
    df = df.dropna(subset=["OCC_YEAR", "OCC_MONTH", "OCC_DAY"])
    print(f"  After dropping null OCC dates: {len(df):,}")

    # Drop rows with null coordinates
    df = df.dropna(subset=["LONG_WGS84", "LAT_WGS84"])
    print(f"  After dropping null coords:    {len(df):,}")

    # Cast types
    df["OCC_YEAR"] = df["OCC_YEAR"].astype(int)
    df["OCC_DAY"] = df["OCC_DAY"].astype(int)
    df["OCC_DOY"] = df["OCC_DOY"].astype(int)

    # Trim whitespace from string columns
    for col in ["OCC_DOW", "REPORT_DOW", "OCC_MONTH", "MCI_CATEGORY",
                 "NEIGHBOURHOOD_158", "HOOD_158"]:
        df[col] = df[col].str.strip()

    # Derive Day / Night
    df["TIME_OF_DAY"] = df["OCC_HOUR"].apply(classify_time_of_day)

    # Add numeric month for sorting
    df["OCC_MONTH_NUM"] = df["OCC_MONTH"].map(MONTH_NUM)

    print(f"  Cleaning done. Final rows: {len(df):,}")
    return df


# -- Step 2: Spatial View ------------------------------------------------
def build_spatial_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    One record per incident with only the columns needed for the
    clustered map, filtering, and tooltips.
    """
    cols = {
        "LAT_WGS84":          "lat",
        "LONG_WGS84":         "lon",
        "MCI_CATEGORY":       "category",
        "OCC_YEAR":           "year",
        "OCC_MONTH":          "month",
        "OCC_MONTH_NUM":      "monthNum",
        "OCC_HOUR":           "hour",
        "TIME_OF_DAY":        "timeOfDay",
        "PREMISES_TYPE":      "premises",
        "OFFENCE":            "offence",
        "NEIGHBOURHOOD_158":  "neighbourhood",
        "HOOD_158":           "hood_id",
    }
    out = df[list(cols.keys())].rename(columns=cols)
    print(f"  Spatial data rows: {len(out):,}")
    return out


# -- Step 2b: Spatial Clusters (pre-aggregated for map) -------------------
def build_spatial_clusters(df: pd.DataFrame) -> list[dict]:
    """
    Aggregate incidents to neighbourhood-level centroids with
    category breakdowns and day/night split for the map view.
    """
    filtered = df[df["NEIGHBOURHOOD_158"] != "NSA"]

    clusters = []
    for (hood, hood_id), grp in filtered.groupby(["NEIGHBOURHOOD_158", "HOOD_158"]):
        cats = grp.groupby("MCI_CATEGORY").size().to_dict()
        tod = grp.groupby("TIME_OF_DAY").size().to_dict()
        yearly = grp.groupby("OCC_YEAR").size().to_dict()
        clusters.append({
            "neighbourhood": hood,
            "hood_id": hood_id,
            "lat": round(grp["LAT_WGS84"].mean(), 6),
            "lon": round(grp["LONG_WGS84"].mean(), 6),
            "total": int(len(grp)),
            "categories": {k: int(v) for k, v in cats.items()},
            "day": int(tod.get("Day", 0)),
            "night": int(tod.get("Night", 0)),
            "yearly": {int(k): int(v) for k, v in yearly.items()},
        })

    print(f"  Spatial clusters: {len(clusters):,} neighbourhoods")
    return clusters


# -- Step 3: Temporal View ------------------------------------------------
def build_temporal_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Monthly aggregated counts by crime category for the interactive
    timeline (supports brushing + stacked area chart).
    """
    grouped = (
        df.groupby(["OCC_YEAR", "OCC_MONTH", "OCC_MONTH_NUM", "MCI_CATEGORY"])
        .size()
        .reset_index(name="count")
    )
    grouped = grouped.rename(columns={
        "OCC_YEAR": "year",
        "OCC_MONTH": "month",
        "OCC_MONTH_NUM": "monthNum",
        "MCI_CATEGORY": "category",
    })

    # Aggregate "All" row per year/month
    all_agg = (
        grouped.groupby(["year", "month", "monthNum"])["count"]
        .sum()
        .reset_index()
    )
    all_agg["category"] = "All"

    combined = pd.concat([grouped, all_agg], ignore_index=True)
    combined = combined.sort_values(["year", "monthNum", "category"]).reset_index(drop=True)

    print(f"  Temporal data rows: {len(combined):,}")
    return combined


# -- Step 4: Bar Chart View ------------------------------------------------
def build_neighbourhood_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Neighbourhood-level crime counts split by Day/Night AND by year for the
    enriched horizontal bar chart.  Excludes 'NSA' neighbourhoods.
    Includes year so the timeline brush can filter the bar chart.
    """
    filtered = df[df["NEIGHBOURHOOD_158"] != "NSA"]
    print(f"  Neighbourhood data: excluded {len(df) - len(filtered):,} NSA rows")

    grouped = (
        filtered.groupby(
            ["NEIGHBOURHOOD_158", "HOOD_158", "MCI_CATEGORY", "TIME_OF_DAY", "OCC_YEAR"]
        )
        .size()
        .reset_index(name="count")
    )
    grouped = grouped.rename(columns={
        "NEIGHBOURHOOD_158": "neighbourhood",
        "HOOD_158":          "hood_id",
        "MCI_CATEGORY":      "category",
        "TIME_OF_DAY":       "timeOfDay",
        "OCC_YEAR":          "year",
    })

    # Also produce an "All" category per neighbourhood + timeOfDay + year
    all_cat = (
        grouped.groupby(["neighbourhood", "hood_id", "timeOfDay", "year"])["count"]
        .sum()
        .reset_index()
    )
    all_cat["category"] = "All"

    combined = pd.concat([grouped, all_cat], ignore_index=True)
    combined = combined.sort_values(
        ["neighbourhood", "category", "timeOfDay", "year"]
    ).reset_index(drop=True)

    print(f"  Neighbourhood data rows: {len(combined):,}")
    return combined


# -- Main ----------------------------------------------------------------
def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    df = load_and_clean(RAW_CSV)

    print("\nBuilding spatial data …")
    spatial = build_spatial_data(df)
    spatial_path = os.path.join(OUT_DIR, "spatial_data.json")
    spatial.to_json(spatial_path, orient="records")
    print(f"  -> {spatial_path}")

    print("\nBuilding spatial clusters …")
    clusters = build_spatial_clusters(df)
    clusters_path = os.path.join(OUT_DIR, "spatial_clusters.json")
    with open(clusters_path, "w") as f:
        json.dump(clusters, f)
    print(f"  -> {clusters_path}")

    print("\nBuilding temporal data …")
    temporal = build_temporal_data(df)
    temporal_path = os.path.join(OUT_DIR, "temporal_data.json")
    temporal.to_json(temporal_path, orient="records")
    print(f"  -> {temporal_path}")

    print("\nBuilding neighbourhood data …")
    neighbourhood = build_neighbourhood_data(df)
    neighbourhood_path = os.path.join(OUT_DIR, "neighbourhood_data.json")
    neighbourhood.to_json(neighbourhood_path, orient="records")
    print(f"  -> {neighbourhood_path}")

    print("\nDone! Pipeline complete.")


if __name__ == "__main__":
    main()
