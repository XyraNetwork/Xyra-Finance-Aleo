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

mapping total_borrowed:
    key as field.public;
    value as u64.public;

mapping available_liquidity:
    key as field.public;
    value as u64.public;

mapping supply_index:
    key as field.public;
    value as u64.public;

mapping borrow_index:
    key as field.public;
    value as u64.public;

mapping last_accrual_block:
    key as field.public;
    value as u64.public;

mapping protocol_fees:
    key as field.public;
    value as u64.public;

mapping supply_apy:
    key as field.public;
    value as u64.public;

mapping borrow_apy:
    key as field.public;
    value as u64.public;

mapping initialized:
    key as field.public;
    value as boolean.public;

mapping user_scaled_supply:
    key as field.public;
    value as u64.public;

mapping user_scaled_borrow:
    key as field.public;
    value as u64.public;

function initialize:
    is.eq self.caller aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr into r0;
    assert.eq r0 true;
    async initialize into r1;
    output r1 as lending_pool_usad_v16.aleo/initialize.future;

finalize initialize:
    get.or_use initialized[0field] false into r0;
    not r0 into r1;
    assert.eq r1 true;
    set 1000000000000u64 into supply_index[0field];
    set 1000000000000u64 into borrow_index[0field];
    set 0u64 into last_accrual_block[0field];
    set 0u64 into total_deposited[0field];
    set 0u64 into total_borrowed[0field];
    set 0u64 into available_liquidity[0field];
    set 0u64 into protocol_fees[0field];
    set 200u64 into supply_apy[0field];
    set 200u64 into borrow_apy[0field];
    set true into initialized[0field];

function deposit:
    input r0 as test_usad_stablecoin.aleo/Token.record;
    input r1 as u64.public;
    input r2 as [MerkleProof; 2u32].private;
    gt r1 0u64 into r3;
    assert.eq r3 true;
    is.eq self.caller r0.owner into r4;
    assert.eq r4 true;
    hash.bhp256 self.caller into r5 as field;
    cast r1 into r6 as u128;
    call test_usad_stablecoin.aleo/transfer_private_to_public aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr r6 r0 r2 into r7 r8 r9;
    cast self.caller 1field r1 0u64 0u64 0u64 into r10 as UserActivity.record;
    async deposit r9 r1 r5 into r11;
    output r10 as UserActivity.record;
    output r7 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r8 as test_usad_stablecoin.aleo/Token.record;
    output r11 as lending_pool_usad_v16.aleo/deposit.future;

finalize deposit:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as u64.public;
    input r2 as field.public;
    await r0;
    cast block.height into r3 as u64;
    get.or_use last_accrual_block[0field] 0u64 into r4;
    get.or_use supply_index[0field] 1000000000000u64 into r5;
    get.or_use borrow_index[0field] 1000000000000u64 into r6;
    get.or_use total_deposited[0field] 0u64 into r7;
    get.or_use total_borrowed[0field] 0u64 into r8;
    get.or_use protocol_fees[0field] 0u64 into r9;
    gt r3 r4 into r10;
    sub r3 r4 into r11;
    ternary r10 r11 0u64 into r12;
    gt r12 1000u64 into r13;
    ternary r13 1000u64 r12 into r14;
    gt r14 0u64 into r15;
    gt r7 0u64 into r16;
    and r15 r16 into r17;
    is.eq r7 0u64 into r18;
    ternary r18 1u64 r7 into r19;
    mul r8 10000u64 into r20;
    div r20 r19 into r21;
    ternary r18 0u64 r21 into r22;
    mul 400u64 r22 into r23;
    div r23 10000u64 into r24;
    add 200u64 r24 into r25;
    mul r25 1000000000000u64 into r26;
    div r26 21024000000u64 into r27;
    mul r27 r22 into r28;
    mul r28 9000u64 into r29;
    div r29 100000000u64 into r30;
    mul r5 r30 into r31;
    mul r31 r14 into r32;
    div r32 1000000000000u64 into r33;
    add r5 r33 into r34;
    ternary r17 r34 r5 into r35;
    mul r6 r27 into r36;
    mul r36 r14 into r37;
    div r37 1000000000000u64 into r38;
    add r6 r38 into r39;
    ternary r17 r39 r6 into r40;
    mul r8 r27 into r41;
    div r41 1000000000000u64 into r42;
    mul r42 r14 into r43;
    mul r43 1000u64 into r44;
    div r44 10000u64 into r45;
    ternary r17 r45 0u64 into r46;
    mul r30 2102400u64 into r47;
    mul r47 10000u64 into r48;
    div r48 1000000000000u64 into r49;
    mul r27 2102400u64 into r50;
    mul r50 10000u64 into r51;
    div r51 1000000000000u64 into r52;
    add r4 r14 into r53;
    ternary r15 r53 r4 into r54;
    set r35 into supply_index[0field];
    set r40 into borrow_index[0field];
    set r54 into last_accrual_block[0field];
    add r9 r46 into r55;
    set r55 into protocol_fees[0field];
    set r49 into supply_apy[0field];
    set r52 into borrow_apy[0field];
    cast r1 into r56 as u128;
    mul r56 1000000000000u128 into r57;
    cast r35 into r58 as u128;
    div r57 r58 into r59;
    cast r59 into r60 as u64;
    get.or_use user_scaled_supply[r2] 0u64 into r61;
    add r61 r60 into r62;
    set r62 into user_scaled_supply[r2];
    add r7 r1 into r63;
    set r63 into total_deposited[0field];
    get.or_use available_liquidity[0field] 0u64 into r64;
    add r64 r1 into r65;
    set r65 into available_liquidity[0field];

