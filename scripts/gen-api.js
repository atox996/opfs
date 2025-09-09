#!/usr/bin/env node

import { $ } from "zx";

/**
 * Extract content from specified region in index.d.ts
 */
function extractRegion(content, regionName) {
  const startPattern = `//#region ${regionName}`;
  const endPattern = "//#endregion";

  const startIndex = content.indexOf(startPattern);
  if (startIndex === -1) return "";

  const endIndex = content.indexOf(endPattern, startIndex);
  if (endIndex === -1) return "";

  let regionContent = content.slice(
    startIndex + startPattern.length,
    endIndex - 1,
  );

  // Remove declare keyword
  regionContent = regionContent.replace(/^declare\s+/gm, "");

  return regionContent.trim();
}

(async () => {
  console.log("🚀 Starting API documentation generation...");

  try {
    // Read template file and type definition file
    const [tplStr, indexDTS] = (
      await Promise.all([$`cat ./docs/_api_tpl`, $`cat ./dist/index.d.ts`])
    ).map((it) => it.stdout.trim());

    console.log("✅ Files read successfully");

    // Extract content from each region
    const opfsDTS = extractRegion(indexDTS, "src/opfs.d.ts");
    const dirDTS = extractRegion(indexDTS, "src/directory.d.ts");
    const fileDTS = extractRegion(indexDTS, "src/file.d.ts");

    // Generate API documentation
    const apiStr = tplStr
      .replace("<opfs-api>", opfsDTS)
      .replace("<dir-api>", dirDTS)
      .replace("<file-api>", fileDTS);

    // Write API documentation
    await $`echo ${apiStr} > ./docs/api.md`;

    console.log("✅ API documentation generated successfully: ./docs/api.md");
  } catch (error) {
    console.error("❌ Failed to generate API documentation:", error.message);
    process.exit(1);
  }
})();
