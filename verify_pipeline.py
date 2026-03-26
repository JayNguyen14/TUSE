"""
Verification script for the TUSE data pipeline outputs.
Checks structure, completeness, and basic data integrity of
the 3 JSON files produced by pipeline.py.
"""

import json
import os
import sys

OUT_DIR = os.path.join(os.path.dirname(__file__), "data", "processed")
EXPECTED_CATEGORIES = {"Assault", "Auto Theft", "Break and Enter", "Robbery", "Theft Over"}
ALL_PASS = True


def check(condition: bool, description: str):
    global ALL_PASS
    status = "✓" if condition else "✗"
    if not condition:
        ALL_PASS = False
    print(f"  {status} {description}")


def load(filename: str):
    path = os.path.join(OUT_DIR, filename)
    check(os.path.exists(path), f"{filename} exists")
    with open(path) as f:
        data = json.load(f)
    check(len(data) > 0, f"{filename} is non-empty ({len(data):,} rows)")
    return data


def verify_spatial():
    print("\n-- spatial_data.json --")
    data = load("spatial_data.json")

    # Check expected keys
    expected_keys = {"lat", "lon", "category", "year", "month", "monthNum",
                     "hour", "timeOfDay", "premises", "offence", "neighbourhood", "hood_id"}
    actual_keys = set(data[0].keys())
    check(actual_keys == expected_keys, f"Keys match expected schema ({actual_keys})")

    # No null lat/lon
    null_coords = sum(1 for r in data if r["lat"] is None or r["lon"] is None)
    check(null_coords == 0, f"No null coordinates (found {null_coords})")

    # All 5 categories present
    cats = {r["category"] for r in data}
    check(cats == EXPECTED_CATEGORIES, f"All 5 MCI categories present: {cats}")

    # timeOfDay only Day/Night
    tods = {r["timeOfDay"] for r in data}
    check(tods == {"Day", "Night"}, f"timeOfDay values: {tods}")

    # Row count sanity
    check(len(data) > 400_000, f"Row count > 400K ({len(data):,})")


def verify_temporal():
    print("\n-- temporal_data.json --")
    data = load("temporal_data.json")

    cats = {r["category"] for r in data}
    check(EXPECTED_CATEGORIES.issubset(cats), f"All 5 categories present: {cats & EXPECTED_CATEGORIES}")
    check("All" in cats, "'All' aggregate category present")

    years = {r["year"] for r in data}
    check(min(years) <= 2014, f"Data starts at/before 2014 (min={min(years)})")
    check(max(years) >= 2024, f"Data extends to/after 2024 (max={max(years)})")

    # Counts are positive integers
    bad_counts = [r for r in data if not isinstance(r["count"], int) or r["count"] <= 0]
    check(len(bad_counts) == 0, f"All counts are positive integers (bad={len(bad_counts)})")

    # monthNum present and 1-12
    month_nums = {r["monthNum"] for r in data}
    check(month_nums.issubset(set(range(1, 13))), f"monthNum values valid: {sorted(month_nums)}")


def verify_neighbourhood():
    print("\n-- neighbourhood_data.json --")
    data = load("neighbourhood_data.json")

    # No NSA
    nsa = [r for r in data if r["neighbourhood"] == "NSA"]
    check(len(nsa) == 0, f"No NSA entries (found {len(nsa)})")

    cats = {r["category"] for r in data}
    check(EXPECTED_CATEGORIES.issubset(cats), f"All 5 categories present")
    check("All" in cats, "'All' aggregate category present")

    # Day/Night split
    tods = {r["timeOfDay"] for r in data}
    check(tods == {"Day", "Night"}, f"Day/Night split present: {tods}")

    # Multiple neighbourhoods
    hoods = {r["neighbourhood"] for r in data}
    check(len(hoods) > 100, f"Has {len(hoods)} neighbourhoods (>100)")

    # Linking key: hood_id present
    check(all("hood_id" in r for r in data), "hood_id linking key present in all rows")


def verify_cross_view_linking():
    """Check that linking keys are consistent across all 3 datasets."""
    print("\n-- Cross-view linking --")
    with open(os.path.join(OUT_DIR, "spatial_data.json")) as f:
        spatial = json.load(f)
    with open(os.path.join(OUT_DIR, "temporal_data.json")) as f:
        temporal = json.load(f)
    with open(os.path.join(OUT_DIR, "neighbourhood_data.json")) as f:
        nbhood = json.load(f)

    # Shared category values
    s_cats = {r["category"] for r in spatial}
    t_cats = {r["category"] for r in temporal} - {"All"}
    n_cats = {r["category"] for r in nbhood} - {"All"}
    check(s_cats == t_cats == n_cats, f"Category values consistent across all 3 views")

    # Shared timeOfDay
    s_tod = {r["timeOfDay"] for r in spatial}
    n_tod = {r["timeOfDay"] for r in nbhood}
    check(s_tod == n_tod, f"timeOfDay values consistent (spatial ↔ neighbourhood)")

    # hood_id linkable between spatial and neighbourhood
    s_hoods = {r["hood_id"] for r in spatial}
    n_hoods = {r["hood_id"] for r in nbhood}
    check(n_hoods.issubset(s_hoods), f"All neighbourhood hood_ids exist in spatial data")


if __name__ == "__main__":
    print("=" * 50)
    print("TUSE Pipeline Verification")
    print("=" * 50)

    verify_spatial()
    verify_temporal()
    verify_neighbourhood()
    verify_cross_view_linking()

    print("\n" + "=" * 50)
    if ALL_PASS:
        print("All checks passed")
    else:
        print("Some checks failed — review above")
    print("=" * 50)

    sys.exit(0 if ALL_PASS else 1)
