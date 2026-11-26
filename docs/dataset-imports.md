# Dataset Import Requirements

EcoGrid accepts user-supplied CSV files through the authenticated Dataset Imports
page. Phase 3A adds the ingestion path; it does not download third-party data.
The current import is scoped to one organization, one source building and one
mapped EcoGrid building/meter per batch.

## Source files

| Source | Required files | Optional files | Import granularity and limits |
| --- | --- | --- | --- |
| I-BLEND | Readings CSV with `timestamp`/`time`/`date` and `power_w`/`power`/`active_power`, or a cumulative `energy_kwh`/`cumulative_kwh`/`kwh` column | Building-level occupancy CSV with `timestamp` and `occupancy_count` | Electrical telemetry is normalized to hourly intervals. Instantaneous values must be declared W or kW; cumulative values must be kWh. Occupancy remains building-level and is imported only when provided. |
| BDG2 | Electricity readings CSV, metadata CSV with source building and site identifiers | Weather CSV | Select a source building ID present in both readings and metadata. Electricity values must be declared kWh, Wh or MWh. The importer rejects ambiguous or nonexistent local times and missing/invalid readings; it does not fill gaps. |
| ASHRAE GEPIII | Train readings CSV, building metadata CSV | Weather CSV | Select a source building ID present in both files. Only electricity meter `0` is imported. Electricity values must be kWh, Wh or MWh. Occupancy and operational schedules are not provided by this import path. Ambiguous or nonexistent local times are rejected. |

The importer reports exact column and unit validation errors when a file does not
match its expected source format. The user must provide a correct source
timezone through a source-supported dataset; the application does not guess a
campus timezone from a filename. Source local timestamps are retained alongside
the normalized UTC timestamp.

## Provenance and quality

Each input file is SHA-256 hashed, including readings, metadata, weather and
occupancy files. The batch records the source label, source URL and license
identifier supplied by the importer, original filename, byte count, timezone,
original unit, preprocessing version, mapping, processing totals, and status.
Readings retain their source external building/meter identifiers and normalized
units. Rejected rows include their source row number and reason; the batch page
provides a CSV report. Inputs are retained in private import storage for
provenance and retry support.

The importer’s license/source labels are attribution metadata, not legal advice
or proof that a user's copy has commercial redistribution rights. Before a
university uploads data, it must confirm the dataset license, access terms,
privacy requirements and attribution obligations for its intended use.

## Lifecycle and retry behavior

New batches move through `UPLOADED`, `VALIDATING`, `PROCESSING`, and then
`COMPLETED`, `COMPLETED_WITH_WARNINGS`, or `FAILED`. Completed imports with the
same file hashes and mappings return the prior batch. A failed batch can be
retried with the same content. Reading writes and rejected-row persistence are
transactional. Unique organization/meter/timestamp keys prevent duplicate
reading records; collisions fail the batch rather than silently discarding
rows. Missing measurements, malformed timestamps, invalid units and ambiguous
DST values are rejected or reported; EcoGrid does not interpolate values or
fabricate occupancy/schedules.

## Current operational limits

- Maximum upload size: 100 MB per file; at most four files per request.
- Maximum one mapped source building and one EcoGrid meter per batch.
- BDG2 and ASHRAE multi-building files should be uploaded one selected source
  building at a time.
- The Express API currently performs normalization synchronously. The database
  stores stage/progress fields and history, but this is not yet a durable queue
  worker. Large real-world files may exceed request timeouts or memory limits;
  validate file sizes and use small subsets before production-scale ingestion.
- The current importer metadata uses source/attribution labels embedded in the
  existing importers. Verify those terms against the exact dataset release
  before commercial use.
- Forecasts are scoped to a selected source and require at least 48 readings.
  Reported error metrics use a chronological holdout split and are not evidence
  of commercial accuracy or energy savings. Confidence ranges are indicative
  and not calibrated.
