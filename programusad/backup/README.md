# Backup: State-Only Lending Pool (v8)

This folder contains a **backup** of the lending pool contract **before** USDC token integration.

- **File:** `main_v8_state_only.leo`
- **Program name:** `lending_pool_v8.aleo`
- **Behavior:** Deposit, withdraw, borrow, repay, and accrue interest with **state tracking only** (no real token transfers).

To restore the state-only version, copy this file over `program/src/main.leo` and remove the USDC dependency from `program/program.json` (delete the `dependencies` block and remove the `import test_usdcx_bridge.aleo` from main.leo).
