import pandas as pd
import numpy as np
from datetime import datetime, time
from typing import List, Dict, Any
from intelligence.app.api.schemas.operational_schemas import (
    OperationalCorrelationRequest,
    OperationalCorrelationResponse,
    InefficiencyFinding
)

class OperationalCorrelationEngine:
    def __init__(self):
        pass

    def correlate(self, req: OperationalCorrelationRequest) -> OperationalCorrelationResponse:
        readings_df = pd.DataFrame([r.dict() for r in req.readings])
        if len(readings_df) == 0:
            return OperationalCorrelationResponse(
                total_hours_analyzed=0,
                scheduled_hours=0,
                unscheduled_hours=0,
                total_inefficiency_instances=0,
                total_excess_kwh=0.0,
                total_estimated_waste_cost=0.0,
                findings=[]
            )

        readings_df['dt'] = pd.to_datetime(readings_df['timestamp'])
        readings_df['hour'] = readings_df['dt'].dt.hour
        readings_df['dow'] = readings_df['dt'].dt.dayofweek
        readings_df['date_str'] = readings_df['dt'].dt.strftime('%Y-%m-%d')
        readings_df['time_str'] = readings_df['dt'].dt.strftime('%H:%M')

        # Map schedule into quick lookup: (room_id, dow, hour) -> schedule_item
        sched_map = {}
        for s in req.schedules:
            room = s.room_id
            try:
                # Parse start and end hour
                if ":" in s.start_time:
                    s_hr = int(s.start_time.split(":")[0])
                else:
                    s_hr = pd.to_datetime(s.start_time).hour
                if ":" in s.end_time:
                    e_hr = int(s.end_time.split(":")[0])
                else:
                    e_hr = pd.to_datetime(s.end_time).hour
            except Exception:
                s_hr, e_hr = 9, 17

            dow = s.day_of_week
            for h in range(s_hr, max(s_hr + 1, e_hr)):
                if dow is not None:
                    sched_map[(room, dow, h)] = s
                else:
                    # All weekdays
                    for d in range(5):
                        sched_map[(room, d, h)] = s

        # Calculate empirical idle baseline per room (e.g. night hours 1 AM - 5 AM or off-days)
        night_mask = readings_df['hour'].isin([1, 2, 3, 4])
        room_baselines = {}
        if night_mask.any():
            idle_stats = readings_df[night_mask].groupby('room_id')['consumption_kwh'].median()
            for r_id, val in idle_stats.items():
                room_baselines[r_id] = max(0.5, float(val))
        
        findings: List[InefficiencyFinding] = []
        total_excess_kwh = 0.0
        scheduled_count = 0
        unscheduled_count = 0

        # Iterate over readings
        for idx, row in readings_df.iterrows():
            room = row['room_id']
            dow = row['dow']
            hr = row['hour']
            consumption = float(row['consumption_kwh'])
            obs_occ = row.get('observed_occupancy')
            if obs_occ is None or np.isnan(obs_occ):
                obs_occ = None

            idle_base = room_baselines.get(room, req.idle_threshold_kwh or 2.0)
            sched = sched_map.get((room, dow, hr))

            if sched is not None:
                scheduled_count += 1
                # Case A: Scheduled session, but observed occupancy is negligible while consumption is at full load
                if obs_occ is not None and obs_occ < 3 and consumption > (idle_base * 2.5):
                    excess = consumption - idle_base
                    cost = excess * req.default_tariff
                    total_excess_kwh += excess
                    findings.append(InefficiencyFinding(
                        building_id=row['building_id'],
                        room_id=room,
                        start_time=row['timestamp'],
                        end_time=row['timestamp'],
                        inefficiency_type="low_occupancy_waste",
                        expected_status=f"Scheduled for {sched.activity_name} ({sched.expected_occupancy} people)",
                        actual_consumption_kwh=round(consumption, 2),
                        idle_baseline_kwh=round(idle_base, 2),
                        excess_kwh=round(excess, 2),
                        estimated_cost_impact=round(cost, 2),
                        confidence=0.88,
                        severity="medium",
                        suggested_investigation=f"Room scheduled for {sched.activity_name} had only {obs_occ} occupants, but equipment and HVAC ran at full capacity."
                    ))
            else:
                unscheduled_count += 1
                # Case B: Unscheduled period, but consumption significantly exceeds idle baseline
                if consumption > (idle_base + 3.0) and consumption > (idle_base * 1.8):
                    excess = consumption - idle_base
                    cost = excess * req.default_tariff
                    total_excess_kwh += excess

                    # Differentiate whether it immediately follows a scheduled session (equipment overrun)
                    prev_sched = sched_map.get((room, dow, (hr - 1) % 24))
                    if prev_sched is not None:
                        itype = "equipment_overrun"
                        desc = f"Class '{prev_sched.activity_name}' finished at {hr}:00, but {room} consumption remained high ({consumption} kWh vs {round(idle_base, 1)} kWh idle baseline)."
                        action = f"Check if lab PCs, projectors, or dedicated AC units in {room} were left running after {prev_sched.activity_name}."
                        sev = "high" if excess > 10 else "medium"
                    elif hr >= 20 or hr < 7:
                        itype = "high_idle_period_consumption"
                        desc = f"Off-hours overnight consumption of {consumption} kWh in {room} (expected idle baseline {round(idle_base, 1)} kWh)."
                        action = f"Conduct night inspection for {room}. Automate smart plug or central breaker shutdown."
                        sev = "high" if excess > 15 else "medium"
                    else:
                        itype = "unscheduled_high_consumption"
                        desc = f"Unscheduled period consumption: {room} drew {consumption} kWh without any timetable booking."
                        action = f"Investigate unbooked usage or audit baseline standby load in {room}."
                        sev = "low" if excess < 6 else "medium"

                    confidence = min(0.95, round(0.70 + (excess / (idle_base + excess)) * 0.25, 2))
                    findings.append(InefficiencyFinding(
                        building_id=row['building_id'],
                        room_id=room,
                        start_time=row['timestamp'],
                        end_time=row['timestamp'],
                        inefficiency_type=itype,
                        expected_status="Unscheduled / Vacant",
                        actual_consumption_kwh=round(consumption, 2),
                        idle_baseline_kwh=round(idle_base, 2),
                        excess_kwh=round(excess, 2),
                        estimated_cost_impact=round(cost, 2),
                        confidence=confidence,
                        severity=sev,
                        suggested_investigation=action
                    ))

        total_cost = round(total_excess_kwh * req.default_tariff, 2)
        return OperationalCorrelationResponse(
            total_hours_analyzed=len(readings_df),
            scheduled_hours=scheduled_count,
            unscheduled_hours=unscheduled_count,
            total_inefficiency_instances=len(findings),
            total_excess_kwh=round(total_excess_kwh, 2),
            total_estimated_waste_cost=total_cost,
            findings=findings
        )
