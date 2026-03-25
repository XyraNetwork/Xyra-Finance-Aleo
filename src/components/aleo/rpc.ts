import { JSONRPCClient } from 'json-rpc-2.0';
import {
  BOUNTY_PROGRAM_ID,
  USDC_POOL_PROGRAM_ID,
  USDC_TOKEN_PROGRAM_ID,
  USAD_POOL_PROGRAM_ID,
  USAD_TOKEN_PROGRAM_ID,
  CURRENT_NETWORK,
  CURRENT_RPC_URL,
} from '@/types';
import { Network } from '@provablehq/aleo-types';
import { frontendLogger } from '@/utils/logger';
import { TREASURY_ADDRESS, getTreasuryRequestMessage } from '@/config/treasury';

// Note: @aleohq/wasm is not imported directly due to WASM build issues in Next.js
// We'll use dynamic import when needed, or fall back to contract call method

// For clarity, alias the lending pool program IDs.
export const LENDING_POOL_PROGRAM_ID = BOUNTY_PROGRAM_ID;
export const USDC_LENDING_POOL_PROGRAM_ID = USDC_POOL_PROGRAM_ID;
export const USAD_LENDING_POOL_PROGRAM_ID = USAD_POOL_PROGRAM_ID;
export const CREDITS_PROGRAM_ID = 'credits.aleo';

/**
 * Debug function to diagnose what records are available in the wallet
 * Call this from the browser console: window.debugRecords(requestRecords)
 */
export async function debugAllRecords(
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  publicKey?: string
): Promise<any> {
  if (!requestRecords) {
    return { error: 'requestRecords not available. Make sure wallet is connected.' };
  }

  console.log('🔍 === WALLET RECORDS DIAGNOSIS ===');
  
  const results: any = {
    timestamp: new Date().toISOString(),
    publicKey: publicKey?.substring(0, 20) + '...',
    approaches: {},
  };

  let creditsRecordsResult: any = [];
  let lendingPoolRecordsResult: any = [];
  let allRecordsResult: any = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Approach 1: Get all records (empty string)
  try {
    console.log('📋 Fetching ALL records (empty string)...');
    const allRecords = await requestRecords('', false);
    allRecordsResult = allRecords || [];
    results.approaches.allRecords = {
      success: true,
      count: allRecords?.length || 0,
      records: allRecords || [],
    };
    console.log('✅ All records:', allRecords?.length || 0);
    if (allRecords && Array.isArray(allRecords)) {
      allRecords.forEach((r: any, i: number) => {
        console.log(`  [${i}] Program: ${r.program_id || r.programId || 'unknown'}, Keys: ${Object.keys(r).join(', ')}`);
      });
    }
  } catch (e: any) {
    const errMsg = `Failed to fetch all records: ${e.message}`;
    console.warn('⚠️', errMsg);
    errors.push(errMsg);
    results.approaches.allRecords = { success: false, error: e.message };
  }

  // Approach 3: Get lending pool records
  try {
    console.log('📋 Fetching LENDING POOL records...');
    const lendingRecords = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
    lendingPoolRecordsResult = lendingRecords || [];
    results.approaches.lendingRecords = {
      success: true,
      count: lendingRecords?.length || 0,
      records: lendingRecords || [],
    };
    console.log('✅ Lending pool records:', lendingRecords?.length || 0);
    if (lendingRecords && Array.isArray(lendingRecords)) {
      lendingRecords.forEach((r: any, i: number) => {
        console.log(`  [${i}]:`, JSON.stringify(r, null, 2).substring(0, 300));
      });
    }
  } catch (e: any) {
    const errMsg = `Failed to fetch lending pool records: ${e.message}`;
    console.warn('⚠️', errMsg);
    errors.push(errMsg);
    results.approaches.lendingRecords = { success: false, error: e.message };
  }

  console.log('🔍 === DIAGNOSIS COMPLETE ===');
  console.log('📊 Summary:', results);
  
  // Store diagnostic in logger
  frontendLogger.storeRecordDiagnostic(
    publicKey,
    creditsRecordsResult,
    lendingPoolRecordsResult,
    allRecordsResult,
    errors,
    warnings
  );
  
  return results;
}

// Default fee for lending pool functions (in credits, will be converted to microcredits).
// If you see fee-related errors in Leo Wallet, you can increase this.
const DEFAULT_LENDING_FEE = 0.2; // 0.2 credits = 200,000 microcredits

/** Testnet explorer base for transaction IDs (at1…). */
export const ALEO_TESTNET_TX_EXPLORER = 'https://testnet.explorer.provable.com/transaction';

/** Log a clickable diagnosis line for an Aleo tx id (browser console). */
export function logAleoTxExplorer(context: string, txId: string | undefined | null): void {
  if (!txId || typeof txId !== 'string') {
    console.warn(`[${context}] No transaction id to log.`);
    return;
  }
  console.info(`[${context}] Explorer (testnet): ${ALEO_TESTNET_TX_EXPLORER}/${txId}`);
}

type MerkleProofBuildResult = { literal: string; source: string };

// Flag to disable credits record check (for testing purposes)
// When true, skips validation and creates a mock record if none found
const DISABLE_CREDITS_CHECK = false; // Set to false to re-enable checks

// Create the JSON-RPC client
export const client = getClient(CURRENT_RPC_URL);


// returns a string for address-based mappings
export async function fetchMappingValueString(
  mappingName: string,
  key: number
): Promise<string> {
  try {
    const result = await client.request('getMappingValue', {
      programId: LENDING_POOL_PROGRAM_ID,
      mappingName,
      key: `${key}.public`,
    });
    return result.value; // The address is stored as string in 'result.value'
  } catch (error) {
    console.error(`Failed to fetch mapping ${mappingName} with key ${key}:`, error);
    throw error;
  }
}

