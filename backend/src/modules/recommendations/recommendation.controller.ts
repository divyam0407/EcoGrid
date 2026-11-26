import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config';
import '../../middleware/auth';
import { generateRecommendations, validateOptions } from './energy-intelligence.service';

const json = (raw?: string | null) => { try { return raw ? JSON.parse(raw) : null; } catch { return raw || null; } };
const getOrg = (req: Request) => req.user!.organizationId;
const failure = (res: Response, error: any) => res.status(error?.status || 500).json({ error: error?.message || 'Recommendation operation failed.' });
const recommendationInclude = { building: { select: { id: true, name: true } }, room: { select: { id: true, roomNumber: true } }, meter: { select: { id: true, meterName: true } }, assignedUser: { select: { id: true, name: true, email: true } }, approvedByUser: { select: { id: true, name: true } }, operationalInsight: { select: { id: true, evidenceJson: true, limitationsJson: true, periodStart: true, periodEnd: true, generatorVersion: true } } };

export async function listRecommendations(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req); const page = Math.max(1, Math.floor(Number(req.query.page) || 1)); const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)));
    const where: Prisma.RecommendationWhereInput = { organizationId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.buildingId) where.buildingId = String(req.query.buildingId);
    if (req.query.priority) where.priority = String(req.query.priority).toUpperCase();
    if (req.query.category) where.recommendationType = String(req.query.category).toUpperCase();
    if (req.query.source) where.generationSource = String(req.query.source);
    if (req.query.search) where.OR = [{ title: { contains: String(req.query.search), mode: 'insensitive' } }, { description: { contains: String(req.query.search), mode: 'insensitive' } }];
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(String(req.query.from)) : null; const to = req.query.to ? new Date(String(req.query.to)) : null;
      if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) return res.status(400).json({ error: 'Date filters must be valid dates.' });
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23,59,59,999);
      if (from && to && from > to) return res.status(400).json({ error: 'The from date must not follow the to date.' });
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    const [recommendations, total] = await Promise.all([
      prisma.recommendation.findMany({ where, include: recommendationInclude, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.recommendation.count({ where }),
    ]);
    res.json({ recommendations: recommendations.map(r => ({ ...r, evidence: json(r.evidence), assumptions: json(r.assumptionsJson), limitations: json(r.limitationsJson), priorityRationale: json(r.priorityReason), estimatedEnergySavingKwh: r.estimatedEnergySavingKwh?.toString() ?? null, estimatedCostSaving: r.financialEstimateAvailable ? r.estimatedCostSaving?.toString() ?? null : null, approvedSavingsTargetKwh: r.approvedSavingsTargetKwh?.toString() ?? null })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { failure(res, e); }
}

export async function refreshRecommendations(req: Request, res: Response) {
  let options; try { options = validateOptions(req.body || {}); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  try { res.json(await generateRecommendations(getOrg(req), req.user!.id, options)); }
  catch (e) { failure(res, e); }
}

export async function recommendationSummary(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req);
    const rows = await prisma.recommendation.findMany({ where: { organizationId, generationSource: 'A7_ENGINE' }, select: { id: true, buildingId: true, status: true, priority: true, estimatedEnergySavingKwh: true, estimatedCostSaving: true, approvedSavingsTargetKwh: true, financialEstimateAvailable: true, building: { select: { name: true } }, createdAt: true } });
    const current = rows.filter(r => ['NEW','UNDER_REVIEW','APPROVED','IN_PROGRESS'].includes(r.status));
    const byBuilding = new Map<string, any>(); const byStatus: Record<string, number> = {}; const byPriority: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    for (const r of current) { byPriority[r.priority] = (byPriority[r.priority] || 0) + 1; const b = byBuilding.get(r.buildingId) || { buildingId: r.buildingId, buildingName: r.building.name, recommendations: 0, potentialEnergyKwh: 0, pricedRecommendations: 0, potentialCost: '0' }; b.recommendations++; b.potentialEnergyKwh += Number(r.estimatedEnergySavingKwh || 0); if (r.financialEstimateAvailable && r.estimatedCostSaving) { b.pricedRecommendations++; b.potentialCost = new Prisma.Decimal(b.potentialCost).add(r.estimatedCostSaving).toString(); } byBuilding.set(r.buildingId, b); }
    const priced = current.filter(r => r.financialEstimateAvailable && r.estimatedCostSaving !== null);
    res.json({ totals: { activeOpportunities: current.length, potentialEnergyKwh: current.reduce((s,r) => s + Number(r.estimatedEnergySavingKwh || 0),0), potentialCost: priced.reduce((s,r) => s.add(r.estimatedCostSaving!), new Prisma.Decimal(0)).toString(), approvedSavingsTargetKwh: rows.filter(r => ['APPROVED','IN_PROGRESS'].includes(r.status)).reduce((s,r) => s.add(r.approvedSavingsTargetKwh || 0), new Prisma.Decimal(0)).toString(), pricedRecommendationCount: priced.length, unpricedRecommendationCount: current.length - priced.length }, byStatus, byPriority, byBuilding: [...byBuilding.values()], trend: [...new Set(rows.map(r => r.createdAt.toISOString().slice(0,7)))].sort().map(month => ({ month, count: rows.filter(r => r.createdAt.toISOString().slice(0,7) === month).length, potentialEnergyKwh: rows.filter(r => r.createdAt.toISOString().slice(0,7) === month).reduce((s,r) => s + Number(r.estimatedEnergySavingKwh || 0),0) })) });
  } catch (e) { failure(res, e); }
}

export async function listRecommendationAssignees(req: Request, res: Response) {
  try { const members = await prisma.organizationMember.findMany({ where: { organizationId: getOrg(req), user: { status: 'ACTIVE' } }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } }); res.json({ members: members.map(m => ({ ...m.user, role: m.role })) }); }
  catch (e) { failure(res, e); }
}

export async function getRecommendation(req: Request, res: Response) {
  try {
    const recommendation = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId: getOrg(req) }, include: { ...recommendationInclude, events: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true } } } }, measurements: { orderBy: { measuredAt: 'desc' } } } });
    if (!recommendation) return res.status(404).json({ error: 'Recommendation not found.' });
    res.json({ recommendation: { ...recommendation, evidence: json(recommendation.evidence), assumptions: json(recommendation.assumptionsJson), limitations: json(recommendation.limitationsJson), priorityRationale: json(recommendation.priorityReason), estimatedEnergySavingKwh: recommendation.estimatedEnergySavingKwh?.toString() ?? null, estimatedCostSaving: recommendation.financialEstimateAvailable ? recommendation.estimatedCostSaving?.toString() ?? null : null, approvedSavingsTargetKwh: recommendation.approvedSavingsTargetKwh?.toString() ?? null } });
  } catch (e) { failure(res, e); }
}

