import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../../config';

const VALID_QUALITY = ['VALIDATED', 'MEASURED', 'CALCULATED_INTERVAL'];
const EXCLUDED_OCCUPANCY = ['ESTIMATED', 'SCHEDULED'];
const GENERATOR_VERSION = 'a7.1';
type Options = { analysisDays: number; baselineDays: number; minimumOccurrenceDays: number; minimumBaselineSamples: number; baselineMadMultiplier: number };
type Reading = any;
type Opportunity = { category: string; readings: Reading[]; deltas: Array<{ reading: Reading; baselineKwh: Prisma.Decimal; savingKwh: Prisma.Decimal; baselineCount: number; rate: Prisma.Decimal | null }>; baselineCount: number; days: Set<string>; limitations: Set<string>; reason: string; action: string; effort: 'LOW' | 'MEDIUM' };

export const DEFAULT_OPTIONS: Options = { analysisDays: 30, baselineDays: 90, minimumOccurrenceDays: 3, minimumBaselineSamples: 8, baselineMadMultiplier: 3 };
const decimal = (n: unknown) => new Prisma.Decimal(String(n));
const median = (items: number[]) => {
  if (!items.length) return null;
  const s = [...items].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function localParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  const days: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day: days[String(parts.weekday).toLowerCase()], hour: parts.hour, minute: parts.minute, time: `${parts.hour}:${parts.minute}`, weekend: ['saturday', 'sunday'].includes(String(parts.weekday).toLowerCase()) };
}
function timeWindow(start: string, end: string, time: string) { return start <= end ? time >= start && time < end : time >= start || time < end; }
function scheduleMatches(reading: Reading, meter: any, schedules: any[], timezone: string) {
  const local = localParts(reading.timestamp, timezone);
  return schedules.some(s => {
    if (s.buildingId !== reading.buildingId || (meter.roomId && s.roomId && s.roomId !== meter.roomId)) return false;
    if (s.recurrenceRule === 'NONE') return Boolean(s.startDatetime && s.endDatetime && reading.timestamp >= s.startDatetime && reading.timestamp < s.endDatetime);
    const scheduleLocal = localParts(reading.timestamp, s.timezone || timezone);
    return (s.dayOfWeek === null || s.dayOfWeek === scheduleLocal.day) && timeWindow(s.startTime, s.endTime, scheduleLocal.time) && (!s.recurrenceEnd || reading.timestamp <= s.recurrenceEnd);
  });
}
function calendarMatches(reading: Reading, meter: any, events: any[]) {
  return events.some(e => (!e.buildingId || e.buildingId === reading.buildingId) && (!e.roomId || e.roomId === meter.roomId) && reading.timestamp >= e.startDatetime && reading.timestamp < e.endDatetime && ['HOLIDAY', 'VACATION'].includes(e.eventType));
}
function tariffRateAt(reading: Reading, tariffs: any[], timezone: string): Prisma.Decimal | null {
  const tariff = tariffs.filter(t => reading.timestamp >= t.effectiveFrom && (!t.effectiveTo || reading.timestamp <= t.effectiveTo)).sort((a,b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  if (!tariff) return null;
  if (!tariff.periods.length) return decimal(tariff.pricePerKwh);
  const local = localParts(reading.timestamp, timezone);
  const matching = tariff.periods.filter((p: any) => (p.dayType === 'ALL' || (p.dayType === 'WEEKEND' && local.weekend) || (p.dayType === 'WEEKDAY' && !local.weekend)) && timeWindow(p.startTime, p.endTime, local.time));
  return matching.length === 1 ? decimal(matching[0].pricePerKwh) : null;
}
function observedOccupancy(reading: Reading, meter: any, records: any[]) {
  const tolerance = Math.max(1, Number(reading.intervalMinutes || 60)) * 30000;
  return records.filter(o => o.buildingId === reading.buildingId && (meter.roomId ? o.roomId === meter.roomId : !o.roomId) && !EXCLUDED_OCCUPANCY.includes(o.sourceType) && Math.abs(o.timestamp.getTime() - reading.timestamp.getTime()) <= tolerance).sort((a,b) => Math.abs(a.timestamp.getTime() - reading.timestamp.getTime()) - Math.abs(b.timestamp.getTime() - reading.timestamp.getTime()))[0] || null;
}

function classifyReading(reading: Reading, meter: any, schedules: any[], events: any[], timezone: string) {
  const local = localParts(reading.timestamp, timezone);
  const room = meter.room;
  const hours = room?.expectedOperatingHours;
  const outsideHours = Boolean(meter.roomId && hours && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(hours) && !timeWindow(hours.slice(0,5), hours.slice(6,11), local.time));
  const holiday = calendarMatches(reading, meter, events);
  const scheduled = scheduleMatches(reading, meter, schedules, timezone);
  return { local, outsideHours, holiday, scheduled };
}

function prepareCandidates(readings: Reading[], schedules: any[], events: any[], occupancies: any[], tariffs: any[], anomalies: any[], timezone: string, options: Options, now = new Date()): Opportunity[] {
  const analysisStart = new Date(now.getTime() - options.analysisDays * 86400000);
  const baselineStart = new Date(analysisStart.getTime() - options.baselineDays * 86400000);
  const byMeter = new Map<string, Reading[]>();
  readings.forEach(r => { if (r.building.organizationId === r.organizationId && r.meter.organizationId === r.organizationId && r.meter.buildingId === r.buildingId && (!r.meter.roomId || (r.meter.room?.organizationId === r.organizationId && r.roomId === r.meter.roomId))) { const group = byMeter.get(r.meterId) || []; group.push(r); byMeter.set(r.meterId, group); } });
  const opportunities: Opportunity[] = [];
  for (const group of byMeter.values()) {
    const meter = group[0].meter;
    const contexts = new Map<string, ReturnType<typeof classifyReading>>();
    for (const r of group) contexts.set(r.id, classifyReading(r, meter, schedules, events, timezone));
    const baselineBuckets = new Map<string, Reading[]>();
    for (const b of group) {
      if (b.timestamp >= analysisStart || b.timestamp < baselineStart) continue;
      const context = contexts.get(b.id)!; if (context.holiday) continue;
      const bucketKey = [context.local.day, context.local.hour, b.intervalMinutes, context.scheduled, context.outsideHours].join('|');
      const bucket = baselineBuckets.get(bucketKey) || []; bucket.push(b); baselineBuckets.set(bucketKey, bucket);
    }
    const targetGroups = new Map<string, Reading[]>();
    for (const r of group.filter(x => x.timestamp >= analysisStart && x.timestamp < now)) {
      const c = contexts.get(r.id)!;
      const observed = observedOccupancy(r, meter, occupancies);
      const observedPeople = observed && observed.occupancyCount > 0;
      // Observed occupancy is evidence against an idle-consumption claim; schedules alone never establish presence.
      if (observedPeople) continue;
      const category = c.holiday ? 'HOLIDAY_CONSUMPTION' : c.outsideHours ? 'AFTER_HOURS_CONSUMPTION' : !c.scheduled ? 'REPEATED_OUTSIDE_SCHEDULE' : null;
      if (category) { const groupKey = `${meter.id}|${category}`; const group = targetGroups.get(groupKey) || []; group.push(r); targetGroups.set(groupKey, group); }
    }
    for (const [key, targetRows] of targetGroups) {
      const category = key.split('|')[1]; const days = new Set(targetRows.map(r => contexts.get(r.id)!.local.date));
      if (days.size < options.minimumOccurrenceDays) continue;
      const deltas: Opportunity['deltas'] = []; const limitations = new Set<string>(); let baselineCount = 0;
      for (const r of targetRows) {
        const c = contexts.get(r.id)!;
        const outsideOptions = category === 'AFTER_HOURS_CONSUMPTION' ? [true] : [false, true];
        const comparables = outsideOptions.flatMap(outside => baselineBuckets.get([c.local.day, c.local.hour, r.intervalMinutes, c.scheduled, outside].join('|')) || []);
        if (comparables.length < options.minimumBaselineSamples) { limitations.add(`At least ${options.minimumBaselineSamples} comparable historical meter intervals are required; ${comparables.length} were available for some observations.`); continue; }
        const baselineKwh = decimal(median(comparables.map(x => Number(x.consumptionKwh)))!);
        const rawSaving = decimal(r.consumptionKwh).sub(baselineKwh);
        const savingKwh = rawSaving.greaterThan(0) ? rawSaving : decimal(0);
        const rate = tariffRateAt(r, tariffs, timezone);
        if (!rate) limitations.add('An applicable organization tariff rate is missing for some intervals; financial savings are not calculated.');
        deltas.push({ reading: r, baselineKwh, savingKwh, baselineCount: comparables.length, rate }); baselineCount += comparables.length;
      }
      // Repeated off-hours/context readings are not an opportunity unless measured excess exists.
      if (!deltas.some(x => x.savingKwh.greaterThan(0))) continue;
      const anomalyRows = anomalies.filter(a => a.meterId === meter.id && targetRows.some(r => Math.abs(a.detectedAt.getTime() - r.timestamp.getTime()) <= Math.max(1, r.intervalMinutes || 60) * 30000));
      if (category === 'HOLIDAY_CONSUMPTION') limitations.add('Calendar dates identify holidays; occupancy or event exceptions may still exist and should be checked.');
      if (category === 'REPEATED_OUTSIDE_SCHEDULE') limitations.add('Absence of a timetable entry is not evidence that a room was vacant.');
      if (!meter.roomId) limitations.add('The meter is building-scoped; no room attribution is made.');
      const reasonMap: Record<string, string> = {
        HOLIDAY_CONSUMPTION: 'Repeated readings on calendar holidays or vacations exceeded the comparable historical meter baseline.',
        AFTER_HOURS_CONSUMPTION: 'Repeated readings outside stored room operating hours exceeded the comparable historical meter baseline.',
        REPEATED_OUTSIDE_SCHEDULE: 'Repeated readings outside scheduled windows exceeded the comparable historical meter baseline; schedule absence alone is not treated as waste.',
      };
      opportunities.push({ category, readings: targetRows, deltas, baselineCount, days, limitations, reason: reasonMap[category], action: category === 'AFTER_HOURS_CONSUMPTION' ? 'Inspect shutdown practices and equipment schedules for the identified intervals before changing controls.' : category === 'HOLIDAY_CONSUMPTION' ? 'Confirm holiday exceptions and campus closures, then review the identified meter intervals with facilities staff.' : 'Check timetable completeness and observed occupancy before investigating the repeated meter draw.', effort: 'LOW' });
    }

    // Baseline outliers are investigation-only; they do not imply recoverable energy or savings.
    const normalRows = group.filter(r => {
      const c = contexts.get(r.id)!; return r.timestamp >= analysisStart && r.timestamp < now && !c.holiday && !c.outsideHours && c.scheduled && !observedOccupancy(r, meter, occupancies)?.occupancyCount;
    });
    const abnormal = new Map<string, Reading[]>();
    for (const r of normalRows) {
      const c = contexts.get(r.id)!;
      const samples = [false, true].flatMap(outside => baselineBuckets.get([c.local.day, c.local.hour, r.intervalMinutes, true, outside].join('|')) || []).map(x => Number(x.consumptionKwh));
      if (samples.length < options.minimumBaselineSamples) continue;
      const mid = median(samples)!; const mad = median(samples.map(x => Math.abs(x - mid)))!;
      if (Number(r.consumptionKwh) > mid + options.baselineMadMultiplier * mad) { const rows = abnormal.get(meter.id) || []; rows.push(r); abnormal.set(meter.id, rows); }
    }
    for (const rows of abnormal.values()) {
      const days = new Set(rows.map(r => contexts.get(r.id)!.local.date)); if (days.size < options.minimumOccurrenceDays) continue;
      opportunities.push({ category: 'ABNORMAL_BASELINE_USAGE', readings: rows, deltas: [], baselineCount: 0, days, limitations: new Set(['Robust outlier rule uses same-weekday, same-local-hour historical intervals and the configured median absolute deviation multiplier. This identifies unusual consumption only; no savings are estimated.']), reason: `Meter consumption repeatedly exceeded the same-weekday, same-hour median baseline by more than ${options.baselineMadMultiplier} median absolute deviations.`, action: 'Inspect equipment state, operating conditions, and meter quality for these outlier intervals.', effort: 'MEDIUM' });
    }
  }
  return opportunities;
}

function priorityFor(candidate: Opportunity, all: Opportunity[], weights: { energy: number; financial: number; evidence: number; recurrence: number; feasibility: number }) {
  const energy = candidate.deltas.reduce((s,x) => s + Number(x.savingKwh), 0);
  const cost = candidate.deltas.length && candidate.deltas.every(x => x.rate) ? candidate.deltas.reduce((s,x) => s + Number(x.savingKwh.mul(x.rate!).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)), 0) : null;
  const energyRank = energy > 0 ? (all.filter(o => o.deltas.reduce((s,x) => s + Number(x.savingKwh), 0) <= energy).length / Math.max(1, all.length)) * 100 : 0;
  const priced = all.filter(o => o.deltas.length && o.deltas.every(x => x.rate));
  const costRank = cost === null ? energyRank : (priced.filter(o => o.deltas.reduce((s,x) => s + Number(x.savingKwh.mul(x.rate!).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)), 0) <= cost).length / Math.max(1, priced.length)) * 100;
  const baselineSamples = candidate.deltas.length ? Math.min(...candidate.deltas.map(x => x.baselineCount)) : 0;
  const evidenceScore = Math.min(100, (baselineSamples / 8) * 40 + Math.min(30, candidate.readings.length * 3) + Math.min(30, candidate.days.size * 4));
  const recurrenceScore = Math.min(100, candidate.days.size / 7 * 100);
  const feasibility = candidate.effort === 'LOW' ? 80 : 50;
  const score = energyRank * weights.energy + costRank * weights.financial + evidenceScore * weights.evidence + recurrenceScore * weights.recurrence + feasibility * weights.feasibility;
  const priority = score >= 85 ? 'CRITICAL' : score >= 65 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  return { energy, cost, score: Number(score.toFixed(1)), priority, evidenceScore: Number(evidenceScore.toFixed(1)), energyRank: Number(energyRank.toFixed(1)), costRank: Number(costRank.toFixed(1)), recurrenceScore: Number(recurrenceScore.toFixed(1)), feasibilityScore: feasibility };
}

