# solidcash

A SolidCash project powered by [SolidHat](https://www.npmjs.com/package/@solidcash/solidhat).

## Get started

```sh
npm install
npm run solidhat:compile
npm run solidhat:test
npm run solidhat:deploy -- --network regtest
```

The included `Counter.scash` and `Counter.test.ts` demonstrate artifact and factory resolution.

## Project layout

```text
contracts/                 SolidCash source files
test/                      Vitest contract tests
scripts/deploy.ts          Network-selectable deployment script
solidcash.config.ts        Compiler, paths, and network settings
vitest.solidhat.config.ts  Hardhat/Ethers compatibility aliases
artifacts/solidcash/        Generated contract artifacts
typechain-types/            Generated Ethers 6 contract bindings
```

The incremental compile cache lives in `~/.cache/solidcash`, outside the project.

This project targets Hardhat 3 and Ethers 6 compatibility through the tree-shakeable `@solidcash/solidhat/hardhat3` and `@solidcash/solidhat/ethers6` entry points.

## Commands

- `npm run solidhat:compile` compiles the whole dependency graph, reuses unchanged roots, and updates bindings.
- `npm run solidhat:typegen` regenerates bindings from existing artifacts.
- `npm run solidhat:test` compiles first, then runs tests with `vitest.solidhat.config.ts`.
- `npm run solidhat:deploy -- --network regtest` runs the conventional deployment script against BCHN regtest.
- `npm run solidhat:clean` removes generated artifacts, cache data, and configured bindings.

EVM artifacts and Hardhat configuration can coexist with these namespaced outputs.
