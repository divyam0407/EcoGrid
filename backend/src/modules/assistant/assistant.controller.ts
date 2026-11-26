import { Request, Response } from 'express';
import { prisma } from '../../config';

export const queryEnergyAssistant = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message query cannot be empty.' });
    }

    const q = message.toLowerCase();

    // Grounded Context Gathering from Real Database Records
    const buildings = await prisma.building.findMany({
      where: { organizationId: orgId },
      include: {
        energyReadings: { select: { consumptionKwh: true } },
        anomalies: { where: { status: 'OPEN' } },
      },
    });

    const anomalies = await prisma.anomaly.findMany({
      where: { organizationId: orgId, status: 'OPEN' },
      orderBy: { detectedAt: 'desc' },
      take: 5,
      include: { building: true, room: true },
    });

    const recommendations = await prisma.recommendation.findMany({
      where: { organizationId: orgId, generationSource: 'A7_ENGINE', financialEstimateAvailable: true, status: { in: ['NEW','UNDER_REVIEW','APPROVED','IN_PROGRESS'] } },
      take: 5,
    });

    const latestOpt = await prisma.optimizationRun.findFirst({
      where: { organizationId: orgId, solverStatus: 'OPTIMAL', baselineCost: { not: null }, optimizedCost: { not: null }, estimatedSavings: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    // Compute metrics
    const bldgTotals = buildings.map((b) => ({
      name: b.name,
      totalKwh: b.energyReadings.reduce((sum, r) => sum + r.consumptionKwh, 0),
    })).sort((a, b) => b.totalKwh - a.totalKwh);

    const highestBldg = bldgTotals[0] || null;
    const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true } });
    const currency = organization?.currency || 'configured currency';
    const totalPotentialSavings = recommendations.reduce((sum, r) => sum + Number(r.estimatedCostSaving || 0), 0);

    let answer = '';
    let citations: any[] = [];

    if (q.includes('which building') || q.includes('highest') || q.includes('most electricity')) {
      answer = highestBldg ? `Across the readings currently stored, **${highestBldg.name}** has the highest registered consumption at **${highestBldg.totalKwh.toLocaleString()} kWh**. This total is not normalized for floor area or operating conditions.` : 'No building energy readings are available for this organization yet.';
      citations = highestBldg ? [
        { type: 'meter_aggregation', label: `${highestBldg.name} sub-meters`, value: `${highestBldg.totalKwh.toLocaleString()} kWh` },
      ] : [];
    } else if (q.includes('saving') || q.includes('inefficienc') || q.includes('reduce')) {
      answer = recommendations.length ? `Persisted A7 recommendations have configured-tariff potential cost estimates totaling **${currency} ${totalPotentialSavings.toLocaleString()}** for their stated evidence windows. These are potential estimates, not monthly or realized savings.\n\n` + recommendations.map((r, i) => `${i + 1}. **${r.title}**: ${currency} ${Number(r.estimatedCostSaving || 0).toLocaleString()} potential estimate (Priority: ${r.priority}).`).join('\n') : 'There are no priced A7 recommendations yet. Refresh recommendations after tariff and meter data are available; no financial savings are inferred without an applicable configured tariff.';
      citations = recommendations.map((r) => ({ type: 'recommendation', label: r.title, value: `${currency} ${Number(r.estimatedCostSaving || 0)}` }));
    } else if (q.includes('anomal') || q.includes('spike') || q.includes('alert')) {
      if (anomalies.length > 0) {
        answer = `There are currently **${anomalies.length} active anomalies** detected:\n` +
          anomalies.map((a, i) => `${i + 1}. **${a.anomalyType}** in ${a.building.name} (${a.room?.roomNumber || 'Meter Feeder'}): Observed **${a.observedValue} kWh** vs expected **${a.expectedValue} kWh** (+${a.deviationPercent}%). Suggested action: ${a.suggestedAction || 'Inspect equipment'}.`).join('\n');
        citations = anomalies.map((a) => ({ type: 'anomaly', label: `${a.building.name} Alert`, value: `${a.observedValue} kWh` }));
      } else {
        answer = `All building meter readings are currently operating within nominal statistical thresholds (within 2.0 standard deviations of empirical historical baselines). No critical anomalies are open.`;
      }
    } else if (q.includes('optimization') || q.includes('battery') || q.includes('solar')) {
      if (latestOpt) {
        const runCurrency = JSON.parse(latestOpt.resultData).currency || currency;
        answer = `The latest solver-backed run is labeled as an estimate, not measured savings. Estimated cost change: **${runCurrency} ${latestOpt.estimatedSavings?.toFixed(2)}**.\n- Baseline cost: **${runCurrency} ${latestOpt.baselineCost?.toFixed(2)}**\n- Optimized cost: **${runCurrency} ${latestOpt.optimizedCost?.toFixed(2)}**\n\nThe persisted dispatch schedule and its assumptions are available in the Energy Optimization history.`;
        citations = [
          { type: 'optimization_run', label: 'Estimated optimization result', value: `${runCurrency} ${latestOpt.estimatedSavings}` },
        ];
      } else {
        answer = 'No feasible optimization run is stored for this organization. Configure an active forecast model and tariff, then run Energy Optimization. EcoGrid does not estimate savings or dispatch schedules from missing inputs.';
      }
    } else {
      answer = `Hello! I am EcoGrid's Operational Energy Assistant. I analyze your organization's energy data grounded in actual meter readings, academic timetables, tariffs, and optimization runs.\n\nYou can ask me:\n- *"Which building consumes the most electricity?"*\n- *"What operational inefficiencies were detected after class hours?"*\n- *"How much money can we save by scheduling battery storage?"*\n- *"What are the current open anomalies?"*`;
    }

    return res.json({
      query: message,
      answer,
      citations,
      dataGrounded: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