export async function fetchMappingValueRaw(
  mappingName: string,
  key: string
): Promise<string> {
  try {

    const keyString = `${key}u64`;

    const result = await client.request("getMappingValue", {
      program_id: LENDING_POOL_PROGRAM_ID,
      mapping_name: mappingName,
      key: keyString,
    });

    if (!result) {
      throw new Error(
        `No result returned for mapping "${mappingName}" and key "${keyString}"`
      );
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch mapping "${mappingName}" with key "${key}":`, error);
    throw error;
  }
}


export async function fetchBountyStatusAndReward(bountyId: string) {
  try {
 
    const keyU64 = `${bountyId}u64`;


    const statusResult = await client.request('getMappingValue', {
      program_id: LENDING_POOL_PROGRAM_ID,
      mapping_name: 'bounty_status',
      key: keyU64,
    });

    const rewardResult = await client.request('getMappingValue', {
      program_id: LENDING_POOL_PROGRAM_ID,
      // In the Leo program this is stored as `bounty_payment`
      mapping_name: 'bounty_payment',
      key: keyU64,
    });

    return {
      status: statusResult?.value ?? statusResult ?? null,
      reward: rewardResult?.value ?? rewardResult ?? null,
    };
  } catch (error) {
    console.error('Error fetching bounty status/reward from chain:', error);
    throw new Error('Failed to fetch chain data');
  }
}

export async function readBountyMappings(bountyId: string) {
  // Fetch raw strings for all mappings
  const creator = await fetchMappingValueRaw('bounty_creator', bountyId);
  const payment = await fetchMappingValueRaw('bounty_payment', bountyId);
  const status = await fetchMappingValueRaw('bounty_status', bountyId);

  return {
    creator,  
    payment,  
    status,   
  };
}

export async function readProposalMappings(bountyId: number, proposalId: number) {
  // Ensure safe arithmetic using BigInt
  const compositeProposalId = (BigInt(bountyId) * BigInt(1_000_000) + BigInt(proposalId)).toString();

  console.log("Fetching data for Composite Proposal ID:", compositeProposalId);

  try {
    // Fetch all mappings related to the proposal
    const proposalBountyId = await fetchMappingValueRaw("proposal_bounty_id", compositeProposalId);
    const proposalProposer = await fetchMappingValueRaw("proposal_proposer", compositeProposalId);
    const proposalStatus = await fetchMappingValueRaw("proposal_status", compositeProposalId);

    return {
      proposalBountyId,
      proposalProposer,
      proposalStatus,
    };
  } catch (error) {
    console.error("Error fetching proposal mappings:", error);
    throw error;
  }
}



/**
 * Utility to fetch program transactions
 */
export async function getProgramTransactions(
  functionName: string,
  page = 0,
  maxTransactions = 100
) {
  return client.request('aleoTransactionsForProgram', {
    programId: LENDING_POOL_PROGRAM_ID,
    functionName,
    page,
    maxTransactions,
  });
}

/**
 * Transfer credits publicly between two accounts.
 */
export async function transferPublic(
  recipient: string,
  amount: string
): Promise<string> {
  const inputs = [
    `${recipient}.public`, // Recipient's public address
    `${amount}u64`,    // Amount to transfer
  ];

  const result = await client.request('executeTransition', {
    programId: CREDITS_PROGRAM_ID,
    functionName: 'transfer_public',
    inputs,
  });

  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}

/**
 * Transfer credits privately between two accounts.
 *
 * This function calls the on-chain "transfer_private" transition,
 * which exactly expects three inputs in the following order:
 *  - r0: Sender's credits record (credits.record)
 *  - r1: Recipient's address with a ".private" suffix (address.private)
 *  - r2: Transfer amount with a "u64.private" suffix (u64.private)
 *
 * It returns two credits records:
 *  - The first output is the recipient's updated credits record.
 *  - The second output is the sender's updated credits record.
 */
export async function transferPrivate(
  senderRecord: string,
  recipient: string,
  amount: string
): Promise<{ recipientRecord: string; senderRecord: string }> {
  // Exactly matching the expected input types:
  const inputs = [
    `${senderRecord}`,         // r0: credits.record
    `${recipient}.private`,    // r1: address.private
    `${amount}u64.private`,     // r2: u64.private
  ];

  const result = await client.request('executeTransition', {
    programId: CREDITS_PROGRAM_ID,
    functionName: 'transfer_private',
    inputs,
  });

  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }

  // The Aleo program returns:
  //   result.outputs[0] -> recipient's updated credits record (r4)
  //   result.outputs[1] -> sender's updated credits record (r5)
  return {
    recipientRecord: result.outputs[0],
    senderRecord: result.outputs[1],
  };
}

/**
 * Call the `main` transition of the `sample.aleo` program.
 *
 * Leo:
 *   transition main(public a: u32, b: u32) -> u32
 */
// ----------------- Lending Pool helpers -----------------

/**
 * Helper: Get the latest UserPosition record or create a new one
 * Returns the record in the format expected by Aleo transitions (as a string)
 */
/**
 * Get the latest UserActivity record from wallet records, or return a zero activity for first-time users.
 * IMPORTANT: Always fetch from wallet records (requestRecords), never use activity from transaction result.
 * This ensures we always have the most up-to-date activity from the contract.
 * 
 * UserActivity contains 4 counters: total_deposits, total_withdrawals, total_borrows, total_repayments
 * Frontend calculates: net_supplied = total_deposits - total_withdrawals
 *                      net_borrowed = total_borrows - total_repayments
 * 
 * For first-time users (no record found), returns a zero activity object that the contract will accept.
 * The contract automatically handles first-time users when all counters are 0.
 * 
 * @param requestRecords - Function to fetch records from wallet
 * @param publicKey - User's public key (for validation and creating zero activity)
 * @returns The latest UserActivity record, or a zero activity object for first-time users
 */
async function getOrCreateActivity(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  publicKey: string
): Promise<any> {
  try {
    console.log('getOrCreateActivity: Fetching latest records from wallet for program:', LENDING_POOL_PROGRAM_ID);
    // requestRecords takes two parameters: (programId: string, includeSpent?: boolean)
    const records = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
    console.log('getOrCreateActivity: Found records:', records?.length || 0);
    
    if (records && records.length > 0) {
      // Find the most recent UserActivity record
      // Records are typically returned with the newest last, so iterate in reverse
      // IMPORTANT: Always use the LATEST record from wallet, not from transaction result
      for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        console.log('getOrCreateActivity: Checking record', i, ':', typeof record);
        
        // Records from the wallet are typically already in the correct format
        if (typeof record === 'string') {
          // If it's already a string, check if it looks like a UserActivity record
          if (record.includes('owner') || record.includes('total_deposits') || record.includes('total_withdrawals') || 
              record.includes('total_borrows') || record.includes('total_repayments')) {
            console.log('getOrCreateActivity: Found UserActivity record (string format) - using latest from wallet');
            return record;
          }
        } else if (record && typeof record === 'object') {
          // If it's an object, check if it has UserActivity fields
          const recordData = record;
          const hasUserActivityFields = 
            recordData.program_id === LENDING_POOL_PROGRAM_ID || 
            recordData.programId === LENDING_POOL_PROGRAM_ID ||
            recordData.recordName === 'UserActivity' ||
            recordData.type === 'UserActivity' ||
            recordData.recordType === 'UserActivity' ||
            (recordData.data && (
              recordData.data.total_deposits !== undefined || 
              recordData.data.total_withdrawals !== undefined ||
              recordData.data.total_borrows !== undefined ||
              recordData.data.total_repayments !== undefined
            )) ||
            (recordData.total_deposits !== undefined || 
             recordData.total_withdrawals !== undefined ||
             recordData.total_borrows !== undefined ||
             recordData.total_repayments !== undefined);
          
          if (hasUserActivityFields) {
            console.log('getOrCreateActivity: Found UserActivity record (object format) - using latest from wallet');
            // Verify the owner matches (if we can extract it)
            // This ensures we're using the correct user's activity
            if (publicKey && recordData.owner && recordData.owner !== publicKey) {
              console.warn('getOrCreateActivity: Record owner does not match publicKey, continuing search...');
              continue;
            }
            return record; // Return the record object - wallet adapter handles serialization
          }
        }
      }
    }
    
    // No record found - return a zero activity for first-time users
    // The contract will accept this and automatically create the activity
    // The wallet adapter expects records as objects with a specific structure
    console.log('getOrCreateActivity: No existing record found, creating zero activity for first-time user');
    
    // Create a zero activity record object that matches the wallet adapter's expected format
    // The wallet adapter expects records to have a structure similar to what requestRecords returns
    // Format: { program_id, data: { owner, total_deposits, total_withdrawals, total_borrows, total_repayments } }
    const zeroActivityObject = {
      program_id: LENDING_POOL_PROGRAM_ID,
      recordName: 'UserActivity',
      data: {
        owner: `${publicKey}.private`,
        total_deposits: `0u64.private`,
        total_withdrawals: `0u64.private`,
        total_borrows: `0u64.private`,
        total_repayments: `0u64.private`,
      },
    };
    
    console.log('getOrCreateActivity: Created zero activity record object:', zeroActivityObject);
    return zeroActivityObject;
  } catch (error) {
    console.error('getOrCreateActivity: Failed to get activity record from wallet:', error);
    // Return zero activity for first-time users even on error
    // Format it as a proper object structure that matches wallet adapter expectations
    const zeroActivityObject = {
      program_id: LENDING_POOL_PROGRAM_ID,
      recordName: 'UserActivity',
      data: {
        owner: `${publicKey}.private`,
        total_deposits: `0u64.private`,
        total_withdrawals: `0u64.private`,
        total_borrows: `0u64.private`,
        total_repayments: `0u64.private`,
      },
    };
    console.log('getOrCreateActivity: Created zero activity record object (error fallback):', zeroActivityObject);
    return zeroActivityObject;
  }
}

/**
 * Get total spendable private Aleo balance (credits.aleo records) in credits.
 * Sums microcredits from all unspent credits.aleo records; uses decrypt for private records.
 * Returns 0 if no records or on error.
 */
export async function getPrivateCreditsBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) return 0;
    const getMicrocredits = (r: any): number => {
      try {
        if (r.data?.microcredits) {
          return parseInt(String(r.data.microcredits).replace(/\D/g, ''), 10) || 0;
        }
        if (r.plaintext) {
          const m = String(r.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          return m ? parseInt(m[1].replace(/_/g, ''), 10) : 0;
        }
      } catch {
        return 0;
      }
      return 0;
    };
    let totalMicro = 0;
    for (const r of records as any[]) {
      if (r.spent) continue;
      let micro = getMicrocredits(r);
      if (micro === 0 && (r.recordCiphertext || r.ciphertext) && decrypt) {
        try {
          const plain = await decrypt(r.recordCiphertext || r.ciphertext);
          if (plain) {
            const m = plain.match(/microcredits:\s*([\d_]+)u64/);
            micro = m ? parseInt(m[1].replace(/_/g, ''), 10) : 0;
          }
        } catch {
          // skip
        }
      }
      totalMicro += micro;
    }
    return totalMicro / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Deposit into the lending pool using a real `credits.aleo/credits` record.
 *
 * Contract: lending_pool_v86.aleo
 *   async transition deposit_with_credits(
 *     pay_record: credits.aleo/credits,
 *     public amount: u64
 *   ) -> (UserActivity, credits.aleo/credits, Future)
 */
export async function lendingDeposit(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<string> {
  console.log('========================================');
  console.log('💰 LENDING DEPOSIT (credits) CALLED');
  console.log('========================================');
  console.log('📥 Input Parameters:', {
    amount,
    network: CURRENT_NETWORK,
    programId: LENDING_POOL_PROGRAM_ID,
  });

  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable.');
  }
  if (amount <= 0) {
    throw new Error('Deposit amount must be greater than 0');
  }

  try {
    // Convert amount (credits) to microcredits. We allow decimals (up to 6 places),
    // rounding to the nearest micro credit. Pool expects micro-ALEO as its `amount`.
    const amountMicro = Math.round(amount * 1_000_000);
    const requiredMicro = amountMicro;

    console.log('🔍 Fetching credits.aleo records for deposit...', {
      CREDITS_PROGRAM_ID,
      requiredMicro,
    });

    let records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) records = [];

    console.log(`📋 Found ${records.length} credits.aleo records`);

    // Helper similar to NullPay: extract microcredits from data or plaintext
    const getMicrocredits = (record: any): number => {
      try {
        if (record.data && record.data.microcredits) {
          return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
        }
        if (record.plaintext) {
          const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          if (match && match[1]) {
            return parseInt(match[1].replace(/_/g, ''), 10);
          }
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const processRecord = async (r: any): Promise<number> => {
      let val = getMicrocredits(r);
      if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
        try {
          const decrypted = await decrypt(r.recordCiphertext);
          if (decrypted) {
            r.plaintext = decrypted;
            val = getMicrocredits(r);
          }
        } catch (e) {
          console.warn('⚠️ Failed to decrypt credits record for deposit:', e);
        }
      }
      return val;
    };

    let payRecord: any | null = null;
    for (const r of records as any[]) {
      if (r.spent) continue;
      const val = await processRecord(r);
      const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
      if (isSpendable && val >= requiredMicro) {
        payRecord = r;
        break;
      }
    }

    if (!payRecord) {
      throw new Error(
        `No credits.aleo record found with enough microcredits for amount ${amount}. ` +
          `Make sure you have at least ${amount} private credits in one record.`,
      );
    }

    console.log('✅ Selected credits.aleo record for deposit:', {
      preview: JSON.stringify(payRecord).slice(0, 200),
    });

    // Build Leo-compatible record input (plaintext or ciphertext), like NullPay.
    let recordInput: string | any = payRecord.plaintext;

    if (!recordInput) {
      console.warn('⚠️ Credits record missing plaintext. Attempting to reconstruct...');
      const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
      const micro = getMicrocredits(payRecord);
      const owner = payRecord.owner;

      if (nonce && micro > 0 && owner) {
        recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
        console.log('✅ Reconstructed credits plaintext for deposit:', recordInput);
      } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
        recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
        console.log('✅ Using credits ciphertext for deposit input.');
      } else {
        console.warn('⚠️ Could not reconstruct credits record; passing raw object (last resort).');
        recordInput = payRecord;
      }
    }

    const amountInput = `${amountMicro}u64`;
    const inputs: any[] = [recordInput, amountInput];

    console.log('🔍 Calling executeTransaction for deposit_with_credits...', {
      program: LENDING_POOL_PROGRAM_ID,
      function: 'deposit_with_credits',
      inputsPreview: {
        input0_len: recordInput.length,
        input1: amountInput,
      },
    });

    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'deposit_with_credits',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [0],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Deposit failed: No temporary transactionId returned from wallet.');
    }

    console.log('Temporary Transaction ID (deposit_with_credits):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING DEPOSIT (credits) FAILED:', error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Deposit transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Deposit transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Borrow from the lending pool using wallet adapter (v8 - simplified API).
 * v8 API: borrow(public amount: u64) -> (UserActivity, Future)
 * - Updates public pool state (total_borrowed, utilization_index)
 * - Updates private user mappings (increments total_borrows counter)
 * - No Credits record needed - just amount
 */
export async function lendingBorrow(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }

  if (amount <= 0) {
    throw new Error('Borrow amount must be greater than 0');
  }

  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];

    // No frontend liquidity hard-block: program handles cross-collateral eligibility on-chain.

    console.log('🔍 Calling executeTransaction for borrow (public fee)...');
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'borrow',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Borrow failed: No temporary transactionId returned from wallet.');
    }

    console.log('Temporary Transaction ID (borrow):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING BORROW FUNCTION FAILED:', error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Borrow transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Borrow transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Repay to the lending pool using a real `credits.aleo/credits` record.
 *
 * Contract: lending_pool_v86.aleo
 *   async transition repay_with_credits(
 *     pay_record: credits.aleo/credits,
 *     public amount: u64
 *   ) -> (UserActivity, credits.aleo/credits, Future)
 *
 * This mirrors `lendingDeposit` but calls `repay_with_credits` instead of `deposit_with_credits`.
 */
export async function lendingRepay(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable for repay.');
  }
  if (amount <= 0) {
    throw new Error('Repay amount must be greater than 0');
  }

  try {
    // Convert amount (credits) to microcredits. We allow decimals (up to 6 places),
    // rounding to the nearest micro credit. Pool expects micro-ALEO as its `amount`.
    const amountMicro = Math.round(amount * 1_000_000);
    const requiredMicro = amountMicro;

    console.log('🔍 Fetching credits.aleo records for repay...', {
      CREDITS_PROGRAM_ID,
      requiredMicro,
    });

    let records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) records = [];

    console.log(`📋 Found ${records.length} credits.aleo records (for repay)`);

    const getMicrocredits = (record: any): number => {
      try {
        if (record.data && record.data.microcredits) {
          return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
        }
        if (record.plaintext) {
          const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          if (match && match[1]) {
            return parseInt(match[1].replace(/_/g, ''), 10);
          }
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const processRecord = async (r: any): Promise<number> => {
      let val = getMicrocredits(r);
      if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
        try {
          const decrypted = await decrypt(r.recordCiphertext);
          if (decrypted) {
            r.plaintext = decrypted;
            val = getMicrocredits(r);
          }
        } catch (e) {
          console.warn('⚠️ Failed to decrypt credits record for repay:', e);
        }
      }
      return val;
    };

    let payRecord: any | null = null;
    for (const r of records as any[]) {
      if (r.spent) continue;
      const val = await processRecord(r);
      const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
      if (isSpendable && val >= requiredMicro) {
        payRecord = r;
        break;
      }
    }

    if (!payRecord) {
      throw new Error(
        `No credits.aleo record found with enough microcredits for repay amount ${amount}. ` +
          `Make sure you have at least ${amount} private credits in one record.`,
      );
    }

    console.log('✅ Selected credits.aleo record for repay:', {
      preview: JSON.stringify(payRecord).slice(0, 200),
    });

    // Build Leo-compatible record input (plaintext or ciphertext), like NullPay / deposit.
    let recordInput: string | any = payRecord.plaintext;

    if (!recordInput) {
      console.warn('⚠️ Credits record missing plaintext (repay). Attempting to reconstruct...');
      const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
      const micro = getMicrocredits(payRecord);
      const owner = payRecord.owner;

      if (nonce && micro > 0 && owner) {
        recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
        console.log('✅ Reconstructed credits plaintext for repay:', recordInput);
      } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
        recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
        console.log('✅ Using credits ciphertext for repay input.');
      } else {
        console.warn('⚠️ Could not reconstruct credits record; passing raw object (last resort).');
        recordInput = payRecord;
      }
    }

    const amountInput = `${amountMicro}u64`;
    const inputs: any[] = [recordInput, amountInput];

    console.log('🔍 Calling executeTransaction for repay_with_credits...', {
      program: LENDING_POOL_PROGRAM_ID,
      function: 'repay_with_credits',
      inputsPreview: {
        input0_len: typeof recordInput === 'string' ? recordInput.length : 'object',
        input1: amountInput,
      },
    });

    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'repay_with_credits',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [0],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Repay failed: No temporary transactionId returned from wallet.');
    }

    console.log('Temporary Transaction ID (repay_with_credits):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING REPAY (credits) FAILED:', error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Repay transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Repay transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/** Same as pool `FLASH_PREMIUM_BPS` (0.05% of principal). */
export const ALEO_FLASH_PREMIUM_BPS = 5;
export const BPS_DENOMINATOR = 10_000;

/** Ceil(principal_micro * BPS / DENOM) — matches `flash_loan_with_credits` on-chain. */
export function aleoFlashFeeMicro(principalMicro: number): number {
  return Math.floor(
    (principalMicro * ALEO_FLASH_PREMIUM_BPS + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR,
  );
}

/**
 * Flash loan (ALEO pool): `flash_loan_with_credits` — pay principal + fee to vault in one tx;
 * backend sends principal to your wallet (same as borrow).
 */
export async function lendingFlashLoan(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable for flash loan.');
  }
  if (amount <= 0) {
    throw new Error('Flash loan amount must be greater than 0');
  }

  try {
    const principalMicro = Math.round(amount * 1_000_000);
    const feeMicro = aleoFlashFeeMicro(principalMicro);
    const totalMicro = principalMicro + feeMicro;

    console.log('🔍 Fetching credits.aleo records for flash_loan...', {
      CREDITS_PROGRAM_ID,
      principalMicro,
      feeMicro,
      totalMicro,
    });

    let records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) records = [];

    const getMicrocredits = (record: any): number => {
      try {
        if (record.data && record.data.microcredits) {
          return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
        }
        if (record.plaintext) {
          const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          if (match && match[1]) {
            return parseInt(match[1].replace(/_/g, ''), 10);
          }
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const processRecord = async (r: any): Promise<number> => {
      let val = getMicrocredits(r);
      if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
        try {
          const decrypted = await decrypt(r.recordCiphertext);
          if (decrypted) {
            r.plaintext = decrypted;
            val = getMicrocredits(r);
          }
        } catch (e) {
          console.warn('⚠️ Failed to decrypt credits record for flash loan:', e);
        }
      }
      return val;
    };

    let payRecord: any | null = null;
    for (const r of records as any[]) {
      if (r.spent) continue;
      const val = await processRecord(r);
      const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
      if (isSpendable && val >= totalMicro) {
        payRecord = r;
        break;
      }
    }

    if (!payRecord) {
      throw new Error(
        `No credits.aleo record covers principal + flash fee (${amount} + fee). Need one record with at least ${(totalMicro / 1_000_000).toFixed(6)} ALEO.`,
      );
    }

    let recordInput: string | any = payRecord.plaintext;
    if (!recordInput) {
      const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
      const micro = getMicrocredits(payRecord);
      const owner = payRecord.owner;
      if (nonce && micro > 0 && owner) {
        recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
      } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
        recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
      } else {
        recordInput = payRecord;
      }
    }

    const amountInput = `${principalMicro}u64`;
    const inputs: any[] = [recordInput, amountInput];

    console.log('🔍 Calling executeTransaction for flash_loan_with_credits...', {
      program: LENDING_POOL_PROGRAM_ID,
      function: 'flash_loan_with_credits',
      inputsPreview: { input1: amountInput },
    });

    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'flash_loan_with_credits',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [0],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Flash loan failed: No temporary transactionId returned from wallet.');
    }
    console.log('Temporary Transaction ID (flash_loan_with_credits):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ FLASH LOAN FAILED:', error);
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');
    if (isCancelled) {
      console.warn('💡 Flash loan cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }
    throw new Error(`Flash loan failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Withdraw from the lending pool using wallet adapter (v8 - simplified API).
 * v8 API: withdraw(public amount: u64) -> (UserActivity, Future)
 * - Updates public pool state (total_supplied, utilization_index)
 * - Updates private user mappings (increments total_withdrawals counter)
 * - No Credits record needed - just amount
 */
export async function lendingWithdraw(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }

  if (amount <= 0) {
    throw new Error('Withdraw amount must be greater than 0');
  }

  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];

    console.log('🔍 Calling executeTransaction for withdraw (public fee)...');
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'withdraw',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Withdraw failed: No temporary transactionId returned from wallet.');
    }

    console.log('Temporary Transaction ID (withdraw):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING WITHDRAW FUNCTION FAILED:', error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Withdraw transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Withdraw transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

// --- USDC Pool (lending_pool_usdce_v86.aleo) ---
// Contract: deposit(token, amount, proofs), repay(token, amount, proofs),
//           withdraw(public amount), borrow(public amount).
// - deposit/repay: 3 inputs — token, amount (micro-USDC), proofs. Block height is read on-chain.
// - withdraw/borrow: 1 input — amount (micro-USDC). Backend sends USDCx from vault to user.
// Amount in program is micro-USDC (1 USDC = 1_000_000). RPC accepts human USDC and converts to micro for transitions.
const USDC_TOKEN_PROGRAM = USDC_TOKEN_PROGRAM_ID;
const USDC_FREEZELIST_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USDCX_FREEZELIST_PROGRAM_ID || 'test_usdcx_freezelist.aleo';

// --- USAD Pool (lending_pool_usad_v17.aleo) ---
const USAD_TOKEN_PROGRAM = USAD_TOKEN_PROGRAM_ID;
const USAD_FREEZELIST_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USADX_FREEZELIST_PROGRAM_ID || 'test_usad_freezelist.aleo';

/**
 * Static Merkle proof pair for USDCx deposit/repay fallback.
 * Sourced from `programusdc/inputs/deposit_proofs.in`.
 */
const DEFAULT_USDC_MERKLE_PROOFS =
  '[{ siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }, { siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }]';

/**
 * Single-line Leo literal for wallets (test_transfer_usdcx v3/v4, lending pools with stablecoin MerkleProof).
 * Rejects accidental paste of .aleo IR — that produces errors like:
 * "Failed to parse string ... Remaining invalid string is: \"input r2 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32]..."
 */
function normalizeMerkleProofLiteralForWallet(s: string, label: string): string {
  const t = String(s).trim().replace(/\s+/g, ' ');
  if (t.length > 12_000) {
    throw new Error(
      `${label}: Merkle proof string is too long (${t.length} chars). Expected a compact Leo literal (two MerkleProof structs).`,
    );
  }
  const looksLikeProgramIr =
    (t.includes('input r0 as') || t.includes('input r2 as') || t.includes('function deposit')) &&
    (t.includes('finalize ') || t.includes('program ') || t.includes('constructor'));
  if (looksLikeProgramIr) {
    throw new Error(
      `${label}: The proof field contains Aleo program text, not a Merkle proof. ` +
        'Pass only a Leo literal like [{ siblings: [0field,...], leaf_index: 1u32 }, { ... }]. ' +
        'Do not paste build/main.aleo or deployment IR into the proof input.',
    );
  }
  if (!t.startsWith('[') || !t.includes('siblings') || !t.includes('leaf_index')) {
    throw new Error(
      `${label}: Merkle proof must be a Leo array of two structs with siblings and leaf_index.`,
    );
  }
  return t;
}

function encodeUsdcProofPair(proofs: any): string | null {
  if (typeof proofs === 'string') {
    const s = proofs.trim();
    if (s.startsWith('[') && s.includes('siblings')) return s;
    return null;
  }
  if (!Array.isArray(proofs) || proofs.length < 2) return null;
  const raw = [proofs[0], proofs[1]].map((p) => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));
  if (!raw[0] || !raw[1] || !raw[0].includes('siblings') || !raw[1].includes('siblings')) return null;
  return `[${raw[0]}, ${raw[1]}]`;
}

async function getFreezeListIndex0(): Promise<string | null> {
  try {
    // NullPay method: use AleoNetworkClient for freeze_list_index mapping.
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const mappingValue = await client.getProgramMappingValue(
      USDC_FREEZELIST_PROGRAM_ID,
      'freeze_list_index',
      '0u32',
    );
    return mappingValue ? String(mappingValue).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getFreezeListRoot(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_root/1u8`,
    );
    if (!response.ok) return null;
    const value = await response.json();
    return value ? String(value).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getFreezeListCount(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_last_index/true`,
    );
    if (!response.ok) return 0;
    const value = await response.json();
    const parsed = parseInt(String(value).replace('u32', '').replace(/["']/g, ''), 10);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  } catch {
    return 0;
  }
}

async function generateFreezeListProof(targetIndex: number = 1, occupiedLeafValue?: string): Promise<string> {
  try {
    // NullPay method: direct import from @provablehq/wasm.
    const { Poseidon4, Field } = await import('@provablehq/wasm');

    const hasher = new Poseidon4();

    // Precompute empty hashes for each level.
    const emptyHashes: string[] = [];
    let currentEmpty = '0field';
    for (let i = 0; i < 16; i++) {
      emptyHashes.push(currentEmpty);
      const f = Field.fromString(currentEmpty);
      const nextHashField = hasher.hash([f, f]);
      currentEmpty = nextHashField.toString();
    }

    let currentHash = '0field';
    let currentIndex = targetIndex;
    const siblings: string[] = [];

    const normalizeFieldLiteral = (v: string): string => {
      const t = String(v).trim();
      // Expect Leo field literals like "123field". If we get a bare number, append "field".
      return t.endsWith('field') ? t : `${t}field`;
    };

    for (let level = 0; level < 16; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      let siblingHash = emptyHashes[level];
      if (level === 0 && siblingIndex === 0 && occupiedLeafValue) {
        siblingHash = occupiedLeafValue;
      }
      siblings.push(normalizeFieldLiteral(siblingHash));

      const fCurrent = Field.fromString(currentHash);
      const fSibling = Field.fromString(normalizeFieldLiteral(siblingHash));
      const input = isLeft ? [fCurrent, fSibling] : [fSibling, fCurrent];
      const nextHashField = hasher.hash(input);
      currentHash = nextHashField.toString();
      currentIndex = Math.floor(currentIndex / 2);
    }

    return `{ siblings: [${siblings.join(', ')}], leaf_index: ${targetIndex}u32 }`;
  } catch (e: any) {
    console.warn('Merkle Proof Generation Warning (using fallback):', e?.message || e);
    const s = Array(16).fill('0field').join(', ');
    return `{ siblings: [${s}], leaf_index: ${targetIndex}u32 }`;
  }
}

async function generateNullPayStyleUsdcProofPair(): Promise<string> {
  // Match NullPay flow: fetch freeze-list state before generating proofs.
  const [root, count, index0] = await Promise.all([
    getFreezeListRoot(),
    getFreezeListCount(),
    getFreezeListIndex0(),
  ]);
  let index0Field: string | undefined = undefined;
  if (index0) {
    try {
      const { Address } = await import('@provablehq/wasm');
      const addr = Address.from_string(index0);
      const grp = addr.toGroup();
      index0Field = grp.toXCoordinate().toString();
    } catch (e: any) {
      console.warn('[USDC proofs] Failed to convert freeze_list_index[0] address to field:', e?.message || e);
    }
  }
  console.log(
    `[USDC proofs] Freeze-list state -> root: ${root ?? 'null'}, count: ${count}, index[0]: ${index0 ?? 'null'}, index0Field: ${index0Field ?? 'null'}`,
  );
  const proof = await generateFreezeListProof(1, index0Field);
  return `[${proof}, ${proof}]`;
}

async function getUsdcMerkleProofsInput(
  tokenRecord: any,
  proofs?: [string, string] | string
): Promise<MerkleProofBuildResult> {
  const mk = (s: string, source: string): MerkleProofBuildResult => ({
    literal: normalizeMerkleProofLiteralForWallet(s, '[USDC proofs]'),
    source,
  });

  // 1) Prefer explicit proofs passed to function.
  const explicit = encodeUsdcProofPair(proofs);
  if (explicit) return mk(explicit, 'explicit-arg');

  // 2) Try common proof fields from wallet/token record payload.
  const candidates = [
    tokenRecord?.proofs,
    tokenRecord?.merkleProofs,
    tokenRecord?.merkle_proofs,
    tokenRecord?.proof,
    tokenRecord?.data?.proofs,
    tokenRecord?.data?.merkleProofs,
    tokenRecord?.data?.merkle_proofs,
    tokenRecord?.data?.proof,
  ];
  for (const c of candidates) {
    const encoded = encodeUsdcProofPair(c);
    if (encoded) return mk(encoded, 'record-field');
  }

  // 3) Last-chance parse when record payload itself is JSON string containing proofs.
  if (typeof tokenRecord === 'string' && tokenRecord.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(tokenRecord);
      const fromParsed = await getUsdcMerkleProofsInput(parsed, proofs);
      return { ...fromParsed, source: `parsed-token-string:${fromParsed.source}` };
    } catch {
      // ignore and fall through
    }
  }

  // 4) NullPay-style fallback: derive proofs from freeze-list tree in browser.
  try {
    const generated = await generateNullPayStyleUsdcProofPair();
    console.log(
      '[USDC proofs] Wallet record had no proofs; using NullPay-style generated freeze-list proof pair.',
    );
    return mk(generated, 'generated-nullpay');
  } catch (fallbackErr: any) {
    console.warn(
      '[USDC proofs] Dynamic fallback generation failed, using static deposit_proofs.in pair:',
      fallbackErr?.message || fallbackErr,
    );
    return mk(DEFAULT_USDC_MERKLE_PROOFS, 'static-default');
  }
}

/**
 * Static Merkle proof pair for USAD deposit/repay fallback.
 *
 * We follow the same NullPay-style "empty sibling" proof shape used for USDC,
 * but with leaf_index=1u32 (empty side of a tree where index 0 is occupied).
 */
const DEFAULT_USAD_MERKLE_PROOFS =
  '[{ siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }, { siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }]';

function encodeUsadProofPair(proofs: any): string | null {
  const toFieldLiteral = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const t = v.trim().replace(/^["']|["']$/g, '');
      if (!t) return null;
      if (t.endsWith('field')) return t;
      if (/^\d+$/.test(t)) return `${t}field`;
      return null;
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
      return `${v}field`;
    }
    if (typeof v === 'object') {
      if ('value' in v) return toFieldLiteral((v as any).value);
      if ('field' in v) return toFieldLiteral((v as any).field);
    }
    return null;
  };

  const toU32Literal = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const t = v.trim().replace(/^["']|["']$/g, '');
      if (!t) return null;
      if (t.endsWith('u32')) return t;
      if (/^\d+$/.test(t)) return `${t}u32`;
      return null;
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
      return `${v}u32`;
    }
    if (typeof v === 'object' && 'value' in v) return toU32Literal((v as any).value);
    return null;
  };

  const proofToLeo = (p: any): string | null => {
    if (p == null) return null;
    if (typeof p === 'string') {
      const s = p.trim();
      // Accept already-serialized Leo proof literals.
      if (s.startsWith('{') && s.includes('siblings') && s.includes('leaf_index')) return s;
      // Some wallets might return JSON-stringified objects.
      if (s.startsWith('{') && s.includes('siblings')) {
        try {
          const parsed = JSON.parse(s);
          return proofToLeo(parsed);
        } catch {
          return null;
        }
      }
      return null;
    }
    if (typeof p === 'object') {
      const siblingsRaw = (p as any).siblings ?? (p as any).sibling ?? null;
      const leafRaw = (p as any).leaf_index ?? (p as any).leafIndex ?? null;
      if (!Array.isArray(siblingsRaw) || siblingsRaw.length !== 16) return null;
      const siblings = siblingsRaw.map(toFieldLiteral);
      if (siblings.some((x) => x == null)) return null;
      const leaf = toU32Literal(leafRaw);
      if (!leaf) return null;
      return `{ siblings: [${(siblings as string[]).join(', ')}], leaf_index: ${leaf} }`;
    }
    return null;
  };

  if (typeof proofs === 'string') {
    const s = proofs.trim();
    // If it's already a Leo array literal like: [{...}, {...}]
    if (s.startsWith('[') && s.includes('siblings') && s.includes('leaf_index')) return s;
    // Try parsing JSON array/string.
    try {
      const parsed = JSON.parse(s);
      return encodeUsadProofPair(parsed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(proofs) || proofs.length < 2) return null;
  const p0 = proofToLeo(proofs[0]);
  const p1 = proofToLeo(proofs[1]);
  if (!p0 || !p1) return null;
  return `[${p0}, ${p1}]`;
}

async function getUsadFreezeListIndex0(): Promise<string | null> {
  try {
    // NullPay method: use AleoNetworkClient for freeze_list_index mapping.
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const mappingValue = await client.getProgramMappingValue(
      USAD_FREEZELIST_PROGRAM_ID,
      'freeze_list_index',
      '0u32',
    );
    return mappingValue ? String(mappingValue).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getUsadFreezeListRoot(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USAD_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_root/1u8`,
    );
    if (!response.ok) return null;
    const value = await response.json();
    return value ? String(value).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getUsadFreezeListCount(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USAD_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_last_index/true`,
    );
    if (!response.ok) return 0;
    const value = await response.json();
    const parsed = parseInt(String(value).replace('u32', '').replace(/["']/g, ''), 10);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  } catch {
    return 0;
  }
}

async function generateNullPayStyleUsadProofPair(): Promise<string> {
  const [root, count, index0] = await Promise.all([
    getUsadFreezeListRoot(),
    getUsadFreezeListCount(),
    getUsadFreezeListIndex0(),
  ]);

  let index0Field: string | undefined = undefined;
  if (index0) {
    try {
      const { Address } = await import('@provablehq/wasm');
      const addr = Address.from_string(index0);
      const grp = addr.toGroup();
      index0Field = grp.toXCoordinate().toString();
    } catch (e: any) {
      console.warn('[USAD proofs] Failed to convert freeze_list_index[0] address to field:', e?.message || e);
    }
  }

  console.log(
    `[USAD proofs] Freeze-list state -> root: ${root ?? 'null'}, count: ${count}, index[0]: ${index0 ?? 'null'}, index0Field: ${index0Field ?? 'null'}`,
  );

  const proof = await generateFreezeListProof(1, index0Field);
  return `[${proof}, ${proof}]`;
}

/** Default freeze leaf when the on-chain list is empty (Veiled Markets / Sealance convention). */
const USAD_FREEZE_DEFAULT_ZERO_ADDRESS =
  'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

/**
 * Depth for SealanceMerkleTree — must match stablecoin `MerkleProof` sibling count ([field; 16] => depth 16).
 */
const USAD_SEALANCE_TREE_DEPTH = 16;

/**
 * Load all addresses currently in the USAD freeze list (mapping `freeze_list_index`).
 * Falls back to the canonical zero address when empty (same as Veiled Markets default list).
 */
async function fetchUsadFreezeListAddresses(): Promise<string[]> {
  const count = await getUsadFreezeListCount();
  if (count <= 0) {
    return [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  }
  try {
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const addresses: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const mappingValue = await client.getProgramMappingValue(
          USAD_FREEZELIST_PROGRAM_ID,
          'freeze_list_index',
          `${i}u32`,
        );
        const raw = mappingValue ? String(mappingValue).replace(/["']/g, '').trim() : '';
        if (raw.startsWith('aleo1')) {
          addresses.push(raw);
        }
      } catch {
        /* skip missing slot */
      }
    }
    return addresses.length > 0 ? addresses : [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  } catch (e: any) {
    console.warn('[USAD proofs] fetchUsadFreezeListAddresses failed:', e?.message || e);
    return [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  }
}

/**
 * Veiled Markets–style non-inclusion proofs: @provablehq/sdk `SealanceMerkleTree` over the live freeze list,
 * bounded to `ownerAddress`. Matches token program verification when the tree layout is Sealance-compatible.
 */
async function generateSealanceUsadProofPair(ownerAddress: string): Promise<string> {
  const { SealanceMerkleTree } = await import('@provablehq/sdk');
  const sealance = new SealanceMerkleTree();
  const freezeListAddresses = await fetchUsadFreezeListAddresses();
  const leaves = sealance.generateLeaves(freezeListAddresses, USAD_SEALANCE_TREE_DEPTH);
  const tree = sealance.buildTree(leaves);
  const [leftIdx, rightIdx] = sealance.getLeafIndices(tree, ownerAddress);
  const leftProof = sealance.getSiblingPath(tree, leftIdx, USAD_SEALANCE_TREE_DEPTH);
  const rightProof = sealance.getSiblingPath(tree, rightIdx, USAD_SEALANCE_TREE_DEPTH);
  const formatted = sealance.formatMerkleProof([leftProof, rightProof]);
  console.log(
    `[USAD proofs] SealanceMerkleTree pair for ${ownerAddress.slice(0, 12)}… (freeze entries: ${freezeListAddresses.length})`,
  );
  return formatted;
}

/** Parse `owner: aleo1…` from decrypted Token plaintext when caller did not pass wallet address. */
function extractAleoOwnerFromUsadTokenRecord(tokenRecord: any): string | null {
  const pt = tokenRecord?.plaintext ?? tokenRecord?.data?.plaintext;
  if (typeof pt !== 'string') return null;
  const m = pt.match(/owner\s*:\s*(aleo1[a-z0-9]+)/);
  return m ? m[1] : null;
}

async function getUsadMerkleProofsInput(
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
): Promise<MerkleProofBuildResult> {
  const mk = (s: string, source: string): MerkleProofBuildResult => ({
    literal: normalizeMerkleProofLiteralForWallet(s, '[USAD proofs]'),
    source,
  });

  // 1) Prefer explicit proofs passed to function.
  const explicit = encodeUsadProofPair(proofs);
  if (explicit) return mk(explicit, 'explicit-arg');

  // 2) Try common proof fields from wallet/token record payload.
  const candidates = [
    tokenRecord?.proofs,
    tokenRecord?.merkleProofs,
    tokenRecord?.merkle_proofs,
    tokenRecord?.proof,
    tokenRecord?.data?.proofs,
    tokenRecord?.data?.merkleProofs,
    tokenRecord?.data?.merkle_proofs,
    tokenRecord?.data?.proof,
  ];
  for (const c of candidates) {
    const encoded = encodeUsadProofPair(c);
    if (encoded) return mk(encoded, 'record-field');
  }

  // 3) Last-chance parse when record payload itself is JSON string containing proofs.
  if (typeof tokenRecord === 'string' && tokenRecord.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(tokenRecord);
      const fromParsed = await getUsadMerkleProofsInput(parsed, proofs, ownerAddress);
      return { ...fromParsed, source: `parsed-token-string:${fromParsed.source}` };
    } catch {
      // fall through
    }
  }

  // 4) Veiled Markets / Sealance: non-inclusion proofs for this wallet over the live freeze list.
  const resolvedOwner =
    (ownerAddress && String(ownerAddress).trim()) || extractAleoOwnerFromUsadTokenRecord(tokenRecord);
  if (resolvedOwner) {
    try {
      const generated = await generateSealanceUsadProofPair(resolvedOwner);
      console.log('[USAD proofs] Using SealanceMerkleTree (Veiled Markets–style) proof pair.');
      return mk(generated, 'sealance-generated');
    } catch (sealanceErr: any) {
      console.warn(
        '[USAD proofs] SealanceMerkleTree failed, trying NullPay-style fallback:',
        sealanceErr?.message || sealanceErr,
      );
    }
  } else {
    console.warn(
      '[USAD proofs] No wallet address for Sealance proofs; pass owner address or ensure Token plaintext has owner. Trying NullPay-style fallback.',
    );
  }

  // 5) NullPay-style fallback: simplified Poseidon tree (browser).
  try {
    const generated = await generateNullPayStyleUsadProofPair();
    console.log('[USAD proofs] Wallet record had no proofs; using NullPay-style generated proof pair.');
    return mk(generated, 'generated-nullpay');
  } catch (fallbackErr: any) {
    console.warn(
      '[USAD proofs] Dynamic fallback generation failed, using static deposit_proofs.in pair:',
      fallbackErr?.message || fallbackErr,
    );
    return mk(DEFAULT_USAD_MERKLE_PROOFS, 'static-default');
  }
}

/**
 * USAD private record format (from chain/wallet):
 * { programName, recordName: "Token", recordCiphertext, spent, owner, commitment, tag, ... }
 *
 * For USAD, we expect the same Token record shape as USDCx, only bound to a different token program.
 */
function isUsadTokenRecord(rec: any): boolean {
  const programId = (rec?.program_id ?? rec?.programId ?? rec?.programName ?? '').toString();
  const recordName = (rec?.recordName ?? rec?.record_name ?? rec?.data?.recordName ?? '').toString();
  const isToken = recordName === 'Token' || (!recordName && (rec?.recordCiphertext ?? rec?.record_ciphertext));
  return (programId === USAD_TOKEN_PROGRAM || programId.includes('test_usad_stablecoin')) && (isToken || !!rec?.recordCiphertext);
}

/**
 * Build the token record value for transition input #0 (deposit/repay).
 * Prefer plaintext so the wallet can parse it as test_usad_stablecoin.aleo/Token.record.
 */
function getUsadTokenInputForTransition(record: any): string | any {
  if (record?.plaintext && typeof record.plaintext === 'string') {
    const pt = record.plaintext.trim();
    if (pt) return pt;
  }
  // Fallback to ciphertext-only, using the same generic ciphertext extractor used for USDC.
  const cipher = getUsdcRecordCipher(record);
  if (cipher) return cipher;
  if (record && typeof record === 'object') return record;
  return '';
}

/**
 * USDCx private record format (from chain/wallet):
 * { programName, recordName: "Token", recordCiphertext, spent, owner, commitment, tag, ... }
 * Amount is inside recordCiphertext (encrypted); we accept unspent Token records and pass to program.
 */
function isUsdcTokenRecord(rec: any): boolean {
  const programId = (rec?.program_id ?? rec?.programId ?? rec?.programName ?? '').toString();
  const recordName = (rec?.recordName ?? rec?.record_name ?? rec?.data?.recordName ?? '').toString();
  const isToken = recordName === 'Token' || (!recordName && (rec?.recordCiphertext ?? rec?.record_ciphertext));
  return (programId === USDC_TOKEN_PROGRAM || programId.includes('test_usdcx_stablecoin')) && (isToken || !!rec?.recordCiphertext);
}

/**
 * Returns the raw record ciphertext for use as transition input.
 * Wallets typically expect the canonical Aleo record form (ciphertext string, e.g. "record1q..."),
 * not JSON. Use this for deposit/repay input #0 to avoid "Failed to parse input #0 (Token.record)".
 */
export function getUsdcRecordCipher(record: any): string {
  if (record == null) return '';
  if (typeof record === 'string') {
    const t = record.trim();
    if (t.startsWith('record1')) return t;
    if (t.startsWith('{')) {
      try {
        const o = JSON.parse(t);
        return getUsdcRecordCipher(o);
      } catch {
        return '';
      }
    }
    return t;
  }
  const ciphertext = record.recordCiphertext ?? record.record_ciphertext ?? record.ciphertext;
  return typeof ciphertext === 'string' ? ciphertext.trim() : '';
}

/**
 * Build the token record value for transition input #0 (deposit/repay).
 * Prefer plaintext so the wallet can parse it as test_usdcx_stablecoin.aleo/Token.record (NullPay pattern).
 * Ciphertext often fails with "Failed to parse input #0 (Token.record)".
 */
function getUsdcTokenInputForTransition(record: any): string | any {
  if (record?.plaintext && typeof record.plaintext === 'string') {
    const pt = record.plaintext.trim();
    if (pt) return pt;
  }
  const cipher = getUsdcRecordCipher(record);
  if (cipher) return cipher;
  if (record && typeof record === 'object') return record;
  return '';
}

/**
 * Format USDC Token record for transition input #0.
 * Prefer getUsdcRecordCipher(record) so the wallet receives raw ciphertext (canonical Token.record form).
 * This helper can return JSON for wallets that expect it; currently we use ciphertext-only to fix parse errors.
 */
export function formatUsdcRecordForInput(record: any): string {
  return getUsdcRecordCipher(record);
}

/**
 * Parse amount from a record field (string like "100u128.private" or number).
 */
function parseUsdcAmount(amt: unknown): bigint | null {
  if (amt === undefined || amt === null) return null;
  if (typeof amt === 'number') return BigInt(amt);
  if (typeof amt === 'string') {
    const match = amt.match(/^(\d+)/);
    return match ? BigInt(match[1]) : null;
  }
  return null;
}

/** Parse amount from Token record plaintext string (e.g. "amount: 0u128.private" or "amount: 100u128"). */
export function parseUsdcAmountFromPlaintext(plaintext: string): bigint | null {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const match = plaintext.match(/amount:\s*(\d+)u128/);
  return match ? BigInt(match[1]) : null;
}

/**
 * Resolve Token record balance in micro-units (u128 on-chain). Used so we never pick a record that
 * cannot cover `transfer_private_to_public` (would fail with u128 underflow, e.g. 7500 - 10000).
 */
async function getTokenRecordAmountMicroUsdc(
  rec: any,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<bigint | null> {
  const amt =
    rec?.data?.amount ??
    rec?.amount ??
    rec?.data?.amount_ ??
    (rec?.data && typeof rec.data === 'object' && (rec.data as any).amount);
  let val = parseUsdcAmount(amt);
  if (val !== null) return val;
  if (rec?.plaintext && typeof rec.plaintext === 'string') {
    val = parseUsdcAmountFromPlaintext(rec.plaintext);
    if (val !== null) return val;
  }
  const cipher = rec?.recordCiphertext ?? rec?.record_ciphertext ?? rec?.ciphertext;
  if (cipher && decrypt) {
    try {
      const plain = await decrypt(cipher);
      if (plain) return parseUsdcAmountFromPlaintext(plain);
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Get total private USDC balance (test_usdcx_stablecoin.aleo Token records) in human USDC.
 * Sums amount from all unspent Token records; uses decrypt for encrypted records.
 * Returns 0 if no records or on error.
 */
export async function getPrivateUsdcBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(USDC_TOKEN_PROGRAM, false);
    if (!records || !Array.isArray(records)) return 0;
    let totalMicro = BigInt(0);
    for (const rec of records as any[]) {
      if (rec?.spent === true || rec?.data?.spent === true) continue;
      if (!isUsdcTokenRecord(rec)) continue;
      let val: bigint | null = parseUsdcAmount(
        rec?.data?.amount ?? rec?.amount ?? (rec?.data && (rec.data as any).amount)
      );
      if (val === null && (rec.plaintext || (rec.recordCiphertext ?? rec.record_ciphertext)) && decrypt) {
        try {
          const plain = rec.plaintext || await decrypt(rec.recordCiphertext || rec.record_ciphertext);
          if (plain) val = parseUsdcAmountFromPlaintext(plain);
        } catch {
          // skip
        }
      }
      if (val != null && val > BigInt(0)) totalMicro += val;
    }
    return Number(totalMicro) / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Get total private USAD balance (test_usad_stablecoin.aleo Token records) in human USAD.
 * Mirrors getPrivateUsdcBalance but queries the USAD token program.
 */
export async function getPrivateUsadBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(USAD_TOKEN_PROGRAM, false);
    if (!records || !Array.isArray(records)) return 0;
    let totalMicro = BigInt(0);
    for (const rec of records as any[]) {
      if (rec?.spent === true || rec?.data?.spent === true) continue;
      if (!isUsadTokenRecord(rec)) continue;
      let val: bigint | null = parseUsdcAmount(
        rec?.data?.amount ?? rec?.amount ?? (rec?.data && (rec.data as any).amount),
      );
      if (
        val === null &&
        (rec.plaintext || (rec.recordCiphertext ?? rec.record_ciphertext)) &&
        decrypt
      ) {
        try {
          const plain =
            rec.plaintext || (await decrypt(rec.recordCiphertext || rec.record_ciphertext));
          if (plain) val = parseUsdcAmountFromPlaintext(plain);
        } catch {
          // skip
        }
      }
      if (val != null && val > BigInt(0)) totalMicro += val;
    }
    return Number(totalMicro) / 1_000_000;
  } catch {
    return 0;
  }
}

/** Get latest block height from chain (for USDC pool: prefer records from latest block). */
export async function getLatestBlockHeight(): Promise<number> {
  const toNum = (v: any): number => {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'object' && v !== null) {
      const n = v.result ?? v.height ?? v.block_height ?? v.value;
      return toNum(n);
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  try {
    const h = await client.request('latest/height', {});
    return toNum(h);
  } catch (e) {
    try {
      const h = await client.request('getLatestBlockHeight', {});
      return toNum(h);
    } catch {
      return 0;
    }
  }
}

/** Extract block height from a record if present (wallet/chain may provide height, block_height, etc.). */
function getUsdcRecordBlockHeight(rec: any): number | null {
  if (rec == null) return null;
  const v =
    rec.height ??
    rec.block_height ??
    rec.blockHeight ??
    rec.block ??
    (rec.data && typeof rec.data === 'object' && (rec.data as any).height) ??
    (rec.data && typeof rec.data === 'object' && (rec.data as any).block_height);
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch a USDCx Token record from the wallet with balance >= amount.
 * Supports chain format: { programName, recordName: "Token", recordCiphertext, spent, ... } (amount in ciphertext).
 * Returns the record object; use formatUsdcRecordForInput(record) for the transition input if needed.
 *
 * **One record must cover the full deposit/repay**: the stablecoin debits a single Token record. If your
 * balance is split across multiple records, consolidate (e.g. private transfer to self) first.
 * Pass `decrypt` so encrypted amounts can be verified; without it, records without plaintext may be skipped.
 */
export async function getSuitableUsdcTokenRecord(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  amount: number,
  _publicKey: string,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<any | null> {
  const amountU128 = BigInt(amount);
  const logPrefix = '[getSuitableUsdcTokenRecord]';

  console.log(`${logPrefix} Requesting records for program: ${USDC_TOKEN_PROGRAM}, amount required: ${amount} (micro units u64)`);

  let records: any[];
  try {
    records = await requestRecords(USDC_TOKEN_PROGRAM, false);
  } catch (e: any) {
    console.error(`${logPrefix} requestRecords threw:`, e?.message ?? e);
    throw e;
  }

  console.log(`${logPrefix} requestRecords("${USDC_TOKEN_PROGRAM}", false) returned:`, {
    isArray: Array.isArray(records),
    length: records?.length ?? 0,
    raw: records,
  });

  if (!records || !Array.isArray(records)) {
    console.warn(`${logPrefix} No records array (got ${records})`);
    return null;
  }

  if (records.length === 0) {
    console.warn(`${logPrefix} Zero records for "${USDC_TOKEN_PROGRAM}". Trying requestRecords("", false) to see all programs...`);
    try {
      const allRecords = await requestRecords('', false);
      const allArr = Array.isArray(allRecords) ? allRecords : [];
      const programKey = (r: any) => r?.program_id ?? r?.programId ?? r?.programName ?? '?';
      console.log(`${logPrefix} requestRecords("") returned ${allArr.length} total records. Program IDs:`, allArr.map(programKey));
      const usdcFromAll = allArr.filter((r: any) => {
        const id = (r?.program_id ?? r?.programId ?? r?.programName ?? '').toString();
        return id === USDC_TOKEN_PROGRAM || id.includes('test_usdcx_stablecoin');
      });
      console.log(`${logPrefix} Of those, ${usdcFromAll.length} are ${USDC_TOKEN_PROGRAM}`);
      if (usdcFromAll.length > 0) {
        console.log(`${logPrefix} Use program "${USDC_TOKEN_PROGRAM}" in wallet record permissions / reconnect with that program.`);
      }
    } catch (e2: any) {
      console.warn(`${logPrefix} requestRecords("") failed:`, e2?.message ?? e2);
    }
    return null;
  }

  // USDC pool: prefer unspent records from the latest block — fetch latest height and sort by block height (latest first)
  let latestBlockHeight = 0;
  try {
    latestBlockHeight = await getLatestBlockHeight();
    if (latestBlockHeight > 0) {
      console.log(`${logPrefix} Latest block height: ${latestBlockHeight}; sorting records by block height (latest first).`);
    }
  } catch (e: any) {
    console.warn(`${logPrefix} Could not fetch latest block height:`, e?.message ?? e);
  }
  const sortedRecords = [...records].sort((a, b) => {
    const ha = getUsdcRecordBlockHeight(a) ?? 0;
    const hb = getUsdcRecordBlockHeight(b) ?? 0;
    return hb - ha; // descending: latest block first
  });
  if (latestBlockHeight > 0 && sortedRecords.length > 0) {
    const firstHeight = getUsdcRecordBlockHeight(sortedRecords[0]);
    if (firstHeight != null) {
      console.log(`${logPrefix} First record after sort has block height: ${firstHeight}`);
    }
  }

  console.log(`${logPrefix} Inspecting ${sortedRecords.length} record(s)...`);

  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const spent = rec?.spent === true || rec?.data?.spent === true;
    const isToken = isUsdcTokenRecord(rec);
    const recHeight = getUsdcRecordBlockHeight(rec);
    console.log(`${logPrefix} Record[${i}]:`, {
      keys: rec ? Object.keys(rec) : [],
      program_id: rec?.program_id ?? rec?.programId ?? rec?.programName,
      recordName: rec?.recordName ?? rec?.record_name,
      block_height: recHeight,
      spent,
      isUsdcToken: isToken,
      hasRecordCiphertext: !!(rec?.recordCiphertext ?? rec?.record_ciphertext),
      dataKeys: rec?.data ? Object.keys(rec.data) : [],
      amount: rec?.data?.amount ?? rec?.amount,
      owner: rec?.data?.owner ?? rec?.owner,
    });

    if (spent) {
      console.log(`${logPrefix} Record[${i}] skipped (spent)`);
      continue;
    }

    if (!isToken) {
      console.log(`${logPrefix} Record[${i}] skipped (not a USDCx Token record)`);
      continue;
    }

    const val = await getTokenRecordAmountMicroUsdc(rec, decrypt);

    if (val === null) {
      console.log(
        `${logPrefix} Record[${i}] skipped (could not read amount; connect wallet decrypt or ensure record exposes plaintext)`,
      );
      continue;
    }
    if (val === BigInt(0)) {
      console.log(`${logPrefix} Record[${i}] skipped (amount is 0)`);
      continue;
    }
    console.log(`${logPrefix} Record[${i}] amount: ${String(val)} micro (need >= ${String(amountU128)}): ${val >= amountU128}`);
    if (val >= amountU128) {
      console.log(`${logPrefix} Using record[${i}] for deposit/repay`);
      return rec;
    }
  }

  console.warn(
    `${logPrefix} No single Token record holds >= ${String(amountU128)} micro. ` +
      'Total balance may be split across records — consolidate into one record (private transfer to yourself) then retry.',
  );
  return null;
}

/**
 * Fetch a USAD Token record from the wallet with balance >= amount.
 * Mirrors getSuitableUsdcTokenRecord, but queries `test_usad_stablecoin.aleo` records.
 *
 * IMPORTANT: `amount` is in micro units (u64) matching the USAD Token record amount type.
 * One record must cover the full amount — pass `decrypt` to verify encrypted balances.
 */
export async function getSuitableUsadTokenRecord(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  amount: number,
  _publicKey: string,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<any | null> {
  const amountU128 = BigInt(amount);
  const logPrefix = '[getSuitableUsadTokenRecord]';

  console.log(
    `${logPrefix} Requesting records for program: ${USAD_TOKEN_PROGRAM}, amount required: ${amount} (micro units u64)`,
  );

  let records: any[];
  try {
    records = await requestRecords(USAD_TOKEN_PROGRAM, false);
  } catch (e: any) {
    console.error(`${logPrefix} requestRecords threw:`, e?.message ?? e);
    throw e;
  }

  console.log(`${logPrefix} requestRecords("${USAD_TOKEN_PROGRAM}", false) returned:`, {
    isArray: Array.isArray(records),
    length: records?.length ?? 0,
    raw: records,
  });

  if (!records || !Array.isArray(records)) {
    console.warn(`${logPrefix} No records array (got ${records})`);
    return null;
  }

  if (records.length === 0) {
    console.warn(`${logPrefix} Zero records for "${USAD_TOKEN_PROGRAM}". Trying requestRecords("", false) to see all programs...`);
    try {
      const allRecords = await requestRecords('', false);
      const allArr = Array.isArray(allRecords) ? allRecords : [];
      const programKey = (r: any) => r?.program_id ?? r?.programId ?? r?.programName ?? '?';
      console.log(`${logPrefix} requestRecords("") returned ${allArr.length} total records. Program IDs:`, allArr.map(programKey));
      const usadFromAll = allArr.filter((r: any) => {
        const id = (r?.program_id ?? r?.programId ?? r?.programName ?? '').toString();
        return id === USAD_TOKEN_PROGRAM || id.includes('test_usad_stablecoin');
      });
      console.log(`${logPrefix} Of those, ${usadFromAll.length} are ${USAD_TOKEN_PROGRAM}`);
      if (usadFromAll.length > 0) {
        console.log(`${logPrefix} Use program "${USAD_TOKEN_PROGRAM}" in wallet record permissions / reconnect with that program.`);
      }
    } catch (e2: any) {
      console.warn(`${logPrefix} requestRecords("") failed:`, e2?.message ?? e2);
    }
    return null;
  }

  let latestBlockHeight = 0;
  try {
    latestBlockHeight = await getLatestBlockHeight();
    if (latestBlockHeight > 0) {
      console.log(`${logPrefix} Latest block height: ${latestBlockHeight}; sorting records by block height (latest first).`);
    }
  } catch (e: any) {
    console.warn(`${logPrefix} Could not fetch latest block height:`, e?.message ?? e);
  }

  const sortedRecords = [...records].sort((a, b) => {
    const ha = getUsdcRecordBlockHeight(a) ?? 0;
    const hb = getUsdcRecordBlockHeight(b) ?? 0;
    return hb - ha;
  });

  console.log(`${logPrefix} Inspecting ${sortedRecords.length} record(s)...`);

  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const spent = rec?.spent === true || rec?.data?.spent === true;
    const isToken = isUsadTokenRecord(rec);
    const recHeight = getUsdcRecordBlockHeight(rec);
    console.log(`${logPrefix} Record[${i}]:`, {
      program_id: rec?.program_id ?? rec?.programId ?? rec?.programName,
      recordName: rec?.recordName ?? rec?.record_name,
      block_height: recHeight,
      spent,
      isUsadToken: isToken,
      hasRecordCiphertext: !!(rec?.recordCiphertext ?? rec?.record_ciphertext),
      amount: rec?.data?.amount ?? rec?.amount,
    });

    if (spent) {
      console.log(`${logPrefix} Record[${i}] skipped (spent)`);
      continue;
    }

    if (!isToken) {
      console.log(`${logPrefix} Record[${i}] skipped (not a USAD Token record)`);
      continue;
    }

    const val = await getTokenRecordAmountMicroUsdc(rec, decrypt);

    if (val === null) {
      console.log(
        `${logPrefix} Record[${i}] skipped (could not read amount; connect wallet decrypt or ensure record exposes plaintext)`,
      );
      continue;
    }
    if (val === BigInt(0)) {
      console.log(`${logPrefix} Record[${i}] skipped (amount is 0)`);
      continue;
    }
    console.log(`${logPrefix} Record[${i}] amount: ${String(val)} micro (need >= ${String(amountU128)}): ${val >= amountU128}`);
    if (val >= amountU128) {
      console.log(`${logPrefix} Using record[${i}] for deposit/repay`);
      return rec;
    }
  }

  console.warn(
    `${logPrefix} No single USAD Token record holds >= ${String(amountU128)} micro. ` +
      'If balance is split across records, consolidate (private transfer to self). Ensure private USAD and wallet record access.',
  );
  return null;
}

function handleUsdcTxError(error: any, action: string): string {
  const rawMsg = String(error?.message || error || '').toLowerCase();
  const isCancelled =
    rawMsg.includes('operation was cancelled by the user') ||
    rawMsg.includes('operation was canceled by the user') ||
    rawMsg.includes('user cancelled') ||
    rawMsg.includes('user canceled') ||
    rawMsg.includes('user rejected') ||
    rawMsg.includes('rejected by user') ||
    rawMsg.includes('transaction cancelled by user');
  if (isCancelled) return '__CANCELLED__';
  if (rawMsg.includes('proving failed') || rawMsg.includes('proving error')) {
    throw new Error(
      `${action} failed: Proving failed. The USDCx token program requires valid Merkle proofs for your record. ` +
        'Placeholder proofs cannot be used on-chain. Obtain valid proofs from your wallet (if it supports USDCx private transfer) or from Provable/token issuer. ' +
        'See programusdc/inputs/README_DEPOSIT_EXAMPLE.md for details.'
    );
  }
  if (rawMsg.includes('integer subtraction') || rawMsg.includes('underflow')) {
    throw new Error(
      `${action} failed: The chosen private USDCx Token record does not hold enough for this transfer. ` +
        'If your balance is split across multiple records, consolidate into one (private transfer to yourself) or reduce the amount.',
    );
  }
  if (
    rawMsg.includes('finalize') ||
    (rawMsg.includes('assert') && (rawMsg.includes('fail') || rawMsg.includes('abort'))) ||
    rawMsg.includes('real_debt')
  ) {
    throw new Error(
      `${action} failed (on-chain): assertion or finalize rejected. For **repay**, try a slightly smaller amount — ` +
        `accrued interest can make on-chain debt higher than the UI. Also verify Merkle proofs and that ` +
        `NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID matches your deployed pool. Original: ${error?.message || 'unknown'}`,
    );
  }
  throw new Error(`${action} failed: ${error?.message || 'Unknown error'}`);
}

function handleUsadTxError(error: any, action: string): string {
  const rawMsg = String(error?.message || error || '').toLowerCase();
  const isCancelled =
    rawMsg.includes('operation was cancelled by the user') ||
    rawMsg.includes('operation was canceled by the user') ||
    rawMsg.includes('user cancelled') ||
    rawMsg.includes('user canceled') ||
    rawMsg.includes('user rejected') ||
    rawMsg.includes('rejected by user') ||
    rawMsg.includes('transaction cancelled by user');
  if (isCancelled) return '__CANCELLED__';

  if (rawMsg.includes('proving failed') || rawMsg.includes('proving error')) {
    throw new Error(
      `${action} failed: Proving failed. The USAD token program requires valid Merkle proofs for your record. ` +
        'Placeholder proofs cannot be used on-chain. Obtain valid proofs from your wallet or from the token issuer.',
    );
  }
  if (rawMsg.includes('integer subtraction') || rawMsg.includes('underflow')) {
    throw new Error(
      `${action} failed: The chosen private USAD Token record does not hold enough for this transfer. ` +
        'Consolidate balance into one record or reduce the amount.',
    );
  }
  if (
    rawMsg.includes('finalize') ||
    (rawMsg.includes('assert') && (rawMsg.includes('fail') || rawMsg.includes('abort'))) ||
    rawMsg.includes('real_debt')
  ) {
    throw new Error(
      `${action} failed (on-chain): assertion or finalize rejected. For **repay**, try a smaller amount (interest accrual). ` +
        `Check NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID. Original: ${error?.message || 'unknown'}`,
    );
  }
  throw new Error(`${action} failed: ${error?.message || 'Unknown error'}`);
}

/**
 * USAD deposit: xyra_lending_v2.aleo/deposit_usad(token, amount, proofs) — 3 inputs.
 * Amount in human USAD; converted to micro-USAD for the program.
 *
 * @param ownerAddress - Connected wallet `aleo1…` address. Used to build Sealance / Veiled Markets–style
 *   Merkle non-inclusion proofs when the wallet does not attach proofs to the record.
 */
export async function lendingDepositUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Deposit amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USAD Token record is required. Please ensure you have USAD in your wallet.');
  try {
    const tokenInput = getUsadTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USAD Token record has no ciphertext or plaintext. Ensure the record is from test_usad_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsadMerkleProofsInput(tokenRecord, proofs, ownerAddress);
    const proofsLiteral = proofBundle.literal;

    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;
    console.log('[USAD deposit] ========== pool tx diagnostics ==========');
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: USAD_LENDING_POOL_PROGRAM_ID,
          envPoolProgram: process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USAD_TOKEN_PROGRAM,
          function: 'deposit_usad',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 100) : typeof tokenInput,
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [tokenInput, amountStr, proofsLiteral];

    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'deposit_usad',
      inputs,
      fee: feeMicro,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Deposit failed: No transactionId returned.');
    logAleoTxExplorer('USAD deposit', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USAD deposit] Raw error:', error?.message ?? error, error);
    return handleUsadTxError(error, 'USAD deposit');
  }
}

/**
 * USAD repay: xyra_lending_v2.aleo/repay_usad(token, amount, proofs) — 3 inputs.
 * Amount in human USAD; converted to micro-USAD for the program.
 *
 * @param ownerAddress - Connected wallet address for Sealance / Veiled-style Merkle proofs (see deposit).
 */
export async function lendingRepayUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Repay amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USAD Token record is required for repay.');
  try {
    const tokenInput = getUsadTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USAD Token record has no ciphertext or plaintext. Ensure the record is from test_usad_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsadMerkleProofsInput(tokenRecord, proofs, ownerAddress);
    const proofsLiteral = proofBundle.literal;

    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;
    console.log('[USAD repay] ========== pool tx diagnostics ==========');
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: USAD_LENDING_POOL_PROGRAM_ID,
          envPoolProgram: process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USAD_TOKEN_PROGRAM,
          function: 'repay_usad',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          ownerForProofs: ownerAddress ? `${String(ownerAddress).slice(0, 16)}…` : null,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 100) : typeof tokenInput,
          hints: [
            'finalize_repay asserts amount <= on-chain accrued debt; UI can lag interest — try a smaller repay.',
            'Invalid Merkle proofs for test_usad_stablecoin transfer_private_to_public will reject.',
            'NEXT_PUBLIC_* pool program id must match the deployed pool you initialized.',
          ],
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [tokenInput, amountStr, proofsLiteral];

    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'repay_usad',
      inputs,
      fee: feeMicro,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Repay failed: No transactionId returned.');
    logAleoTxExplorer('USAD repay', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USAD repay] Raw error:', error?.message ?? error, error);
    return handleUsadTxError(error, 'USAD repay');
  }
}

/**
 * USAD withdraw: state-only; wallet submits withdraw transition, backend later transfers USAD.
 */
export async function lendingWithdrawUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Withdraw amount must be greater than 0');
  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'withdraw_usad',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Withdraw failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsadTxError(error, 'USAD withdraw');
  }
}

/**
 * USAD borrow: state-only; wallet submits borrow transition, backend later transfers USAD.
 */
export async function lendingBorrowUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Borrow amount must be greater than 0');
  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'borrow_usad',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Borrow failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsadTxError(error, 'USAD borrow');
  }
}

/**
 * USDC deposit: xyra_lending_v2.aleo/deposit_usdcx — token, amount, proofs — 3 inputs.
 * Amount in human USDC; converted to micro-USDC for the program.
 */
export async function lendingDepositUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Deposit amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USDC Token record is required. Please ensure you have USDCx in your wallet.');
  try {
    const tokenInput = getUsdcTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USDC Token record has no ciphertext or plaintext. Ensure the record is from test_usdcx_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsdcMerkleProofsInput(tokenRecord, proofs);
    const proofsLiteral = proofBundle.literal;
    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

    console.log('[USDC deposit] ========== pool tx diagnostics ==========');
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: USDC_LENDING_POOL_PROGRAM_ID,
          envPoolProgram: process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USDC_TOKEN_PROGRAM,
          function: 'deposit_usdcx',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 120) : typeof tokenInput,
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [tokenInput, amountStr, proofsLiteral];

    console.log('[USDC deposit] input2 proofs preview:', proofsLiteral.slice(0, 220));

    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'deposit_usdcx',
      inputs,
      fee: feeMicro,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Deposit failed: No transactionId returned.');
    logAleoTxExplorer('USDC deposit', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USDC deposit] Raw error:', error?.message ?? error, error);
    return handleUsdcTxError(error, 'USDC deposit');
  }
}

/**
 * USDC repay: xyra_lending_v2.aleo/repay_usdcx — 3 inputs.
 * Amount in human USDC; converted to micro-USDC for the program.
 */
export async function lendingRepayUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Repay amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USDC Token record is required for repay.');
  try {
    const tokenInput = getUsdcTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USDC Token record has no ciphertext or plaintext. Ensure the record is from test_usdcx_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsdcMerkleProofsInput(tokenRecord, proofs);
    const proofsLiteral = proofBundle.literal;
    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

    console.log('[USDC repay] ========== pool tx diagnostics ==========');
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: USDC_LENDING_POOL_PROGRAM_ID,
          envPoolProgram: process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USDC_TOKEN_PROGRAM,
          function: 'repay_usdcx',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 120) : typeof tokenInput,
          hints: [
            'finalize_repay asserts amount <= on-chain accrued debt; UI can lag — try a slightly smaller repay.',
            'Invalid Merkle proofs for test_usdcx_stablecoin transfer_private_to_public will reject.',
            'Pool program in NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID must match deployed pool.',
          ],
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [tokenInput, amountStr, proofsLiteral];

    console.log('[USDC repay] input2 proofs preview:', proofsLiteral.slice(0, 220));

    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'repay_usdcx',
      inputs,
      fee: feeMicro,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Repay failed: No transactionId returned.');
    logAleoTxExplorer('USDC repay', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USDC repay] Raw error:', error?.message ?? error, error);
    return handleUsdcTxError(error, 'USDC repay');
  }
}

export async function lendingWithdrawUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Withdraw amount must be greater than 0');
  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'withdraw_usdcx',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Withdraw failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'USDC withdraw');
  }
}

