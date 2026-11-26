from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Tuple, Optional


class NonExistentLocalTimeError(ValueError):
    """Raised when a naive local timestamp falls in a DST spring-forward gap."""
    pass


class AmbiguousLocalTimeError(ValueError):
    """Raised when a naive local timestamp is ambiguous during DST fall-back."""
    pass


def parse_and_convert_to_utc(
    raw_ts: str,
    source_tz_name: str = "UTC",
    fmt: Optional[str] = None,
    reject_ambiguous: bool = False,
) -> Tuple[datetime, str, str, Optional[str]]:
    """
    Parses a raw timestamp string (or Unix epoch) in the source timezone and returns:
      (utc_datetime, utc_iso_string, preserved_source_local_time, tz_warning)

    Detects:
      - Non-existent DST spring-forward local timestamps -> raises NonExistentLocalTimeError.
      - Ambiguous DST fall-back local timestamps -> flags via tz_warning='DST_AMBIGUOUS'
        (or raises AmbiguousLocalTimeError if reject_ambiguous=True).
    """
    if raw_ts is None:
        raise ValueError("Timestamp cannot be None.")

    raw_str = str(raw_ts).strip()
    if not raw_str:
        raise ValueError("Timestamp string is empty.")

    source_tz = ZoneInfo(source_tz_name)

    # Check if numeric Unix epoch (e.g. "1462093200")
    if raw_str.replace(".", "", 1).isdigit():
        epoch_val = float(raw_str)
        if epoch_val > 1e11:
            epoch_val = epoch_val / 1000.0
        dt_utc = datetime.fromtimestamp(epoch_val, tz=timezone.utc)
        dt_local = dt_utc.astimezone(source_tz)
        return dt_utc, dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), dt_local.isoformat(), None

    # Parse string timestamp
    if fmt:
        dt = datetime.strptime(raw_str, fmt)
    else:
        cleaned = raw_str.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(cleaned)
        except ValueError:
            for candidate_fmt in (
                "%d-%m-%Y %H:%M:%S",
                "%d-%m-%Y %H:%M",
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%m/%d/%Y %H:%M:%S",
                "%m/%d/%Y %H:%M",
            ):
                try:
                    dt = datetime.strptime(raw_str, candidate_fmt)
                    break
                except ValueError:
                    continue
            else:
                raise ValueError(f"Unrecognized timestamp format: '{raw_str}'")

    tz_warning: Optional[str] = None

    if dt.tzinfo is None:
        # Check for non-existent DST spring-forward local time
        dt_fold0 = dt.replace(tzinfo=source_tz, fold=0)
        roundtrip0 = dt_fold0.astimezone(timezone.utc).astimezone(source_tz)
        if roundtrip0.replace(tzinfo=None) != dt.replace(tzinfo=None):
            raise NonExistentLocalTimeError(
                f"Non-existent local timestamp '{raw_str}' in timezone '{source_tz_name}' (DST spring-forward gap)."
            )

        # Check for ambiguous DST fall-back local time
        dt_fold1 = dt.replace(tzinfo=source_tz, fold=1)
        if dt_fold0.utcoffset() != dt_fold1.utcoffset():
            if reject_ambiguous:
                raise AmbiguousLocalTimeError(
                    f"Ambiguous local timestamp '{raw_str}' in timezone '{source_tz_name}' (DST fall-back)."
                )
            tz_warning = (
                f"DST_AMBIGUOUS: Local timestamp '{raw_str}' in '{source_tz_name}' occurs twice "
                f"(offsets {dt_fold0.utcoffset()} vs {dt_fold1.utcoffset()}); cannot determine exact UTC without offset."
            )

        dt_local = dt_fold0
        preserved_local = dt_local.isoformat()
    else:
        dt_local = dt
        preserved_local = raw_str

    dt_utc = dt_local.astimezone(timezone.utc)
    return dt_utc, dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), preserved_local, tz_warning
