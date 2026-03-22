import merkle_tree.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program lending_pool_usad_v16.aleo;

record UserActivity:
    owner as address.private;
    asset_id as field.private;
    total_deposits as u64.private;
    total_withdrawals as u64.private;
    total_borrows as u64.private;
    total_repayments as u64.private;

struct MerkleProof:
    siblings as [field; 16u32];
    leaf_index as u32;

struct WalletEcdsaSigner:
    wallet_id as address;
    ecdsa_signer as [u8; 20u32];

struct AdminOp:
    op as u8;
    threshold as u8;
    aleo_signer as address;
    ecdsa_signer as [u8; 20u32];

mapping total_deposited:
    key as field.public;
    value as u64.public;

function deposit:
    input r0 as test_usad_stablecoin.aleo/Token.record;
    input r1 as u64.public;
    input r2 as [MerkleProof; 2u32].private;
    cast r1 into r3 as u128;
    call test_usad_stablecoin.aleo/transfer_private_to_public aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr r3 r0 r2 into r4 r5 r6;
    cast self.caller 1field r1 0u64 0u64 0u64 into r7 as UserActivity.record;
    async deposit r6 r1 into r8;
    output r7 as UserActivity.record;
    output r4 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r5 as test_usad_stablecoin.aleo/Token.record;
    output r8 as lending_pool_usad_v16.aleo/deposit.future;

finalize deposit:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as u64.public;
    await r0;
    get.or_use total_deposited[0field] 0u64 into r2;
    add r2 r1 into r3;
    set r3 into total_deposited[0field];

constructor:
    assert.eq program_owner aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;
