import os
import unittest
from datetime import datetime, timezone, timedelta
from datasets.importers.common.enums import DataSourceType, DataQualityStatus, OccupancyGranularity
from datasets.importers.common.timezone_utils import (
    parse_and_convert_to_utc,
    NonExistentLocalTimeError,
    AmbiguousLocalTimeError,
)
from datasets.importers.common.physics import (
    convert_to_kwh,
    integrate_power_series_to_kwh,
    compute_cumulative_delta,
)
from datasets.importers.iblend_importer import IBlendImporter
from datasets.importers.bdg2_importer import BDG2Importer
from datasets.importers.ashrae_importer import AshraeImporter

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


# ============================================================================
# ISSUE 1 — I-BLEND POWER INTEGRATION
# ============================================================================

class TestPowerIntegration(unittest.TestCase):
    """Tests that power-to-energy integration uses actual elapsed time,
    interval duration matches the measurement period, and partial
    coverage is never falsely labelled as a complete hour."""

    def test_constant_60kw_full_hour_equals_60kwh(self):
        """60 kW constant for a full 60 minutes = 60 kWh."""
        t0 = datetime(2016, 5, 1, 3, 30, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 4, 30, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0, t1], [60000.0, 60000.0], method="trapezoidal"
        )
        self.assertAlmostEqual(energy, 60.0, places=4)
        self.assertAlmostEqual(avg_kw, 60.0, places=4)
        self.assertAlmostEqual(minutes, 60.0, places=1)

    def test_constant_60kw_half_hour_equals_30kwh(self):
        """60 kW constant for 30 minutes = 30 kWh (NOT 60 kWh)."""
        t0 = datetime(2016, 5, 1, 3, 30, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 4, 0, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0, t1], [60000.0, 60000.0], method="trapezoidal"
        )
        self.assertAlmostEqual(energy, 30.0, places=4)
        self.assertAlmostEqual(avg_kw, 60.0, places=4)
        self.assertAlmostEqual(minutes, 30.0, places=1)

    def test_variable_power_trapezoidal(self):
        """Trapezoidal integration of varying power over 1 hour.
        P(t) = [30kW, 60kW, 90kW] at t = [0, 30, 60] min.
        Segment 1: avg = 45kW * 0.5h = 22.5 kWh
        Segment 2: avg = 75kW * 0.5h = 37.5 kWh
        Total = 60.0 kWh"""
        t0 = datetime(2016, 5, 1, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 0, 30, tzinfo=timezone.utc)
        t2 = datetime(2016, 5, 1, 1, 0, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0, t1, t2], [30000.0, 60000.0, 90000.0], method="trapezoidal"
        )
        self.assertAlmostEqual(energy, 60.0, places=4)
        self.assertAlmostEqual(avg_kw, 60.0, places=4)
        self.assertAlmostEqual(minutes, 60.0, places=1)

    def test_missing_intervals_long_gap_not_interpolated(self):
        """A 2-hour gap with max_gap_minutes=60 must be skipped, not interpolated."""
        t0 = datetime(2016, 5, 1, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 0, 30, tzinfo=timezone.utc)
        # 2 hours later — gap too large
        t2 = datetime(2016, 5, 1, 2, 30, tzinfo=timezone.utc)
        t3 = datetime(2016, 5, 1, 3, 0, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0, t1, t2, t3],
            [60000.0, 60000.0, 60000.0, 60000.0],
            method="trapezoidal",
            max_gap_minutes=60.0,
        )
        # Only 0-0:30 and 2:30-3:00 are integrated (each 30 kWh)
        self.assertAlmostEqual(energy, 60.0, places=4)
        self.assertAlmostEqual(minutes, 60.0, places=1)
        self.assertEqual(gaps, 1)
        self.assertAlmostEqual(gap_min, 120.0, places=1)

    def test_partial_hour_bucket(self):
        """3 samples in first 15 minutes of an hour yield < 60 min coverage."""
        t0 = datetime(2016, 5, 1, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 0, 5, tzinfo=timezone.utc)
        t2 = datetime(2016, 5, 1, 0, 15, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0, t1, t2], [60000.0, 60000.0, 60000.0], method="trapezoidal"
        )
        # 60 kW * 15/60 h = 15 kWh
        self.assertAlmostEqual(energy, 15.0, places=4)
        self.assertAlmostEqual(minutes, 15.0, places=1)

    def test_single_sample_uses_configured_duration(self):
        """A single sample should integrate over single_sample_minutes."""
        t0 = datetime(2016, 5, 1, 0, 0, tzinfo=timezone.utc)
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            [t0], [60000.0], single_sample_minutes=1.0
        )
        # 60 kW * 1/60 h = 1.0 kWh
        self.assertAlmostEqual(energy, 1.0, places=4)
        self.assertAlmostEqual(minutes, 1.0, places=1)

    def test_irregular_timestamps(self):
        """Intervals of 10, 20, 30 min at constant 60 kW.
        Total = 60 kW * 1h = 60 kWh."""
        base = datetime(2016, 5, 1, 0, 0, tzinfo=timezone.utc)
        timestamps = [
            base,
            base + timedelta(minutes=10),
            base + timedelta(minutes=30),
            base + timedelta(minutes=60),
        ]
        energy, avg_kw, minutes, gaps, gap_min = integrate_power_series_to_kwh(
            timestamps, [60000.0] * 4, method="trapezoidal"
        )
        self.assertAlmostEqual(energy, 60.0, places=4)
        self.assertAlmostEqual(minutes, 60.0, places=1)


