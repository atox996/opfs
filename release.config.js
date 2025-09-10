const COMMIT_TYPE = {
  FEAT: "feat",
  FIX: "fix",
  DOCS: "docs",
  STYLE: "style",
  REFACTOR: "refactor",
  PERF: "perf",
  TEST: "test",
  BUILD: "build",
  CI: "ci",
  CHORE: "chore",
  HOTFIX: "hotfix",
  SECURITY: "security",
};

const RELEASE_TYPES = [
  { breaking: true, release: "major" },
  { type: COMMIT_TYPE.FEAT, release: "minor" },
  { type: COMMIT_TYPE.FIX, release: "patch" },
  { type: COMMIT_TYPE.HOTFIX, release: "patch" },
  { type: COMMIT_TYPE.SECURITY, release: "patch" },
  { type: COMMIT_TYPE.DOCS, release: "patch" },
  { type: COMMIT_TYPE.PERF, release: "patch" },
  { type: COMMIT_TYPE.REFACTOR, release: "patch" },
  { type: COMMIT_TYPE.STYLE, release: "patch" },
  { type: COMMIT_TYPE.TEST, release: "patch" },
  { type: COMMIT_TYPE.BUILD, release: "patch" },
  { type: COMMIT_TYPE.CI, release: "patch" },
  { type: COMMIT_TYPE.CHORE, release: "patch" },
];

const COMMIT_TYPES = [
  { type: COMMIT_TYPE.FEAT, section: "✨ Features" },
  { type: COMMIT_TYPE.FIX, section: "🐛 Bug Fixes" },
  { type: COMMIT_TYPE.HOTFIX, section: "⚡ Hotfixes" },
  { type: COMMIT_TYPE.SECURITY, section: "🔒 Security Fixes" },
  { type: COMMIT_TYPE.DOCS, section: "📝 Documentation" },
  { type: COMMIT_TYPE.STYLE, section: "💄 Styles" },
  { type: COMMIT_TYPE.REFACTOR, section: "♻️ Code Refactoring" },
  { type: COMMIT_TYPE.PERF, section: "🚀 Performance Improvements" },
  { type: COMMIT_TYPE.TEST, section: "✅ Tests" },
  { type: COMMIT_TYPE.BUILD, section: "📦 Build System" },
  { type: COMMIT_TYPE.CI, section: "🤖 Continuous Integration" },
  { type: COMMIT_TYPE.CHORE, section: "🛠 Chores" },
];

const COMMIT_ANALYZER_PRESET = "conventionalcommits";
const NPM_TARBALL_DIR = "release";

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: [
    "releases/major",
    "releases/minor",
    "releases/patch",
    { name: "releases/alpha", prerelease: "alpha" },
  ],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      { preset: COMMIT_ANALYZER_PRESET, releaseRules: RELEASE_TYPES },
    ],
    [
      "@semantic-release/release-notes-generator",
      { preset: COMMIT_ANALYZER_PRESET },
    ],
    ["@semantic-release/changelog"],
    [
      "@semantic-release/npm",
      { npmPublish: true, tarballDir: NPM_TARBALL_DIR },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "pnpm-lock.yaml"],
        message: "chore(release): ${nextRelease.version} [skip ci]",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [
          { path: `${NPM_TARBALL_DIR}/*.tgz`, label: "Distribution Package" },
        ],
        successComment: false,
        failComment: false,
      },
    ],
  ],
  preset: COMMIT_ANALYZER_PRESET,
  presetConfig: { types: COMMIT_TYPES },
};
