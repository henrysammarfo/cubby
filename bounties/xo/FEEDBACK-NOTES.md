# Facts observed while building (for Henry to write his own feedback; do not submit this text)

- Byte variables: `compileLockingBytecodeFromTemplateLockingScriptIdentifier` wants hex strings. A Uint8Array there was silently turned into the text "118,169,..." and compiled to a wrong address, with no error.
- `compileCashAssemblyString` is the opposite: hex strings are treated as UTF-8 text, and raw Uint8Array is correct.
- `compileCashAssemblySourceToBytes` is referenced in the docs but not exported from `@xo-cash/utils`.
- `parseTemplate` accepted a P2SH lock whose redeem script is a 215-byte raw hex literal plus four pushed variables. Follow-up actions on the locking script worked as documented.
- `Engine.create` fails offline with "Cannot bootstrap the header accumulator: no electrum clients are connected". There is no offline or mock mode for testing invitations without Electrum.
- Chipnet Electrum only listens on 50001 to 50004 (TCP/TLS/WS/WSS). Networks that allow only 443 cannot use the engine.
- No built-in way to model an input unlocked by an external signer (here a WebAuthn passkey vault). It has to come in as a commit with its own unlocking bytecode.
- The packages are on npm "next" tags: engine 0.1.1-next.18230317763, utils 0.0.12, types 0.0.9.