export async function updateStatus(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req); const userId = req.user!.id; const next = String(req.body.status || '').toUpperCase(); const reason = String(req.body.reason || '').trim();
    const allowed: Record<string, string[]> = { NEW: ['UNDER_REVIEW','APPROVED','REJECTED','DISMISSED'], UNDER_REVIEW: ['APPROVED','REJECTED','DISMISSED','NEW'], APPROVED: ['IN_PROGRESS','DISMISSED','UNDER_REVIEW'], REJECTED: ['NEW','UNDER_REVIEW'], IN_PROGRESS: ['COMPLETED','DISMISSED','UNDER_REVIEW'], COMPLETED: ['UNDER_REVIEW'], DISMISSED: ['NEW','UNDER_REVIEW'] };
    if (!Object.keys(allowed).includes(next)) return res.status(400).json({ error: 'Unsupported recommendation status.' });
    if (['REJECTED','DISMISSED'].includes(next) && !reason) return res.status(400).json({ error: 'A reason is required for rejection or dismissal.' });
    const current = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId } }); if (!current) return res.status(404).json({ error: 'Recommendation not found.' });
    if (!allowed[current.status]?.includes(next)) return res.status(409).json({ error: `Cannot change status from ${current.status} to ${next}.` });
    let approvedSavingsTargetKwh: Prisma.Decimal | undefined;
    if (next === 'APPROVED' && req.body.approvedSavingsTargetKwh !== undefined) { const target = Number(req.body.approvedSavingsTargetKwh); if (!Number.isFinite(target) || target < 0) return res.status(400).json({ error: 'approvedSavingsTargetKwh must be a non-negative number.' }); approvedSavingsTargetKwh = new Prisma.Decimal(target.toFixed(6)); }
    const updated = await prisma.$transaction(async tx => {
      const row = await tx.recommendation.update({ where: { id: current.id }, data: { status: next, ...(next === 'APPROVED' ? { approvedByUserId: userId, approvedAt: new Date(), ...(approvedSavingsTargetKwh !== undefined ? { approvedSavingsTargetKwh } : {}) } : {}), ...(next === 'REJECTED' ? { rejectedReason: reason } : {}), ...(next === 'COMPLETED' ? { implementedAt: current.implementedAt || new Date(), completionDetails: req.body.completionDetails || current.completionDetails } : {}) } });
      await tx.recommendationEvent.create({ data: { organizationId, recommendationId: current.id, actorUserId: userId, eventType: 'STATUS_CHANGED', fromStatus: current.status, toStatus: next, reason: reason || null, note: req.body.note || null } });
      await tx.auditLog.create({ data: { organizationId, userId, action: 'STATUS_CHANGED', entityType: 'Recommendation', entityId: current.id } }); return row;
    }); res.json({ recommendation: updated });
  } catch (e) { failure(res, e); }
}

