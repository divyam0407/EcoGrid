from typing import List, Tuple, Optional
from datetime import datetime
from .enums import DataQualityStatus


def convert_to_kwh(value: float, unit: str, interval_minutes: int = 60) -> float:
    """
    Converts raw energy or constant power reading to interval energy in kWh.
    Supported energy units: 'Wh', 'kWh', 'MWh'.
    Supported constant power units: 'W', 'kW'.
    """
    if unit is None or not str(unit).strip():
        raise ValueError("Unit cannot be empty.")

    u = unit.strip().lower()
    hours = interval_minutes / 60.0

    if u == "kwh":
        return float(value)
    elif u == "wh":
        return float(value) / 1000.0
    elif u == "mwh":
        return float(value) * 1000.0
    elif u == "kw":
        return float(value) * hours
    elif u == "w":
        return (float(value) / 1000.0) * hours
    else:
        raise ValueError(f"Unsupported energy/power unit: '{unit}'")


def integrate_power_series_to_kwh(
    timestamps: List[datetime],
    power_watts: List[float],
    method: str = "trapezoidal",
    max_gap_minutes: Optional[float] = None,
    single_sample_minutes: float = 1.0,
) -> Tuple[float, float, float, int, float]:
    """
    Integrates a sub-hourly instantaneous active power time series P(t) [Watts]
    into interval energy [kWh] using actual elapsed time.

    Does NOT silently interpolate across gaps larger than `max_gap_minutes`.

    Returns:
      (energy_kwh, avg_power_kw, integrated_minutes, skipped_gap_count, skipped_gap_minutes)
    """
    if not timestamps or not power_watts or len(timestamps) != len(power_watts):
        raise ValueError("Timestamps and power_watts must be non-empty and of equal length.")

    if len(power_watts) == 1:
        p_kw = power_watts[0] / 1000.0
        energy_kwh = p_kw * (single_sample_minutes / 60.0)
        return round(energy_kwh, 6), round(p_kw, 4), float(single_sample_minutes), 0, 0.0

    total_wh = 0.0
    total_seconds = 0.0
    skipped_gap_count = 0
    skipped_gap_seconds = 0.0

    for i in range(len(timestamps) - 1):
        dt_sec = (timestamps[i + 1] - timestamps[i]).total_seconds()
        if dt_sec <= 0:
            continue

        if max_gap_minutes is not None and dt_sec > max_gap_minutes * 60.0:
            skipped_gap_count += 1
            skipped_gap_seconds += dt_sec
            continue

        dt_hr = dt_sec / 3600.0
        if method == "trapezoidal":
            avg_w = 0.5 * (power_watts[i] + power_watts[i + 1])
        else:
            avg_w = power_watts[i]
        total_wh += avg_w * dt_hr
        total_seconds += dt_sec

    integrated_minutes = total_seconds / 60.0
    skipped_gap_minutes = skipped_gap_seconds / 60.0

    if total_seconds <= 0:
        return 0.0, 0.0, 0.0, skipped_gap_count, round(skipped_gap_minutes, 2)

    energy_kwh = total_wh / 1000.0
    avg_power_kw = energy_kwh / (total_seconds / 3600.0)
    return (
        round(energy_kwh, 6),
        round(avg_power_kw, 4),
        round(integrated_minutes, 2),
        skipped_gap_count,
        round(skipped_gap_minutes, 2),
    )


def compute_cumulative_delta(
    current_reading: float,
    previous_reading: float,
    physical_max_kwh: float = 50000.0,
    counter_rollover_limit: Optional[float] = None
) -> Tuple[Optional[float], DataQualityStatus, Optional[str]]:
    """
    Computes interval energy from cumulative meter counter readings.
    Never silently converts negative differences to zero.

    Returns: (delta_kwh, quality_status, diagnostic_note)
    """
    delta = current_reading - previous_reading

    if delta >= 0:
        if delta > physical_max_kwh:
            return (
                delta,
                DataQualityStatus.FLAGGED_OUTLIER,
                f"Delta {delta:.2f} kWh exceeds physical feeder capacity ({physical_max_kwh} kWh)."
            )
        return round(delta, 6), DataQualityStatus.CALCULATED_INTERVAL, None

    # Negative delta: check if explained by hardware counter rollover
    if counter_rollover_limit is not None and counter_rollover_limit >= previous_reading:
        rollover_delta = (counter_rollover_limit - previous_reading) + current_reading
        if 0 <= rollover_delta <= physical_max_kwh:
            return (
                round(rollover_delta, 6),
                DataQualityStatus.METER_RESET_ROLLOVER,
                f"Hardware counter rollover detected at limit {counter_rollover_limit} "
                f"(prev={previous_reading}, curr={current_reading}, recovered={rollover_delta:.3f} kWh)."
            )

    # Unexplained negative jump (meter reset, replacement, or corrupted packet)
    return (
        None,
        DataQualityStatus.INVALID_REJECTED,
        f"Negative cumulative delta ({delta:.3f}) not explained by rollover "
        f"(prev={previous_reading}, curr={current_reading})."
    )
