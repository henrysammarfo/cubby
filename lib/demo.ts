export const DEMO_ADDRESS = 'bchtest:pwh5d9m9akqawmr4aczes0auk426kkftpsthn99tqex3xdatjc7zsdcfzwewk';
export const DEMO_DEPOSIT = '8f9e1dd30944559c095e43ab911551dd14acafe32abfa199d58238cc0948f5e7';
export const DEMO_SPEND = '2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993';
export const DEMO_FAUCET = '0f44dde17217258290fd77d4a926cde5d654503d49080fac811cfeeaa34bb149';
export const DEMO_SPEND_TO = 'bchtest:qpl93ln6r425c60fqhc25sf4sh59fmwwrufym39tj0';
/** Real amounts from the chipnet explorer for the proof spend, 21 Nov 2026 14:50 Accra (UTC+0). */
export const DEMO_DEPOSIT_SATS = 1_016_741n;
export const DEMO_SENT_SATS = 1_005_741n;
export const DEMO_FEE_SATS = 11_000n;
export const DEMO_TIME = 1_795_272_646;

export type DemoReplay = 'funded' | 'spent';

export const demoReplayFromSearch = (q: { get: (k: string) => string | null }): DemoReplay =>
  q.get('replay') === 'spent' ? 'spent' : 'funded';

export const demoReplaySats = (step: DemoReplay): bigint => (step === 'spent' ? 0n : DEMO_DEPOSIT_SATS);

export const demoReplayTxs = (step: DemoReplay) => {
  const deposit = {
    txid: DEMO_DEPOSIT,
    kind: 'in' as const,
    satoshis: DEMO_DEPOSIT_SATS,
    time: DEMO_TIME,
    confirmations: 162,
  };
  const spend = {
    txid: DEMO_SPEND,
    kind: 'out' as const,
    satoshis: DEMO_SENT_SATS,
    time: DEMO_TIME,
    confirmations: 162,
    feeSats: DEMO_FEE_SATS,
    counterparty: DEMO_SPEND_TO,
  };
  return step === 'spent' ? [spend, deposit] : [deposit];
};