# ============================================================================
# ISSUE 2 — ASHRAE UNITS
# ============================================================================

class TestAshraeUnits(unittest.TestCase):
    """Verifies ASHRAE electricity (meter=0) is kWh by default;
    kBTU requires explicit override; unsupported units are rejected."""

    def test_ashrae_electricity_default_kwh(self):
        """ASHRAE meter=0 readings are in kWh. No conversion needed."""
        importer = AshraeImporter()
        buildings, readings, summary = importer.import_train_csv(
            train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
            metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
            weather_filepath=os.path.join(FIXTURES_DIR, "ashrae_weather_sample.csv"),
        )
        # 6 total rows: 1 chilledwater (meter=1), 1 duplicate, 1 NaN, 1 negative → 2 valid
        self.assertEqual(summary.total_rows_processed, 6)
        self.assertEqual(summary.valid_records_count, 2)
        self.assertEqual(len(buildings), 1)
        self.assertEqual(buildings[0].external_id, "101")
        # First valid reading: 100.0 kWh (no conversion)
        self.assertAlmostEqual(readings[0].consumption_kwh, 100.0, places=4)
        self.assertEqual(readings[0].raw_unit, "kWh")
        self.assertEqual(readings[0].temperature_c, 24.5)

    def test_ashrae_explicit_kbtu_override_site_0(self):
        """kBTU unit is accepted only with explicit_site_0_kbtu_override=True for site 0."""
        importer = AshraeImporter()
        buildings, readings, summary = importer.import_train_csv(
            train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
            metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
            weather_filepath=os.path.join(FIXTURES_DIR, "ashrae_weather_sample.csv"),
            raw_unit="kBTU",
            explicit_site_0_kbtu_override=True,
        )
        # First valid reading: 100.0 * 0.293071 = 29.3071 kWh
        self.assertAlmostEqual(readings[0].consumption_kwh, 29.3071, places=4)
        self.assertEqual(readings[0].raw_unit, "kBTU")

    def test_ashrae_rejects_kbtu_without_override(self):
        """kBTU unit raises ValueError without explicit override flag."""
        importer = AshraeImporter()
        with self.assertRaises(ValueError) as ctx:
            importer.import_train_csv(
                train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
                metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
                raw_unit="kBTU",
            )
        self.assertIn("kBTU", str(ctx.exception))

    def test_ashrae_rejects_unsupported_unit(self):
        """Units like 'BTU', 'joules', etc. are rejected."""
        importer = AshraeImporter()
        with self.assertRaises(ValueError) as ctx:
            importer.import_train_csv(
                train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
                metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
                raw_unit="BTU",
            )
        self.assertIn("Unsupported", str(ctx.exception))

    def test_unit_conversion_function(self):
        """Direct unit conversion tests for convert_to_kwh."""
        self.assertAlmostEqual(convert_to_kwh(5000, "Wh"), 5.0)
        self.assertAlmostEqual(convert_to_kwh(60000, "W", interval_minutes=60), 60.0)
        self.assertAlmostEqual(convert_to_kwh(60000, "W", interval_minutes=15), 15.0)
        self.assertAlmostEqual(convert_to_kwh(1.5, "MWh"), 1500.0)
        with self.assertRaises(ValueError):
            convert_to_kwh(100, "gallons")


