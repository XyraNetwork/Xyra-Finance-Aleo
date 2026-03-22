# Real example: 1 deposit

This folder contains **concrete input files** for one deposit (`amount = 1u64`) into `xyra_usdc_lending.aleo`.

## Inputs (3 total)

| File | Input # | Content |
|------|---------|--------|
| `deposit_token.in` | 0 | Your USDCx **Token** record (ciphertext). Must be owned by the signer; decoded amount must be ≥ 1. |
| (CLI arg) | 1 | `1u64` (public amount) |
| `deposit_proofs.in` | 2 | Two **MerkleProof** structs (placeholder; replace with real proofs for on-chain execution). |

## Token record (input 0)

- **File:** `deposit_token.in`
- **Value:** The ciphertext you provided (starts with `record1q...`).  
  If your paste was truncated, replace with the **full** ciphertext from the chain/explorer.
- **Decoded form** (for reference):  
  `owner`, `amount: 1000000u128.private`, `_nonce`, `_version: 1u8.public`  
  So this record has enough balance for a 1u64 deposit.

## MerkleProof (input 2)

- **File:** `deposit_proofs.in`
- **Format:** Two `MerkleProof` values. Each has `siblings: [field; 16]`, `leaf_index: u32`.
- The placeholder file uses zeroed values. **Placeholder proofs cause "proving failed" on-chain**: the real `test_usdcx_stablecoin.aleo` verifies Merkle proofs against its commitment tree, so you must use **valid** proofs.
- **Where to get valid proofs:** From the same Merkle tree the token program uses (e.g. Provable record/state APIs, or a wallet that supports USDCx private transfer and supplies proofs when you spend a record). Contact [Provable devservices](mailto:devservices@provable.com) or check the wallet’s USDCx documentation.

## Run command

From the **program** directory:

```bash
# If Leo takes: input0_file, input1_value, input2_file
leo run deposit inputs/deposit_token.in 1u64 inputs/deposit_proofs.in
```

If your Leo version expects a single combined input file or different order, adjust the command accordingly. You can also run:

```bash
leo run deposit 1u64
```

and when Leo prompts for private inputs, paste the contents of `deposit_token.in` and `deposit_proofs.in` (or point to the files if supported).

## Note on token ciphertext

If the token string in `deposit_token.in` is truncated (incomplete), copy the **full** `record1q...` string from your wallet or explorer and replace the contents of `deposit_token.in`.
