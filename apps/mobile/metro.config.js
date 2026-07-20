// Metro configured for the Bun workspaces monorepo: watch the repo root so
// changes in packages/shared are picked up, and resolve modules from both the
// app and the hoisted root node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Prefer a single copy of React/RN from the app to avoid duplicate-instance errors.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
