# Merkle proof + wallet: `Failed to parse string` (program IR in error)

If the error **“Remaining invalid string”** starts with `input r2 as [test_usdcx_stablecoin.aleo/MerkleProof...` and then shows your **whole** `main.aleo` / program text, the wallet is **not** parsing a Merkle proof literal — it is trying to parse **program source** (or the wrong field was bound to the proof input).

## Fix checklist

1. **Register programs** in `AleoWalletProvider` `programs` (see `src/pages/_app.tsx`):
   - `test_transfer_usdcx_v4.aleo` (or your deployed name; override with `NEXT_PUBLIC_USDC_TRANSFER_PROGRAM_ID`)
   - `merkle_tree.aleo`
   - `test_usdcx_multisig_core.aleo`
   - `test_usdcx_freezelist.aleo`
   - `test_usdcx_stablecoin.aleo`

2. **Third input** to `deposit_private` / `deposit` must be **only** a Leo literal, one line, e.g.  
   `[{ siblings: [0field, ...16...], leaf_index: 1u32 }, { siblings: [...], leaf_index: 1u32 }]`  
   Do **not** paste `build/main.aleo`, deployment output, or anything containing `function deposit` / `input r0`.

3. **Second input** is **u128** for v3/v4, e.g. `1000000u128` (micro-USDC).

4. **Shield / Leo extension**: add the same program IDs under the wallet’s allowed programs if it keeps a separate list.

5. If it still fails, try **another adapter** (e.g. Puzzle) or **upgrade** `@provablehq/aleo-wallet-adaptor-*` — some builds mishandle qualified `Program/MerkleProof` types in `executeTransaction`.
