import path from 'path'

import * as core from '@actions/core'

const { GITHUB_REPOSITORY, RUNNER_CACHE_DIR, RUNNER_TOOL_CACHE } = process.env
const CWD = process.cwd()

export const STRATEGIES = ['copy-immutable', 'copy', 'move'] as const
export type Strategy = (typeof STRATEGIES)[number]

type Vars = {
  cacheDir: string
  cachePath: string
  options: {
    key: string
    restoreKeys: string[]
    paths: string[]
    strategy: Strategy
    cacheLocation?: string
  }
  targetDirs: string[]
  targetPaths: string[]
}

export const getVars = (): Vars => {
  if (!RUNNER_TOOL_CACHE) {
    throw new TypeError('Expected RUNNER_TOOL_CACHE environment variable to be defined.')
  }

  if (!GITHUB_REPOSITORY) {
    throw new TypeError('Expected GITHUB_REPOSITORY environment variable to be defined.')
  }

  const options = {
    key: core.getInput('key') || 'no-key',
    restoreKeys: core.getInput('restore-keys')
      ? core
          .getInput('restore-keys')
          .split('\n')
          .map((k: string) => k.trim())
      : [],
    paths: core
      .getInput('path')
      .split('\n')
      .map((p: string) => p.trim()),
    strategy: core.getInput('strategy') as Strategy,
    cacheLocation: core.getInput('cache-location'),
  }

  if (!options.paths.length) {
    throw new TypeError('path is required but was not provided.')
  }

  if (!Object.values(STRATEGIES).includes(options.strategy)) {
    throw new TypeError(`Unknown strategy ${options.strategy}`)
  }

  const baseCacheDir = options.cacheLocation || RUNNER_CACHE_DIR || path.join(RUNNER_TOOL_CACHE, GITHUB_REPOSITORY)
  const cacheDir = path.join(baseCacheDir, options.key)
  const cachePath = path.join(cacheDir, options.paths[0]) // Primary path for cache
  const targetPaths = options.paths.map((p: string) => path.resolve(CWD, p))
  const targetDirs = targetPaths.map((p: string) => path.parse(p).dir)

  return {
    cacheDir,
    cachePath,
    options,
    targetDirs,
    targetPaths,
  }
}
