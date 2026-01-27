#!/usr/bin/env node
/**
 * Fix ESM imports by adding .js extension to relative imports
 * Handles both file imports (./foo → ./foo.js) and directory imports (./bar → ./bar/index.js)
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2] || join(__dirname, '..', 'dist', 'server');

function getAllJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixImports(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const fileDir = dirname(filePath);
  let modified = false;

  // Match: from './path' or from "../path" (relative imports without .js)
  const importRegex = /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g;

  content = content.replace(importRegex, (match, pre, importPath, post) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      return match;
    }

    // Resolve the import path relative to the file
    const resolvedBase = resolve(fileDir, importPath);

    // Check if it's a file (add .js)
    if (existsSync(resolvedBase + '.js')) {
      modified = true;
      return `${pre}${importPath}.js${post}`;
    }

    // Check if it's a directory with index.js
    if (existsSync(resolvedBase) && statSync(resolvedBase).isDirectory()) {
      if (existsSync(join(resolvedBase, 'index.js'))) {
        modified = true;
        return `${pre}${importPath}/index.js${post}`;
      }
    }

    // Fallback: just add .js and hope for the best
    console.warn(`  Warning: Could not resolve ${importPath} from ${filePath}`);
    modified = true;
    return `${pre}${importPath}.js${post}`;
  });

  if (modified) {
    writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
  }
}

console.log(`Fixing ESM imports in ${distDir}...`);

if (!existsSync(distDir)) {
  console.error(`Directory not found: ${distDir}`);
  process.exit(1);
}

const files = getAllJsFiles(distDir);
console.log(`Found ${files.length} JS files`);

for (const file of files) {
  fixImports(file);
}

console.log('Done!');
