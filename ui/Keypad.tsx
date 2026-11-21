'use client';
import { Delete } from 'lucide-react';

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','del'] as const;
  return (
    <div className="keys" role="group" aria-label="Number pad">
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => onKey(k)} aria-label={k === 'del' ? 'Delete' : k}>
          {k === 'del' ? <Delete size={22} aria-hidden /> : k}
        </button>
      ))}
    </div>
  );
}

export const applyKey = (current: string, key: string): string => {
  if (key === 'del') return current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : (current || '0') + '.';
  if (current === '0' && key !== '.') return key;
  const [w, f] = (current + key).split('.');
  if (f && f.length > 8) return current;
  return current + key;
};
