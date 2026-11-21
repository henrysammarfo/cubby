export function StatusChip({ confirmations }: { confirmations?: number }) {
  if (confirmations === undefined) return <span className="status-chip chip wait">Waiting</span>;
  if (confirmations <= 0) return <span className="status-chip chip wait">In the mempool</span>;
  if (confirmations === 1) return <span className="status-chip chip ok">1 confirmation</span>;
  return <span className="status-chip chip ok">{confirmations.toLocaleString()} confirmations</span>;
}