function withdraw:
    input r0 as u64.public;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    hash.bhp256 self.caller into r2 as field;
    cast self.caller 1field 0u64 r0 0u64 0u64 into r3 as UserActivity.record;
    async withdraw r0 r2 into r4;
    output r3 as UserActivity.record;
    output r4 as lending_pool_usad_v16.aleo/withdraw.future;

finalize withdraw:
    input r0 as u64.public;
    input r1 as field.public;
    cast block.height into r2 as u64;
    get.or_use last_accrual_block[0field] 0u64 into r3;
    get.or_use supply_index[0field] 1000000000000u64 into r4;
    get.or_use borrow_index[0field] 1000000000000u64 into r5;
    get.or_use total_deposited[0field] 0u64 into r6;
    get.or_use total_borrowed[0field] 0u64 into r7;
    get.or_use protocol_fees[0field] 0u64 into r8;
    gt r2 r3 into r9;
    sub r2 r3 into r10;
    ternary r9 r10 0u64 into r11;
    gt r11 1000u64 into r12;
    ternary r12 1000u64 r11 into r13;
    gt r13 0u64 into r14;
    gt r6 0u64 into r15;
    and r14 r15 into r16;
    is.eq r6 0u64 into r17;
    ternary r17 1u64 r6 into r18;
    mul r7 10000u64 into r19;
    div r19 r18 into r20;
    ternary r17 0u64 r20 into r21;
    mul 400u64 r21 into r22;
    div r22 10000u64 into r23;
    add 200u64 r23 into r24;
    mul r24 1000000000000u64 into r25;
    div r25 21024000000u64 into r26;
    mul r26 r21 into r27;
    mul r27 9000u64 into r28;
    div r28 100000000u64 into r29;
    mul r4 r29 into r30;
    mul r30 r13 into r31;
    div r31 1000000000000u64 into r32;
    add r4 r32 into r33;
    ternary r16 r33 r4 into r34;
    mul r5 r26 into r35;
    mul r35 r13 into r36;
    div r36 1000000000000u64 into r37;
    add r5 r37 into r38;
    ternary r16 r38 r5 into r39;
    mul r7 r26 into r40;
    div r40 1000000000000u64 into r41;
    mul r41 r13 into r42;
    mul r42 1000u64 into r43;
    div r43 10000u64 into r44;
    ternary r16 r44 0u64 into r45;
    mul r29 2102400u64 into r46;
    mul r46 10000u64 into r47;
    div r47 1000000000000u64 into r48;
    mul r26 2102400u64 into r49;
    mul r49 10000u64 into r50;
    div r50 1000000000000u64 into r51;
    add r3 r13 into r52;
    ternary r14 r52 r3 into r53;
    set r34 into supply_index[0field];
    set r39 into borrow_index[0field];
    set r53 into last_accrual_block[0field];
    add r8 r45 into r54;
    set r54 into protocol_fees[0field];
    set r48 into supply_apy[0field];
    set r51 into borrow_apy[0field];
    get.or_use user_scaled_supply[r1] 0u64 into r55;
    cast r55 into r56 as u128;
    cast r34 into r57 as u128;
    mul r56 r57 into r58;
    div r58 1000000000000u128 into r59;
    cast r59 into r60 as u64;
    lte r0 r60 into r61;
    assert.eq r61 true;
    get.or_use user_scaled_borrow[r1] 0u64 into r62;
    cast r62 into r63 as u128;
    cast r39 into r64 as u128;
    mul r63 r64 into r65;
    div r65 1000000000000u128 into r66;
    cast r66 into r67 as u64;
    sub r60 r0 into r68;
    mul r68 7500u64 into r69;
    div r69 10000u64 into r70;
    is.eq r67 0u64 into r71;
    lte r67 r70 into r72;
    or r71 r72 into r73;
    assert.eq r73 true;
    cast r0 into r74 as u128;
    mul r74 1000000000000u128 into r75;
    cast r34 into r76 as u128;
    div r75 r76 into r77;
    cast r77 into r78 as u64;
    gt r55 r78 into r79;
    sub r55 r78 into r80;
    ternary r79 r80 0u64 into r81;
    set r81 into user_scaled_supply[r1];
    gt r6 r0 into r82;
    sub r6 r0 into r83;
    ternary r82 r83 0u64 into r84;
    set r84 into total_deposited[0field];
    get.or_use available_liquidity[0field] 0u64 into r85;
    gt r85 r0 into r86;
    sub r85 r0 into r87;
    ternary r86 r87 0u64 into r88;
    set r88 into available_liquidity[0field];

