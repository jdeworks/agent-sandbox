#!/usr/bin/env node
/**
 * Add or remove a scan volume from docker-compose.yml. Only touches scan-* volumes and service mounts.
 * Usage: node scripts/patch-compose-volumes.js add <name> <hostPath>
 *        node scripts/patch-compose-volumes.js remove <name>
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const composePath = path.join(repoRoot, 'docker-compose.yml');
const [op, name, hostPath] = process.argv.slice(2);

if (!op || !name) {
  console.error('Usage: node scripts/patch-compose-volumes.js add <name> <hostPath>');
  console.error('       node scripts/patch-compose-volumes.js remove <name>');
  process.exit(1);
}

const volumeName = `scan-${name}`;
const mountPath = `/mnt/scan-volumes/${name}`;

let yaml = fs.readFileSync(composePath, 'utf8');

if (op === 'add') {
  if (!hostPath) {
    console.error('add requires <hostPath>');
    process.exit(1);
  }
  const absPath = path.isAbsolute(hostPath) ? hostPath : path.resolve(repoRoot, hostPath);
  if (yaml.includes(`${volumeName}:`)) {
    console.error('Volume already in compose:', volumeName);
    process.exit(1);
  }
  // Add volume mount after each "      - uploads:/uploads" (backend and worker)
  let count = 0;
  yaml = yaml.replace(/(\n\s+- uploads:\/uploads)/g, (m) => {
    if (count < 2) {
      count++;
      return m + `\n      - ${volumeName}:${mountPath}`;
    }
    return m;
  });
  // Top-level volumes: append to the "volumes:" section (at the end of the file)
  const volEntry = `  ${volumeName}:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${absPath}
`;
  yaml = yaml.replace(/\nvolumes:\n([\s\S]*)$/, (_, rest) => '\nvolumes:\n' + rest + volEntry + '\n');
  fs.writeFileSync(composePath, yaml);
  console.log('Added to docker-compose:', volumeName, '->', mountPath);
} else if (op === 'remove') {
  if (!yaml.includes(`${volumeName}:`)) {
    console.error('Volume not in compose:', volumeName);
    process.exit(1);
  }
  // Remove volume mount lines (backend and worker)
  const escapedPath = mountPath.replace(/\//g, '\\/');
  yaml = yaml.replace(new RegExp(`\\n\\s+- ${volumeName}:${escapedPath}`, 'g'), '');
  // Remove top-level volume block (multiline)
  yaml = yaml.replace(
    new RegExp(`\\n  ${volumeName}:\\s*\\n\\s+driver: local\\s*\\n\\s+driver_opts:\\s*\\n[\\s\\S]*?device: [^\\n]+\\n`, ''),
    '\n'
  );
  fs.writeFileSync(composePath, yaml);
  console.log('Removed from docker-compose:', volumeName);
} else {
  console.error('Unknown op:', op);
  process.exit(1);
}