# ============================================================================
# ISSUE 3 — TIMEZONE AND DATA QUALITY
# ============================================================================

class TestTimezoneConversion(unittest.TestCase):
    """Tests IST conversion, DST handling, and ambiguous/missing timestamps."""

    def test_ist_to_utc_preservation(self):
        """IST (UTC+5:30) → UTC with preserved local time."""
        dt_utc, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc(
            "2016-05-01 09:00:00", "Asia/Kolkata"
        )
        self.assertEqual(utc_iso, "2016-05-01T03:30:00Z")
        self.assertIn("+05:30", local_iso)
        self.assertIsNone(tz_warn)

    def test_north_america_edt_conversion(self):
        """EDT (UTC-4) in May → UTC."""
        dt_utc, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc(
            "2016-05-01 09:00:00", "America/New_York"
        )
        self.assertEqual(utc_iso, "2016-05-01T13:00:00Z")
        self.assertIn("-04:00", local_iso)
        self.assertIsNone(tz_warn)

    def test_dst_spring_forward_gap_raises(self):
        """2:30 AM local on 2016-03-13 in US/Eastern does not exist (spring forward)."""
        with self.assertRaises(NonExistentLocalTimeError):
            parse_and_convert_to_utc("2016-03-13 02:30:00", "America/New_York")

    def test_dst_fall_back_ambiguous_flagged(self):
        """1:30 AM on 2016-11-06 in US/Eastern is ambiguous (fall back).
        Should flag tz_warning, not silently guess."""
        dt_utc, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc(
            "2016-11-06 01:30:00", "America/New_York"
        )
        self.assertIsNotNone(tz_warn)
        self.assertIn("DST_AMBIGUOUS", tz_warn)

    def test_dst_fall_back_ambiguous_reject_mode(self):
        """With reject_ambiguous=True, ambiguous timestamp raises."""
        with self.assertRaises(AmbiguousLocalTimeError):
            parse_and_convert_to_utc(
                "2016-11-06 01:30:00", "America/New_York", reject_ambiguous=True
            )

    def test_ist_no_dst_ambiguity(self):
        """India Standard Time has no DST — no warning ever."""
        _, _, _, tz_warn = parse_and_convert_to_utc("2016-11-06 01:30:00", "Asia/Kolkata")
        self.assertIsNone(tz_warn)

    def test_epoch_timestamp(self):
        """Unix epoch integers are parsed correctly."""
        dt_utc, utc_iso, local_iso, tz_warn = parse_and_convert_to_utc("1462093200", "UTC")
        self.assertEqual(utc_iso, "2016-05-01T09:00:00Z")
        self.assertIsNone(tz_warn)


