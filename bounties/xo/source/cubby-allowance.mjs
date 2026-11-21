// XO template for the Cubby Allowance jar (the SolidCash contract in ../solidcash/contracts/CubbyAllowance.scash).
// The jar bytecode below is the solidc 0.51.1 output, unchanged, so XO and the Cubby app lock coins to the same address.
// Generated hex source of truth: src/bounties/allowance-artifact.ts (ALLOWANCE_BYTECODE_HEX).
import { ALLOWANCE_BYTECODE_HEX, ALLOWANCE_SELECTORS } from './allowance-bytecode.mjs';

const none = { satoshis: 0n, fungibleTokens: 0n, nonfungibleTokens: 0 };

export const cubbyAllowanceTemplate = {
  $schema: 'https://libauth.org/schemas/wallet-template-v0.schema.json',
  name: 'Cubby Allowance',
  description: 'A pocket money jar. It pays a set allowance to a child once per period, and only the owner\u2019s Cubby passkey vault can top it up, change it, or close it.',
  icon: 'jar',
  version: '1',
  supported: ['BCH_2026_05'],
  resources: [
    { name: 'Cubby', description: 'Seedless BCH vault opened with a passkey checked on chain.', url: 'https://cubby-liart-six.vercel.app' },
    { name: 'SolidCash source', description: 'CubbyAllowance.scash, compiled with solidc 0.51.1.', url: 'https://github.com/henrysammarfo/cubby/tree/bounties/bounties/solidcash' },
  ],

  roles: {
    owner: { name: 'Owner', description: 'The parent. Funds and manages the jar from their Cubby vault.', icon: 'owner' },
    child: { name: 'Child', description: 'Receives the allowance.', icon: 'child' },
    claimer: { name: 'Claimer', description: 'Anyone who pulls the allowance for the child. The money can only go to the child.', icon: 'claimer' },
  },

  start: [{ action: 'createJar', role: 'owner' }],

  actions: {
    createJar: {
      name: 'Start a pocket money jar',
      description: 'Lock coins in a jar that pays the child once per period.',
      icon: 'jar',
      roles: {
        owner: {
          requirements: { variables: ['ownerVaultLock', 'childLock', 'allowance', 'periodBlocks', 'fundSatoshis'] },
        },
      },
      requirements: { participants: [{ role: 'owner', slots: { min: 1, max: 1 } }] },
      transaction: 'createJarTransaction',
    },
    claimAllowance: {
      name: 'Pay this period\u2019s allowance',
      description: 'Pay one allowance to the child and put the rest back in the jar.',
      icon: 'drip',
      roles: { claimer: { requirements: { variables: ['jarSatoshis'] } } },
      requirements: { participants: [{ role: 'claimer', slots: { min: 1, max: 1 } }] },
      transaction: 'claimTransaction',
    },
    claimLast: {
      name: 'Pay what is left',
      description: 'When less than one allowance is left, pay all of it to the child.',
      icon: 'drip',
      roles: { claimer: { requirements: { variables: ['jarSatoshis'] } } },
      requirements: { participants: [{ role: 'claimer', slots: { min: 1, max: 1 } }] },
      transaction: 'claimLastTransaction',
    },
    manageJar: {
      name: 'Top up or close the jar',
      description: 'Spend the owner\u2019s Cubby vault in the same transaction. The vault checks the passkey signed every output.',
      icon: 'owner',
      roles: { owner: { requirements: { variables: ['jarSatoshis', 'newJarSatoshis', 'vaultSatoshis', 'vaultFeeSatoshis'] } } },
      requirements: { participants: [{ role: 'owner', slots: { min: 1, max: 1 } }] },
      transaction: 'manageTransaction',
    },
  },

  transactions: {
    createJarTransaction: {
      name: 'Pocket money jar started',
      description: 'Put $(<fundSatoshis>) satoshis in a jar that pays $(<allowance>) every $(<periodBlocks>) blocks.',
      icon: 'jar',
      inputs: [],
      outputs: [{ output: 'jarOutput', outputIndex: 0 }],
      composable: true,
    },
    claimTransaction: {
      name: 'Allowance paid',
      description: 'Paid $(<allowance>) satoshis to the child.',
      icon: 'drip',
      version: 2,
      inputs: [{ input: 'jarClaimInput', inputIndex: 0 }],
      outputs: [
        { output: 'childPayout', outputIndex: 0 },
        { output: 'jarChange', outputIndex: 1 },
      ],
    },
    claimLastTransaction: {
      name: 'Last allowance paid',
      description: 'Paid the rest of the jar to the child.',
      icon: 'drip',
      version: 2,
      inputs: [{ input: 'jarClaimInput', inputIndex: 0 }],
      outputs: [{ output: 'childPayoutLast', outputIndex: 0 }],
    },
    manageTransaction: {
      name: 'Jar managed',
      description: 'The owner set the jar to $(<newJarSatoshis>) satoshis.',
      icon: 'owner',
      version: 2,
      inputs: [
        { input: 'ownerVaultInput', inputIndex: 0 },
        { input: 'jarManageInput', inputIndex: 1 },
      ],
      outputs: [
        { output: 'jarOutputManaged', outputIndex: 0 },
        { output: 'vaultChange', outputIndex: 1 },
      ],
    },
  },

  inputs: {
    jarClaimInput: {
      name: 'Jar coins',
      description: 'The jar coin, aged at least one period.',
      icon: 'jar',
      valueSatoshis: '$(<jarSatoshis>)',
      token: null,
      // BIP68 relative lock: the contract checks this.age >= periodBlocks with OP_CHECKSEQUENCEVERIFY.
      sequenceNumber: '$(<periodBlocks>)',
      unlockingScript: 'jarClaimUnlock',
    },
    jarManageInput: {
      name: 'Jar coins',
      description: 'The jar coin being topped up or closed.',
      icon: 'jar',
      valueSatoshis: '$(<jarSatoshis>)',
      token: null,
      unlockingScript: 'jarManageUnlock',
    },
    ownerVaultInput: {
      name: 'Owner\u2019s Cubby vault',
      description: 'Unlocked by the owner\u2019s passkey outside XO: the passkey signs a hash of every output, and the vault script checks it on chain. Added as a commit with its own unlocking bytecode, after the outputs are final.',
      icon: 'owner',
      valueSatoshis: '$(<vaultSatoshis>)',
      token: null,
    },
  },

  outputs: {
    jarOutput: {
      name: 'Pocket money jar',
      description: '$(<fundSatoshis>) satoshis for the child.',
      icon: 'jar',
      lockingScript: 'allowanceJar',
      valueSatoshis: '$(<fundSatoshis>)',
      token: null,
    },
    jarOutputManaged: {
      name: 'Pocket money jar',
      description: '$(<newJarSatoshis>) satoshis for the child.',
      icon: 'jar',
      lockingScript: 'allowanceJar',
      valueSatoshis: '$(<newJarSatoshis>)',
      token: null,
    },
    jarChange: {
      name: 'Pocket money jar',
      description: 'What is left in the jar after this period.',
      icon: 'jar',
      lockingScript: 'allowanceJar',
      valueSatoshis: '$(<jarSatoshis> <allowance> OP_SUB <minerFeeSatoshis> OP_SUB)',
      token: null,
    },
    childPayout: {
      name: 'Allowance',
      description: '$(<allowance>) satoshis for the child.',
      icon: 'drip',
      lockingScript: '$(<childLock>)',
      valueSatoshis: '$(<allowance>)',
      token: null,
    },
    childPayoutLast: {
      name: 'Last allowance',
      description: 'Everything left in the jar, for the child.',
      icon: 'drip',
      lockingScript: '$(<childLock>)',
      valueSatoshis: '$(<jarSatoshis> <minerFeeSatoshis> OP_SUB)',
      token: null,
    },
    vaultChange: {
      name: 'Back to the vault',
      description: 'The rest returns to the owner\u2019s Cubby vault.',
      icon: 'owner',
      lockingScript: '$(<ownerVaultLock>)',
      valueSatoshis: '$(<vaultSatoshis> <jarSatoshis> OP_ADD <newJarSatoshis> OP_SUB <vaultFeeSatoshis> OP_SUB)',
      token: null,
    },
  },

  lockingScripts: {
    allowanceJar: {
      name: 'Cubby Allowance jar',
      description: 'Pays $(<allowance>) satoshis to the child every $(<periodBlocks>) blocks. Only the owner\u2019s Cubby vault can change it.',
      icon: 'jar',
      lockingType: 'p2sh',
      lockingBytecode: 'jarRedeem',
      selectable: false,
      balance: none,
      state: { variables: ['ownerVaultLock', 'childLock', 'allowance', 'periodBlocks'], secrets: [] },
      // Follow-up actions on every jar coin, including the change a claim puts back.
      actions: [
        { action: 'claimAllowance', role: 'claimer' },
        { action: 'claimLast', role: 'claimer' },
        { action: 'manageJar', role: 'owner' },
      ],
    },
  },

  scripts: {
    // Constructor arguments in reverse declaration order, then the compiled SolidCash bytecode (raw hex literal).
    jarRedeem: `<periodBlocks> <allowance> <childLock> <ownerVaultLock> 0x${ALLOWANCE_BYTECODE_HEX}`,
    jarClaimUnlock: `<0x${ALLOWANCE_SELECTORS.claim}> <jarRedeem>`,
    jarManageUnlock: `<0x${ALLOWANCE_SELECTORS.manage}> <jarRedeem>`,
  },

  constants: {
    minerFeeSatoshis: { name: 'Network fee', description: 'Fixed fee the jar pays on each claim (MINER_FEE in the contract).', type: 'satoshis', value: 1000n },
  },

  variables: {
    ownerVaultLock: { name: 'Owner vault', description: 'Locking script of the owner\u2019s Cubby vault.', type: 'locking_script' },
    childLock: { name: 'Child', description: 'Where the allowance goes.', type: 'locking_script' },
    allowance: { name: 'Allowance', description: 'Satoshis paid each period.', type: 'satoshis' },
    periodBlocks: { name: 'Blocks per period', description: 'How many blocks the jar waits between payments (about 144 a day).', type: 'integer' },
    fundSatoshis: { name: 'Starting amount', description: 'Satoshis put in the jar.', type: 'satoshis' },
    jarSatoshis: { name: 'Jar amount', description: 'Satoshis in the jar coin being spent.', type: 'satoshis' },
    newJarSatoshis: { name: 'New jar amount', description: 'Satoshis in the jar after the owner\u2019s change.', type: 'satoshis' },
    vaultSatoshis: { name: 'Vault amount', description: 'Satoshis in the owner\u2019s vault coin.', type: 'satoshis' },
    vaultFeeSatoshis: { name: 'Vault fee', description: 'Network fee for the passkey-checked spend (about 1 satoshi per byte of a 10 kB transaction).', type: 'satoshis' },
  },

  icons: [
    { name: 'jar', hash: '0000000000000000000000' },
    { name: 'drip', hash: '0000000000000000000000' },
    { name: 'owner', hash: '0000000000000000000000' },
    { name: 'child', hash: '0000000000000000000000' },
    { name: 'claimer', hash: '0000000000000000000000' },
  ],
};
