// Check BullMQ queue contents for the onboarding queue.
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || 'redispass',
  maxRetriesPerRequest: null,
});

(async () => {
  const queue = new Queue('onboarding-assignment', { connection });
  try {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    console.log('JOB COUNTS:', JSON.stringify(counts));

    const waiting = await queue.getJobs(['waiting'], 0, 5);
    console.log('\nWAITING JOBS:');
    for (const j of waiting) {
      console.log(`  id=${j.id} data=${JSON.stringify(j.data)}`);
    }
    const failed = await queue.getJobs(['failed'], 0, 5);
    console.log('\nFAILED JOBS:');
    for (const j of failed) {
      console.log(`  id=${j.id} data=${JSON.stringify(j.data)}`);
      console.log(`    reason=${j.failedReason}`);
      console.log(`    attemptsMade=${j.attemptsMade}`);
    }
    const completed = await queue.getJobs(['completed'], 0, 5);
    console.log('\nCOMPLETED JOBS (last 5):');
    for (const j of completed) {
      console.log(`  id=${j.id} data=${JSON.stringify(j.data)}`);
      console.log(`    returnvalue=${JSON.stringify(j.returnvalue)}`);
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
