/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: [
    "main",
    { name: "beta", prerelease: "beta" },
    { name: "alpha", prerelease: "alpha" },
  ],
  plugins: [
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],
    ["@semantic-release/changelog"],
    ["@semantic-release/npm"],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "pnpm-lock.yaml", "docs/**"],
        message: "chore(release): ${nextRelease.version} [skip ci]",
      },
    ],
    ["@semantic-release/github"],
  ],
};
