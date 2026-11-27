# 7. Limitations and future work

## Current limitations

- ABC University is fictional; dataset values are synthetic and deterministic.
- No physical smart-meter integration or customer deployment was verified. The live-looking telemetry workflow is a browser simulator.
- No occupancy observations exist in the seed. Timetables describe planned activity only.
- The synthetic flat tariff and solar/battery specifications are illustrative assumptions, not utility contracts or actual equipment records.
- Model diagnostics on synthetic data do not demonstrate generalization to a real university. Horizon diagnostics may use one fixed origin; repeated rolling-origin evaluation on licensed real data is needed.
- Forecasting is hourly and meter-level; the project does not infer room-level consumption or weather effects where the records are absent.
- Digital Twin outcomes depend on forecast, tariff, resource configuration and scenario assumptions. Savings are `ESTIMATED_UNVERIFIED`; no field measurement confirms them.
- Demand-charge treatment uses a selected-horizon peak proxy rather than a complete utility billing-cycle model. Some multi-meter/multi-battery configurations are deliberately rejected until topology is represented safely.
- The repository’s local demo startup is not evidence of hardened production hosting, managed backup/recovery, distributed workers or third-party integrations.

## Future work

1. Integrate one real campus data source under license, preserving source lineage and validating time/unit semantics.
2. Connect physical meters through a documented gateway protocol with authenticated device identity and operational monitoring.
3. Add privacy-reviewed occupancy evidence only where lawfully available; maintain separation from schedules.
4. Conduct repeated rolling-origin forecast evaluation on held-out real campus data and publish uncertainty/coverage measures.
5. Compare predicted recommendations with verified interventions and post-action measurements before any savings claim.
6. Extend optimization to billing-cycle demand charges, equipment topology, degradation calibration, weather-driven solar forecasts and operational constraints.
7. Complete production operations: deployment pipeline, managed private object storage, email/payment providers if required, distributed rate limiting/workers, automated backups and restoration drills, retention/export/deletion processes and security review.

## Conclusion

EcoGrid demonstrates an integrated architecture for energy data, operational context and analytical workflows. Its strongest validated contribution is a reproducible synthetic end-to-end demonstration, including a forecast-to-optimization path. Further field data and operational validation are required before claims about real-world predictive performance, energy savings or commercial readiness.
