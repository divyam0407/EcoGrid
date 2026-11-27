# 1. Project overview

## Abstract

EcoGrid is a web-based operational intelligence prototype for campus energy management. It joins building and meter records, time-series energy readings, academic schedules, analytical workflows and scenario-based optimization in one organization-scoped application. Its web client is built with React, TypeScript and Vite; an Express/TypeScript API uses Prisma and PostgreSQL; a Python FastAPI service performs forecasting, anomaly analysis, operational correlation and optimization. The repository includes a fictional, deterministic ABC University dataset and a browser-driven simulated telemetry demonstration. The prototype demonstrates a complete analysis path, including a future 24-hour forecast consumed by a digital-twin optimization scenario. It does not establish commercial performance, field reliability, verified savings or real campus model accuracy.

## Problem and motivation

Campus energy is affected by building use, time-of-day patterns, operating schedules and controllable resources. Meter readings alone do not explain why demand changes, while static dashboards do not test how hypothetical dispatch decisions interact with energy and tariffs. EcoGrid explores a unified workflow that links those records and analytical tools while retaining source labels and organization boundaries.

## Objectives and contributions

1. Provide an authenticated, multi-organization web application for buildings, meters and energy data.
2. Track imports and their provenance, validate data, and retain rejected-row evidence.
3. Relate readings to schedules and calendar context without treating schedules as observed occupancy.
4. Train and run hourly demand forecasts, preserve model metadata, and persist predictions.
5. Detect historical deviations and retain baseline/context evidence.
6. Manage recommendations and their review/measurement lifecycle.
7. Configure solar, battery, tariff and optimization scenarios and persist solver outputs.
8. Demonstrate telemetry through an explicitly simulated browser workflow.

## Scope

The implementation covers software ingestion, analytics and simulation. There is no verified physical-meter connection, real customer deployment, external benchmark evaluation, or measured savings study. The seeded campus, operating schedules, tariffs, solar, battery and simulated anomaly are illustrative synthetic inputs.

## Implemented capability summary

Implemented: organization-aware application foundation, building/meter records, provenance-aware dataset imports, dashboard/reporting, operational schedule/calendar features, forecasting, anomaly detection, recommendations, solar/battery configuration, MILP optimization, Digital Twin scenarios, and synthetic live telemetry. Simulated: future meter events and optimization dispatch. Illustrative: synthetic campus and resource/tariff values. Future: physical integrations, real campus validation, deployment operations, and measurement-based savings verification.
