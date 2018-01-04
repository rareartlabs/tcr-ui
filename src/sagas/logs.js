import { all, takeLatest, call, put, select } from 'redux-saga/effects'
import { fromJS } from 'immutable'

import {
  setDecodedLogs,
  logsError,
  updateItems,
} from '../actions'
import { SET_CONTRACTS } from '../constants'
import { selectEthjs, selectRegistryItems, selectRegistry } from '../selectors'

import {
  logUtils,
  commonUtils,
} from './utils'

import {
  fromNaturalUnit,
} from '../libs/units'

export default function* logsSaga() {
  yield takeLatest(SET_CONTRACTS, getFreshLogs)
}

// Gets fresh logs
function* getFreshLogs() {
  const registryItems = yield select(selectRegistryItems)
  try {
    const [
      // allEvents,
      applications,
      challenges,
      newlyWhitelistedDomains,
      // failedChallenges,
    ] = yield all([
      // call(handleLogs),
      call(handleLogs, '_Application'),
      call(handleLogs, '_Challenge'),
      call(handleLogs, '_NewDomainWhitelisted'),
      // call(handleLogs, '_ChallengeFailed'),
    ])
    // console.log('allEvents', allEvents)
    console.log('applications', applications)
    console.log('challenges', challenges)

    // const indices = challenges.map((challenge, ind) =>
    //   fromJS(applications).findIndex(ri =>
    //     ri.get('domain') === challenge.domain
    //   )
    // )
    // const back = indices.sort((a,b) => b - a)

    // console.log('back', back)
    // const dd = newApps.map((na, i) => {
    //   applications[na].pollID = challenges[i].pollID.toString(10)
    //   return applications
    // })
    // console.log('dd', dd)

    // console.log('newlyWhitelistedDomains', newlyWhitelistedDomains)
    // console.log('failedChallenges', failedChallenges)

    // const whitelist = applications.filter(app => app.whitelisted)
    // console.log('whitelist', whitelist)

    // const challenged = apps.filter(app => app.challengeID)
    // console.log('challenged', challenged)

    // const canBeWhitelistedLogs = yield call(logUtils.canBeWhitelisted, registry, applications)
    // console.log('canBeWhitelistedLogs', canBeWhitelistedLogs)

    yield put(setDecodedLogs(applications))
    yield put(updateItems(challenges))
  } catch (err) {
    console.log('Fresh log error:', err)
    yield put(logsError('logs error', err))
  }
}


function* handleLogs(topic) {
  const eth = yield select(selectEthjs)
  const registry = yield select(selectRegistry)

  const filter = yield call(logUtils.buildFilter, registry.address, topic)
  const rawLogs = yield call(eth.getLogs, filter)
  const decodedLogs = yield call(logUtils.decodeLogs, eth, registry.contract, rawLogs)

  if (topic !== '_Application') {
    return decodedLogs
  }

  return yield all(
    yield all(decodedLogs.map(async (dLog, ind) => {
      const block = await commonUtils.getBlock(eth, rawLogs[ind].blockHash)
      const txDetails = await commonUtils.getTransaction(eth, rawLogs[ind].transactionHash)

      return call(buildRegistryItem, rawLogs, registry, block, dLog, ind, txDetails)
    }))
  )
}

function* buildRegistryItem(rawLogs, registry, block, log, i, txDetails) {
  let unstakedDeposit = '0'
  if (log.deposit) {
    unstakedDeposit = fromNaturalUnit(log.deposit).toString(10)
  }

  // console.log('log', log)
  // console.log('rawLogs', rawLogs)
  // console.log('txDetails', txDetails)

  const isWhitelisted = yield call(commonUtils.isWhitelisted, registry, log.domain)

  const tx = {
    hash: rawLogs[i].transactionHash,
    from: txDetails.from,
    to: txDetails.to,
    index: txDetails.transactionIndex,
  }
  const details = {
    domain: log.domain,
    unstakedDeposit,
    pollID: log.pollID && log.pollID.toString(10),
    index: i,
    eventName: log._eventName,
    contractAddress: rawLogs[i].address,
    isWhitelisted,
  }

  return commonUtils.shapeShift(block, tx, details)
}