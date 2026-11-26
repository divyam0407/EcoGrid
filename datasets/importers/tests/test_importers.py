import os
import unittest
from datetime import datetime, timezone
from datasets.importers.common.enums import DataSourceType, DataQualityStatus, OccupancyGranularity
from datasets.importers.common.timezone_utils import parse_and_convert_to_utc
from datasets.importers.common.physics import (
    convert_to_kwh,
    integrate_power_series_to_kwh,
    compute_cumulative_delta,
)
from datasets.importers.iblend_importer import IBlendImporter
from datasets.importers.bdg2_importer import BDG2Importer
from datasets.importers.ashrae_importer import AshraeImporter

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


class TestCommonPhysicsAndTimezones(unittest.TestCase):
    def test_ist_to_utc_preservation(self):
        dt_utc, utc_iso, local_iso = parse_and_convert_to_utc("2016-05-01 09:00:00", "Asia/Kolkata")
        self.assertEqual(utc_iso, "2016-05-01T03:30:00Z")
        self.assertIn("+05:30", local_iso)

    def test_north_america_dst_conversion(self):
        # May 1 is EDT (UTC-4) in America/New_York
        _, utc_iso, local_iso = parse_and_convert_to_utc("2016-05-01 09:00:00", "America/New_York")
        self.assertEqual(utc_iso, "2016-05-01T13:00:00Z")
        self.assertIn("-04:00", local_iso)

    def test_unit_conversions(self):
        self.assertAlmostEqual(convert_to_kwh(5000, "Wh"), 5.0)
        self.assertAlmostEqual(convert_to_kwh(60000, "W", interval_minutes=60), 60.0)
        self.assertAlmostEqual(convert_to_kwh(60000, "W", interval_minutes=15), 15.0)
        self.assertAlmostEqual(convert_to_kwh(1.5, "MWh"), 1500.0)

    def test_trapezoidal_power_integration(self):
        t0 = datetime(2016, 5, 1, 3, 30, tzinfo=timezone.utc)
        t1 = datetime(2016, 5, 1, 4, 0, tzinfo=timezone.utc)
        # 60,000 W (60 kW) held over 0.5 hr = 30.0 kWh
        energy_kwh, avg_kw = integrate_power_series_to_kwh([t0, t1], [60000.0, 60000.0], method="trapezoidal")
        self.assertAlmostEqual(energy_kwh, 30.0)
        self.assertAlmostEqual(avg_kw, 60.0)

    def test_cumulative_meter_reset_and_rollover(self):
        # Normal increment
        delta, status, _ = compute_cumulative_delta(150.0, 100.0)
        self.assertEqual(delta, 50.0)
        self.assertEqual(status, DataQualityStatus.CALCULATED_INTERVAL)

        # Hardware rollover at 10,000 kWh limit: 9980 -> 30 => 50 kWh
        delta_roll, status_roll, _ = compute_cumulative_delta(30.0, 9980.0, counter_rollover_limit=10000.0)
        self.assertEqual(delta_roll, 50.0)
        self.assertEqual(status_roll, DataQualityStatus.METER_RESET_ROLLOVER)

        # Unexplained negative jump (no rollover limit or exceeds capacity) -> INVALID_REJECTED (never silently 0!)
        delta_bad, status_bad, _ = compute_cumulative_delta(10.0, 500.0)
        self.assertIsNone(delta_bad)
        self.assertEqual(status_bad, DataQualityStatus.INVALID_REJECTED)


