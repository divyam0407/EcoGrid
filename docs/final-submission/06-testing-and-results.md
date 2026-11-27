# 6. Testing and results

This chapter summarizes evidence recorded during F1–F4. It does not claim that every test suite was rerun in one final combined command. Suite counts below are milestone-specific and may overlap.

| Milestone | Recorded verification | Interpretation |
|---|---|---|
| F1 | Integration and application checks were run and reported complete in the F1 milestone | The count is not restated here because the source milestone report is not part of this repository snapshot. |
| F2 | Responsive UI checks were reported complete | No claim of formal browser/device matrix coverage. |
| F3 | Synthetic demo data validation and end-to-end workflows were reported 10/10 | Validation applies to the seeded synthetic demo. |
| F4 | Python intelligence tests: 19 passed; backend and frontend builds passed; Prisma validation and `git diff --check` passed | The dedicated F4 end-to-end demo used `ecogrid_demo`. |
| F4 forecast→Digital Twin | 24 contiguous future hourly predictions were persisted; first timestamp `2026-11-27T14:00Z`, last `2026-11-28T13:00Z`; scenario completed with solver status `OPTIMAL` across 24 intervals | This confirms workflow integration for synthetic demo inputs, not forecasting accuracy or realized energy savings. |
| F4 safety | Verification explicitly used `ecogrid_demo`; `ecogrid_db`, `ecogrid_a10_test` and original SQLite database were left untouched | Database preservation was part of that recorded verification. |

Additional A6/A7/A8/A9/A10 integration suites have milestone-specific counts recorded in their code and earlier reports. They are not combined into a single “total passed” number here because runs occurred at different times and suites overlap. The final F4 Python suite emitted pandas deprecation and `datetime.utcnow` warnings; these did not fail the run.

### How to interpret the result

`OPTIMAL` is a solver status, not a causal energy-savings evaluation. Forecast predictions and dispatch are model/simulation outputs. No real building deployment, held-out real campus dataset, physical meter signal, or independently verified savings measurement is claimed.