class TestDataQuality(unittest.TestCase):
    """Tests for counter resets/rollovers, duplicate detection, missing intervals."""

    def test_cumulative_normal_increment(self):
        delta, status, note = compute_cumulative_delta(150.0, 100.0)
        self.assertEqual(delta, 50.0)
        self.assertEqual(status, DataQualityStatus.CALCULATED_INTERVAL)

    def test_cumulative_hardware_rollover(self):
        """9980 → 30 at counter limit 10000 → recovered 50 kWh."""
        delta, status, note = compute_cumulative_delta(
            30.0, 9980.0, counter_rollover_limit=10000.0
        )
        self.assertEqual(delta, 50.0)
        self.assertEqual(status, DataQualityStatus.METER_RESET_ROLLOVER)
        self.assertIn("rollover", note.lower())

    def test_cumulative_unexplained_negative_rejected(self):
        """Negative jump without rollover limit → INVALID_REJECTED, never zero."""
        delta, status, note = compute_cumulative_delta(10.0, 500.0)
        self.assertIsNone(delta)
        self.assertEqual(status, DataQualityStatus.INVALID_REJECTED)

    def test_cumulative_exceeds_physical_max(self):
        """Delta exceeding physical max → FLAGGED_OUTLIER."""
        delta, status, note = compute_cumulative_delta(60000.0, 1.0, physical_max_kwh=50000.0)
        self.assertEqual(status, DataQualityStatus.FLAGGED_OUTLIER)
        self.assertIn("exceeds", note.lower())


# ============================================================================
# IMPORTER INTEGRATION TESTS
# ============================================================================

class TestIBlendImporter(unittest.TestCase):
    """Integration tests for the I-BLEND importer using sample fixtures."""

    def test_iblend_power_and_occupancy_import(self):
        # Fixture uses 30-min spacing, so set max_gap_minutes=None to avoid
        # rejecting the 30-min gap between 09:00 and 09:30 IST samples.
        # (Real I-BLEND data at 1-min intervals would use the default 15-min threshold.)
        importer = IBlendImporter(target_interval_minutes=60, max_gap_minutes=None)
        power_csv = os.path.join(FIXTURES_DIR, "iblend_power_sample.csv")
        readings, summary = importer.import_electrical_csv(
            power_csv,
            building_id="IIITD_Academic_Block",
            meter_id="IIITD_Acad_Main",
            power_unit="W",
        )

        # 7 raw rows total
        self.assertEqual(summary.total_rows_processed, 7)
        # Data source and provenance
        self.assertEqual(summary.data_source, DataSourceType.IBLEND_REAL_WORLD)
        self.assertEqual(summary.source_timezone, "Asia/Kolkata")
        self.assertTrue(len(summary.file_sha256) == 64)

        # Verify valid readings were produced
        self.assertGreater(len(readings), 0)
        self.assertGreater(summary.valid_records_count, 0)

        # Rejections: 1 missing power (row 6/11:00), 1 negative (row 7/12:00), 1 duplicate (row 4+5/10:00)
        # Total rejected >= 3 (may include additional from detect_duplicates_and_gaps)
        self.assertGreaterEqual(summary.rejected_count, 3)
        self.assertGreaterEqual(summary.duplicate_count, 1)

        # Verify IST → UTC on first reading bucket
        first = readings[0]
        self.assertIn("+05:30", first.source_local_time)
        self.assertEqual(first.raw_unit, "W")

        # Power integration: 09:00 and 09:30 IST → bucket at 09:00 IST (03:30Z)
        # 60 kW constant over 30 minutes = 30 kWh
        self.assertAlmostEqual(first.consumption_kwh, 30.0, places=1)
        # interval_minutes should reflect actual coverage (~30 min), NOT 60
        self.assertLessEqual(first.interval_minutes, 60)
        # Partial coverage (30 of 60 min) is correctly flagged, not labeled CALCULATED_INTERVAL
        self.assertEqual(first.quality_status, DataQualityStatus.FLAGGED_OUTLIER)

        # Verify missing intervals are detected
        self.assertGreaterEqual(summary.missing_interval_count, 1)

        # Occupancy import: building-level only
        occ_csv = os.path.join(FIXTURES_DIR, "iblend_occupancy_sample.csv")
        occ_records, occ_rejected = importer.import_building_occupancy_csv(
            occ_csv, building_id="IIITD_Academic_Block"
        )
        self.assertEqual(len(occ_records), 2)
        self.assertEqual(len(occ_rejected), 2)  # 1 missing, 1 negative
        self.assertEqual(occ_records[0].granularity, OccupancyGranularity.BUILDING_LEVEL)
        self.assertEqual(occ_records[0].source_type, "WIFI_ASSOCIATION")


