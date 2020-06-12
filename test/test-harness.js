// @ts-check

'use strict'

const AWS = require('aws-sdk')
const tape = require('@pre-bundled/tape')
const rimraf = require('@pre-bundled/rimraf')
const util = require('util')
const tapeCluster = require('tape-cluster')

const { FakeCloudwatchLogs } = require('../index.js')

/**
 * @typedef {(err?: Error) => void} Callback
 */

/**
 * @class
 */
class TestHarness {
  /**
   * @constructor
   */
  constructor () {
    /** @type {FakeCloudwatchLogs} */
    this.cwServer = new FakeCloudwatchLogs({
      port: 0
    })
    /** @type {AWS.CloudWatchLogs | null} */
    this.cw = null
  }

  /**
   * @returns {Promise<void>}
   */
  async bootstrap () {
    const hostPort = await this.cwServer.bootstrap()

    this.cw = new AWS.CloudWatchLogs({
      region: 'us-east-1',
      endpoint: `http://${hostPort}`,
      sslEnabled: false,
      accessKeyId: '123',
      secretAccessKey: 'abc'
    })
  }

  /**
   * @returns {FakeCloudwatchLogs}
   */
  getServer () {
    return this.cwServer
  }

  /**
   * @returns {AWS.CloudWatchLogs}
   */
  getCW () {
    if (!this.cw) throw new Error('not bootstrapped yet')
    return this.cw
  }

  /**
   * @returns {Promise<void>}
   */
  async close () {
    await this.cwServer.close()

    for (const cachePath of this.cwServer.knownCaches) {
      await util.promisify((
        /** @type {Callback} */ cb
      ) => {
        rimraf(cachePath, {
          disableGlob: true
        }, cb)
      })()
    }
  }
}
exports.TestHarness = TestHarness

exports.test = tapeCluster(tape, TestHarness)
