declare module "snarkjs" {
  export const groth16: {
    fullProve: (
      input: unknown,
      wasmPath: string,
      zkeyPath: string,
    ) => Promise<{ proof: unknown; publicSignals: string[] }>;
    verify: (
      verificationKey: unknown,
      publicSignals: string[],
      proof: unknown,
    ) => Promise<boolean>;
  };
}
