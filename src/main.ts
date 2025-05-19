import { setFailed, setOutput } from '@actions/core'
import { mkdirP, mv, cp } from '@actions/io/'
import { exists } from '@actions/io/lib/io-util'
import path from 'path'

import { getVars } from './lib/getVars'
import { isErrorLike } from './lib/isErrorLike'
import log from './lib/log'

async function tryRestoreCache(
  cachePath: string,
  targetPath: string,
  targetDir: string,
  strategy: string
): Promise<boolean> {
  if (await exists(cachePath)) {
    await mkdirP(targetDir)

    switch (strategy) {
      case 'copy-immutable':
      case 'copy':
        await cp(cachePath, targetPath, {
          copySourceDirectory: false,
          recursive: true,
        })
        break
      case 'move':
        await mv(cachePath, targetPath, { force: true })
        break
    }
    return true
  }
  return false
}

async function main(): Promise<void> {
  try {
    const { cacheDir, targetDirs, targetPaths, options } = getVars()
    let cacheHit = false

    // Try primary key first
    const primaryCachePath = path.join(cacheDir, options.paths[0])
    if (await tryRestoreCache(primaryCachePath, targetPaths[0], targetDirs[0], options.strategy)) {
      cacheHit = true
      log.info(`Cache found and restored to ${options.paths[0]} with ${options.strategy} strategy`)
    } else {
      // Try restore-keys
      for (const restoreKey of options.restoreKeys) {
        const restoreCachePath = path.join(cacheDir, restoreKey, options.paths[0])
        if (
          await tryRestoreCache(restoreCachePath, targetPaths[0], targetDirs[0], options.strategy)
        ) {
          cacheHit = true
          log.info(
            `Cache found with restore-key ${restoreKey} and restored to ${options.paths[0]} with ${options.strategy} strategy`
          )
          break
        }
      }
    }

    // Handle additional paths if primary path was restored
    if (cacheHit && options.paths.length > 1) {
      for (let i = 1; i < options.paths.length; i++) {
        const relativePath = options.paths[i]
        const pathCachePath = path.join(cacheDir, relativePath)
        if (await tryRestoreCache(pathCachePath, targetPaths[i], targetDirs[i], options.strategy)) {
          log.info(`Additional path ${relativePath} restored with ${options.strategy} strategy`)
        }
      }
    }

    if (!cacheHit) {
      log.info(`Skipping: cache not found for ${options.paths.join(', ')}.`)
    }

    setOutput('cache-hit', cacheHit)
  } catch (error: unknown) {
    console.trace(error)
    setFailed(isErrorLike(error) ? error.message : `unknown error: ${error}`)
  }
}

void main()