export async function generateRecommendations(organizationId: string, userId: string, rawOptions: Partial<Options> = {}) {
  const options: Options = { ...DEFAULT_OPTIONS, ...rawOptions };
  const now = new Date(); const analysisStart = new Date(now.getTime() - options.analysisDays * 86400000); const baselineStart = new Date(analysisStart.getTime() - options.baselineDays * 86400000);
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, currency: true } });
  if (!org) throw new Error('Organization context is invalid.');
  const [readings, schedules, events, occupancy, tariffs, anomalies] = await Promise.all([
    prisma.energyReading.findMany({ where: { organizationId, timestamp: { gte: baselineStart, lt: now }, qualityStatus: { in: VALID_QUALITY } , dataSource: { not: 'INVALID_REJECTED' } }, include: { meter: { select: { id: true, organizationId: true, buildingId: true, roomId: true, room: { select: { id: true, organizationId: true, expectedOperatingHours: true } } } }, building: { select: { id: true, organizationId: true, name: true } } }, orderBy: { timestamp: 'asc' }, take: 50000 }),
    prisma.operationalSchedule.findMany({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.academicCalendarEvent.findMany({ where: { organizationId, status: 'ACTIVE', startDatetime: { lt: now }, endDatetime: { gt: baselineStart } } }),
    prisma.occupancyRecord.findMany({ where: { organizationId, timestamp: { gte: baselineStart, lt: now } }, take: 50000 }),
    prisma.electricityTariff.findMany({ where: { organizationId, effectiveFrom: { lt: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: baselineStart } }] }, include: { periods: true }, orderBy: { effectiveFrom: 'desc' } }),
    prisma.anomaly.findMany({ where: { organizationId, status: { in: ['OPEN', 'INVESTIGATING'] }, detectedAt: { gte: analysisStart, lt: now } }, select: { id: true, meterId: true, anomalyType: true, severity: true, detectedAt: true } }),
  ]);
  if (readings.length >= 50000) throw new Error('Analysis window exceeded 50,000 readings; reduce the analysis window before refreshing recommendations.');
  const scoredWeights = { energy: 0.3, financial: 0.2, evidence: 0.3, recurrence: 0.1, feasibility: 0.1 };
  const candidates = prepareCandidates(readings, schedules, events, occupancy, tariffs, anomalies, org.timezone, options, now);
  // With no parent/child meter map, a building meter may include a submeter's loads.
  // Suppress quantified savings when those scopes have coincident intervals.
  for (const candidate of candidates) {
    const meter = candidate.readings[0]?.meter;
    if (!meter) continue;
    const timestamps = new Set(candidate.readings.map(r => r.timestamp.getTime()));
    const coincidentScope = candidates.some(other => other !== candidate && other.readings[0]?.meterId !== meter.id && other.readings[0]?.buildingId === candidate.readings[0]?.buildingId && other.readings.some(o => timestamps.has(o.timestamp.getTime()) && (!o.meter.roomId || !meter.roomId || o.meter.roomId === meter.roomId)));
    if (coincidentScope && candidate.deltas.length) {
      candidate.deltas = [];
      candidate.baselineCount = 0;
      candidate.limitations.add('Another meter reports coincident intervals in this building. Meter hierarchy is not modeled, so savings are withheld to avoid possible double counting.');
    }
  }
  const buildings = await prisma.building.findMany({ where: { organizationId }, select: { id: true, name: true } });
  const buildingNames = new Map(buildings.map(b => [b.id,b.name]));
  const generated: any[] = [];
  for (const candidate of candidates) {
    const first = candidate.readings[0]; const meter = first.meter;
    const periodStart = new Date(Math.min(...candidate.readings.map(r => r.timestamp.getTime()))); const periodEnd = new Date(Math.max(...candidate.readings.map(r => r.timestamp.getTime())));
    const sourceKey = crypto.createHash('sha256').update([candidate.category, meter.id].join('|')).digest('hex');
    const scoring = priorityFor(candidate, candidates, scoredWeights);
    const saving = scoring.energy > 0 && candidate.category !== 'ABNORMAL_BASELINE_USAGE' ? decimal(scoring.energy.toFixed(6)) : null;
    const financial = saving && scoring.cost !== null && candidate.deltas.every(x => x.rate) ? decimal(scoring.cost.toFixed(4)) : null;
    if (!financial && saving) candidate.limitations.add('Financial savings are unavailable because an applicable configured tariff was not found for every comparison interval.');
    const dataSources = [...new Set(candidate.readings.map(r => r.dataSource))];
    const evidence = {
      sourceReadingIds: candidate.readings.map(r => r.id),
      baselineComparisons: candidate.deltas.map(x => ({ readingId: x.reading.id, timestamp: x.reading.timestamp.toISOString(), observedKwh: Number(x.reading.consumptionKwh), comparableBaselineMedianKwh: Number(x.baselineKwh), potentialDifferenceKwh: Number(x.savingKwh), comparisonCount: x.baselineCount, tariffPerKwh: x.rate?.toString() || null })),
      occurrenceDays: [...candidate.days].sort(), occurrenceCount: candidate.readings.length, baselineSampleCount: candidate.baselineCount,
      dataSources, relevantAnomalyIds: anomalies.filter(a => a.meterId === meter.id && candidate.readings.some(r => Math.abs(a.detectedAt.getTime() - r.timestamp.getTime()) <= Math.max(1, r.intervalMinutes || 60) * 30000)).map(a => a.id),
      scoring: { weights: scoredWeights, score: scoring.score, components: { energyPercentile: scoring.energyRank, financialPercentile: scoring.costRank, evidenceQuality: scoring.evidenceScore, recurrence: scoring.recurrenceScore, operationalFeasibility: scoring.feasibilityScore } },
    };
    const evidenceSamples = candidate.deltas.length ? Math.min(...candidate.deltas.map(x => x.baselineCount)) : 0;
    const confidence = Math.min(1, (evidenceSamples / 8) * 0.4 + Math.min(0.3, candidate.readings.length * 0.03) + Math.min(0.3, candidate.days.size * 0.04));
    const confidenceLabel = confidence >= 0.75 ? 'HIGH_EVIDENCE' : confidence >= 0.5 ? 'MODERATE_EVIDENCE' : 'LIMITED_EVIDENCE';
    const action = candidate.action;
    const insightData = { organizationId, buildingId: first.buildingId, roomId: meter.roomId, category: candidate.category, title: candidate.reason.split('.')[0], reason: candidate.reason, recommendation: action, periodStart, periodEnd, observedEnergyKwh: candidate.readings.reduce((s,r)=>s+Number(r.consumptionKwh),0), estimatedSavingsKwh: saving?.toNumber() ?? null, estimatedSavingsCost: financial?.toNumber() ?? null, confidence: confidenceLabel, evidenceJson: JSON.stringify(evidence), limitationsJson: JSON.stringify([...candidate.limitations]), sourceKey, generatorVersion: GENERATOR_VERSION };
    const recData = { organizationId, buildingId: first.buildingId, roomId: meter.roomId, meterId: meter.id, recommendationType: candidate.category === 'AFTER_HOURS_CONSUMPTION' ? 'IDLE_CUTOFF' : 'OPERATIONAL_ADJUSTMENT', generationSource: 'A7_ENGINE', title: `${candidate.reason.split('.')[0]} — ${buildingNames.get(first.buildingId) || 'Building'}`, description: `${candidate.reason} Evidence covers ${candidate.days.size} distinct days and ${candidate.readings.length} measured intervals.`, evidence: JSON.stringify(evidence), estimatedEnergySavingKwh: saving, estimatedCostSaving: financial, financialEstimateAvailable: Boolean(financial), savingsPeriod: saving ? 'OBSERVED_WINDOW' : null, calculationPeriodStart: periodStart, calculationPeriodEnd: periodEnd, calculationMethod: saving ? `Measured interval excess over median of at least ${options.minimumBaselineSamples} comparable readings, same meter, weekday, local hour and operating context. No extrapolation.` : null, assumptionsJson: JSON.stringify({ timezone: org.timezone, analysisDays: options.analysisDays, baselineDays: options.baselineDays, minimumBaselineSamples: options.minimumBaselineSamples, minimumOccurrenceDays: options.minimumOccurrenceDays, currency: org.currency }), limitationsJson: JSON.stringify([...candidate.limitations, ...(candidate.category === 'ABNORMAL_BASELINE_USAGE' ? ['No kWh or financial savings are estimated for an anomaly-only signal.'] : [])]), priority: scoring.priority, priorityReason: JSON.stringify({ score: scoring.score, components: evidence.scoring.components, formula: '30% energy rank + 20% financial rank (or energy rank when unavailable) + 30% evidence + 10% recurrence + 10% feasibility; relative to candidates in this refresh.' }), effortLevel: candidate.effort, confidence, status: 'NEW', sourceKey };
    const persisted = await prisma.$transaction(async tx => {
      const old = await tx.recommendation.findUnique({ where: { organizationId_sourceKey: { organizationId, sourceKey } }, select: { id: true, status: true } });
      const insight = await tx.operationalInsight.upsert({ where: { organizationId_sourceKey: { organizationId, sourceKey } }, create: insightData, update: { ...insightData, status: undefined, approvalStatus: undefined, outcomeJson: undefined } });
      const recommendation = await tx.recommendation.upsert({ where: { organizationId_sourceKey: { organizationId, sourceKey } }, create: { ...recData, operationalInsightId: insight.id }, update: { ...recData, status: undefined, assignedUserId: undefined, approvedByUserId: undefined, approvedAt: undefined, rejectedReason: undefined, implementedAt: undefined, completionDetails: undefined, operationalInsightId: insight.id } });
      if (!old) {
        await tx.recommendationEvent.create({ data: { organizationId, recommendationId: recommendation.id, actorUserId: userId, eventType: 'GENERATED', toStatus: recommendation.status, metadataJson: JSON.stringify({ generatorVersion: GENERATOR_VERSION, sourceKey }) } });
        await tx.auditLog.create({ data: { organizationId, userId, action: 'GENERATE', entityType: 'Recommendation', entityId: recommendation.id } });
      } else {
        await tx.recommendationEvent.create({ data: { organizationId, recommendationId: recommendation.id, actorUserId: userId, eventType: 'EVIDENCE_REFRESHED', fromStatus: old.status, toStatus: old.status, metadataJson: JSON.stringify({ generatorVersion: GENERATOR_VERSION, sourceKey }) } });
      }
      return { recommendation, created: !old };
    });
    generated.push({ ...persisted.recommendation, created: persisted.created });
  }
  return { generated: generated.length, created: generated.filter(r => r.created).length, refreshed: generated.filter(r => !r.created).length, window: { start: analysisStart.toISOString(), end: now.toISOString(), baselineStart: baselineStart.toISOString(), baselineEnd: analysisStart.toISOString(), timezone: org.timezone }, recommendations: generated };
}

export function validateOptions(input: any): Options {
  const o = { ...DEFAULT_OPTIONS, ...(input || {}) };
  if (!Number.isInteger(o.analysisDays) || o.analysisDays < 7 || o.analysisDays > 60) throw new Error('analysisDays must be 7–60.');
  if (!Number.isInteger(o.baselineDays) || o.baselineDays < 30 || o.baselineDays > 180) throw new Error('baselineDays must be 30–180.');
  if (!Number.isInteger(o.minimumOccurrenceDays) || o.minimumOccurrenceDays < 2 || o.minimumOccurrenceDays > 14) throw new Error('minimumOccurrenceDays must be 2–14.');
  if (!Number.isInteger(o.minimumBaselineSamples) || o.minimumBaselineSamples < 4 || o.minimumBaselineSamples > 24) throw new Error('minimumBaselineSamples must be 4–24.');
  if (typeof o.baselineMadMultiplier !== 'number' || o.baselineMadMultiplier < 1 || o.baselineMadMultiplier > 6) throw new Error('baselineMadMultiplier must be 1–6.');
  return o;
}

export { median, tariffRateAt, prepareCandidates };
