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

async function savePath(sourcePath: string, cacheDir: string, strategy: string): Promise<void> {
  // Handle wildcards
  if (sourcePath.includes('*')) {
    const files = await globPromise(sourcePath)
    if (files.length === 0) {
      log.info(`No files found matching pattern: ${sourcePath}`)
      return
    }

    for (const file of files) {
      const targetPath = path.join(cacheDir, path.relative(process.cwd(), file))
      await mkdirP(path.dirname(targetPath))

      switch (strategy) {
        case 'copy-immutable':
          if (await exists(targetPath)) {
            log.info(`Cache already exists for ${file}, skipping`)
            continue
          }
          await cp(file, targetPath, { recursive: true })
          break
        case 'copy':
          await rmRF(targetPath)
          await cp(file, targetPath, { recursive: true })
          break
        case 'move':
          await mv(file, targetPath, { force: true })
          break
      }
    }
    return
  }

  // Handle regular paths
  const targetPath = path.join(cacheDir, path.relative(process.cwd(), sourcePath))
  await mkdirP(path.dirname(targetPath))

  switch (strategy) {
    case 'copy-immutable':
      if (await exists(targetPath)) {
        log.info(`Cache already exists for ${sourcePath}, skipping`)
        return
      }
      await cp(sourcePath, targetPath, { recursive: true })
      break
    case 'copy':
      await rmRF(targetPath)
      await cp(sourcePath, targetPath, { recursive: true })
      break
    case 'move':
      await mv(sourcePath, targetPath, { force: true })
      break
  }
}

async function post(): Promise<void> {
  try {
    const { cacheDir, targetPaths, options } = getVars()
    await mkdirP(cacheDir)

    for (let i = 0; i < options.paths.length; i++) {
      await savePath(targetPaths[i], cacheDir, options.strategy)
      log.info(`${i === 0 ? 'Primary' : 'Additional'} path ${options.paths[i]} saved to cache`)
    }
  } catch (error: unknown) {
    log.trace(error)
    setFailed(isErrorLike(error) ? error.message : `unknown error: ${error}`)
  }
}

void post()
