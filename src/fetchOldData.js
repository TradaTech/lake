const { IceteaWeb3 } = require('@iceteachain/web3')
const web3 = new IceteaWeb3('wss://rpc.icetea.io/websocket')

const handlingDataHelper = require('./helper/handlingDataHelper')
const { generateOldBlockEventQuery, generateOldTxEventQuery } = handlingDataHelper

const mysqlHelper = require('./helper/mysqlHelper')
const { query } = mysqlHelper

/**
 * Fetch block data from `from` block height to `to` block height
 * @param {*} from block height
 * @param {*} to block height
 */
function fetchOldBlocks (from, to) {
  if (to < from) return

  const promises = []
  let start = from
  const step = 20 // tendermint support MAX of 20, don't increase to > 20
  let end = Math.min(to, start + step - 1)

  while (start <= end) {
    const p = web3.getBlocks({ minHeight: start, maxHeight: end }).then((result) => {
      // array of blocks 
      const stepPromises = result.block_metas.reduce((list, bl) => {
        const blockQuery = generateOldBlockEventQuery(bl)
        list.push(query(blockQuery))
        return list
      }, [])
      return Promise.all(stepPromises)
    })
    promises.push(p)

    // for next round
    start = end + 1
    end = Math.min(to, start + step - 1)
  }
  return Promise.all(promises)
}
/**
 * Fetch transaction data from `from` block height to `to` block height
 * @param {*} from block height
 * @param {*} to block height
 */
function fetchOldTxs (from, to) {
  if (to < from) return

  const promises = []
  for (let i = from; i <= to; i++) {
    // TODO: currently not work if a block contains more than 100 txs
    // tendermint support max per_page of 100 (default 30)
    const p = web3.searchTransactions(`tx.height = ${i}`, { per_page: 100 }).then((result) => {
      const getTxs = result.txs.reduce((arr, tx) => {
        const decoded = web3.utils.decodeTxResult(tx)
        const mysqlQuery = generateOldTxEventQuery(decoded)
        arr.push(query(mysqlQuery))
        return arr
      }, [])
      return Promise.all(getTxs)
    })
    promises.push(p)
  }
  return Promise.all(promises)
}

module.exports = { fetchOldBlocks, fetchOldTxs }