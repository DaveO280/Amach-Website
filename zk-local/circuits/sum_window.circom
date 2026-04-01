pragma circom 2.0.0;

// Teaching circuit: sum of N fixed-size field elements.
// N is chosen at COMPILE time → each N = separate .r1cs/.wasm artifact.
// "Dynamic" per user/session: same N, different `values[]` in input.json.
// For true variable-length windows without recompiling, use max N and pad with 0.
template SumWindow(N) {
    signal input values[N];
    signal output sum;

    var acc = 0;
    for (var i = 0; i < N; i++) {
        acc += values[i];
    }
    sum <== acc;
}

// Demo: 8 days; change template arg and re-run ./scripts/full-prove.sh for other sizes.
// `public […]` on main is only for public *inputs*; `sum` is an output → public by default.
component main = SumWindow(8);