function borrow:
    input r0 as u64.public;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    hash.bhp256 self.caller into r2 as field;
    cast self.caller 1field 0u64 0u64 r0 0u64 into r3 as UserActivity.record;
    async borrow r0 r2 into r4;
    output r3 as UserActivity.record;
    output r4 as lending_pool_usad_v16.aleo/borrow.future;

finalize borrow:
    input r0 as u64.public;
    input r1 as field.public;
    cast block.height into r2 as u64;
    get.or_use last_accrual_block[0field] 0u64 into r3;
    get.or_use supply_index[0field] 1000000000000u64 into r4;
    get.or_use borrow_index[0field] 1000000000000u64 into r5;
    get.or_use total_deposited[0field] 0u64 into r6;
    get.or_use total_borrowed[0field] 0u64 into r7;
    get.or_use protocol_fees[0field] 0u64 into r8;
    gt r2 r3 into r9;
    sub r2 r3 into r10;
    ternary r9 r10 0u64 into r11;
    gt r11 1000u64 into r12;
    ternary r12 1000u64 r11 into r13;
    gt r13 0u64 into r14;
    gt r6 0u64 into r15;
    and r14 r15 into r16;
    is.eq r6 0u64 into r17;
    ternary r17 1u64 r6 into r18;
    mul r7 10000u64 into r19;
    div r19 r18 into r20;
    ternary r17 0u64 r20 into r21;
    mul 400u64 r21 into r22;
    div r22 10000u64 into r23;
    add 200u64 r23 into r24;
    mul r24 1000000000000u64 into r25;
    div r25 21024000000u64 into r26;
    mul r26 r21 into r27;
    mul r27 9000u64 into r28;
    div r28 100000000u64 into r29;
    mul r4 r29 into r30;
    mul r30 r13 into r31;
    div r31 1000000000000u64 into r32;
    add r4 r32 into r33;
    ternary r16 r33 r4 into r34;
    mul r5 r26 into r35;
    mul r35 r13 into r36;
    div r36 1000000000000u64 into r37;
    add r5 r37 into r38;
    ternary r16 r38 r5 into r39;
    mul r7 r26 into r40;
    div r40 1000000000000u64 into r41;
    mul r41 r13 into r42;
    mul r42 1000u64 into r43;
    div r43 10000u64 into r44;
    ternary r16 r44 0u64 into r45;
    mul r29 2102400u64 into r46;
    mul r46 10000u64 into r47;
    div r47 1000000000000u64 into r48;
    mul r26 2102400u64 into r49;
    mul r49 10000u64 into r50;
    div r50 1000000000000u64 into r51;
    add r3 r13 into r52;
    ternary r14 r52 r3 into r53;
    set r34 into supply_index[0field];
    set r39 into borrow_index[0field];
    set r53 into last_accrual_block[0field];
    add r8 r45 into r54;
    set r54 into protocol_fees[0field];
    set r48 into supply_apy[0field];
    set r51 into borrow_apy[0field];
    get.or_use user_scaled_supply[r1] 0u64 into r55;
    cast r55 into r56 as u128;
    cast r34 into r57 as u128;
    mul r56 r57 into r58;
    div r58 1000000000000u128 into r59;
    cast r59 into r60 as u64;
    mul r60 7500u64 into r61;
    div r61 10000u64 into r62;
    get.or_use user_scaled_borrow[r1] 0u64 into r63;
    cast r63 into r64 as u128;
    cast r39 into r65 as u128;
    mul r64 r65 into r66;
    div r66 1000000000000u128 into r67;
    cast r67 into r68 as u64;
    add r68 r0 into r69;
    lte r69 r62 into r70;
    assert.eq r70 true;
    get.or_use available_liquidity[0field] 0u64 into r71;
    lte r0 r71 into r72;
    assert.eq r72 true;
    cast r0 into r73 as u128;
    mul r73 1000000000000u128 into r74;
    cast r39 into r75 as u128;
    div r74 r75 into r76;
    cast r76 into r77 as u64;
    add r63 r77 into r78;
    set r78 into user_scaled_borrow[r1];
    add r7 r0 into r79;
    set r79 into total_borrowed[0field];
    gt r71 r0 into r80;
    sub r71 r0 into r81;
    ternary r80 r81 0u64 into r82;
    set r82 into available_liquidity[0field];

