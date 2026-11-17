/**
 * A tiny symbolic-stack helper for writing CashAssembly by hand.
 * It tracks named stack items so OP_PICK / OP_ROLL depths are computed,
 * never typed in by hand. It does not optimise beyond the obvious cases.
 */
import { binToHex } from '@bitauth/libauth';

export class Asm {
  readonly ops: string[] = [];
  readonly stack: string[];
  private tmp = 0;

  constructor(initial: readonly string[] = []) {
    this.stack = [...initial];
  }

  /** Raw opcodes whose stack effect the caller states explicitly. */
  raw(code: string, consumes: number, produces: readonly string[] = []): this {
    this.ops.push(code);
    this.popN(consumes);
    this.stack.push(...produces);
    return this;
  }

  num(value: bigint | number, name = this.fresh()): this {
    this.ops.push(`<${BigInt(value).toString()}>`);
    this.stack.push(name);
    return this;
  }

  bytes(value: Uint8Array, name = this.fresh()): this {
    this.ops.push(value.length === 0 ? 'OP_0' : `<0x${binToHex(value)}>`);
    this.stack.push(name);
    return this;
  }

  depth(name: string): number {
    const i = this.stack.lastIndexOf(name);
    if (i < 0) throw new Error(`asm: no stack item named ${name} in [${this.stack.join(' ')}]`);
    return this.stack.length - 1 - i;
  }

  has(name: string): boolean {
    return this.stack.includes(name);
  }

  /** Copy a named item to the top. */
  pick(name: string, as = this.fresh()): this {
    const d = this.depth(name);
    this.ops.push(d === 0 ? 'OP_DUP' : d === 1 ? 'OP_OVER' : `<${d}> OP_PICK`);
    this.stack.push(as);
    return this;
  }

  /** Move a named item to the top (consuming it from its old place). */
  roll(name: string, as?: string): this {
    const d = this.depth(name);
    if (d === 1) this.ops.push('OP_SWAP');
    else if (d === 2) this.ops.push('OP_ROT');
    else if (d > 2) this.ops.push(`<${d}> OP_ROLL`);
    const i = this.stack.length - 1 - d;
    const [item] = this.stack.splice(i, 1);
    this.stack.push(as ?? (item as string));
    return this;
  }

  /** Bring an operand to the top: roll it when this is its last use, otherwise pick. */
  get(name: string, last = false): this {
    return last ? this.roll(name) : this.pick(name);
  }

  /** Remove a named item. */
  drop(name: string): this {
    const d = this.depth(name);
    if (d === 0) this.ops.push('OP_DROP');
    else if (d === 1) this.ops.push('OP_NIP');
    else {
      this.roll(name);
      this.ops.push('OP_DROP');
      this.stack.pop();
      return this;
    }
    this.stack.splice(this.stack.length - 1 - d, 1);
    return this;
  }

  rename(name: string, to: string): this {
    const i = this.stack.lastIndexOf(name);
    if (i < 0) throw new Error(`asm: rename missing ${name}`);
    this.stack[i] = to;
    return this;
  }

  /** Name the current top item. */
  name(to: string): this {
    if (this.stack.length === 0) throw new Error('asm: empty stack');
    this.stack[this.stack.length - 1] = to;
    return this;
  }

  top(): string {
    const t = this.stack[this.stack.length - 1];
    if (t === undefined) throw new Error('asm: empty stack');
    return t;
  }

  /** OP_INVOKE a defined function with a known stack effect. */
  invoke(id: number, consumes: number, produces: readonly string[]): this {
    return this.raw(`<${id}> OP_INVOKE`, consumes, produces);
  }

  assertStack(expected: readonly string[]): void {
    const tail = this.stack.slice(this.stack.length - expected.length);
    if (tail.join(' ') !== expected.join(' ')) {
      throw new Error(`asm: expected top [${expected.join(' ')}], got [${tail.join(' ')}]`);
    }
  }

  source(): string {
    return this.ops.join('\n');
  }

  private popN(n: number): void {
    if (n > this.stack.length) throw new Error(`asm: underflow popping ${n} from [${this.stack.join(' ')}]`);
    this.stack.length -= n;
  }

  private fresh(): string {
    this.tmp += 1;
    return `$${this.tmp}`;
  }
}
