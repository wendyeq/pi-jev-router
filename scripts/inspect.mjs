#!/usr/bin/env node
// The implementation lives with the agent skill. This file keeps the published command stable.
import { inspect, isMainModule } from '../skills/pi-jev-router-inspect/scripts/inspect.mjs';

export { inspect, summarize } from '../skills/pi-jev-router-inspect/scripts/inspect.mjs';

// Checked against this wrapper's own URL, so a symlinked invocation still runs the CLI.
if (isMainModule(import.meta.url)) {
  inspect(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
