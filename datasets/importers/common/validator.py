import hashlib
from datetime import datetime, timedelta
from typing import List, Set, Tuple, Optional
from .enums import DataQualityStatus
from .models import NormalizedReading, RejectedRow, ImportBatchSummary


def compute_file_sha256(filepath: str) -> str:
    """Computes SHA-256 cryptographic hash of an input file for provenance."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_electrical_parameters(
    voltage_v: Optional[float] = None,
    power_factor: Optional[float] = None,
    frequency_hz: Optional[float] = None
) -> Optional[str]:
    """Validates physical bounds on electrical telemetry. Returns warning string if out of bounds."""
    warnings = []
    if voltage_v is not None and (voltage_v < 0 or voltage_v > 1000):
        warnings.append(f"Voltage {voltage_v}V out of nominal distribution range")
    if power_factor is not None and (abs(power_factor) > 1.0):
        warnings.append(f"Power factor {power_factor} exceeds physical bound [-1, 1]")
    if frequency_hz is not None and (frequency_hz < 45.0 or frequency_hz > 65.0):
        warnings.append(f"Frequency {frequency_hz}Hz outside 50/60Hz grid bounds")
    return "; ".join(warnings) if warnings else None


def detect_duplicates_and_gaps(
    readings: List[NormalizedReading],
    expected_interval_minutes: int = 60
) -> Tuple[List[NormalizedReading], List[RejectedRow], int]:
    """
    Deduplicates (external_meter_id, timestamp_utc) pairs and detects missing intervals
    without silently interpolating missing records.

    Returns: (deduplicated_readings, duplicate_rejections, missing_interval_count)
    """
    seen: Set[Tuple[str, str]] = set()
    clean: List[NormalizedReading] = []
    dups: List[RejectedRow] = []

    for idx, r in enumerate(readings):
        key = (r.external_meter_id, r.timestamp_utc)
        if key in seen:
            dups.append(
                RejectedRow(
                    row_number=idx + 1,
                    external_building_id=r.external_building_id,
                    external_meter_id=r.external_meter_id,
                    raw_timestamp=r.source_local_time,
                    raw_value=str(r.raw_reading),
                    reason=f"Duplicate reading for meter '{r.external_meter_id}' at UTC '{r.timestamp_utc}'.",
                    quality_status=DataQualityStatus.INVALID_REJECTED,
                )
            )
            continue
        seen.add(key)
        clean.append(r)

    # Sort chronologically per meter to count missing intervals accurately
    missing_count = 0
    by_meter = {}
    for r in clean:
        by_meter.setdefault(r.external_meter_id, []).append(r)

    expected_delta = timedelta(minutes=expected_interval_minutes)
    for meter_id, m_readings in by_meter.items():
        m_readings.sort(key=lambda x: x.timestamp_utc)
        for i in range(1, len(m_readings)):
            t_prev = datetime.fromisoformat(m_readings[i - 1].timestamp_utc.replace("Z", "+00:00"))
            t_curr = datetime.fromisoformat(m_readings[i].timestamp_utc.replace("Z", "+00:00"))
            gap = t_curr - t_prev
            if gap > expected_delta * 1.5:
                missed = int(round(gap.total_seconds() / (expected_interval_minutes * 60))) - 1
                if missed > 0:
                    missing_count += missed

    return clean, dups, missing_count


def finalize_batch_summary(
    summary: ImportBatchSummary,
    readings: List[NormalizedReading],
    rejected: List[RejectedRow],
    missing_count: int
) -> ImportBatchSummary:
    """Populates final audit counters on ImportBatchSummary."""
    summary.valid_records_count = len(readings)
    summary.rejected_rows = rejected
    summary.rejected_count = len(rejected)
    summary.missing_interval_count = missing_count

    summary.calculated_interval_count = sum(
        1 for r in readings if r.quality_status == DataQualityStatus.CALCULATED_INTERVAL
    )
    summary.imputed_count = sum(
        1 for r in readings if r.quality_status == DataQualityStatus.ESTIMATED_IMPUTED
    )
    summary.flagged_count = sum(
        1 for r in readings if r.quality_status == DataQualityStatus.FLAGGED_OUTLIER
    )
    summary.rollover_count = sum(
        1 for r in readings if r.quality_status == DataQualityStatus.METER_RESET_ROLLOVER
    )

    if readings:
        timestamps = sorted(r.timestamp_utc for r in readings)
        summary.min_timestamp_utc = timestamps[0]
        summary.max_timestamp_utc = timestamps[-1]

    return summary
