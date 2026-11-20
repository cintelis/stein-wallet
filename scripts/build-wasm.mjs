// Builds the wallet core (wasm/) for WebAssembly and puts it where the app
// and the tests load it from: public/stein_wallet_core.wasm.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const target = 'wasm32-unknown-unknown';
execFileSync('cargo', ['build', '--release', '--locked', '--target', target], {
  cwd: 'wasm',
  stdio: 'inherit',
});
mkdirSync('public', { recursive: true });
copyFileSync(`wasm/target/${target}/release/stein_wallet_core.wasm`, 'public/stein_wallet_core.wasm');
console.log('built public/stein_wallet_core.wasm');
