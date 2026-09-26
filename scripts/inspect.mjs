#!/usr/bin/env node
// The implementation lives with the agent skill. This file keeps the published command stable.
import { pathToFileURL } from 'node:url';
import { inspect } from '../skills/pi-jev-router-inspect/scripts/inspect.mjs';

export { inspect, summarize } from '../skills/pi-jev-router-inspect/scripts/inspect.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspect(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
