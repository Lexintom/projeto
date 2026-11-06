import { cpus, platform, arch } from "node:os";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const users = Number(process.env.USERS ?? "10");
const seconds = Number(process.env.DURATION ?? "30");
if (
  !Number.isInteger(users) ||
  users < 1 ||
  !Number.isFinite(seconds) ||
  seconds <= 0
)
  throw new Error("Invalid USERS or DURATION");
const response = await fetch(`${base}/wallets`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    playerId: crypto.randomUUID(),
    initialBalance: { amount: "1000000.00", currency: "BRL" },
  }),
});
if (!response.ok) throw new Error(`Wallet creation failed: ${response.status}`);
const wallet = (await response.json()) as { id: string; playerId: string };
const latencies: number[] = [];
const statuses: Record<string, number> = {};
const metricsBefore = await fetch(`${base}/metrics`).then((r) => r.text());
const start = performance.now(),
  deadline = start + seconds * 1000;
await Promise.all(
  Array.from({ length: users }, async () => {
    while (performance.now() < deadline) {
      const id = crypto.randomUUID(),
        began = performance.now();
      try {
        const result = await fetch(`${base}/wagering/transactions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `load:${id}`,
          },
          body: JSON.stringify({
            providerId: "load",
            externalTransactionId: id,
            walletId: wallet.id,
            playerId: wallet.playerId,
            roundId: id,
            gameId: "load",
            kind: "BET",
            money: { amount: "1.00", currency: "BRL" },
          }),
        });
        await result.arrayBuffer();
        statuses[result.status] = (statuses[result.status] ?? 0) + 1;
      } catch {
        statuses.network = (statuses.network ?? 0) + 1;
      }
      latencies.push(performance.now() - began);
    }
  }),
);
const elapsed = (performance.now() - start) / 1000;
latencies.sort((a, b) => a - b);
const percentile = (p: number) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ??
  0;
const failures = Object.entries(statuses)
  .filter(([code]) => code !== "200")
  .reduce((sum, [, count]) => sum + count, 0);
const metricsAfter = await fetch(`${base}/metrics`).then((r) => r.text());
const reconciliation = await fetch(
  `${base}/wallets/${wallet.id}/reconciliation`,
  { method: "POST" },
).then((r) => r.json());
console.log(
  JSON.stringify(
    {
      environment: {
        bun: Bun.version,
        platform: platform(),
        arch: arch(),
        cpus: cpus().length,
      },
      methodology: {
        wallets: 1,
        operation: "BET 1.00 BRL",
        users,
        requestedSeconds: seconds,
      },
      elapsedSeconds: elapsed,
      requests: latencies.length,
      throughput: latencies.length / elapsed,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      errorRate: failures / latencies.length,
      statuses,
      reconciliation,
      metricsBefore,
      metricsAfter,
    },
    null,
    2,
  ),
);
