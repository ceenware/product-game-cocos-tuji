# Task 4 Report: 参数化修补 Cocos vivo 导出

## Scope

Implemented only the Task 4 code and test files:

- `platforms/vivo/lib/cocos-build-patch.js`
- `platforms/vivo/scripts/patch-cocos-build.js`
- `platforms/vivo/tests/cocos-build-patch.test.js`

The patch consumes the caller-provided release config and VersionInfo object. It writes only `cocos.compile.config.json` and `src/manifest.json` below the supplied Cocos export directory.

## TDD Evidence

### RED 1: missing patch module

Command:

```text
node --test platforms/vivo/tests/cocos-build-patch.test.js
```

Result: failed as expected before production code existed:

```text
Error: Cannot find module '../lib/cocos-build-patch'
```

### GREEN 1: core patch behavior

After adding `cocos-build-patch.js`, the same focused command passed:

```text
2 tests
2 pass
0 fail
```

### RED 2: missing CLI

After adding the CLI behavior test, the focused command failed as expected because the CLI file did not exist:

```text
2 pass
1 fail
Error: Cannot find module '/Users/vicky/Documents/Github/火线-vivo/platforms/vivo/scripts/patch-cocos-build.js'
```

### GREEN 2: CLI behavior

After adding `patch-cocos-build.js`, the focused command passed:

```text
3 tests
3 pass
0 fail
```

## Verification

Full Node suite:

```text
npm run test:node --prefix platforms/vivo
```

Result:

```text
14 tests
14 pass
0 fail
```

Diff whitespace check:

```text
git diff --check
```

Result: passed with no output.

## Implementation Review

- Rejects exports unless both `compile.platform === 'vivo-mini-game'` and `compile.buildEngineParam.platform === 'VIVO'`.
- Performs the platform check before any file mutation; the test also verifies that the wrong-platform fixture remains unchanged.
- Discovers the engine file from `src/cocos-js` using `/^cc(?:\.[^.]+)?\.js$/` and requires exactly one match before writing JSON.
- Uses `config.packageName` and `config.minPlatformVersion`; no release values are duplicated in production code.
- Uses the supplied `version.versionName` and `version.versionCode` for compile config and manifest fields.
- Preserves a trailing newline for both JSON outputs.
- CLI resolves all three paths, loads the shared release config through `lib/config.js`, loads the version JSON, and forwards patch errors with a nonzero exit code.

## Concerns

The temporary test fixture was sufficient and did not block Task 4: it creates every required export file and exercises the hashed engine filename, JSON outputs, and CLI invocation. No real Cocos Creator export was available for integration testing in this worktree, so only that external integration check remains unexecuted; it does not block the focused or full Node suites.

## Fix Round 1

### Reviewer finding 1: partial mutation

Root cause: the first implementation wrote `cocos.compile.config.json` before reading `src/manifest.json`. A malformed manifest therefore left the compile file rewritten even though the patch failed.

Fix:

- Read and validate both JSON files as objects before any mutation is written.
- Validate the vivo platform anchors and `packages.vivo-mini-game` anchor before writing.
- Discover and require exactly one `cc*.js` engine bundle before writing.
- Prepare both in-memory JSON objects before either `writeJson` call.

Regression coverage: a malformed manifest test records the original bytes of both JSON files, asserts a `SyntaxError`, and verifies both files are byte-for-byte unchanged.

### Reviewer finding 2: dynamic discovery negative coverage

Added separate zero-match and multiple-match tests. Each asserts the exact-one discovery error and verifies that both JSON files remain byte-for-byte unchanged. The implementation retains directory-based matching with `/^cc(?:\.[^.]+)?\.js$/` and no fixed engine filename.

### TDD and verification evidence

RED after adding the three regression tests and before the ordering fix:

```text
6 tests
5 pass
1 fail
```

The failing test was the malformed-manifest regression and showed the compile bytes had changed. The zero- and multiple-match cases already passed because engine discovery was previously before the first write.

GREEN after the fix:

```text
node --test platforms/vivo/tests/cocos-build-patch.test.js
6 tests
6 pass
0 fail
```

Full Node suite:

```text
npm run test:node --prefix platforms/vivo
17 tests
17 pass
0 fail
```

`git diff --check` passed with no output. No fixture detail blocked the fix; the only remaining limitation is the absence of a real Cocos Creator export for integration testing.