class TestIBlendImporter(unittest.TestCase):
    def test_iblend_power_and_occupancy_import(self):
        importer = IBlendImporter(target_interval_minutes=60)
        power_csv = os.path.join(FIXTURES_DIR, "iblend_power_sample.csv")
        readings, summary = importer.import_electrical_csv(
            power_csv, building_id="IIITD_Academic_Block", meter_id="IIITD_Acad_Main", power_unit="W"
        )

        # 7 raw rows: 1 duplicate (10:00), 1 missing (11:00), 1 negative (-500 at 12:00) -> 3 rejected
        self.assertEqual(summary.total_rows_processed, 7)
        self.assertEqual(summary.rejected_count, 3)
        self.assertEqual(summary.duplicate_count, 1)
        self.assertEqual(summary.data_source, DataSourceType.IBLEND_REAL_WORLD)
        self.assertEqual(summary.source_timezone, "Asia/Kolkata")
        self.assertTrue(len(summary.file_sha256) == 64)

        # Verify IST -> UTC and trapezoidal integration on 09:00-09:30 bucket (60kW * 0.5h = 30 kWh)
        first = readings[0]
        self.assertEqual(first.timestamp_utc, "2016-05-01T03:30:00Z")
        self.assertIn("+05:30", first.source_local_time)
        self.assertAlmostEqual(first.consumption_kwh, 30.0)
        self.assertEqual(first.raw_unit, "W")
        self.assertEqual(first.voltage_v, 230.0)
        self.assertEqual(first.quality_status, DataQualityStatus.CALCULATED_INTERVAL)

        # Verify missing intervals detected (gap between 10:00 and 13:00 IST)
        self.assertGreaterEqual(summary.missing_interval_count, 1)

        # Occupancy import: building-level only
        occ_csv = os.path.join(FIXTURES_DIR, "iblend_occupancy_sample.csv")
        occ_records, occ_rejected = importer.import_building_occupancy_csv(occ_csv, building_id="IIITD_Academic_Block")
        self.assertEqual(len(occ_records), 2)
        self.assertEqual(len(occ_rejected), 2)  # 1 missing, 1 negative
        self.assertEqual(occ_records[0].granularity, OccupancyGranularity.BUILDING_LEVEL)
        self.assertEqual(occ_records[0].source_type, "WIFI_ASSOCIATION")


class TestBDG2Importer(unittest.TestCase):
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

        # 4 rows x 2 buildings = 8 raw records:
        # - Panther duplicate at 10:00 (1 rejected)
        # - Robin NaN at 10:00 (1 rejected)
        # - Robin negative at 12:00 (1 rejected)
        # => 5 valid readings, 3 rejected
        self.assertEqual(summary.total_rows_processed, 8)
        self.assertEqual(summary.valid_records_count, 5)
        self.assertEqual(summary.rejected_count, 3)

        # Verify weather joined via UTC alignment
        panther_9am = [r for r in readings if r.external_building_id == "Panther_education_BldgA"][0]
        self.assertEqual(panther_9am.timestamp_utc, "2016-05-01T13:00:00Z")
        self.assertEqual(panther_9am.temperature_c, 21.4)


class TestAshraeImporter(unittest.TestCase):
    def test_ashrae_electricity_filter_and_kbtu_conversion(self):
        importer = AshraeImporter()
        buildings, readings, summary = importer.import_train_csv(
            train_filepath=os.path.join(FIXTURES_DIR, "ashrae_train_sample.csv"),
            metadata_filepath=os.path.join(FIXTURES_DIR, "ashrae_metadata_sample.csv"),
            weather_filepath=os.path.join(FIXTURES_DIR, "ashrae_weather_sample.csv"),
            site_0_kbtu_to_kwh=True,
        )

        # 6 rows total: 1 chilledwater (meter=1) filtered out, 1 duplicate, 1 NaN, 1 negative -> 2 valid electric readings
        self.assertEqual(summary.total_rows_processed, 6)
        self.assertEqual(summary.valid_records_count, 2)
        self.assertEqual(summary.rejected_count, 3)
        self.assertEqual(len(buildings), 1)
        self.assertEqual(buildings[0].external_id, "101")

        # Site 0 kBTU -> kWh conversion: 100.0 * 0.293071 = 29.3071
        self.assertAlmostEqual(readings[0].consumption_kwh, 29.3071, places=4)
        self.assertEqual(readings[0].raw_unit, "kBTU")
        self.assertEqual(readings[0].temperature_c, 24.5)


if __name__ == "__main__":
    unittest.main()