export async function lendingBorrowUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Borrow amount must be greater than 0');
  try {
    const amountMicro = Math.round(amount * 1_000_000);
    const inputs = [`${amountMicro}u64`];
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'borrow_usdcx',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Borrow failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'USDC borrow');
  }
}

/**
 * Admin-only: initialize ALEO lending pool once.
 */
export async function lendingInitializeAleoPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize ALEO pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`Initialize ALEO pool failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Admin-only: initialize USDC lending pool once.
 */
export async function lendingInitializeUsdcPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize USDC pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'Initialize USDC pool');
  }
}

/**
 * Admin-only: initialize USAD lending pool once.
 */
export async function lendingInitializeUsadPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize USAD pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    return handleUsadTxError(error, 'Initialize USAD pool');
  }
}

/**
 * Accrue interest on the Aleo pool (v86) using wallet adapter.
 * accrue_interest() — updates liquidity_index and borrow_index using on-chain block.height.
 * Anyone can call; indices are also updated automatically on every deposit, borrow, repay, withdraw.
 */
export async function lendingAccrueInterest(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  console.log('========================================');
  console.log('📈 LENDING ACCRUE INTEREST FUNCTION CALLED (Aleo pool)');
  console.log('========================================');
  console.log('📥 Input Parameters:', {
    network: CURRENT_NETWORK,
    programId: LENDING_POOL_PROGRAM_ID,
  });

  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  const fee = DEFAULT_LENDING_FEE * 1_000_000;

  try {
    const inputs: string[] = ['0field'];
    console.log('💰 Transaction Configuration:', {
      inputs,
      fee: `${fee} microcredits`,
    });

    console.log('🔍 Calling executeTransaction for accrue_interest (public fee)...');
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs,
      fee,
      privateFee: false,
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Accrue interest failed: No temporary transactionId returned from wallet.');
    }

    console.log('Temporary Transaction ID (accrue_interest):', tempId);
    console.log('========================================\n');
    return tempId;
  } catch (error: any) {
    console.error('========================================');
    console.error('❌ LENDING ACCRUE INTEREST FUNCTION FAILED');
    console.error('========================================');
    console.error('📋 Error Details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      error: error,
    });
    console.error('========================================\n');

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Accrue interest transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Accrue interest transaction failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Accrue interest on the USDC pool (lending_pool_usdce_v86.aleo). Same signature as Aleo pool.
 */
export async function lendingAccrueInterestUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  const fee = DEFAULT_LENDING_FEE * 1_000_000;
  try {
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs: ['1field'],
      fee,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('USDC accrue interest failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('user cancelled') || rawMsg.includes('user rejected');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`USDC accrue interest failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Accrue interest on the USAD pool (lending_pool_usad_v17.aleo). Same signature as Aleo pool.
 */
