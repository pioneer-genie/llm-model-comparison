#!/usr/bin/env node

import { buildStaticSite } from "../src/lib/static-site.js";

const result = await buildStaticSite();
process.stdout.write(
  `Built static site in ${result.outDir} with ${result.modelCount} models across ${result.providerCount} providers.\n`
);
