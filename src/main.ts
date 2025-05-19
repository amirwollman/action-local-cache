import { setFailed, setOutput } from '@actions/core'
import { mkdirP, mv, cp } from '@actions/io/'
import { exists } from '@actions/io/lib/io-util'

import { getVars, PathItem } from './lib/getVars'
import { isErrorLike } from './lib/isErrorLike'
import log from './lib/log'

/**
 * Process a single path item based on the selected strategy
 */
async function processPathItem(pathItem: PathItem, strategy: string): Promise<boolean> {
  const { cachePath, targetDir, targetPath } = pathItem
  
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
    
    log.info(`Cache found and restored to ${targetPath} with ${strategy} strategy`)
    return true
  } else {
    log.info(`Skipping: cache not found for ${targetPath}.`)
    return false
  }
}

async function main(): Promise<void> {
  try {
    const { pathItems, options } = getVars()
    
    let cacheHit = false
    let cacheCount = 0
    let totalPaths = pathItems.length
    
    for (const pathItem of pathItems) {
      const result = await processPathItem(pathItem, options.strategy)
      if (result) cacheCount++
    }
    
    // Consider it a cache hit if at least one path was cached
    cacheHit = cacheCount > 0
    
    log.info(`Cache restoration complete. ${cacheCount}/${totalPaths} paths were restored.`)
    setOutput('cache-hit', cacheHit)
    
  } catch (error: unknown) {
    console.trace(error)
    setFailed(isErrorLike(error) ? error.message : `unknown error: ${error}`)
  }
}

void main()