export async function assignRecommendation(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req); const recommendation = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId } }); if (!recommendation) return res.status(404).json({ error: 'Recommendation not found.' });
    const assignedUserId = req.body.assignedUserId || null;
    if (assignedUserId && !await prisma.organizationMember.findFirst({ where: { organizationId, userId: assignedUserId }, select: { id: true } })) return res.status(400).json({ error: 'Assigned user must be a member of this organization.' });
    await prisma.$transaction([prisma.recommendation.update({ where: { id: recommendation.id }, data: { assignedUserId } }), prisma.recommendationEvent.create({ data: { organizationId, recommendationId: recommendation.id, actorUserId: req.user!.id, eventType: assignedUserId ? 'ASSIGNED' : 'UNASSIGNED', metadataJson: JSON.stringify({ assignedUserId }) } }), prisma.auditLog.create({ data: { organizationId, userId: req.user!.id, action: 'ASSIGN', entityType: 'Recommendation', entityId: recommendation.id } })]);
    res.json({ success: true, assignedUserId });
  } catch (e) { failure(res, e); }
}

export async function addRecommendationNote(req: Request, res: Response) {
  try { const organizationId = getOrg(req); const note = String(req.body.note || '').trim(); if (!note || note.length > 4000) return res.status(400).json({ error: 'Note must contain 1–4000 characters.' }); const found = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId }, select: { id: true } }); if (!found) return res.status(404).json({ error: 'Recommendation not found.' }); const event = await prisma.$transaction(async tx => { const result = await tx.recommendationEvent.create({ data: { organizationId, recommendationId: found.id, actorUserId: req.user!.id, eventType: 'NOTE_ADDED', note } }); await tx.auditLog.create({ data: { organizationId, userId: req.user!.id, action: 'NOTE_ADDED', entityType: 'Recommendation', entityId: found.id } }); return result; }); res.status(201).json({ event }); }
  catch (e) { failure(res, e); }
}

