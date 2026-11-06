export {};
// Compile with tsc so NestJS receives decorator metadata, then watch both processes.
const compile = Bun.spawn([process.execPath, "run", "build"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await compile.exited) process.exit(1);
const children = [
  Bun.spawn(
    [
      process.execPath,
      "node_modules/typescript/bin/tsc",
      "--watch",
      "--preserveWatchOutput",
    ],
    { stdout: "inherit", stderr: "inherit" },
  ),
  Bun.spawn([process.execPath, "--watch", "dist/main.js"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
