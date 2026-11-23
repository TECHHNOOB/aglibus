#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
node --input-type=module - "$project_root" "$dist_root/server/index.js" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [root, output] = process.argv.slice(2);
const files = {
  "/": ["index.html", "text/html"],
  "/app.css": ["app.css", "text/css"],
  "/app.js": ["app.js", "text/javascript"],
  "/network.js": ["network.js", "text/javascript"],
  "/transit.js": ["transit.js", "text/javascript"]
};
const assets = Object.fromEntries(Object.entries(files).map(([path, [file, type]]) =>
  [path, {type:type + "; charset=utf-8", body:readFileSync(join(root, "web", file), "utf8")}]));
writeFileSync(output, "const assets = " + JSON.stringify(assets) + ";\n" +
  readFileSync(join(root, "worker/index.js"), "utf8"));
NODE
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"

echo "Built $dist_root"