export async function completeRecommendation(req: Request, res: Response) {
  req.body.status = 'COMPLETED';
  if (!req.body.completionDetails || String(req.body.completionDetails).trim().length > 4000) return res.status(400).json({ error: 'Completion details are required (maximum 4000 characters).' });
  return updateStatus(req, res);
}

export async function recordImplementation(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req); const current = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId } }); if (!current) return res.status(404).json({ error: 'Recommendation not found.' });
    if (!['APPROVED','IN_PROGRESS'].includes(current.status)) return res.status(409).json({ error: 'Only approved or in-progress recommendations can receive an implementation date.' });
    const implementedAt = new Date(req.body.implementedAt); if (!Number.isFinite(implementedAt.getTime())) return res.status(400).json({ error: 'A valid implementedAt date is required.' });
    const result = await prisma.$transaction(async tx => { const row = await tx.recommendation.update({ where: { id: current.id }, data: { implementedAt, status: 'IN_PROGRESS' } }); await tx.recommendationEvent.create({ data: { organizationId, recommendationId: current.id, actorUserId: req.user!.id, eventType: 'IMPLEMENTATION_DATED', fromStatus: current.status, toStatus: 'IN_PROGRESS', note: req.body.note || null, metadataJson: JSON.stringify({ implementedAt: implementedAt.toISOString() }) } }); await tx.auditLog.create({ data: { organizationId, userId: req.user!.id, action: 'IMPLEMENTATION_DATED', entityType: 'Recommendation', entityId: current.id } }); return row; }); res.json({ recommendation: result });
  } catch (e) { failure(res, e); }
}

export async function recommendationHistory(req: Request, res: Response) {
  try { const organizationId = getOrg(req); const found = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId }, select: { id: true } }); if (!found) return res.status(404).json({ error: 'Recommendation not found.' }); const events = await prisma.recommendationEvent.findMany({ where: { organizationId, recommendationId: found.id }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }); res.json({ events }); }
  catch (e) { failure(res, e); }
}

