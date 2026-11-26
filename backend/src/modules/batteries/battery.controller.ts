import { Request, Response } from 'express';
import { prisma } from '../../config';
import '../../middleware/auth';

const numericFields = ['capacityKwh', 'maxChargeKw', 'maxDischargeKw', 'minSoc', 'maxSoc', 'initialSoc', 'chargingEfficiency', 'dischargingEfficiency', 'degradationCost', 'reserveSocKwh', 'finalSocKwh'] as const;
function validateBattery(v: any) {
  if (v.status !== undefined && !['ACTIVE', 'MAINTENANCE', 'OFFLINE'].includes(v.status)) return 'Battery status must be ACTIVE, MAINTENANCE or OFFLINE.';
  if (v.allowGridCharging !== undefined && typeof v.allowGridCharging !== 'boolean') return 'Grid-charging permission must be boolean.';
  const values = Object.fromEntries(numericFields.map(k => [k, v[k]]));
  const required = ['capacityKwh', 'maxChargeKw', 'maxDischargeKw', 'minSoc', 'maxSoc', 'initialSoc', 'chargingEfficiency', 'dischargingEfficiency', 'degradationCost'] as const;
  if (required.some(k => values[k] === undefined || !Number.isFinite(Number(values[k]))) || ['reserveSocKwh', 'finalSocKwh'].some(k => values[k] != null && !Number.isFinite(Number(values[k])))) return 'All battery ratings and efficiencies must be configured as finite values.';
  if (v.capacityKwh <= 0 || v.maxChargeKw <= 0 || v.maxDischargeKw <= 0 || v.minSoc < 0 || v.minSoc > v.initialSoc || v.initialSoc > v.maxSoc || v.maxSoc > v.capacityKwh) return 'Battery capacity, power and SOC limits are inconsistent.';
  if (v.chargingEfficiency <= 0 || v.chargingEfficiency > 1 || v.dischargingEfficiency <= 0 || v.dischargingEfficiency > 1 || v.degradationCost < 0) return 'Battery efficiencies must be within (0, 1] and cycle penalty cannot be negative.';
  if (v.reserveSocKwh != null && (v.reserveSocKwh < v.minSoc || v.reserveSocKwh > v.maxSoc)) return 'Battery reserve must be within the SOC range.';
  if (v.finalSocKwh != null && (v.finalSocKwh < v.minSoc || v.finalSocKwh > v.maxSoc)) return 'Final SOC must be within the SOC range.';
  return null;
}

export const getBatteries = async (req: Request, res: Response) => {
  try {
    const batteries = await prisma.battery.findMany({ where: { organizationId: req.user!.organizationId }, include: {
      building: { select: { id: true, name: true } }, readings: { orderBy: { timestamp: 'desc' }, take: 24 },
    } });
    return res.json({ batteries });
  } catch { return res.status(500).json({ error: 'Could not load battery configuration.' }); }
};

export const createBattery = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const { buildingId, name, allowGridCharging = false, ...values } = req.body;
    if (!buildingId || typeof allowGridCharging !== 'boolean') return res.status(400).json({ error: 'Building and explicit grid-charging setting are required.' });
    const building = await prisma.building.findFirst({ where: { id: String(buildingId), organizationId } });
    if (!building) return res.status(404).json({ error: 'Building not found in this organization.' });
    for (const key of numericFields) if (values[key] !== undefined && values[key] !== null) values[key] = Number(values[key]);
    const issue = validateBattery(values);
    if (issue) return res.status(400).json({ error: issue });
    const battery = await prisma.battery.create({ data: { organizationId, buildingId: building.id, name: name || 'Battery storage', allowGridCharging, ...values } });
    return res.status(201).json({ battery });
  } catch { return res.status(500).json({ error: 'Could not create battery configuration.' }); }
};

export const updateBattery = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const current = await prisma.battery.findFirst({ where: { id: req.params.id, organizationId } });
    if (!current) return res.status(404).json({ error: 'Battery not found in this organization.' });
    const allowed = [...numericFields, 'name', 'status', 'allowGridCharging'];
    const data: any = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k as any)));
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No battery configuration fields were supplied.' });
    for (const key of numericFields) if (data[key] !== undefined && data[key] !== null) data[key] = Number(data[key]);
    const issue = validateBattery({ ...current, ...data });
    if (issue) return res.status(400).json({ error: issue });
    const battery = await prisma.battery.update({ where: { id: current.id }, data });
    return res.json({ battery });
  } catch { return res.status(500).json({ error: 'Could not update battery configuration.' }); }
};

export const recordBatteryReading = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const battery = await prisma.battery.findFirst({ where: { id: req.params.id, organizationId, status: 'ACTIVE' } });
    if (!battery) return res.status(404).json({ error: 'Active battery not found in this organization.' });
    const soc = Number(req.body.stateOfChargeKwh);
    const charge = Number(req.body.chargePowerKw ?? 0);
    const discharge = Number(req.body.dischargePowerKw ?? 0);
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
    if (![soc, charge, discharge].every(Number.isFinite) || soc < battery.minSoc || soc > battery.maxSoc || charge < 0 || charge > battery.maxChargeKw || discharge < 0 || discharge > battery.maxDischargeKw || (charge > 0 && discharge > 0) || Number.isNaN(timestamp.getTime())) {
      return res.status(400).json({ error: 'Reading is outside configured SOC/power limits or has simultaneous charge and discharge.' });
    }
    const reading = await prisma.batteryReading.create({ data: { organizationId, batteryId: battery.id,
      timestamp, stateOfCharge: soc, stateOfChargeKwh: soc, chargePowerKw: charge, dischargePowerKw: discharge } });
    return res.status(201).json({ reading });
  } catch { return res.status(500).json({ error: 'Battery reading could not be recorded.' }); }
};
