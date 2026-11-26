import { Request, Response } from 'express';
import { prisma } from '../../config';

const numeric = (value: unknown, label: string, nullable = false) => {
  if (nullable && value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative finite value.`);
  return n;
};
const time = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const endTime = (value: unknown) => time(value) || value === '24:00';
function periodsFrom(input: any) {
  if (!Array.isArray(input)) throw new Error('Tariff periods must be an array.');
  return input.map((p, i) => {
    if (!time(p.startTime) || !endTime(p.endTime) || p.startTime === p.endTime) throw new Error(`Tariff period ${i + 1} needs valid distinct local start and end times.`);
    if (!['ALL', 'WEEKDAY', 'WEEKEND'].includes(p.dayType || 'ALL')) throw new Error(`Tariff period ${i + 1} has an unsupported day type.`);
    if (typeof p.periodName !== 'string' || !p.periodName.trim()) throw new Error(`Tariff period ${i + 1} needs a name.`);
    return { periodName: p.periodName.trim(), startTime: p.startTime, endTime: p.endTime, pricePerKwh: numeric(p.pricePerKwh, `Tariff period ${i + 1} price`), dayType: p.dayType || 'ALL' };
  });
}
const canEditOrg = (req: Request, organizationId: string) => req.user?.role === 'SUPER_ADMIN' || req.user?.organizationId === organizationId;

export const createTariff = async (req: Request, res: Response) => {
  try {
    if (!canEditOrg(req, req.params.id)) return res.status(403).json({ error: 'Organization scope mismatch.' });
    const b = req.body;
    if (!b.tariffName || !['FLAT', 'TIME_OF_USE', 'TIERED', 'DEMAND_PEAK'].includes(b.tariffType)) return res.status(400).json({ error: 'Tariff name and supported tariff type are required.' });
    const pricePerKwh = numeric(b.pricePerKwh, 'Tariff price');
    const periods = b.periods === undefined ? [] : periodsFrom(b.periods);
    if (b.tariffType === 'TIME_OF_USE' && !periods.length) throw new Error('Time-of-use tariffs need at least one explicit price period.');
    const effectiveFrom = b.effectiveFrom ? new Date(b.effectiveFrom) : new Date();
    const effectiveTo = b.effectiveTo ? new Date(b.effectiveTo) : null;
    const demandWindowMinutes = b.demandWindowMinutes === undefined ? 60 : Number(b.demandWindowMinutes);
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) || (effectiveTo && effectiveTo <= effectiveFrom)) return res.status(400).json({ error: 'Tariff effective timestamps are invalid.' });
    if (![15, 30, 60].includes(demandWindowMinutes)) return res.status(400).json({ error: 'Demand window must be 15, 30 or 60 minutes.' });
    const tariff = await prisma.electricityTariff.create({ data: { organizationId: req.params.id,
      tariffName: String(b.tariffName).trim(), tariffType: b.tariffType, pricePerKwh, effectiveFrom,
      effectiveTo,
      allowGridExport: b.allowGridExport === true,
      exportPricePerKwh: b.allowGridExport ? numeric(b.exportPricePerKwh, 'Export compensation') : null,
      demandChargePerKw: b.demandChargePerKw == null ? null : numeric(b.demandChargePerKw, 'Demand charge'),
      demandWindowMinutes,
      fixedCharge: b.fixedCharge === undefined ? 0 : numeric(b.fixedCharge, 'Fixed charge'),
      carbonEmissionKgPerKwh: b.carbonEmissionKgPerKwh == null ? null : numeric(b.carbonEmissionKgPerKwh, 'Emissions factor'),
      periods: { create: periods } }, include: { periods: true } });
    return res.status(201).json({ tariff });
  } catch (error: any) { return res.status(400).json({ error: error.message || 'Tariff could not be created.' }); }
};

export const updateTariff = async (req: Request, res: Response) => {
  try {
    const organizationId = req.params.id;
    if (!canEditOrg(req, organizationId)) return res.status(403).json({ error: 'Organization scope mismatch.' });
    const current = await prisma.electricityTariff.findFirst({ where: { id: req.params.tariffId, organizationId } });
    if (!current) return res.status(404).json({ error: 'Tariff not found in this organization.' });
    const b = req.body;
    const data: any = {};
    if (b.tariffName !== undefined) data.tariffName = String(b.tariffName).trim();
    if (b.tariffType !== undefined) {
      if (!['FLAT', 'TIME_OF_USE', 'TIERED', 'DEMAND_PEAK'].includes(b.tariffType)) throw new Error('Unsupported tariff type.');
      data.tariffType = b.tariffType;
    }
    if (b.pricePerKwh !== undefined) data.pricePerKwh = numeric(b.pricePerKwh, 'Tariff price');
    if (b.effectiveFrom !== undefined) { data.effectiveFrom = new Date(b.effectiveFrom); if (Number.isNaN(data.effectiveFrom.getTime())) throw new Error('Effective-from timestamp is invalid.'); }
    if (b.effectiveTo !== undefined) { data.effectiveTo = b.effectiveTo ? new Date(b.effectiveTo) : null; if (data.effectiveTo && (Number.isNaN(data.effectiveTo.getTime()) || data.effectiveTo <= (data.effectiveFrom || current.effectiveFrom))) throw new Error('Effective-to must be after effective-from.'); }
    if (b.allowGridExport !== undefined) {
      if (typeof b.allowGridExport !== 'boolean') throw new Error('Grid-export permission must be boolean.');
      data.allowGridExport = b.allowGridExport;
    }
    if (b.exportPricePerKwh !== undefined) data.exportPricePerKwh = numeric(b.exportPricePerKwh, 'Export compensation', true);
    if ((data.allowGridExport ?? current.allowGridExport) && (data.exportPricePerKwh ?? current.exportPricePerKwh) === null) throw new Error('Enabled grid export requires an explicit export compensation rate.');
    if (b.demandChargePerKw !== undefined) data.demandChargePerKw = numeric(b.demandChargePerKw, 'Demand charge', true);
    if (b.demandWindowMinutes !== undefined) {
      const window = Number(b.demandWindowMinutes);
      if (![15, 30, 60].includes(window)) throw new Error('Demand window must be 15, 30 or 60 minutes.');
      data.demandWindowMinutes = window;
    }
    if (b.fixedCharge !== undefined) data.fixedCharge = numeric(b.fixedCharge, 'Fixed charge');
    if (b.carbonEmissionKgPerKwh !== undefined) data.carbonEmissionKgPerKwh = numeric(b.carbonEmissionKgPerKwh, 'Emissions factor', true);
    const periods = b.periods === undefined ? undefined : periodsFrom(b.periods);
    if ((data.tariffType || current.tariffType) === 'TIME_OF_USE' && !(periods ?? await prisma.tariffPeriod.findMany({ where: { tariffId: current.id } })).length) throw new Error('Time-of-use tariffs need at least one explicit price period.');
    const tariff = await prisma.$transaction(async tx => {
      if (periods) await tx.tariffPeriod.deleteMany({ where: { tariffId: current.id } });
      return tx.electricityTariff.update({ where: { id: current.id }, data: { ...data, ...(periods ? { periods: { create: periods } } : {}) }, include: { periods: true } });
    });
    return res.json({ tariff });
  } catch (error: any) { return res.status(400).json({ error: error.message || 'Tariff could not be updated.' }); }
};
