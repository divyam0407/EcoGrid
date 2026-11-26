import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ABC University Demonstration Dataset...');

  // 1. Clean existing records for fresh demo state
  await prisma.auditLog.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.optimizationRun.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.anomaly.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.batteryReading.deleteMany();
  await prisma.battery.deleteMany();
  await prisma.solarReading.deleteMany();
  await prisma.solarInstallation.deleteMany();
  await prisma.tariffPeriod.deleteMany();
  await prisma.electricityTariff.deleteMany();
  await prisma.occupancyRecord.deleteMany();
  await prisma.operationalSchedule.deleteMany();
  await prisma.energyReading.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.room.deleteMany();
  await prisma.department.deleteMany();
  await prisma.building.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'ABC University (DEMO)',
      industryType: 'HIGHER_EDUCATION',
      address: '100 University Boulevard, Tech Campus',
      timezone: 'America/New_York',
      currency: 'USD',
    },
  });

  // 3. Create Users
  const passwordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Dr. Sarah Jenkins',
      email: 'admin@abc.edu',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      role: 'ORG_ADMIN',
    },
  });

  const facilityManager = await prisma.user.create({
    data: {
      name: 'Marcus Vance',
      email: 'facility@abc.edu',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: facilityManager.id,
      role: 'ENERGY_MANAGER',
    },
  });

  // 4. Create Electricity Tariff with Time-Of-Use
  const tariff = await prisma.electricityTariff.create({
    data: {
      organizationId: org.id,
      tariffName: 'Campus Time-of-Use Standard Tariff',
      tariffType: 'TIME_OF_USE',
      pricePerKwh: 0.15,
    },
  });

  await prisma.tariffPeriod.createMany({
    data: [
      { tariffId: tariff.id, periodName: 'OFF_PEAK', startTime: '00:00', endTime: '06:00', pricePerKwh: 0.08, dayType: 'ALL' },
      { tariffId: tariff.id, periodName: 'STANDARD', startTime: '06:00', endTime: '14:00', pricePerKwh: 0.15, dayType: 'ALL' },
      { tariffId: tariff.id, periodName: 'PEAK', startTime: '14:00', endTime: '20:00', pricePerKwh: 0.28, dayType: 'ALL' },
      { tariffId: tariff.id, periodName: 'STANDARD', startTime: '20:00', endTime: '24:00', pricePerKwh: 0.14, dayType: 'ALL' },
    ],
  });

  // 5. Create Buildings
  const buildingsData = [
    { name: 'Academic Block', buildingType: 'ACADEMIC', totalArea: 85000 },
    { name: 'Computer Science Block', buildingType: 'LAB', totalArea: 62000 },
    { name: 'University Library', buildingType: 'LIBRARY', totalArea: 48000 },
    { name: 'Student Hostel Complex', buildingType: 'RESIDENTIAL', totalArea: 95000 },
    { name: 'Grand Auditorium', buildingType: 'AUDITORIUM', totalArea: 32000 },
  ];

  const createdBuildings: any[] = [];
  for (const b of buildingsData) {
    const created = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: b.name,
        buildingType: b.buildingType,
        totalArea: b.totalArea,
      },
    });
    createdBuildings.push(created);
  }

  const academicBlock = createdBuildings[0];
  const csBlock = createdBuildings[1];
  const library = createdBuildings[2];
  const hostel = createdBuildings[3];
  const auditorium = createdBuildings[4];

  // 6. Create Departments
  const deptEng = await prisma.department.create({
    data: { organizationId: org.id, buildingId: academicBlock.id, name: 'Faculty of Engineering', departmentType: 'ACADEMIC' },
  });
  const deptCS = await prisma.department.create({
    data: { organizationId: org.id, buildingId: csBlock.id, name: 'Computer Science & AI', departmentType: 'LAB' },
  });
  const deptLib = await prisma.department.create({
    data: { organizationId: org.id, buildingId: library.id, name: 'Library Services', departmentType: 'LIBRARY' },
  });

  // 7. Create Rooms
  // 20 classrooms in Academic Block, 5 computer labs in CS Block
  const createdRooms: any[] = [];
  for (let c = 101; c <= 120; c++) {
    const rm = await prisma.room.create({
      data: {
        organizationId: org.id,
        buildingId: academicBlock.id,
        departmentId: deptEng.id,
        roomNumber: `Room ${c}`,
        roomType: 'CLASSROOM',
        capacity: 45,
        floor: Math.floor((c - 100) / 7) + 1,
        expectedOperatingHours: '08:00-18:00',
      },
    });
    createdRooms.push(rm);
  }

  for (let l = 1; l <= 5; l++) {
    const lab = await prisma.room.create({
      data: {
        organizationId: org.id,
        buildingId: csBlock.id,
        departmentId: deptCS.id,
        roomNumber: `Computer Lab ${l}`,
        roomType: 'COMPUTER_LAB',
        capacity: 35,
        floor: l <= 2 ? 1 : 2,
        expectedOperatingHours: '09:00-17:00',
      },
    });
    createdRooms.push(lab);
  }

  const libReadingRoom = await prisma.room.create({
    data: {
      organizationId: org.id,
      buildingId: library.id,
      departmentId: deptLib.id,
      roomNumber: 'Main Reading Hall',
      roomType: 'LIBRARY',
      capacity: 250,
      floor: 1,
      expectedOperatingHours: '08:00-22:00',
    },
  });

  const audiMain = await prisma.room.create({
    data: {
      organizationId: org.id,
      buildingId: auditorium.id,
      roomNumber: 'Main Auditorium Hall',
      roomType: 'AUDITORIUM',
      capacity: 800,
      floor: 1,
      expectedOperatingHours: '10:00-21:00',
    },
  });

  // 8. Create Meters
  const meters: any[] = [];
  for (const b of createdBuildings) {
    const m = await prisma.meter.create({
      data: {
        organizationId: org.id,
        buildingId: b.id,
        meterName: `${b.name} Main Feeder`,
        meterType: 'MAIN_FEEDER',
        sourceType: 'IOT_MQTT',
        unit: 'kWh',
        status: 'ACTIVE',
      },
    });
    meters.push(m);
  }

  // Sub-meters for key computer labs
  const labMeter1 = await prisma.meter.create({
    data: {
      organizationId: org.id,
      buildingId: csBlock.id,
      roomId: createdRooms.find((r) => r.roomNumber === 'Computer Lab 1')?.id,
      meterName: 'Computer Lab 1 Sub-Meter',
      meterType: 'SUB_METER',
    },
  });

  // 9. Solar Installations & Batteries
  const solarAcademic = await prisma.solarInstallation.create({
    data: {
      organizationId: org.id,
      buildingId: academicBlock.id,
      capacityKw: 120.0,
      status: 'ACTIVE',
    },
  });

  const batteryBank = await prisma.battery.create({
    data: {
      organizationId: org.id,
      buildingId: academicBlock.id,
      name: 'Main Campus Tesla Megapack Bank',
      capacityKwh: 200.0,
      maxChargeKw: 50.0,
      maxDischargeKw: 50.0,
      minSoc: 20.0,
      maxSoc: 190.0,
      initialSoc: 40.0,
      chargingEfficiency: 0.94,
      dischargingEfficiency: 0.94,
      degradationCost: 0.012,
    },
  });

  // 10. Operational Schedules (Timetable)
  console.log('Creating Academic Timetable Schedules...');
  const scheduleRows = [
    { room: 'Room 101', dow: 0, s: '09:00', e: '11:00', act: 'Thermodynamics Lecture', occ: 42 },
    { room: 'Room 101', dow: 0, s: '11:00', e: '13:00', act: 'Circuit Analysis', occ: 40 },
    { room: 'Room 102', dow: 0, s: '09:00', e: '12:00', act: 'Fluid Mechanics', occ: 38 },
    { room: 'Computer Lab 1', dow: 0, s: '10:00', e: '12:00', act: 'Data Structures Practical', occ: 32 },
    // Notice Lab 1 has NO classes after 12:00 on Monday! (Perfect correlation scenario)
    { room: 'Computer Lab 2', dow: 0, s: '14:00', e: '17:00', act: 'Machine Learning Lab', occ: 30 },

    { room: 'Room 101', dow: 1, s: '09:00', e: '11:00', act: 'Control Systems', occ: 35 },
    { room: 'Room 103', dow: 1, s: '10:00', e: '12:00', act: 'Linear Algebra', occ: 44 },
    { room: 'Computer Lab 1', dow: 1, s: '13:00', e: '16:00', act: 'Web Technologies Lab', occ: 34 },
    
    { room: 'Room 102', dow: 2, s: '09:00', e: '12:00', act: 'Electromagnetic Fields', occ: 39 },
    { room: 'Computer Lab 3', dow: 2, s: '10:00', e: '13:00', act: 'Database Systems Lab', occ: 30 },

    { room: 'Room 104', dow: 3, s: '11:00', e: '13:00', act: 'Engineering Ethics', occ: 45 },
    { room: 'Computer Lab 2', dow: 3, s: '09:00', e: '12:00', act: 'Compiler Design Lab', occ: 28 },

    { room: 'Room 101', dow: 4, s: '09:00', e: '11:00', act: 'Final Term Revision', occ: 42 },
    { room: 'Main Auditorium Hall', dow: 4, s: '14:00', e: '18:00', act: 'Annual Tech Symposium', occ: 650 },
  ];

  for (const s of scheduleRows) {
    const targetRoom = createdRooms.find((r) => r.roomNumber === s.room);
    if (targetRoom) {
      await prisma.operationalSchedule.create({
        data: {
          organizationId: org.id,
          buildingId: targetRoom.buildingId,
          roomId: targetRoom.id,
          activityName: s.act,
          activityType: s.act.includes('Lab') ? 'LAB_SESSION' : s.act.includes('Symposium') ? 'EVENT' : 'LECTURE',
          dayOfWeek: s.dow,
          startTime: s.s,
          endTime: s.e,
          expectedOccupancy: s.occ,
          sourceType: 'TIMETABLE_CSV',
        },
      });
    }
  }

  // 11. Generate 60 Days of Realistic Hourly Energy & Solar Readings
  console.log('Generating 60 days of hourly energy readings and solar generation...');
  const now = new Date();
  const totalDays = 60;
  const startDt = new Date(now.getTime() - totalDays * 86400000);

  const energyChunks: any[] = [];
  const solarChunks: any[] = [];

  for (let d = 0; d < totalDays; d++) {
    const currentDay = new Date(startDt.getTime() + d * 86400000);
    const dow = currentDay.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dow === 0 || dow === 6;

    for (let hr = 0; hr < 24; hr++) {
      const readingTimestamp = new Date(currentDay);
      readingTimestamp.setHours(hr, 0, 0, 0);

      // Hourly Solar Generation
      let solGen = 0.0;
      if (hr >= 6 && hr <= 18) {
        const cloudFactor = (Math.sin((d + hr) * 0.4) > 0.6) ? 0.4 : 0.95;
        solGen = Math.round(120.0 * Math.sin((hr - 6) / 12 * Math.PI) * cloudFactor * 0.85 * 10) / 10;
      }
      solarChunks.push({
        organizationId: org.id,
        installationId: solarAcademic.id,
        timestamp: readingTimestamp,
        generationKwh: solGen,
        powerKw: solGen,
      });

      // Buildings consumption
      for (const b of createdBuildings) {
        let baseKwh = 15.0; // standby night load
        let activeKwh = 0.0;

        if (b.name === 'Academic Block') {
          baseKwh = 18.0;
          if (!isWeekend && hr >= 8 && hr <= 18) {
            activeKwh = 60.0 + Math.sin((hr - 8) / 10 * Math.PI) * 25.0;
          }
        } else if (b.name === 'Computer Science Block') {
          baseKwh = 22.0; // Server room baseline
          if (!isWeekend && hr >= 9 && hr <= 17) {
            activeKwh = 55.0;
          }
          // Seed operational anomaly: on Tuesdays between 18:00 and 23:00, lab left running!
          if (dow === 2 && hr >= 18 && hr <= 22) {
            activeKwh = 48.0; // Equipment overrun!
          }
        } else if (b.name === 'University Library') {
          baseKwh = 10.0;
          if (hr >= 8 && hr <= 22) {
            activeKwh = isWeekend ? 35.0 : 45.0;
          }
        } else if (b.name === 'Student Hostel Complex') {
          // Inverted residential profile: peaks morning 7-9 AM and evening 6-11 PM
          baseKwh = 25.0;
          if ((hr >= 7 && hr <= 9) || (hr >= 18 && hr <= 23)) {
            activeKwh = 50.0;
          }
        } else if (b.name === 'Grand Auditorium') {
          baseKwh = 5.0;
          if (dow === 4 && hr >= 14 && hr <= 18) {
            activeKwh = 85.0; // Event load
          }
        }

        const totalKwh = Math.round((baseKwh + activeKwh + (Math.random() * 4.0 - 2.0)) * 10) / 10;
        const bldgMeter = meters.find((m) => m.buildingId === b.id) || meters[0];

        energyChunks.push({
          organizationId: org.id,
          meterId: bldgMeter.id,
          buildingId: b.id,
          timestamp: readingTimestamp,
          consumptionKwh: Math.max(1.0, totalKwh),
          powerKw: Math.max(1.0, totalKwh),
          source: 'IOT_MQTT',
          qualityStatus: 'VALIDATED',
        });
      }
    }
  }

  // Insert in batches of 500
  console.log(`Inserting ${energyChunks.length} energy readings...`);
  for (let i = 0; i < energyChunks.length; i += 500) {
    await prisma.energyReading.createMany({
      data: energyChunks.slice(i, i + 500),
    });
  }

  console.log(`Inserting ${solarChunks.length} solar readings...`);
  for (let i = 0; i < solarChunks.length; i += 500) {
    await prisma.solarReading.createMany({
      data: solarChunks.slice(i, i + 500),
    });
  }

  // 12. Create Seed Anomalies
  console.log('Seeding Anomalies...');
  await prisma.anomaly.createMany({
    data: [
      {
        organizationId: org.id,
        buildingId: csBlock.id,
        meterId: labMeter1.id,
        anomalyType: 'UNSCHEDULED_SURGE',
        severity: 'CRITICAL',
        expectedValue: 12.5,
        observedValue: 68.4,
        deviation: 55.9,
        deviationPercent: 447.2,
        description: 'Night-time power draw of 68.4 kWh detected in Computer Lab 1 between 1:00 AM and 4:00 AM.',
        suggestedAction: 'Facility dispatch indicated 32 GPU workstation nodes were mining or running unscheduled render tasks.',
        status: 'INVESTIGATING',
        detectedAt: new Date(Date.now() - 3600000 * 18),
      },
      {
        organizationId: org.id,
        buildingId: academicBlock.id,
        anomalyType: 'SPIKE',
        severity: 'HIGH',
        expectedValue: 42.0,
        observedValue: 98.2,
        deviation: 56.2,
        deviationPercent: 133.8,
        description: 'Rapid demand spike during noon transition: chiller pump and elevator motors started simultaneously.',
        suggestedAction: 'Implement soft-starter staggering delay (15-min interval) to avoid concurrent startup peak charges.',
        status: 'OPEN',
        detectedAt: new Date(Date.now() - 3600000 * 36),
      },
      {
        organizationId: org.id,
        buildingId: library.id,
        anomalyType: 'HIGH_IDLE',
        severity: 'MEDIUM',
        expectedValue: 8.0,
        observedValue: 24.5,
        deviation: 16.5,
        deviationPercent: 206.2,
        description: 'Basement ventilation fan left on continuously over Sunday when facility was fully closed.',
        suggestedAction: 'Integrate damper control with Sunday library closure schedule.',
        status: 'RESOLVED',
        detectedAt: new Date(Date.now() - 86400000 * 4),
      },
    ],
  });

  // 13. Create Actionable Recommendations
  console.log('Seeding Recommendations...');
  await prisma.recommendation.createMany({
    data: [
      {
        organizationId: org.id,
        buildingId: csBlock.id,
        recommendationType: 'OPERATIONAL_ADJUSTMENT',
        title: 'Auto-Shutdown CS Labs After Scheduled Timetable Sessions',
        description: 'Correlated energy-timetable analytics show Computer Labs 1-3 draw 45 kW for 5 hours post-class without bookings.',
        evidence: '35 unoccupied hours recorded per week at full load across 5 labs.',
        estimatedEnergySavingKwh: 3850,
        estimatedCostSaving: 577.50,
        priority: 'CRITICAL',
        confidence: 0.95,
        status: 'PENDING',
      },
      {
        organizationId: org.id,
        buildingId: academicBlock.id,
        recommendationType: 'PEAK_SHAVING',
        title: 'Dispatch 50 kW Battery Storage During Peak Tariff Window (2-8 PM)',
        description: 'Discharging stored solar power between 2:00 PM and 8:00 PM offsets high $0.28/kWh peak grid rates.',
        evidence: 'Reduces monthly peak demand penalty charges from 98 kW to 65 kW.',
        estimatedEnergySavingKwh: 4500,
        estimatedCostSaving: 780.00,
        priority: 'HIGH',
        confidence: 0.92,
        status: 'PENDING',
      },
      {
        organizationId: org.id,
        buildingId: academicBlock.id,
        recommendationType: 'SOLAR_BATTERY_DISPATCH',
        title: 'Absorb Midday Solar Surplus into Battery Storage Bank',
        description: 'Direct 40 kW surplus solar output at 12:30 PM into battery storage rather than exporting to grid.',
        evidence: 'Avoids curtailment and stores zero-marginal-cost renewable power for evening hostel lighting.',
        estimatedEnergySavingKwh: 2200,
        estimatedCostSaving: 330.00,
        priority: 'HIGH',
        confidence: 0.90,
        status: 'APPROVED',
      },
      {
        organizationId: org.id,
        buildingId: library.id,
        recommendationType: 'IDLE_CUTOFF',
        title: 'Automate Library 3rd Floor Lighting Sleep Mode',
        description: 'Night audit detected lighting circuits active 24/7 on quiet reference stack floors.',
        evidence: 'Sub-meter shows flat 14 kWh consumption through 2 AM to 5 AM.',
        estimatedEnergySavingKwh: 1400,
        estimatedCostSaving: 112.00,
        priority: 'MEDIUM',
        confidence: 0.97,
        status: 'PENDING',
      },
    ],
  });

  // 14. Save Sample CSV files to datasets/sample/
  console.log('Writing downloadable CSV sample files to datasets/sample/...');
  const sampleDir = path.join(__dirname, '../../datasets/sample');
  if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });

  const sampleCsvHeader = 'Timestamp,Building,Meter,Consumption kWh,Power kW\n';
  const sampleCsvRows = energyChunks.slice(0, 100).map((r) => {
    const bldgName = createdBuildings.find((b) => b.id === r.buildingId)?.name || 'Academic Block';
    return `${r.timestamp.toISOString().slice(0, 19).replace('T', ' ')},${bldgName},M001,${r.consumptionKwh},${r.powerKw}`;
  }).join('\n');
  fs.writeFileSync(path.join(sampleDir, 'sample_campus_energy_readings.csv'), sampleCsvHeader + sampleCsvRows);

  const timetableCsvHeader = 'Room,Day,Start,End,Activity,Type,Occupancy\n';
  const timetableCsvRows = scheduleRows.map((s) => `${s.room},${['Monday','Tuesday','Wednesday','Thursday','Friday'][s.dow] || 'Monday'},${s.s},${s.e},${s.act},Lecture,${s.occ}`).join('\n');
  fs.writeFileSync(path.join(sampleDir, 'sample_academic_timetable.csv'), timetableCsvHeader + timetableCsvRows);

  console.log('Demo Database Seeding Complete!');
  console.log('Sample University Administrator: admin@abc.edu (password: admin123)');
  console.log('Sample Energy Manager: facility@abc.edu (password: admin123)');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