export async function lendingAccrueInterestUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  const fee = DEFAULT_LENDING_FEE * 1_000_000;
  try {
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs: ['2field'],
      fee,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('USAD accrue interest failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user rejected');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`USAD accrue interest failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Read global pool state from mappings for a given program.
 * Keys are always GLOBAL_KEY = 0u8 in the Leo program.
 * v85 (lending_pool_v85.aleo) also has liquidity_index and borrow_index for interest/APY.
 */
export async function getLendingPoolStateForProgram(programId: string, assetKey: string = '0field'): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  try {
    const requestWithErrorHandling = async (mappingName: string, key: string) => {
      try {
        return await Promise.resolve(client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        }));
      } catch (err: any) {
        console.warn(
          `getLendingPoolStateForProgram(${programId}): Failed to fetch ${mappingName} (key=${key}):`,
          err?.message,
        );
        return null;
      }
    };

    const extract = (res: any): string | null => {
      if (res == null) return null;
      const raw = res.value ?? res ?? null;
      if (raw == null) return null;
      const str = String(raw);
      return str.replace(/u64$/i, '');
    };

    // -----------------------------
    // v91+ (current main.leo) schema
    // key type: field (single-asset key = 0field)
    // mappings: total_deposited, total_borrowed, supply_index, borrow_index, ...
    // -----------------------------
    const keyField = assetKey;
    const [depositedV91, borrowedV91, supplyIdxV91, borrowIdxV91] = await Promise.all([
      requestWithErrorHandling('total_deposited', keyField),
      requestWithErrorHandling('total_borrowed', keyField),
      requestWithErrorHandling('supply_index', keyField),
      requestWithErrorHandling('borrow_index', keyField),
    ]);

    const depositedStr = extract(depositedV91);
    const borrowedStr = extract(borrowedV91);
    const supplyIdxStr = extract(supplyIdxV91);
    const borrowIdxStr = extract(borrowIdxV91);

    // If v91 mappings exist, use them.
    if (depositedStr != null || borrowedStr != null || supplyIdxStr != null || borrowIdxStr != null) {
      return {
        totalSupplied: depositedStr,
        totalBorrowed: borrowedStr,
        // v91 program does not store utilization/interest indices separately.
        utilizationIndex: null,
        // Keep legacy fields populated for UI components that still display them.
        interestIndex: supplyIdxStr,
        liquidityIndex: supplyIdxStr,
        borrowIndex: borrowIdxStr,
      };
    }

    // -----------------------------
    // v86 fallback schema (older pools)
    // key type: u8 (GLOBAL_KEY = 0u8)
    // mappings: total_supplied, utilization_index, liquidity_index, borrow_index, ...
    // -----------------------------
    const keyU8 = '0u8';
    const [supplied, borrowed, utilization, interest, liquidityIdx, borrowIdx] = await Promise.all([
      requestWithErrorHandling('total_supplied', keyU8),
      requestWithErrorHandling('total_borrowed', keyU8),
      requestWithErrorHandling('utilization_index', keyU8),
      requestWithErrorHandling('interest_index', keyU8),
      requestWithErrorHandling('liquidity_index', keyU8),
      requestWithErrorHandling('borrow_index', keyU8),
    ]);

    return {
      totalSupplied: extract(supplied),
      totalBorrowed: extract(borrowed),
      utilizationIndex: extract(utilization),
      interestIndex: extract(interest),
      liquidityIndex: extract(liquidityIdx),
      borrowIndex: extract(borrowIdx),
    };
  } catch (error: any) {
    console.error('getLendingPoolStateForProgram: Error fetching pool state:', error);
    return {
      totalSupplied: null,
      totalBorrowed: null,
      utilizationIndex: null,
      interestIndex: null,
      liquidityIndex: null,
      borrowIndex: null,
    };
  }
}

/**
 * Read V2 oracle price mapping for an asset key (e.g. 0field/1field/2field).
 * Returns price in program PRICE_SCALE units (1e6 => $1.000000).
 */
export async function getAssetPriceForProgram(
  programId: string,
  assetKey: string,
): Promise<number | null> {
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: 'asset_price',
      key: assetKey,
    });
    const raw = res?.value ?? res ?? null;
    if (raw == null) return null;
    const num = Number(String(raw).replace(/u64$/i, ''));
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

/**
 * Read global pool state for the Aleo pool (lending_pool_v86.aleo).
 */
export async function getLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(LENDING_POOL_PROGRAM_ID, '0field');
}

/**
 * Read global pool state for the USDC pool (lending_pool_usdce_v86.aleo).
 */
export async function getUsdcLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(USDC_LENDING_POOL_PROGRAM_ID, '1field');
}

/**
 * Read global pool state for the USAD pool.
 */
export async function getUsadLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(USAD_LENDING_POOL_PROGRAM_ID, '2field');
}

// --- v91 interest/APY constants (match program lending_pool_v91.aleo) ---
// Leo program:
//   const SCALE:        u64 = 10_000u64;   // basis points denominator
//   const BASE_RATE:    u64 = 200u64;      // 2% base borrow rate (annual, bps)
//   const SLOPE_RATE:   u64 = 400u64;      // +4% borrow per 100% utilization (annual, bps)
//   const RESERVE_FACTOR: u64 = 1_000u64;  // 10% of interest to protocol
//
// On-chain, borrow APY (in bps) is:
//   borrow_apy_bps = BASE_RATE + SLOPE_RATE * util
// where util in [0,1]. Supply APY in bps is:
//   supply_apy_bps = borrow_apy_bps * util * (1 - RESERVE_FACTOR / SCALE).
//
// We expose APY to the UI as fractions (e.g. 0.02 = 2%).
const SCALE_ALEO = 10_000; // basis points denominator
const BASE_RATE_BPS_ALEO = 200; // 2% base borrow APR
const SLOPE_RATE_BPS_ALEO = 400; // +4% per 100% util
const RESERVE_FACTOR_BPS_ALEO = 1_000; // 10% reserve cut

/**
 * Compute supply and borrow APY (fractions) from pool state using the v91 model.
 * Inputs:
 *   - totalSupplied/totalBorrowed: principal balances (micro-credits); only the ratio matters.
 * Returns:
 *   - borrowAPY: annualized borrow rate as fraction (e.g. 0.02 = 2%).
 *   - supplyAPY: annualized supply rate as fraction.
 */
export function computeAleoPoolAPY(
  totalSupplied: number | string,
  totalBorrowed: number | string,
): { supplyAPY: number; borrowAPY: number } {
  const ts = Number(totalSupplied) || 0;
  const tb = Number(totalBorrowed) || 0;
  if (ts <= 0) {
    return { supplyAPY: 0, borrowAPY: 0 };
  }
  const utilRaw = tb / ts; // 0..1
  const util = Math.max(0, Math.min(1, utilRaw));

  // Borrow APY in fraction: (BASE_RATE + SLOPE_RATE * util) / SCALE
  const borrowAPY =
    (BASE_RATE_BPS_ALEO + SLOPE_RATE_BPS_ALEO * util) / SCALE_ALEO;

  // Supply APY = borrowAPY * util * (1 - reserve_factor)
  const reserveCut = RESERVE_FACTOR_BPS_ALEO / SCALE_ALEO;
  const supplyAPY = borrowAPY * util * (1 - reserveCut);

  return { supplyAPY, borrowAPY };
}

/** Same rate model as Aleo pool (v86); USDC pool uses identical constants. */
export const computeUsdcPoolAPY = computeAleoPoolAPY;

/** Same rate model as Aleo pool (v86); USAD pool uses identical constants. */
export const computeUsadPoolAPY = computeAleoPoolAPY;

// These caches are module-level and can survive HMR in development.
// Version them so changes to key-derivation logic don't leave stale entries.
const USER_FIELD_HASH_SCHEME_VERSION = 'v2';
const userFieldHashCache = new Map<string, string>();
const lendingPositionKeyCache = new Map<string, string>();

function normalizeFieldLiteral(fieldStr: string): string {
  const t = String(fieldStr).trim();
  return t.endsWith('field') ? t : `${t}field`;
}

/** Default `@provablehq/wasm` entry is testnet; align with `CURRENT_NETWORK` when you switch to mainnet builds. */
async function loadProvableWasm(): Promise<typeof import('@provablehq/wasm')> {
  if (CURRENT_NETWORK === Network.MAINNET) {
    // Subpath exists at runtime (package exports); TS moduleResolution: node may not resolve it.
    // @ts-expect-error -- provable wasm mainnet entry
    return import('@provablehq/wasm/mainnet.js');
  }
  return import('@provablehq/wasm');
}

/** Leo: user_key = BHP256::hash_to_field(caller). Same as xyra_lending_v3 mapping inputs. */
export async function computeUserKeyFieldFromAddress(address: string): Promise<string | null> {
  try {
    const cacheKey = `${USER_FIELD_HASH_SCHEME_VERSION}:${address}`;
    if (userFieldHashCache.has(cacheKey)) {
      return userFieldHashCache.get(cacheKey) ?? null;
    }
    const { BHP256, Address } = await loadProvableWasm();
    const bhp = new BHP256();
    const addr = Address.from_string(address);
    // Leo's `BHP256::hash_to_field(caller)` hashes the field elements of the address.
    // Hashing the address object directly can diverge depending on wasm bindings.
    const userKeyField = bhp.hash(addr.toFields());
    const s = userKeyField.toString();
    userFieldHashCache.set(cacheKey, s);
    return s;
  } catch (e) {
    console.warn('computeUserKeyFieldFromAddress failed:', e);
    return null;
  }
}

/**
 * Leo: compute_position_key(user_key, asset_id) = BHP256::hash_to_field(user_key + asset_id).
 * assetIdField: ALEO 0field, USDCx 1field, USAD 2field (xyra_lending_v3).
 */
export async function computeLendingPositionMappingKey(
  address: string,
  assetIdField: string,
): Promise<string | null> {
  try {
    const cacheKey = `${USER_FIELD_HASH_SCHEME_VERSION}:${address}:${assetIdField}`;
    if (lendingPositionKeyCache.has(cacheKey)) {
      return lendingPositionKeyCache.get(cacheKey) ?? null;
    }
    const userKeyStr = await computeUserKeyFieldFromAddress(address);
    if (!userKeyStr) return null;
    const { BHP256, Field } = await loadProvableWasm();
    const bhp = new BHP256();
    const userKey = Field.fromString(normalizeFieldLiteral(userKeyStr));
    const assetF = Field.fromString(normalizeFieldLiteral(assetIdField));
    const sum = userKey.add(assetF);
    const posKey = bhp.hash([sum]);
    const out = posKey.toString();
    lendingPositionKeyCache.set(cacheKey, out);
    return out;
  } catch (e) {
    console.warn('computeLendingPositionMappingKey failed:', e);
    return null;
  }
}

/**
 * Effective supply balance = (user_scaled_supply * supply_index) / INDEX_SCALE.
 * Effective borrow debt = (user_scaled_borrow * borrow_index) / INDEX_SCALE.
 *
 * @param assetIdField Per-asset key: `0field` (ALEO), `1field` (USDCx), `2field` (USAD) for unified v3.
 * Returns null if position key cannot be computed (caller should fall back to records).
 */
export async function getAleoPoolUserEffectivePosition(
  programId: string,
  userAddress: string,
  assetIdField: string = '0field',
): Promise<{ effectiveSupplyBalance: number; effectiveBorrowDebt: number } | null> {
  const posKey = await computeLendingPositionMappingKey(userAddress, assetIdField);
  if (!posKey) return null;
  try {
    const requestWithErrorHandling = async (mappingName: string, key: string) => {
      try {
        const res = await client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        });
        const raw = res?.value ?? res ?? null;
        if (raw == null) return null;
        const str = String(raw).replace(/u64$/i, '');
        return str ? BigInt(str) : null;
      } catch {
        return null;
      }
    };

    const assetKey = normalizeFieldLiteral(assetIdField);
    const keyU8 = '0u8';
    const [scaledSupply, scaledBorrow, supplyIndexAsset, borrowIndexAsset] = await Promise.all([
      requestWithErrorHandling('user_scaled_supply', posKey),
      requestWithErrorHandling('user_scaled_borrow', posKey),
      requestWithErrorHandling('supply_index', assetKey),
      requestWithErrorHandling('borrow_index', assetKey),
    ]);

    const INDEX_SCALE_ALEO = BigInt('1000000000000');

    // Unified v3: indices are per asset_id. Legacy single-asset pools: fall back to 0field / 0u8.
    let li = supplyIndexAsset;
    if (li == null) {
      li =
        (await requestWithErrorHandling('supply_index', '0field')) ??
        (await requestWithErrorHandling('liquidity_index', keyU8));
    }
    let bi = borrowIndexAsset;
    if (bi == null) {
      bi =
        (await requestWithErrorHandling('borrow_index', '0field')) ??
        (await requestWithErrorHandling('borrow_index', keyU8));
    }
    li = li ?? INDEX_SCALE_ALEO;
    bi = bi ?? INDEX_SCALE_ALEO;
    const ss = scaledSupply ?? BigInt(0);
    const sb = scaledBorrow ?? BigInt(0);
    const effectiveSupplyBalance = Number((ss * li) / INDEX_SCALE_ALEO);
    const effectiveBorrowDebt = Number((sb * bi) / INDEX_SCALE_ALEO);
    return { effectiveSupplyBalance, effectiveBorrowDebt };
  } catch {
    return null;
  }
}

/** Matches `xyra_lending_v4.aleo` / `weighted_collateral_usd` + `finalize_borrow` (INDEX_SCALE, PRICE_SCALE, SCALE). */
const LENDING_INDEX_SCALE = BigInt('1000000000000');
const LENDING_PRICE_SCALE = BigInt('1000000');
const LENDING_LTV_SCALE = BigInt('10000');
/** u128::MAX — same bound as Leo for `(real_sup * price) * ltv` before single division. */
const LENDING_U128_MAX = BigInt('340282366920938463463374607431768211455');

function weightedCollateralUsdMicro(realSup: bigint, price: bigint, ltv: bigint): bigint {
  const rp = realSup * price;
  const den = LENDING_PRICE_SCALE * LENDING_LTV_SCALE;
  const rpTimesLOk = ltv === BigInt(0) || rp <= LENDING_U128_MAX / ltv;
  return rpTimesLOk ? (rp * ltv) / den : ((rp / LENDING_PRICE_SCALE) * ltv) / LENDING_LTV_SCALE;
}

async function getMappingU64Big(programId: string, mappingName: string, key: string): Promise<bigint | null> {
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: mappingName,
      key,
    });
    const raw = res?.value ?? res ?? null;
    if (raw == null) return null;
    const str = String(raw).replace(/u64$/i, '').trim();
    if (!str) return null;
    return BigInt(str);
  } catch {
    return null;
  }
}

/**
 * Replicates `finalize_borrow` collateral/debt USD totals and max borrow per asset (micro units)
 * so the UI cannot exceed `assert(total_debt + new_borrow_usd <= total_collateral)`.
 */
export type CrossCollateralChainCaps = {
  totalCollateralUsd: bigint;
  totalDebtUsd: bigint;
  headroomUsd: bigint;
  maxBorrowMicroAleo: bigint;
  maxBorrowMicroUsdcx: bigint;
  maxBorrowMicroUsad: bigint;
};

export async function getCrossCollateralBorrowCapsFromChain(
  programId: string,
  userAddress: string,
): Promise<CrossCollateralChainCaps | null> {
  const [pkAleo, pkUsdcx, pkUsad] = await Promise.all([
    computeLendingPositionMappingKey(userAddress, '0field'),
    computeLendingPositionMappingKey(userAddress, '1field'),
    computeLendingPositionMappingKey(userAddress, '2field'),
  ]);
  if (!pkAleo || !pkUsdcx || !pkUsad) return null;

  const z = (x: bigint | null) => x ?? BigInt(0);

  const [
    ssA,
    ssU,
    ssD,
    sbA,
    sbU,
    sbD,
    supA,
    supU,
    supD,
    borA,
    borU,
    borD,
    pA,
    pU,
    pD,
    ltvA,
    ltvU,
    ltvD,
  ] = await Promise.all([
    getMappingU64Big(programId, 'user_scaled_supply', pkAleo),
    getMappingU64Big(programId, 'user_scaled_supply', pkUsdcx),
    getMappingU64Big(programId, 'user_scaled_supply', pkUsad),
    getMappingU64Big(programId, 'user_scaled_borrow', pkAleo),
    getMappingU64Big(programId, 'user_scaled_borrow', pkUsdcx),
    getMappingU64Big(programId, 'user_scaled_borrow', pkUsad),
    getMappingU64Big(programId, 'supply_index', '0field'),
    getMappingU64Big(programId, 'supply_index', '1field'),
    getMappingU64Big(programId, 'supply_index', '2field'),
    getMappingU64Big(programId, 'borrow_index', '0field'),
    getMappingU64Big(programId, 'borrow_index', '1field'),
    getMappingU64Big(programId, 'borrow_index', '2field'),
    getMappingU64Big(programId, 'asset_price', '0field'),
    getMappingU64Big(programId, 'asset_price', '1field'),
    getMappingU64Big(programId, 'asset_price', '2field'),
    getMappingU64Big(programId, 'asset_ltv', '0field'),
    getMappingU64Big(programId, 'asset_ltv', '1field'),
    getMappingU64Big(programId, 'asset_ltv', '2field'),
  ]);

  const supIdxA = supA ?? LENDING_INDEX_SCALE;
  const supIdxU = supU ?? LENDING_INDEX_SCALE;
  const supIdxD = supD ?? LENDING_INDEX_SCALE;
  const borIdxA = borA ?? LENDING_INDEX_SCALE;
  const borIdxU = borU ?? LENDING_INDEX_SCALE;
  const borIdxD = borD ?? LENDING_INDEX_SCALE;

  const priceA = pA ?? LENDING_PRICE_SCALE;
  const priceU = pU ?? LENDING_PRICE_SCALE;
  const priceD = pD ?? LENDING_PRICE_SCALE;

  const ltvAB = ltvA ?? BigInt(7500);
  const ltvUB = ltvU ?? BigInt(8500);
  const ltvDB = ltvD ?? BigInt(8500);

  const realSupA = (z(ssA) * supIdxA) / LENDING_INDEX_SCALE;
  const realSupU = (z(ssU) * supIdxU) / LENDING_INDEX_SCALE;
  const realSupD = (z(ssD) * supIdxD) / LENDING_INDEX_SCALE;
  const realBorA = (z(sbA) * borIdxA) / LENDING_INDEX_SCALE;
  const realBorU = (z(sbU) * borIdxU) / LENDING_INDEX_SCALE;
  const realBorD = (z(sbD) * borIdxD) / LENDING_INDEX_SCALE;

  // finalize_borrow: weighted_* (weighted_collateral_usd) and debt_* (same order as Leo).
  const weightedA = weightedCollateralUsdMicro(realSupA, priceA, ltvAB);
  const weightedU = weightedCollateralUsdMicro(realSupU, priceU, ltvUB);
  const weightedD = weightedCollateralUsdMicro(realSupD, priceD, ltvDB);
  const totalCollateralUsd = weightedA + weightedU + weightedD;

  const debtA = (realBorA * priceA) / LENDING_PRICE_SCALE;
  const debtU = (realBorU * priceU) / LENDING_PRICE_SCALE;
  const debtD = (realBorD * priceD) / LENDING_PRICE_SCALE;
  const totalDebtUsd = debtA + debtU + debtD;

  let headroomUsd = totalCollateralUsd - totalDebtUsd;
  if (headroomUsd < BigInt(0)) headroomUsd = BigInt(0);

  const maxMicroForPrice = (head: bigint, price: bigint): bigint => {
    if (head <= BigInt(0) || price <= BigInt(0)) return BigInt(0);
    return (head * LENDING_PRICE_SCALE + LENDING_PRICE_SCALE - BigInt(1)) / price;
  };

  return {
    totalCollateralUsd,
    totalDebtUsd,
    headroomUsd,
    maxBorrowMicroAleo: maxMicroForPrice(headroomUsd, priceA),
    maxBorrowMicroUsdcx: maxMicroForPrice(headroomUsd, priceU),
    maxBorrowMicroUsad: maxMicroForPrice(headroomUsd, priceD),
  };
}

export type CrossCollateralWithdrawCaps = {
  maxWithdrawMicroAleo: bigint;
  maxWithdrawMicroUsdcx: bigint;
  maxWithdrawMicroUsad: bigint;
};

/**
 * Replicates `finalize_withdraw` health + collateral burn logic from `xyra_lending_v4.aleo`.
 * Returns the maximum output-asset amount (micro units) the user can withdraw while the
 * program's assertions pass, allowing "withdraw with any asset".
 */
export async function getCrossCollateralWithdrawCapsFromChain(
  programId: string,
  userAddress: string,
): Promise<CrossCollateralWithdrawCaps | null> {
  const [pkAleo, pkUsdcx, pkUsad] = await Promise.all([
    computeLendingPositionMappingKey(userAddress, '0field'),
    computeLendingPositionMappingKey(userAddress, '1field'),
    computeLendingPositionMappingKey(userAddress, '2field'),
  ]);
  if (!pkAleo || !pkUsdcx || !pkUsad) return null;

  const z = (x: bigint | null) => x ?? BigInt(0);

  const [
    ssA,
    ssU,
    ssD,
    sbA,
    sbU,
    sbD,
    supA,
    supU,
    supD,
    borA,
    borU,
    borD,
    pA,
    pU,
    pD,
    ltvA,
    ltvU,
    ltvD,
  ] = await Promise.all([
    getMappingU64Big(programId, 'user_scaled_supply', pkAleo),
    getMappingU64Big(programId, 'user_scaled_supply', pkUsdcx),
    getMappingU64Big(programId, 'user_scaled_supply', pkUsad),
    getMappingU64Big(programId, 'user_scaled_borrow', pkAleo),
    getMappingU64Big(programId, 'user_scaled_borrow', pkUsdcx),
    getMappingU64Big(programId, 'user_scaled_borrow', pkUsad),
    getMappingU64Big(programId, 'supply_index', '0field'),
    getMappingU64Big(programId, 'supply_index', '1field'),
    getMappingU64Big(programId, 'supply_index', '2field'),
    getMappingU64Big(programId, 'borrow_index', '0field'),
    getMappingU64Big(programId, 'borrow_index', '1field'),
    getMappingU64Big(programId, 'borrow_index', '2field'),
    getMappingU64Big(programId, 'asset_price', '0field'),
    getMappingU64Big(programId, 'asset_price', '1field'),
    getMappingU64Big(programId, 'asset_price', '2field'),
    getMappingU64Big(programId, 'asset_ltv', '0field'),
    getMappingU64Big(programId, 'asset_ltv', '1field'),
    getMappingU64Big(programId, 'asset_ltv', '2field'),
  ]);

  const supIdxA = supA ?? LENDING_INDEX_SCALE;
  const supIdxU = supU ?? LENDING_INDEX_SCALE;
  const supIdxD = supD ?? LENDING_INDEX_SCALE;
  const borIdxA = borA ?? LENDING_INDEX_SCALE;
  const borIdxU = borU ?? LENDING_INDEX_SCALE;
  const borIdxD = borD ?? LENDING_INDEX_SCALE;

  const priceA = pA ?? LENDING_PRICE_SCALE;
  const priceU = pU ?? LENDING_PRICE_SCALE;
  const priceD = pD ?? LENDING_PRICE_SCALE;

  const ltvAB = ltvA ?? BigInt(7500);
  const ltvUB = ltvU ?? BigInt(8500);
  const ltvDB = ltvD ?? BigInt(8500);

  const realSup = [
    (z(ssA) * supIdxA) / LENDING_INDEX_SCALE,
    (z(ssU) * supIdxU) / LENDING_INDEX_SCALE,
    (z(ssD) * supIdxD) / LENDING_INDEX_SCALE,
  ];
  const realBor = [
    (z(sbA) * borIdxA) / LENDING_INDEX_SCALE,
    (z(sbU) * borIdxU) / LENDING_INDEX_SCALE,
    (z(sbD) * borIdxD) / LENDING_INDEX_SCALE,
  ];

  const prices = [priceA, priceU, priceD];
  const ltvs = [ltvAB, ltvUB, ltvDB];

  const debtUsd = [
    (realBor[0] * prices[0]) / LENDING_PRICE_SCALE,
    (realBor[1] * prices[1]) / LENDING_PRICE_SCALE,
    (realBor[2] * prices[2]) / LENDING_PRICE_SCALE,
  ];
  const totalDebtUsd = debtUsd[0] + debtUsd[1] + debtUsd[2];

  const supUsdBefore = [
    (realSup[0] * prices[0]) / LENDING_PRICE_SCALE,
    (realSup[1] * prices[1]) / LENDING_PRICE_SCALE,
    (realSup[2] * prices[2]) / LENDING_PRICE_SCALE,
  ];
  const totalSupplyUsdBefore = supUsdBefore[0] + supUsdBefore[1] + supUsdBefore[2];

  const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);

  const canWithdraw = (amountOutMicro: bigint, outIdx: 0 | 1 | 2): boolean => {
    if (amountOutMicro <= BigInt(0)) return false;
    const priceOut = prices[outIdx];
    if (priceOut <= BigInt(0)) return false;

    // withdraw_usd = floor(amount * price_out / PRICE_SCALE)
    const withdrawUsd = (amountOutMicro * priceOut) / LENDING_PRICE_SCALE;
    if (withdrawUsd <= BigInt(0)) return false;
    if (withdrawUsd > totalSupplyUsdBefore) return false;

    // Burn collateral in deterministic order: ALEO -> USDCx -> USAD
    let rem = withdrawUsd;
    const burnAmt: bigint[] = [BigInt(0), BigInt(0), BigInt(0)];
    for (const idx of [0, 1, 2] as const) {
      const targetUsd = rem > supUsdBefore[idx] ? supUsdBefore[idx] : rem;
      const burnAmtRaw = (targetUsd * LENDING_PRICE_SCALE) / prices[idx];
      const burnAmtIdx = burnAmtRaw > realSup[idx] ? realSup[idx] : burnAmtRaw;
      const burnUsd = (burnAmtIdx * prices[idx]) / LENDING_PRICE_SCALE;
      rem = rem > burnUsd ? rem - burnUsd : BigInt(0);
      burnAmt[idx] = burnAmtIdx;
    }

    // Tiny rounding dust tolerance in USD-micro units.
    if (rem > BigInt(3)) return false;

    const realSupAfter = [
      realSup[0] > burnAmt[0] ? realSup[0] - burnAmt[0] : BigInt(0),
      realSup[1] > burnAmt[1] ? realSup[1] - burnAmt[1] : BigInt(0),
      realSup[2] > burnAmt[2] ? realSup[2] - burnAmt[2] : BigInt(0),
    ];

    const weightedAfter = [
      weightedCollateralUsdMicro(realSupAfter[0], prices[0], ltvs[0]),
      weightedCollateralUsdMicro(realSupAfter[1], prices[1], ltvs[1]),
      weightedCollateralUsdMicro(realSupAfter[2], prices[2], ltvs[2]),
    ];
    const totalCollateralAfter = weightedAfter[0] + weightedAfter[1] + weightedAfter[2];

    return totalDebtUsd === BigInt(0) || totalDebtUsd <= totalCollateralAfter;
  };

  const maxAmtForOut = (outIdx: 0 | 1 | 2): bigint => {
    const priceOut = prices[outIdx];
    if (priceOut <= BigInt(0)) return BigInt(0);

    // Upper bound ignores health constraint:
    // amount = floor(total_supply_usd_before * PRICE_SCALE / price_out)
    let high = (totalSupplyUsdBefore * LENDING_PRICE_SCALE) / priceOut;
    if (high > MAX_U64) high = MAX_U64;

    let low = BigInt(0);
    while (low < high) {
      const mid = (low + high + BigInt(1)) / BigInt(2);
      if (canWithdraw(mid, outIdx)) low = mid;
      else high = mid - BigInt(1);
    }
    return low;
  };

  const maxMicroAleo = maxAmtForOut(0);
  const maxMicroUsdcx = maxAmtForOut(1);
  const maxMicroUsad = maxAmtForOut(2);

  return {
    maxWithdrawMicroAleo: maxMicroAleo,
    maxWithdrawMicroUsdcx: maxMicroUsdcx,
    maxWithdrawMicroUsad: maxMicroUsad,
  };
}

/**
 * Get address hash from contract (helper function for v8).
 * Calls: lending_pool_v8.aleo/get_address_hash() -> field
 */
export async function getAddressHashFromContract(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  requestTransactionHistory?: (program: string) => Promise<any[]>
): Promise<string | null> {
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  try {
    const inputs: string[] = [];
    const fee = DEFAULT_LENDING_FEE * 1_000_000;
    const chainId = CURRENT_NETWORK === Network.TESTNET 
      ? Network.TESTNET 
      : String(CURRENT_NETWORK);
    
    const transaction = {
      programId: LENDING_POOL_PROGRAM_ID,
      functionName: 'get_address_hash',
      inputs,
      fee,
      chainId,
    };
    
    const txId = await requestTransaction(transaction);
    console.log('✅ get_address_hash transaction submitted:', txId);
    
    // Wait for transaction to finalize and extract hash from output
    // Note: This is a simplified version - you may need to adjust based on actual transaction output format
    return txId;
  } catch (error: any) {
    console.error('getAddressHashFromContract failed:', error);
    return null;
  }
}

/**
 * Get user activity from contract (helper function for v8).
 * Calls: lending_pool_v8.aleo/get_user_activity() -> (UserActivity, Future)
 */
export async function getUserActivityFromContract(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string
): Promise<string | null> {
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  try {
    const inputs: string[] = [];
    const fee = DEFAULT_LENDING_FEE * 1_000_000;
    const chainId = CURRENT_NETWORK === Network.TESTNET 
      ? Network.TESTNET 
      : String(CURRENT_NETWORK);
    
    const transaction = {
      programId: LENDING_POOL_PROGRAM_ID,
      functionName: 'get_user_activity',
      inputs,
      fee,
      chainId,
    };
    
    const txId = await requestTransaction(transaction);
    console.log('✅ get_user_activity transaction submitted:', txId);
    
    return txId;
  } catch (error: any) {
    console.error('getUserActivityFromContract failed:', error);
    return null;
  }
}

/**
 * Create test credits (for testing only - v8 does not have this function).
 * Note: v8 does not have create_test_credits function
 */
export async function createTestCredits(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number
): Promise<string> {
  // Note: v8 does not have create_test_credits function
  // This function is kept for backward compatibility but will throw an error
  throw new Error('v8 does not support create_test_credits. Use actual credits.aleo records from your wallet.');
}

/**
 * Deposit test with real credits (for testing only - v8 does not have this function).
 * Note: v8 does not have deposit_test function
 */
export async function depositTestReal(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>
): Promise<string> {
  // Note: v8 does not have deposit_test function
  // This function is kept for backward compatibility but will throw an error
  throw new Error('v8 does not support deposit_test. Use the regular deposit function instead.');
}

/**
 * Repay borrowed amount to the pool using wallet adapter.
export async function lendingRepay(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>
): Promise<string> {
  console.log('========================================');
  console.log('💰 LENDING REPAY FUNCTION CALLED (Option 1 - Real Tokens)');
  console.log('========================================');
  
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  if (!requestRecords) {
    throw new Error('requestRecords is not available. Please ensure your wallet is connected.');
  }

  const chainId = CURRENT_NETWORK === Network.TESTNET 
    ? Network.TESTNET 
    : String(CURRENT_NETWORK);
  
  const fee = DEFAULT_LENDING_FEE * 1_000_000;

  try {
    // Option 1: Fetch credits record from wallet (real Aleo tokens)
    console.log('🔍 Step 1: Fetching credits records from wallet...');
    console.log('📋 Credits Program ID:', CREDITS_PROGRAM_ID);
    console.log('📋 requestRecords function:', typeof requestRecords);
    
    // Convert amount (in credits) to microcredits (1 credit = 1_000_000 microcredits)
    const requiredMicrocredits = amount * 1_000_000;
    
    // Fetch all credits records from wallet
    let allCreditsRecords: any[] = [];
    try {
      // requestRecords takes two parameters: (programId: string, includeSpent?: boolean)
      // includeSpent: false = only unspent records, true = include spent records
      allCreditsRecords = await requestRecords(CREDITS_PROGRAM_ID, false);
      console.log(`📋 requestRecords returned:`, {
        isArray: Array.isArray(allCreditsRecords),
        length: allCreditsRecords?.length || 0,
        type: typeof allCreditsRecords,
        firstRecord: allCreditsRecords?.[0] ? JSON.stringify(allCreditsRecords[0]).substring(0, 200) : 'none',
      });
    } catch (recordsError: any) {
      console.error('❌ Error fetching credits records:', {
        message: recordsError?.message,
        error: recordsError,
      });
      // PHASE 3: Provide helpful error message with test credits option
      console.log('💡 PHASE 3: No credits records found for repay. For testing:');
        console.log('   Get Aleo credits from: https://faucet.aleo.org/ (testnet)');
        console.log('   Wait 10-30 seconds after receiving credits for wallet to index them');
        throw new Error(
          `No credits.aleo records found in wallet. ` +
          `Please: 1) Get Aleo credits from the testnet faucet (https://faucet.aleo.org/), ` +
          `2) Wait 10-30 seconds for wallet to index the new records, ` +
          `3) Then try repay again. ` +
          `Required: ${requiredMicrocredits} microcredits (${amount} credits) + ${fee / 1_000_000} credits fee. ` +
          `Error: ${recordsError?.message || 'Unknown error'}`
        );
    }
    
    if (!allCreditsRecords || !Array.isArray(allCreditsRecords) || allCreditsRecords.length === 0) {
      if (DISABLE_CREDITS_CHECK) {
        console.warn('⚠️ CREDITS CHECK DISABLED: No credits records found, but check is disabled. Creating mock record for testing.');
        // Create a mock credits record structure for testing
        allCreditsRecords = [{
          data: {
            owner: publicKey,
            microcredits: `${requiredMicrocredits + fee}u64.private`,
          },
          spent: false,
          program_id: CREDITS_PROGRAM_ID,
        }];
        console.log('📋 Created mock credits record:', allCreditsRecords[0]);
      } else {
        console.error('❌ No credits records found:', {
          allCreditsRecords,
          isArray: Array.isArray(allCreditsRecords),
          length: allCreditsRecords?.length,
        });
        throw new Error(
          'No credits records found in wallet. ' +
          'Please ensure: 1) You have Aleo credits in your wallet, 2) Your wallet is connected, ' +
          '3) You have granted record access permissions to the app.'
        );
      }
    }
    
    console.log(`📋 Found ${allCreditsRecords.length} total credits records`);
    
    // Log record structure for debugging
    if (allCreditsRecords.length > 0) {
      console.log('📋 Sample record structure:', {
        record: allCreditsRecords[0],
        hasData: !!allCreditsRecords[0]?.data,
        hasMicrocredits: !!allCreditsRecords[0]?.data?.microcredits,
        microcreditsValue: allCreditsRecords[0]?.data?.microcredits,
        spent: allCreditsRecords[0]?.spent,
        keys: Object.keys(allCreditsRecords[0] || {}),
      });
    }
    
    // Filter for private, unspent records
    // Try multiple record formats
    const privateRecords = allCreditsRecords.filter((record: any) => {
      // Check if record has microcredits field (could be in data or directly on record)
      const microcredits = record.data?.microcredits || record.microcredits;
      const isPrivate = microcredits && (
        typeof microcredits === 'string' && microcredits.endsWith('u64.private')
      );
      return isPrivate;
    });
    
    console.log(`📋 Found ${privateRecords.length} private credits records`);
    
    const unspentRecords = privateRecords.filter((record: any) => {
      const spent = record.spent === false || record.spent === undefined || record.data?.spent === false;
      return spent;
    });
    
    console.log(`📋 Found ${unspentRecords.length} unspent private credits records`);
    
    if (unspentRecords.length === 0) {
      // Provide more helpful error message
      const allSpent = privateRecords.length > 0 && privateRecords.every((r: any) => r.spent === true);
      if (DISABLE_CREDITS_CHECK) {
        console.warn('⚠️ CREDITS CHECK DISABLED: No unspent records, but check is disabled. Creating mock record for testing.');
        // Create a mock unspent record
        unspentRecords.push({
          data: {
            owner: publicKey,
            microcredits: `${requiredMicrocredits + fee}u64.private`,
          },
          spent: false,
          program_id: CREDITS_PROGRAM_ID,
        });
        console.log('📋 Created mock unspent credits record');
      } else {
        if (allSpent) {
          throw new Error('All credits records are already spent. Please wait for new records or receive more credits.');
        } else {
          throw new Error(
            'No unspent credits records available. ' +
            `Found ${privateRecords.length} private records but all are marked as spent. ` +
            'Please ensure you have available Aleo credits in your wallet.'
          );
        }
      }
    }
    
    // Helper to extract microcredits value
    const extractMicrocredits = (valueStr: string | undefined): number => {
      if (!valueStr || typeof valueStr !== 'string') return 0;
      const match = valueStr.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    
    // Find a record with enough microcredits (including fee)
    const totalNeeded = requiredMicrocredits + fee;
    console.log('💰 Credit requirements:', {
      amount: `${amount} credits`,
      requiredMicrocredits: `${requiredMicrocredits} microcredits`,
      fee: `${fee} microcredits`,
      totalNeeded: `${totalNeeded} microcredits (${totalNeeded / 1_000_000} credits)`,
    });
    
    let suitableRecord = unspentRecords.find((record: any) => {
      // Try both record.data.microcredits and record.microcredits
      const microcreditsStr = record.data?.microcredits || record.microcredits;
      const recordMicrocredits = extractMicrocredits(microcreditsStr);
      console.log('🔍 Checking record:', {
        microcreditsStr,
        recordMicrocredits,
        totalNeeded,
        sufficient: recordMicrocredits >= totalNeeded,
      });
      return recordMicrocredits >= totalNeeded;
    });
    
    if (!suitableRecord) {
      const recordAmounts = unspentRecords.map((r: any) => {
        const microcreditsStr = r.data?.microcredits || r.microcredits;
        return extractMicrocredits(microcreditsStr);
      });
      const maxAvailable = recordAmounts.length > 0 ? Math.max(...recordAmounts) : 0;
      const totalAvailable = recordAmounts.reduce((sum, amt) => sum + amt, 0);
      
      console.error('❌ No suitable record found:', {
        totalNeeded: `${totalNeeded} microcredits`,
        maxAvailable: `${maxAvailable} microcredits`,
        totalAvailable: `${totalAvailable} microcredits`,
        recordAmounts,
      });
      
      throw new Error(
        `Insufficient credits. Need ${totalNeeded / 1_000_000} credits (${amount} repay + ${fee / 1_000_000} fee), ` +
        `but largest available record has ${maxAvailable / 1_000_000} credits. ` +
        `Total available: ${totalAvailable / 1_000_000} credits across ${unspentRecords.length} records.`
      );
    }
    
    console.log('✅ Found suitable credits record:', {
      microcredits: suitableRecord.data?.microcredits || suitableRecord.microcredits,
      owner: suitableRecord.data?.owner || suitableRecord.owner,
      recordStructure: Object.keys(suitableRecord),
    });
    
    // Prepare the credits record for the transaction
    // The record format should match what the contract expects
    // Contract expects: { owner: address, microcredits: u64 }
    // When fetched from wallet, records have owner at top level and data fields nested
    // IMPORTANT: Pass as Leo record literal STRING with .private visibility modifiers
    // PHASE 3: Pass the record object directly to wallet adapter
    // The wallet adapter expects the actual record object from requestRecords, not a string
    console.log('✅ Using Credits Record Object for Transaction:', {
      recordId: suitableRecord.id,
      owner: suitableRecord.owner || suitableRecord.data?.owner,
      microcredits: suitableRecord.data?.microcredits || suitableRecord.microcredits,
      programId: suitableRecord.program_id,
      recordName: suitableRecord.recordName,
      spent: suitableRecord.spent,
    });
    
    // Call repay transition with amount and credits record object
    // Contract validates record owner and amount, then consumes the record
    // Pass record object directly (wallet adapter handles serialization)
    const repayInputs = [`${amount}u64`, suitableRecord];
    
    console.log('lendingRepay: Transaction inputs:', {
      amount: `${amount} credits`,
      requiredMicrocredits: `${requiredMicrocredits} microcredits`,
      fee: `${fee} microcredits`,
      creditsRecord: '[Record Object]',
      recordId: suitableRecord.id,
      programId: LENDING_POOL_PROGRAM_ID,
      chainId,
    });
    
    console.log('🔍 Step 2: Creating transaction object...');
    const repayTransaction = Transaction.createTransaction(
      publicKey,
      chainId,
      LENDING_POOL_PROGRAM_ID,
      'repay',
      repayInputs,
      fee,
      false
    );

    console.log('✅ Transaction object created');
    console.log('🔍 Step 3: Requesting transaction signature from wallet...');
    const repayTxId = await requestTransaction(repayTransaction);
    console.log('✅ Transaction submitted successfully!');
    console.log('📤 Transaction ID:', repayTxId);
    
    return repayTxId;
  } catch (error: any) {
    console.error('========================================');
    console.error('❌ LENDING REPAY FUNCTION FAILED');
    console.error('========================================');
    console.error('📋 Error Details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      error: error,
    });
    console.error('========================================\n');
    throw new Error(`Repay transaction failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Withdraw supplied liquidity from the pool using wallet adapter.
 * Following basic_bank.aleo pattern - contract reads user data from mappings automatically.
 * - Updates public pool state (total_supplied, utilization_index)
 * - Updates private user mappings (increments total_withdrawals counter)
 * Returns: (UserActivity, Future) - both updated in one transaction
 * No need to pass old_activity - contract reads from mappings using hashed address
 */

/**
 * Accrue interest on the pool using wallet adapter.
 * Calls: lending_pool_v8.aleo/accrue_interest(public delta_index: u64) -> Future
 */

/**
 * Read user's activity from UserActivity records returned by contract transitions.
 * 
 * IMPORTANT: The records returned by contract transitions show the LATEST transaction amounts,
 * not cumulative totals. The contract updates mappings correctly, but the returned records
 * are placeholders showing only the current transaction.
 * 
 * For EXACT cumulative values, we need to read from mappings using the hash method.
 * However, for simplicity, this function reads from records (which show latest transaction).
 * 
 * @param publicKey - User's Aleo address (aleo1...)
 * @param requestRecords - Function from useWallet() to request records (required)
 * @param requestTransaction - Function to call contract transitions (optional, for hash method)
 */
export async function getUserPosition(
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  requestTransaction?: ((transaction: any) => Promise<string>) | undefined,
  transactionStatus?: (txId: string) => Promise<any>,
  requestTransactionHistory?: (programId: string) => Promise<any[]>
): Promise<{
  supplied: string | null;
  borrowed: string | null;
  totalDeposits: string | null;
  totalWithdrawals: string | null;
  totalBorrows: string | null;
  totalRepayments: string | null;
}> {
  // Note: The contract returns UserActivity records, but they are placeholders (show current transaction, not cumulative)
  // The actual cumulative values are in mappings, which require hash computation to read
  // For simplicity, we'll read from records (which show latest transaction amounts)
  // The contract logic correctly updates mappings in finalize functions
  
  // Fallback: Read from records (may be placeholders, but better than nothing)
  if (!requestRecords) {
    console.warn('getUserPosition: requestRecords not available');
    return { 
      supplied: '0', 
      borrowed: '0',
      totalDeposits: '0',
      totalWithdrawals: '0',
      totalBorrows: '0',
      totalRepayments: '0',
    };
  }
  if (!requestRecords) {
    console.warn('getUserPosition: requestRecords not available');
    return { 
      supplied: '0', 
      borrowed: '0',
      totalDeposits: '0',
      totalWithdrawals: '0',
      totalBorrows: '0',
      totalRepayments: '0',
    };
  }

  try {
    // Request all UserActivity records from the wallet for lending_pool_v8.aleo
    // These are PRIVATE records - only visible to the wallet owner
    console.log('========================================');
    console.log('🔍 getUserPosition: RECORD FETCH DEBUG');
    console.log('========================================');
    console.log('Step 1: Calling requestRecords with program ID:', LENDING_POOL_PROGRAM_ID);
    console.log('User Address:', publicKey);
    console.log('requestRecords function type:', typeof requestRecords);
    
    // Request records from current program only (lending_pool_v8.aleo)
    let records: any[] | null = null;
    
    try {
      console.log('Requesting records for program:', LENDING_POOL_PROGRAM_ID);
      // requestRecords takes two parameters: (programId: string, includeSpent?: boolean)
      records = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
      console.log('requestRecords returned:', records?.length || 0, 'records');
      
      if (records && Array.isArray(records) && records.length > 0) {
        console.log('✅ Successfully got records from current program');
      } else {
        console.warn('⚠️ No records found for current program');
      }
    } catch (recordsError: any) {
      console.warn('requestRecords failed:', recordsError?.message);
      records = null;
    }
    
    console.log('Final records result:');
    console.log('  - Records:', records);
    console.log('  - Is Array:', Array.isArray(records));
    console.log('  - Records Count:', records?.length || 0);
    console.log('  - Records Type:', typeof records);
    console.log('  - Is Null:', records === null);
    console.log('  - Is Undefined:', records === undefined);
    console.log('  - Full Records (first 1000 chars):', JSON.stringify(records, null, 2).substring(0, 1000));
    console.log('========================================');
    
    // Check if records is null, undefined, or empty
    if (records === null || records === undefined) {
      console.error('❌ getUserPosition: requestRecords returned null or undefined');
      console.error('This might mean:');
      console.error('  1. The wallet has not indexed records yet');
      console.error('  2. requestRecords function is not working correctly');
      console.error('  3. Permission issue with the wallet');
      return { 
        supplied: '0', 
        borrowed: '0',
        totalDeposits: '0',
        totalWithdrawals: '0',
        totalBorrows: '0',
        totalRepayments: '0',
      };
    }
    
    if (!Array.isArray(records)) {
      console.error('❌ getUserPosition: requestRecords did not return an array');
      console.error('Returned type:', typeof records);
      console.error('Returned value:', records);
      // Try to convert to array if it's an object
      if (records && typeof records === 'object') {
        console.log('Attempting to convert object to array...');
        records = Object.values(records);
        console.log('Converted records:', records);
      } else {
        return { 
          supplied: '0', 
          borrowed: '0',
          totalDeposits: '0',
          totalWithdrawals: '0',
          totalBorrows: '0',
          totalRepayments: '0',
        };
      }
    }
    
    if (records.length === 0) {
      console.error('❌ getUserPosition: NO RECORDS FOUND (array is empty)');
      console.error('This means the wallet has not indexed the UserActivity record yet.');
      console.error('Solutions:');
      console.error('  1. Wait 10-30 seconds after transaction finalizes');
      console.error('  2. Disconnect and reconnect wallet');
      console.error('  3. Check if transaction actually completed on explorer');
      console.error('  4. Check wallet activity view to see if records are there');
      return { 
        supplied: '0', 
        borrowed: '0',
        totalDeposits: '0',
        totalWithdrawals: '0',
        totalBorrows: '0',
        totalRepayments: '0',
      };
    }

    // Calculate CUMULATIVE totals by summing ALL UserActivity records
    // Each transaction creates a new record with the transaction amount
    // Summing all records gives the cumulative total (matching the mappings)
    let cumulativeTotalDeposits = 0;
    let cumulativeTotalWithdrawals = 0;
    let cumulativeTotalBorrows = 0;
    let cumulativeTotalRepayments = 0;
    let recordsProcessed = 0;

    // Iterate through ALL records and sum them up
    console.log('📊 Processing', records.length, 'records...');
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        console.log(`\n--- Processing Record ${i + 1}/${records.length} ---`);
        console.log('Record type:', typeof record);
        console.log('Record:', record);
        
        let recordData: any;
        if (typeof record === 'string') {
          try {
            recordData = JSON.parse(record);
            console.log('Parsed from JSON string');
          } catch {
            recordData = { raw: record };
            console.log('Could not parse as JSON, treating as raw string');
          }
        } else {
          recordData = record;
          console.log('Record is already an object');
        }
        
        console.log('Record Data:', JSON.stringify(recordData, null, 2));
        console.log('Record Keys:', recordData ? Object.keys(recordData) : 'null');
        
        // Check if this is a UserActivity record - be more lenient
        const hasUserActivityFields = 
          (recordData.data && (
            recordData.data.total_deposits !== undefined || 
            recordData.data.total_withdrawals !== undefined ||
            recordData.data.total_borrows !== undefined ||
            recordData.data.total_repayments !== undefined
          )) ||
          (recordData.total_deposits !== undefined || 
           recordData.total_withdrawals !== undefined ||
           recordData.total_borrows !== undefined ||
           recordData.total_repayments !== undefined);
        
        const matchesProgram = 
          recordData.program_id === LENDING_POOL_PROGRAM_ID || 
          recordData.programId === LENDING_POOL_PROGRAM_ID ||
          recordData.program === LENDING_POOL_PROGRAM_ID;
        
        const isUserActivity = hasUserActivityFields || matchesProgram;
        
        console.log('Is UserActivity?', isUserActivity);
        console.log('  - Has UserActivity fields:', hasUserActivityFields);
        console.log('  - Matches program:', matchesProgram);
        
        if (isUserActivity || hasUserActivityFields) {
          console.log('✅ Found UserActivity record!');
          
          // Helper function to extract numeric value from various formats
          const extractValue = (value: any): number | undefined => {
            if (value === undefined || value === null) return undefined;
            
            // If it's already a number
            if (typeof value === 'number') {
              return isNaN(value) ? undefined : value;
            }
            
            // If it's a string, try to parse it
            if (typeof value === 'string') {
              // Handle formats like "100u64.private", "100u64", "100"
              // Remove ".private", ".public", "u64" suffixes
              const cleaned = value.replace(/\.(private|public)$/, '').replace(/u64$/, '').trim();
              const num = Number(cleaned);
              return isNaN(num) ? undefined : num;
            }
            
            return undefined;
          };
          
          // Try multiple possible record structures
          let totalDeposits: number | undefined;
          let totalWithdrawals: number | undefined;
          let totalBorrows: number | undefined;
          let totalRepayments: number | undefined;
          
          // Structure 1: recordData.data.total_deposits (nested data) - THIS IS THE ACTUAL FORMAT!
          if (recordData.data) {
            // Values are like "0u64.private" or "100u64.private"
            totalDeposits = extractValue(recordData.data.total_deposits);
            totalWithdrawals = extractValue(recordData.data.total_withdrawals);
            totalBorrows = extractValue(recordData.data.total_borrows);
            totalRepayments = extractValue(recordData.data.total_repayments);
            console.log('getUserPosition: Extracted from data - deposits:', totalDeposits, 'withdrawals:', totalWithdrawals, 'borrows:', totalBorrows, 'repayments:', totalRepayments);
          }
          
          // Structure 2: recordData.total_deposits (top level)
          if (totalDeposits === undefined && recordData.total_deposits !== undefined) {
            console.log('📦 Trying top-level total_deposits');
            totalDeposits = extractValue(recordData.total_deposits);
          }
          if (totalWithdrawals === undefined && recordData.total_withdrawals !== undefined) {
            totalWithdrawals = extractValue(recordData.total_withdrawals);
          }
          if (totalBorrows === undefined && recordData.total_borrows !== undefined) {
            totalBorrows = extractValue(recordData.total_borrows);
          }
          if (totalRepayments === undefined && recordData.total_repayments !== undefined) {
            totalRepayments = extractValue(recordData.total_repayments);
          }
          
          // Structure 3: Deep search in the object
          if (totalDeposits === undefined || totalWithdrawals === undefined || totalBorrows === undefined || totalRepayments === undefined) {
            const searchInObject = (obj: any, key: string): any => {
              if (!obj || typeof obj !== 'object') return undefined;
              if (key in obj) return obj[key];
              for (const k in obj) {
                if (typeof obj[k] === 'object') {
                  const found = searchInObject(obj[k], key);
                  if (found !== undefined) return found;
                }
              }
              return undefined;
            };
            
            if (totalDeposits === undefined) {
              totalDeposits = extractValue(searchInObject(recordData, 'total_deposits'));
            }
            if (totalWithdrawals === undefined) {
              totalWithdrawals = extractValue(searchInObject(recordData, 'total_withdrawals'));
            }
            if (totalBorrows === undefined) {
              totalBorrows = extractValue(searchInObject(recordData, 'total_borrows'));
            }
            if (totalRepayments === undefined) {
              totalRepayments = extractValue(searchInObject(recordData, 'total_repayments'));
            }
          }
          
          console.log('getUserPosition: Extracted values from record - deposits:', totalDeposits, 'withdrawals:', totalWithdrawals, 'borrows:', totalBorrows, 'repayments:', totalRepayments);
          
          // Sum up all values to get cumulative totals
          // Each record represents one transaction, so summing all gives cumulative
          if (totalDeposits !== undefined && !isNaN(totalDeposits)) {
            cumulativeTotalDeposits += totalDeposits;
          }
          if (totalWithdrawals !== undefined && !isNaN(totalWithdrawals)) {
            cumulativeTotalWithdrawals += totalWithdrawals;
          }
          if (totalBorrows !== undefined && !isNaN(totalBorrows)) {
            cumulativeTotalBorrows += totalBorrows;
          }
          if (totalRepayments !== undefined && !isNaN(totalRepayments)) {
            cumulativeTotalRepayments += totalRepayments;
          }
          
          recordsProcessed++;
          console.log('getUserPosition: Cumulative totals so far - deposits:', cumulativeTotalDeposits, 'withdrawals:', cumulativeTotalWithdrawals, 'borrows:', cumulativeTotalBorrows, 'repayments:', cumulativeTotalRepayments);
        }
      } catch (e) {
        // Skip records that can't be parsed
        console.warn('getUserPosition: Failed to parse record:', e, record);
      }
    }

    // Calculate net positions from the cumulative counters
    const calculatedNetSupplied = cumulativeTotalDeposits - cumulativeTotalWithdrawals;
    const calculatedNetBorrowed = cumulativeTotalBorrows - cumulativeTotalRepayments;

    console.log('========================================');
    console.log('📊 getUserPosition: CUMULATIVE TOTALS FROM RECORDS');
    console.log('========================================');
    console.log('📝 Records Processed:', recordsProcessed, 'out of', records.length);
    console.log('💰 Cumulative Activity Totals (Sum of All Records):');
    console.log('  - Total Deposits:', cumulativeTotalDeposits, '(sum of all deposit records)');
    console.log('  - Total Withdrawals:', cumulativeTotalWithdrawals, '(sum of all withdrawal records)');
    console.log('  - Total Borrows:', cumulativeTotalBorrows, '(sum of all borrow records)');
    console.log('  - Total Repayments:', cumulativeTotalRepayments, '(sum of all repay records)');
    console.log('📈 Net Positions:');
    console.log('  - Net Supplied:', calculatedNetSupplied, '(deposits - withdrawals)');
    console.log('  - Net Borrowed:', calculatedNetBorrowed, '(borrows - repayments)');
    console.log('========================================');
    console.log('ℹ️  Note: These are cumulative totals calculated by summing all UserActivity records.');
    console.log('ℹ️  Each transaction creates a new record, so summing all gives the cumulative total.');
    console.log('========================================');

    // Return net positions (for backward compatibility) and individual counters
    // All values are returned as strings for display
    return {
      supplied: String(calculatedNetSupplied >= 0 ? calculatedNetSupplied : 0), // Net supplied (deposits - withdrawals)
      borrowed: String(calculatedNetBorrowed >= 0 ? calculatedNetBorrowed : 0), // Net borrowed (borrows - repayments)
      totalDeposits: String(cumulativeTotalDeposits), // Cumulative deposits (sum of all records)
      totalWithdrawals: String(cumulativeTotalWithdrawals), // Cumulative withdrawals (sum of all records)
      totalBorrows: String(cumulativeTotalBorrows), // Cumulative borrows (sum of all records)
      totalRepayments: String(cumulativeTotalRepayments), // Cumulative repayments (sum of all records)
    };
  } catch (error) {
    console.error('getUserPosition: Failed to fetch user activity from private records:', error);
    return { 
      supplied: '0', 
      borrowed: '0',
      totalDeposits: '0',
      totalWithdrawals: '0',
      totalBorrows: '0',
      totalRepayments: '0',
    };
  }
}

/**
 * 1. Post Bounty
 */
export async function postBounty(
  caller: string,
  bountyId: number,
  reward: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${caller}.private`,
    `${reward}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'post_bounty',
    inputs,
  });
  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}

/**
 * 2. View Bounty by ID
 */
export async function viewBountyById(
  bountyId: number
): Promise<{ payment: number; status: number }> {
  const inputs = [`${bountyId}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'view_bounty_by_id',
    inputs,
  });

  // Fetch finalized data from the mappings
  const payment = await fetchMappingValue('bounty_output_payment', bountyId);
  const status = await fetchMappingValue('bounty_output_status', bountyId);

  return { payment, status };
}

