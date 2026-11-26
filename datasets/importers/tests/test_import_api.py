import os
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["IMPORT_SERVICE_TOKEN"] = "test-only-token"
from intelligence.app.main import app  # noqa: E402


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).parent / "fixtures"


class TestImporterApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.headers = {"X-Import-Service-Token": "test-only-token"}

    def _file(self, name):
        return (name, (FIXTURES / name).read_bytes(), "text/csv")

    def test_import_normalizer_rejects_missing_internal_token(self):
        response = self.client.post(
            "/api/imports/normalize",
            data={"dataset_type": "IBLEND_REAL_WORLD", "building_id": "b", "meter_id": "m"},
            files={"readings_file": self._file("iblend_power_sample.csv")},
        )
        self.assertEqual(response.status_code, 401)

    def test_iblend_normalization_keeps_building_level_occupancy(self):
        response = self.client.post(
            "/api/imports/normalize",
            headers=self.headers,
            data={
                "dataset_type": "IBLEND_REAL_WORLD",
                "building_id": "local-building",
                "meter_id": "local-meter",
                "external_building_id": "IIITD_Academic_Block",
                "power_unit": "W",
            },
            files={
                "readings_file": self._file("iblend_power_sample.csv"),
                "occupancy_file": self._file("iblend_occupancy_sample.csv"),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertGreater(data["summary"]["valid_records_count"], 0)
        self.assertEqual(data["source_granularity"], "BUILDING_LEVEL")
        self.assertTrue(all(row["granularity"] == "BUILDING_LEVEL" for row in data["occupancy"]))
        self.assertTrue(all(row["external_building_id"] == "IIITD_Academic_Block" for row in data["occupancy"]))

    def test_bdg2_normalization_filters_and_preserves_source_building(self):
        response = self.client.post(
            "/api/imports/normalize",
            headers=self.headers,
            data={
                "dataset_type": "BDG2_BENCHMARK",
                "building_id": "local-building",
                "meter_id": "local-meter",
                "external_building_id": "Panther_education_BldgA",
                "raw_unit": "kWh",
            },
            files={
                "readings_file": self._file("bdg2_electricity_sample.csv"),
                "metadata_file": self._file("bdg2_metadata_sample.csv"),
                "weather_file": self._file("bdg2_weather_sample.csv"),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertTrue(data["readings"])
        self.assertEqual({row["external_building_id"] for row in data["readings"]}, {"Panther_education_BldgA"})
        self.assertEqual(data["occupancy"], [])

    def test_ashrae_normalization_filters_non_electricity_and_buildings(self):
        response = self.client.post(
            "/api/imports/normalize",
            headers=self.headers,
            data={
                "dataset_type": "ASHRAE_GEPIII",
                "building_id": "local-building",
                "meter_id": "local-meter",
                "external_building_id": "101",
                "raw_unit": "kWh",
            },
            files={
                "readings_file": self._file("ashrae_train_sample.csv"),
                "metadata_file": self._file("ashrae_metadata_sample.csv"),
                "weather_file": self._file("ashrae_weather_sample.csv"),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["summary"]["valid_records_count"], 2)
        self.assertEqual({row["external_building_id"] for row in data["readings"]}, {"101"})
        self.assertEqual(data["occupancy"], [])


if __name__ == "__main__":
    unittest.main()
