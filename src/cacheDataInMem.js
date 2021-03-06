require('dotenv').config()
const mysqlHelper = require('./helper/mysqlHelper')
const { query } = mysqlHelper
const debug = require('debug')('lake:cache')

const { makeLastBlock, makeListTxQuery, makeListBlockQuery } = require('./helper/handlingDataHelper')

class BlockCache {
  constructor () {
    this.cache = []
    this.cacheSize = process.env.BLOCK_CACHE_LENGTH
  }

  async init () {
    const blocksInCacheQuery = makeListBlockQuery(this.cacheSize, 0)
    const queryResult = await query(blocksInCacheQuery)
    this.setData(queryResult)
  }

  update (newBlock) {
    this.cache.unshift(newBlock)
    this.cache.length = this.cacheSize
  }

  blocksOnCache (pageSize, offset) {
    if (offset <= this.cacheSize && pageSize <= this.cacheSize) {
      if (offset + pageSize - 1 < this.cacheSize) {
        debug('cache hit')
        return true
      }
      debug('cache miss')
      return false
    }
    debug('cache miss')
    return false
  }

  blockOnCache (height) {
    if (!this.cache || !this.cache.length) {
      debug('empty block cache')
      return false
    }
    const max = this.cache[0].height
    const min = this.cache[this.cache.length - 1].height
    if (height >= min && height <= max) {
      debug('cache hit')
      return true
    } else {
      debug('cache miss')
      return false
    }
  }

  setData (data) {
    if (Array.isArray(data)) {
      this.cache = data
      this.cache.length = this.cacheSize
    }
  }

  getBlocks (pageSize, offset) {
    return this.cache.slice(offset, offset + pageSize)
  }

  getBlock (height) {
    if (height) {
      const max = this.cache[0].height
      return this.cache[max - height]
    } else {
      debug('cache hit')
      return this.cache[0]
    }
  }

  getHashAndTimeData () {
    debug(this.cache.map(value => {
      return {
        height: value.height,
        time: value.time
      }
    })
    )
  }
}
class TransactionCache {
  constructor () {
    this.cache = []
    this.cacheSize = process.env.TX_CACHE_LENGTH
  }

  async init () {
    const txsInCacheQuery = makeListTxQuery({}, this.cacheSize, 0)
    const queryResult = await query(txsInCacheQuery)
    this.setData(queryResult)
  }

  // update transactions to the head of cache
  update (newTxs) {
    if (Array.isArray(newTxs)) {
      this.cache = newTxs.concat(this.cache)
      this.cache.length = this.cacheSize
    }
  }

  setData (data) {
    if (Array.isArray(data)) {
      this.cache = data
      this.cache.length = this.cacheSize
    }
  }

  getTx (hash) {
    function checkHash (tx) {
      if (tx.hash === hash) { return true }
      return false
    }
    const tx = this.cache.find(checkHash)
    if (tx) {
      return {
        cacheHit: true,
        data: tx
      }
    }
    return {
      cacheHit: false,
      data: null
    }
  }

  getTxs (filter, pageSize, offset) {
    const keys = Object.keys(filter)
    const filteredCache = []
    this.cache.forEach(tx => {
      let eligible = true
      keys.forEach(key => {
        if (tx[key] !== filter[key]) { eligible = false }
      })
      if (eligible) { filteredCache.push(tx) }
    })

    if (offset + pageSize - 1 < filteredCache.length) {
      debug('cache hit')
      return {
        cacheHit: true,
        data: filteredCache.slice(offset, offset + pageSize)
      }
    }
    debug('cache miss')
    return {
      cacheHit: false,
      data: null
    }
  }

  getHashAndTimeData () {
    debug(this.cache.map(value => {
      return {
        height: value.height,
        index: value.index,
        hash: value.hash
      }
    })
    )
  }
}
const blockCache = new BlockCache()
const txCache = new TransactionCache()

const updateBlockCache = async () => {
  /**
     * `TODO`: the case when the `newest block` does not next to the `head block on Blockcache`
     */
  const newestBlock = await query(makeLastBlock())
  blockCache.update(newestBlock[0])
  // blockCache.getHashAndTimeData()
}
const updateTxCache = async () => {
  const newestBlock = await query(makeLastBlock())
  const numTx = newestBlock[0].num_txs
  const newestTxs = await query(makeListTxQuery({}, numTx, 0))
  txCache.update(newestTxs)
  // txCache.getHashAndTimeData()
}
const updateCache = async () => {
  await updateBlockCache()
  await updateTxCache()
}
const initializeCache = async () => {
  await blockCache.init()
  await txCache.init()
}

module.exports = {
  blockCache,
  txCache,
  initializeCache,
  updateCache
}