/**
 * 3. Submit Proposal
 */
export async function submitProposal(
  caller: string,
  bountyId: number,
  proposalId: number,
  proposer: string
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${proposalId}.private`,
    `${proposer}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'submit_proposal',
    inputs,
  });
  return result.transactionId;
}

/**
 * 4. Accept Proposal
 */
export async function acceptProposal(
  caller: string,
  bountyId: number,
  proposalId: number,
  creator: string,
  reward: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${proposalId}.private`,
    `${creator}.private`,
    `${reward}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'accept_proposal',
    inputs,
  });
  return result.transactionId;
}

/**
 * 5. Delete Bounty
 */
export async function deleteBounty(
  caller: string,
  bountyId: number
): Promise<string> {
  const inputs = [`${caller}.private`, `${bountyId}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'delete_bounty',
    inputs,
  });
  return result.transactionId;
}

/**
 * 6. Wait for Transaction Finalization (best-effort)
 *
 * NOTE:
 * - Public Aleo RPC endpoints like `testnetbeta.aleorpc.com` do NOT currently
 *   expose a `getTransactionStatus` method, so we cannot poll precise status.
 * - Instead, we do a simple timed wait to give the network time to include
 *   and finalize the transaction, then return `false` if we timed out.
 *
 * This avoids noisy "Method not found" RPC errors while still giving the user
 * feedback that we're waiting a short period for finalization.
 */
export async function waitForTransactionToFinalize(
  _transactionId: string
): Promise<boolean> {
  const totalWaitMs = 15_000; // 15 seconds total wait
  const stepMs = 3_000; // check every 3 seconds
  let waited = 0;

  while (waited < totalWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    waited += stepMs;
    // We *could* add optional explorer polling here in the future.
  }

  // We don't know the real status, just that we've waited long enough.
  return false;
}


/**
 * 7. Transfer Payment
 */
export async function transfer(
  caller: string,
  receiver: string,
  amount: number
): Promise<string> {
  const inputs = [`${caller}.private`, `${receiver}.private`, `${amount}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'transfer',
    inputs,
  });
  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}


