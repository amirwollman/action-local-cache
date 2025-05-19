import { setFailed } from '@actions/core'
import { mkdirP, mv, cp, rmRF } from '@actions/io'
import path from 'path'
import fs from 'fs'
import { promisify } from 'util'
import glob from 'glob'

import { getVars } from './lib/getVars'
import { isErrorLike } from './lib/isErrorLike'
import log from './lib/log'
import { exists } from '@actions/io/lib/io-util'

const globPromise = promisify(glob)

async function savePath(sourcePath: string, cachePath: string, strategy: string): Promise<void> {
  // Handle wildcards
  if (sourcePath.includes('*')) {
    const files = await globPromise(sourcePath)
    if (files.length === 0) {
      log.info(`No files found matching pattern: ${sourcePath}`)
      return
    }

    // Create the cache directory
    await mkdirP(path.dirname(cachePath))

    // Copy each matched file
    for (const file of files) {
      // Get the relative path from the workspace root
      const relativePath = path.relative(process.cwd(), file)
      // Create the target path in the cache, preserving the directory structure
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
    const { cacheDir, targetPaths, options } = getVars()

    await mkdirP(cacheDir)

    // Save all paths
    for (let i = 0; i < options.paths.length; i++) {
      const relativePath = options.paths[i]
      // Preserve the full relative path structure
      const pathCachePath = path.join(cacheDir, relativePath)
      await savePath(targetPaths[i], pathCachePath, options.strategy)
      log.info(
        `${i === 0 ? 'Primary' : 'Additional'} path ${relativePath} saved to cache with ${
          options.strategy
        } strategy`
      )
    }
  } catch (error: unknown) {
    log.trace(error)
    setFailed(isErrorLike(error) ? error.message : `unknown error: ${error}`)
  }
}

void post()
