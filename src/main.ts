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

    // Try to restore all paths
    for (let i = 0; i < options.paths.length; i++) {
      const relativePath = options.paths[i]
      // Use just the basename of the path to match the save approach
      const pathCachePath = path.join(cacheDir, path.basename(relativePath))

      // Try primary key first
      if (await tryRestoreCache(pathCachePath, targetPaths[i], targetDirs[i], options.strategy)) {
        cacheHit = true
        log.info(
          `${i === 0 ? 'Primary' : 'Additional'} path ${relativePath} restored with ${
            options.strategy
          } strategy`
        )
        continue
      }

      // Try restore-keys if this is the primary path
      if (i === 0) {
        for (const restoreKey of options.restoreKeys) {
          const restoreCachePath = path.join(cacheDir, restoreKey, path.basename(relativePath))
          if (
            await tryRestoreCache(restoreCachePath, targetPaths[i], targetDirs[i], options.strategy)
          ) {
            cacheHit = true
            log.info(
              `Primary path ${relativePath} restored with restore-key ${restoreKey} using ${options.strategy} strategy`
            )
            break
          }
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