/**
 * Helper to Fetch Mapping Values
 */
export async function fetchMappingValue(
  mappingName: string,
  key: string | number // Allow both string and number
): Promise<number> {
  try {
    // Convert `key` to string if it's a number
    const keyString = typeof key === 'number' ? `${key}.public` : `${key}.public`;

    const result = await client.request('getMappingValue', {
      programId: BOUNTY_PROGRAM_ID,
      mappingName,
      key: keyString, // Always pass as a string
    });

    return parseInt(result.value, 10); // Parse as integer
  } catch (error) {
    console.error(
      `Failed to fetch mapping ${mappingName} with key ${key}:`,
      error
    );
    throw error;
  }
}

/**
 * Utility to Create JSON-RPC Client
 */
export function getClient(apiUrl: string): JSONRPCClient {
  const client: JSONRPCClient = new JSONRPCClient((jsonRPCRequest: any) =>
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(jsonRPCRequest),
    }).then((response) => {
      if (response.status === 200) {
        return response.json().then((jsonRPCResponse) =>
          client.receive(jsonRPCResponse)
        );
      }
      throw new Error(response.statusText);
    })
  );
  return client;
}

/**
 * Get Verifying Key for a Function
 */
async function getDeploymentTransaction(programId: string): Promise<any> {
  const response = await fetch(`${CURRENT_RPC_URL}find/transactionID/deployment/${programId}`);
  const deployTxId = await response.json();
  const txResponse = await fetch(`${CURRENT_RPC_URL}transaction/${deployTxId}`);
  const tx = await txResponse.json();
  return tx;
}

export async function getVerifyingKey(
  programId: string,
  functionName: string
): Promise<string> {
  const deploymentTx = await getDeploymentTransaction(programId);

  const allVerifyingKeys = deploymentTx.deployment.verifying_keys;
  const verifyingKey = allVerifyingKeys.filter((vk: any) => vk[0] === functionName)[0][1][0];
  return verifyingKey;
}

export async function getProgram(programId: string, apiUrl: string): Promise<string> {
  const client = getClient(apiUrl);
  const program = await client.request('program', {
    id: programId
  });
  return program;
}


//Deny a proposal

export async function denyProposal(
  caller: string,
  bountyId: number,
  proposalId: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,   
    `${bountyId}.private`, 
    `${proposalId}.private` 
  ];
    
    const result = await client.request('executeTransition', {
      programId: BOUNTY_PROGRAM_ID,
      functionName: 'deny_proposal', 
      inputs, 
    });

    return result.transactionId;
}