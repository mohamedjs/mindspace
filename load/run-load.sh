#!/usr/bin/env bash
set -euo pipefail

# MindSpace v2 Load Benchmark Runner
# Runs read-heavy autocannon benchmarks and concurrent pipeline tests against a fake provider

echo "Starting MindSpace v2 load benchmarks..."
docker compose run --rm dev npx tsx load/run.ts
