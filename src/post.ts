import { setFailed } from '@actions/core'
import { mkdirP, mv, cp, rmRF } from '@actions/io'
import path from 'path'
import glob from 'glob'

import { getVars } from './lib/getVars'
import { isErrorLike } from './lib/isErrorLike'
import log from './lib/log'
import { exists } from '@actions/io/lib/io-util'

async function savePath(sourcePath: string, cachePath: string, strategy: string): Promise<void> {
  // Handle wildcards
  if (sourcePath.includes('*')) {
    const files = await glob(sourcePath, { dot: true })
    if (files.length === 0) {
      log.info(`No files found matching pattern: ${sourcePath}`)
      return
    }

    // Create the cache directory
    await mkdirP(path.dirname(cachePath))

    // Copy each matched file
    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file)
      const targetCachePath = path.join(path.dirname(cachePath), relativePath)
      await mkdirP(path.dirname(targetCachePath))

      switch (strategy) {
        case 'copy-immutable':
          if (await exists(targetCachePath)) {
            log.info(`Cache already exists for ${relativePath}, skipping`)
            continue
          }
          await cp(file, targetCachePath, { copySourceDirectory: false, recursive: true })
          break
        case 'copy':
          await rmRF(targetCachePath)
          await cp(file, targetCachePath, { copySourceDirectory: false, recursive: true })
          break
        case 'move':
          await mv(file, targetCachePath, { force: true })
          break
      }
    }
    return
  }

  // Handle regular paths
  switch (strategy) {
    case 'copy-immutable':
      if (await exists(cachePath)) {
        log.info(`Cache already exists for ${sourcePath}, skipping`)
        return
      }
      await cp(sourcePath, cachePath, { copySourceDirectory: true, recursive: true })
      break
    case 'copy':
      await rmRF(cachePath)
      await cp(sourcePath, cachePath, { copySourceDirectory: true, recursive: true })
      break
    case 'move':
      await mv(sourcePath, cachePath, { force: true })
      break
  }
}

async function post(): Promise<void> {
  try {
    const { cacheDir, targetPaths, cachePath, options } = getVars()

    await mkdirP(cacheDir)

    // Save primary path
    await savePath(targetPaths[0], cachePath, options.strategy)
    log.info(`Primary path ${options.paths[0]} saved to cache with ${options.strategy} strategy`)

    // Save additional paths if any
    if (options.paths.length > 1) {
      for (let i = 1; i < options.paths.length; i++) {
        const pathCachePath = path.join(path.dirname(cachePath), options.paths[i])
        await savePath(targetPaths[i], pathCachePath, options.strategy)
        log.info(
          `Additional path ${options.paths[i]} saved to cache with ${options.strategy} strategy`
        )
      }
    }
  } catch (error: unknown) {
    log.trace(error)
    setFailed(isErrorLike(error) ? error.message : `unknown error: ${error}`)
  }
}

void post()
