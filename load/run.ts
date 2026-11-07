import { runReadNotesBenchmark } from './read-notes.js';
import { runPipelineConcurrentBenchmark } from './pipeline-concurrent.js';

async function main() {
  console.log('====================================================');
  console.log('   MindSpace v2 Load & Concurrency Benchmark Report');
  console.log('====================================================\n');
  console.log('Running Benchmark 1: Read-Heavy Notes with autocannon...');
  const readRes = await runReadNotesBenchmark(10, 20);

  console.log('Running Benchmark 2: Concurrent Pipeline against Fake Provider...');
  const pipelineRes = await runPipelineConcurrentBenchmark(16);

  console.log('\n====================================================');
  console.log('                   BENCHMARK RESULTS');
  console.log('====================================================\n');

  console.log(`### 1. ${readRes.title}`);
  console.log(`- Duration: ${readRes.durationSeconds}s`);
  console.log(`- Concurrency (Connections): ${readRes.connections}`);
  console.log(`- Total Requests: ${readRes.requestsTotal}`);
  console.log(`- Requests / Sec: ${readRes.requestsPerSec.toFixed(1)} req/s`);
  console.log(`- Latency (p50): ${readRes.latencyP50Ms.toFixed(2)} ms`);
  console.log(`- Latency (p95): ${readRes.latencyP95Ms.toFixed(2)} ms`);
  console.log(`- Latency (p99): ${readRes.latencyP99Ms.toFixed(2)} ms`);
  console.log(`- Latency (Max): ${readRes.latencyMaxMs.toFixed(2)} ms`);
  console.log(`- Latency (Mean): ${readRes.latencyAvgMs.toFixed(2)} ms`);
  console.log(`- Throughput: ${(readRes.throughputBytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`);
  console.log(`- Non-2xx Responses: ${readRes.non2xx}\n`);

  console.log(`### 2. ${pipelineRes.title}`);
  console.log(`- Concurrent Pipeline Jobs: ${pipelineRes.concurrentJobs}`);
  console.log(`- Completed Jobs: ${pipelineRes.completedJobs} / ${pipelineRes.concurrentJobs}`);
  console.log(`- Failed Jobs: ${pipelineRes.failedJobs}`);
  console.log(`- Total Elapsed Duration: ${pipelineRes.totalDurationMs} ms`);
  console.log(`- Avg Duration Per Job: ${pipelineRes.avgDurationPerJobMs} ms`);
  console.log(`- Pipeline Throughput: ${pipelineRes.throughputJobsPerSec} jobs/s`);
  console.log(`- Total AI Notes Generated: ${pipelineRes.totalNotesGenerated}\n`);

  console.log('====================================================');
  console.log('Benchmark completed successfully.');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
