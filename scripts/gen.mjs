// Local snapshot generator: runs the shared compute and writes web/data.json.
// Usage: node scripts/gen.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeIndices } from '../functions/_compute.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const data = await computeIndices();
const out = join(__dir, '..', 'web', 'data.json');
writeFileSync(out, JSON.stringify(data, null, 2));
console.log('Wrote', out);
console.log('Summary:', data.summary);
for (const i of data.indices) console.log(`  ${i.name.padEnd(26)} ${String(i.value).padStart(8)}  ${i.signalText}`);
