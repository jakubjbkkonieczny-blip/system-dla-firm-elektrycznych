const { execSync } = require('child_process');
const cwd = process.cwd();
try {
  console.log('Running: npx tsc --noEmit');
  execSync('npx tsc --noEmit', { cwd, stdio: 'inherit' });
  console.log('tsc completed successfully');
} catch (e) {
  console.error('tsc failed');
  process.exit(e.status || 1);
}