export async function measureRecommendation(req: Request, res: Response) {
  try {
    const organizationId = getOrg(req); const recommendation = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId } }); if (!recommendation) return res.status(404).json({ error: 'Recommendation not found.' });
    if (!['IN_PROGRESS','COMPLETED'].includes(recommendation.status)) return res.status(409).json({ error: 'Savings comparisons require an in-progress or completed recommendation.' });
    const meterId = String(req.body.meterId || recommendation.meterId || ''); const start = new Date(req.body.comparisonPeriodStart); const end = new Date(req.body.comparisonPeriodEnd); const durationMs = end.getTime() - start.getTime();
    if (!meterId || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end > new Date() || durationMs < 7 * 86400000 || durationMs > 180 * 86400000) return res.status(400).json({ error: 'Valid meter and a completed comparison window between 7 and 180 days are required.' });
    const meter = await prisma.meter.findFirst({ where: { id: meterId, organizationId, buildingId: recommendation.buildingId }, select: { id: true } }); if (!meter) return res.status(400).json({ error: 'Meter is outside this organization or recommendation building.' });
    if (!recommendation.implementedAt || start < recommendation.implementedAt) return res.status(400).json({ error: 'A post-action comparison must start on or after the recorded implementation date.' });
    const baselineStart = new Date(start.getTime() - durationMs); const quality = ['VALIDATED','MEASURED','CALCULATED_INTERVAL'];
    const [baseline, post, overlaps] = await Promise.all([
      prisma.energyReading.findMany({ where: { organizationId, meterId, timestamp: { gte: baselineStart, lt: start }, qualityStatus: { in: quality } }, select: { timestamp: true, consumptionKwh: true, intervalMinutes: true } }),
      prisma.energyReading.findMany({ where: { organizationId, meterId, timestamp: { gte: start, lt: end }, qualityStatus: { in: quality } }, select: { timestamp: true, consumptionKwh: true, intervalMinutes: true } }),
      prisma.recommendation.findMany({ where: { organizationId, meterId, id: { not: recommendation.id }, status: { in: ['APPROVED','IN_PROGRESS','COMPLETED'] }, implementedAt: { not: null, lte: end } }, select: { id: true, implementedAt: true } }),
    ]);
    const baselineCount = baseline.length; const postCount = post.length; const intervals = new Set([...baseline, ...post].map(r => r.intervalMinutes)); const intervalConsistent = intervals.size === 1; const expected = baselineCount ? baseline.reduce((s,r) => s + r.consumptionKwh,0) / baselineCount * postCount : null; const actual = postCount ? post.reduce((s,r) => s + r.consumptionKwh,0) : null; const diff = expected !== null && actual !== null ? Math.max(0, expected - actual) : null;
    let status = baselineCount < 8 || postCount < 8 || !intervalConsistent ? 'INSUFFICIENT_DATA' : 'ESTIMATED_UNVERIFIED'; const limitations = ['Comparison uses only valid recorded intervals; missing readings are not filled, and sparse coverage may bias the estimate.', 'No weather, schedule, occupancy or seasonal adjustment is available in this measurement.', 'A post-action reduction is an estimate and is not evidence that this recommendation caused it.', 'This result is not verified savings.'];
    if (overlaps.some(o => o.implementedAt && o.implementedAt >= start)) { status = 'OVERLAPPING_RECOMMENDATIONS'; limitations.push('Another implemented recommendation on this meter overlaps the comparison window; savings are not attributed to this recommendation.'); }
    const result = await prisma.$transaction(async tx => { const measurement = await tx.recommendationMeasurement.create({ data: { organizationId, recommendationId: recommendation.id, meterId, baselinePeriodStart: baselineStart, baselinePeriodEnd: start, comparisonPeriodStart: start, comparisonPeriodEnd: end, baselineExpectedKwh: status === 'INSUFFICIENT_DATA' || status === 'OVERLAPPING_RECOMMENDATIONS' ? null : new Prisma.Decimal(expected!.toFixed(6)), postActionMeasuredKwh: actual === null ? null : new Prisma.Decimal(actual.toFixed(6)), estimatedRealizedSavingsKwh: status === 'ESTIMATED_UNVERIFIED' ? new Prisma.Decimal(diff!.toFixed(6)) : null, savingsStatus: status, methodology: `${baselineCount} valid baseline intervals and ${postCount} valid post-action intervals with ${intervals.size} distinct interval duration(s). Baseline mean per interval multiplied by post-action interval count.`, limitationsJson: JSON.stringify(limitations), createdByUserId: req.user!.id } }); await tx.recommendationEvent.create({ data: { organizationId, recommendationId: recommendation.id, actorUserId: req.user!.id, eventType: 'MEASUREMENT_RECORDED', metadataJson: JSON.stringify({ measurementId: measurement.id, status }) } }); await tx.auditLog.create({ data: { organizationId, userId: req.user!.id, action: 'MEASURE', entityType: 'Recommendation', entityId: recommendation.id } }); return measurement; });
    res.status(201).json({ measurement: { ...result, baselineExpectedKwh: result.baselineExpectedKwh?.toString() ?? null, postActionMeasuredKwh: result.postActionMeasuredKwh?.toString() ?? null, estimatedRealizedSavingsKwh: result.estimatedRealizedSavingsKwh?.toString() ?? null, limitations: json(result.limitationsJson) } });
  } catch (e) { failure(res, e); }
}

export async function listMeasurements(req: Request, res: Response) {
  try { const organizationId = getOrg(req); const found = await prisma.recommendation.findFirst({ where: { id: req.params.id, organizationId }, select: { id: true } }); if (!found) return res.status(404).json({ error: 'Recommendation not found.' }); const measurements = await prisma.recommendationMeasurement.findMany({ where: { organizationId, recommendationId: found.id }, orderBy: { measuredAt: 'desc' } }); res.json({ measurements }); }
  catch (e) { failure(res, e); }
}
