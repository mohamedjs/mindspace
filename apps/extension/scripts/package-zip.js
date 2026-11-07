import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(extensionRoot, 'dist');
const zipDistPath = path.resolve(distDir, 'mindspace-extension.zip');
const zipRootPath = path.resolve(extensionRoot, 'mindspace-extension.zip');

async function createZip(outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => {
      resolve(archive.pointer());
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Append files from distDir excluding any zip file itself
    archive.glob('**/*', {
      cwd: distDir,
      ignore: ['*.zip'],
    });

    archive.finalize();
  });
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error(`Dist directory does not exist: ${distDir}`);
    process.exit(1);
  }

  const bytes = await createZip(zipDistPath);
  console.log(`Successfully packaged extension zip: ${zipDistPath} (${bytes} bytes)`);
}

main().catch((err) => {
  console.error('Failed to package extension zip:', err);
  process.exit(1);
});
