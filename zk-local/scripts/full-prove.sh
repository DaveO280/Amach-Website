#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v circom >/dev/null 2>&1; then
  echo "Circom 2 is not in PATH. Install it (Homebrew does not provide circom):"
  echo "  1) Rust toolchain: https://rustup.rs/"
  echo "  2) Then: git clone https://github.com/iden3/circom.git && cd circom && cargo install --path circom"
  echo "     (puts circom in ~/.cargo/bin — add that to PATH if needed)"
  echo "  Or binary: https://docs.circom.io/downloads/downloads/"
  exit 1
fi

if [[ ! -d node_modules/snarkjs ]]; then
  echo "Running npm install in zk-local..."
  npm install
fi

SNARKJS="$ROOT/node_modules/.bin/snarkjs"
mkdir -p build

CIRCUIT="$ROOT/circuits/sum_window.circom"
R1CS="$ROOT/build/sum_window.r1cs"
WASM_DIR="$ROOT/build/sum_window_js"
INPUT="$ROOT/inputs/input_sum8.json"
PTAU="$ROOT/build/pot14_final.ptau"
ZKEY="$ROOT/build/sum_window_final.zkey"
VK="$ROOT/build/verification_key.json"
WTNS="$ROOT/build/witness.wtns"
PROOF="$ROOT/build/proof.json"
PUBLIC="$ROOT/build/public.json"

echo "== Compile circom → r1cs + wasm"
circom "$CIRCUIT" --r1cs --wasm -o "$ROOT/build"

WASM_JS="$ROOT/build/sum_window_js"
if [[ ! -d "$WASM_JS" ]]; then
  echo "Expected wasm dir $WASM_JS after compile. If you changed template name, update this script."
  exit 1
fi

echo "== Phase 1 (dev-only powers of tau) if missing: $PTAU"
if [[ ! -f "$PTAU" ]]; then
  "$SNARKJS" powersoftau new bn128 14 "$ROOT/build/pot14_0000.ptau" -v
  "$SNARKJS" powersoftau contribute "$ROOT/build/pot14_0000.ptau" "$ROOT/build/pot14_0001.ptau" \
    --name=amach-local-dev -v -e="$(date +%s)-local"
  # snarkjs 0.7.x: subcommand is "prepare phase2", not "prepare_phase2"
  "$SNARKJS" powersoftau prepare phase2 "$ROOT/build/pot14_0001.ptau" "$PTAU" -v
fi

echo "== Groth16 setup (phase 2) → zkey"
if [[ ! -f "$ZKEY" ]]; then
  "$SNARKJS" groth16 setup "$R1CS" "$PTAU" "$ROOT/build/sum_window_0000.zkey"
  "$SNARKJS" zkey contribute "$ROOT/build/sum_window_0000.zkey" "$ROOT/build/sum_window_0001.zkey" \
    --name=amach-circuit -v -e="$(date +%s)-circuit"
  "$SNARKJS" zkey verify r1cs "$R1CS" "$PTAU" "$ROOT/build/sum_window_0001.zkey"
  cp "$ROOT/build/sum_window_0001.zkey" "$ZKEY"
  "$SNARKJS" zkey export verificationkey "$ZKEY" "$VK"
fi

echo "== Witness"
node "$WASM_JS/generate_witness.js" "$WASM_JS/sum_window.wasm" "$INPUT" "$WTNS"

echo "== Prove"
"$SNARKJS" groth16 prove "$ZKEY" "$WTNS" "$PROOF" "$PUBLIC"

echo "== Verify (off-chain)"
"$SNARKJS" groth16 verify "$VK" "$PUBLIC" "$PROOF"

echo ""
echo "OK — proof.json + public.json in build/. (Dev ceremony only — not production.)"