function repay:
    input r0 as test_usad_stablecoin.aleo/Token.record;
    input r1 as u64.public;
    input r2 as [MerkleProof; 2u32].private;
    gt r1 0u64 into r3;
    assert.eq r3 true;
    is.eq self.caller r0.owner into r4;
    assert.eq r4 true;
    hash.bhp256 self.caller into r5 as field;
    cast r1 into r6 as u128;
    call test_usad_stablecoin.aleo/transfer_private_to_public aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr r6 r0 r2 into r7 r8 r9;
    cast self.caller 1field 0u64 0u64 0u64 r1 into r10 as UserActivity.record;
    async repay r9 r1 r5 into r11;
    output r10 as UserActivity.record;
    output r7 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r8 as test_usad_stablecoin.aleo/Token.record;
    output r11 as lending_pool_usad_v16.aleo/repay.future;

finalize repay:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as u64.public;
    input r2 as field.public;
    await r0;
    cast block.height into r3 as u64;
    get.or_use last_accrual_block[0field] 0u64 into r4;
    get.or_use supply_index[0field] 1000000000000u64 into r5;
    get.or_use borrow_index[0field] 1000000000000u64 into r6;
    get.or_use total_deposited[0field] 0u64 into r7;
    get.or_use total_borrowed[0field] 0u64 into r8;
    get.or_use protocol_fees[0field] 0u64 into r9;
    gt r3 r4 into r10;
    sub r3 r4 into r11;
    ternary r10 r11 0u64 into r12;
    gt r12 1000u64 into r13;
    ternary r13 1000u64 r12 into r14;
    gt r14 0u64 into r15;
    gt r7 0u64 into r16;
    and r15 r16 into r17;
    is.eq r7 0u64 into r18;
    ternary r18 1u64 r7 into r19;
    mul r8 10000u64 into r20;
    div r20 r19 into r21;
    ternary r18 0u64 r21 into r22;
    mul 400u64 r22 into r23;
    div r23 10000u64 into r24;
    add 200u64 r24 into r25;
    mul r25 1000000000000u64 into r26;
    div r26 21024000000u64 into r27;
    mul r27 r22 into r28;
    mul r28 9000u64 into r29;
    div r29 100000000u64 into r30;
    mul r5 r30 into r31;
    mul r31 r14 into r32;
    div r32 1000000000000u64 into r33;
    add r5 r33 into r34;
    ternary r17 r34 r5 into r35;
    mul r6 r27 into r36;
    mul r36 r14 into r37;
    div r37 1000000000000u64 into r38;
    add r6 r38 into r39;
    ternary r17 r39 r6 into r40;
    mul r8 r27 into r41;
    div r41 1000000000000u64 into r42;
    mul r42 r14 into r43;
    mul r43 1000u64 into r44;
    div r44 10000u64 into r45;
    ternary r17 r45 0u64 into r46;
    mul r30 2102400u64 into r47;
    mul r47 10000u64 into r48;
    div r48 1000000000000u64 into r49;
    mul r27 2102400u64 into r50;
    mul r50 10000u64 into r51;
    div r51 1000000000000u64 into r52;
    add r4 r14 into r53;
    ternary r15 r53 r4 into r54;
    set r35 into supply_index[0field];
    set r40 into borrow_index[0field];
    set r54 into last_accrual_block[0field];
    add r9 r46 into r55;
    set r55 into protocol_fees[0field];
    set r49 into supply_apy[0field];
    set r52 into borrow_apy[0field];
    get.or_use user_scaled_borrow[r2] 0u64 into r56;
    cast r56 into r57 as u128;
    cast r40 into r58 as u128;
    mul r57 r58 into r59;
    div r59 1000000000000u128 into r60;
    cast r60 into r61 as u64;
    lte r1 r61 into r62;
    assert.eq r62 true;
    cast r1 into r63 as u128;
    mul r63 1000000000000u128 into r64;
    cast r40 into r65 as u128;
    div r64 r65 into r66;
    cast r66 into r67 as u64;
    gt r56 r67 into r68;
    sub r56 r67 into r69;
    ternary r68 r69 0u64 into r70;
    set r70 into user_scaled_borrow[r2];
    gt r8 r1 into r71;
    sub r8 r1 into r72;
    ternary r71 r72 0u64 into r73;
    set r73 into total_borrowed[0field];
    get.or_use available_liquidity[0field] 0u64 into r74;
    add r74 r1 into r75;
    set r75 into available_liquidity[0field];

