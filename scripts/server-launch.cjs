const { spawn } = require('node:child_process');

function normaliseChildExitCode(code, childSignal, requestedSignal) {
  if (
    requestedSignal === 'SIGTERM' &&
    (code === 143 || childSignal === 'SIGTERM')
  ) return 0;
  if (
    requestedSignal === 'SIGINT' &&
    (code === 130 || childSignal === 'SIGINT')
  ) return 0;
  return typeof code === 'number' ? code : 1;
}

function main() {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  process.env.NODE_ENV = 'production';
  process.env.HOSTNAME = '127.0.0.1';

  const child = spawn(
    process.execPath,
    ['.next/standalone/server.js'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    }
  );

  let requestedSignal = null;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      requestedSignal ??= signal;
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    });
  }

  child.on('exit', (code, childSignal) => {
    process.exit(normaliseChildExitCode(code, childSignal, requestedSignal));
  });
}

if (require.main === module) main();

exports.main = main;
exports.normaliseChildExitCode = normaliseChildExitCode;