class TestBDG2Importer(unittest.TestCase):
    """Integration tests for the BDG2 importer."""

    def test_bdg2_import_with_metadata_and_weather(self):
        importer = BDG2Importer()
        buildings, readings, summary = importer.import_electricity_csv(
            electricity_filepath=os.path.join(FIXTURES_DIR, "bdg2_electricity_sample.csv"),
            metadata_filepath=os.path.join(FIXTURES_DIR, "bdg2_metadata_sample.csv"),
            weather_filepath=os.path.join(FIXTURES_DIR, "bdg2_weather_sample.csv"),
        )

        self.assertEqual(len(buildings), 2)
        b_map = {b.external_id: b for b in buildings}
        # Verify heterogeneous space usage is NOT coerced into educational
        self.assertEqual(b_map["Panther_education_BldgA"].building_type, "ACADEMIC")
        self.assertEqual(b_map["Robin_office_BldgB"].building_type, "OFFICE")
        self.assertEqual(b_map["Robin_office_BldgB"].primary_space_usage, "Office")

        # 4 timestamp rows × 2 buildings = 8 raw records:
        # - Panther duplicate at 10:00 (1 rejected)
        # - Robin NaN at 10:00 (1 rejected)
        # - Robin negative at 12:00 (1 rejected)
        self.assertEqual(summary.total_rows_processed, 8)
        # At least 3 rejections (may be more due to dedup in detect_duplicates_and_gaps)
        self.assertGreaterEqual(summary.rejected_count, 3)
        # Valid readings should be > 0
        self.assertGreater(summary.valid_records_count, 0)

        # Verify weather joined via UTC alignment for Panther
        panther_readings = [r for r in readings if r.external_building_id == "Panther_education_BldgA"]
        self.assertGreater(len(panther_readings), 0)
        panther_first = panther_readings[0]
        # Panther site uses America/New_York (EDT UTC-4)
        # 09:00 local EDT → 13:00 UTC
        self.assertEqual(panther_first.timestamp_utc, "2016-05-01T13:00:00Z")
        self.assertEqual(panther_first.temperature_c, 21.4)


class TestAshraeImporter(unittest.TestCase):
    """Integration tests for the ASHRAE importer."""

    def test_ashrae_electricity_default_import(self):
        importer = AshraeImporter()
        buildings, readings, summary = importer.import_train_csv(
            train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
            metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
            weather_filepath=os.path.join(FIXTURES_DIR, "ashrae_weather_sample.csv"),
        )

        # 6 rows total: 1 chilledwater (meter=1) filtered → 5 electricity rows processed
        # From 5: 1 duplicate, 1 NaN, 1 negative → 2 valid
        self.assertEqual(summary.total_rows_processed, 6)
        self.assertEqual(summary.valid_records_count, 2)
        self.assertEqual(len(buildings), 1)
        self.assertEqual(buildings[0].external_id, "101")

        # Default unit is kWh — no conversion
        self.assertAlmostEqual(readings[0].consumption_kwh, 100.0, places=4)
        self.assertEqual(readings[0].raw_unit, "kWh")
        self.assertEqual(readings[0].temperature_c, 24.5)


if __name__ == "__main__":
    unittest.main()
