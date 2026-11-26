import numpy as np
import pandas as pd
from typing import List, Dict, Any

class SolarGenerationModel:
    """Illustrative clear-sky shape model; not a weather-informed generation forecast."""
    def __init__(self, capacity_kw: float, derating_factor: float):
        self.capacity_kw = capacity_kw
        self.derating_factor = derating_factor

    def calculate_generation(
        self,
        timestamps: List[str],
        cloud_cover_percent: List[float]
    ) -> List[Dict[str, float]]:
        if len(cloud_cover_percent) != len(timestamps):
            raise ValueError("An explicit cloud-cover assumption is required for every timestamp.")
        results = []
        dts = pd.to_datetime(timestamps)

        for idx, dt in enumerate(dts):
            hr = dt.hour + (dt.minute / 60.0)
            # Solar peak at ~12:30 PM (solar noon)
            # Active between 6 AM and 6.5 PM (18:30)
            if 6.0 <= hr <= 18.5:
                # Normal distribution centered at 12.5 with std dev ~2.5 hours
                solar_angle_factor = np.sin((hr - 6.0) / (18.5 - 6.0) * np.pi) ** 1.3
                cloud = cloud_cover_percent[idx] / 100.0
                derating = self.derating_factor
                gen_kw = max(0.0, self.capacity_kw * solar_angle_factor * (1.0 - 0.75 * cloud) * derating)
            else:
                gen_kw = 0.0

            results.append({
                "timestamp": dt.isoformat(),
                "generation_kw": round(gen_kw, 2),
                "generation_kwh": round(gen_kw, 2) # for 1-hour interval
            })
        return results
