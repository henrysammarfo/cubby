// Writes dist/cubby-allowance.xo-template.json (XO extended JSON, bigint-safe) for import into an XO wallet.
import { writeFileSync } from 'node:fs';
import { parseTemplate, serializeTemplate, generateTemplateIdentifier } from '@xo-cash/utils';
import { cubbyAllowanceTemplate } from '../source/cubby-allowance.mjs';
const t = parseTemplate(cubbyAllowanceTemplate);
writeFileSync(new URL('../dist/cubby-allowance.xo-template.json', import.meta.url), serializeTemplate(t) + '\n');
console.log('template id', await generateTemplateIdentifier(t));