function accrue_interest:
    async accrue_interest into r0;
    output r0 as lending_pool_usad_v16.aleo/accrue_interest.future;

finalize accrue_interest:
    cast block.height into r0 as u64;
    get.or_use last_accrual_block[0field] 0u64 into r1;
    get.or_use supply_index[0field] 1000000000000u64 into r2;
    get.or_use borrow_index[0field] 1000000000000u64 into r3;
    get.or_use total_deposited[0field] 0u64 into r4;
    get.or_use total_borrowed[0field] 0u64 into r5;
    get.or_use protocol_fees[0field] 0u64 into r6;
    gt r0 r1 into r7;
    sub r0 r1 into r8;
    ternary r7 r8 0u64 into r9;
    gt r9 1000u64 into r10;
    ternary r10 1000u64 r9 into r11;
    gt r11 0u64 into r12;
    gt r4 0u64 into r13;
    and r12 r13 into r14;
    is.eq r4 0u64 into r15;
    ternary r15 1u64 r4 into r16;
    mul r5 10000u64 into r17;
    div r17 r16 into r18;
    ternary r15 0u64 r18 into r19;
    mul 400u64 r19 into r20;
    div r20 10000u64 into r21;
    add 200u64 r21 into r22;
    mul r22 1000000000000u64 into r23;
    div r23 21024000000u64 into r24;
    mul r24 r19 into r25;
    mul r25 9000u64 into r26;
    div r26 100000000u64 into r27;
    mul r2 r27 into r28;
    mul r28 r11 into r29;
    div r29 1000000000000u64 into r30;
    add r2 r30 into r31;
    ternary r14 r31 r2 into r32;
    mul r3 r24 into r33;
    mul r33 r11 into r34;
    div r34 1000000000000u64 into r35;
    add r3 r35 into r36;
    ternary r14 r36 r3 into r37;
    mul r5 r24 into r38;
    div r38 1000000000000u64 into r39;
    mul r39 r11 into r40;
    mul r40 1000u64 into r41;
    div r41 10000u64 into r42;
    ternary r14 r42 0u64 into r43;
    mul r27 2102400u64 into r44;
    mul r44 10000u64 into r45;
    div r45 1000000000000u64 into r46;
    mul r24 2102400u64 into r47;
    mul r47 10000u64 into r48;
    div r48 1000000000000u64 into r49;
    add r1 r11 into r50;
    ternary r12 r50 r1 into r51;
    set r32 into supply_index[0field];
    set r37 into borrow_index[0field];
    set r51 into last_accrual_block[0field];
    add r6 r43 into r52;
    set r52 into protocol_fees[0field];
    set r46 into supply_apy[0field];
    set r49 into borrow_apy[0field];

function withdraw_fees:
    input r0 as u64.public;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    async withdraw_fees r0 self.caller into r2;
    output r2 as lending_pool_usad_v16.aleo/withdraw_fees.future;

finalize withdraw_fees:
    input r0 as u64.public;
    input r1 as address.public;
    is.eq r1 aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px into r2;
    assert.eq r2 true;
    get.or_use protocol_fees[0field] 0u64 into r3;
    lte r0 r3 into r4;
    assert.eq r4 true;
    sub r3 r0 into r5;
    set r5 into protocol_fees[0field];

constructor:
    assert.eq program_owner aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr;
