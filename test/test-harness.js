// @ts-check

'use strict'

const AWS = require('aws-sdk')
const tape = require('@pre-bundled/tape')
const rimraf = require('@pre-bundled/rimraf')
const util = require('util')
const tapeCluster = require('tape-cluster')
const path = require('path')
const os = require('os')

const { FakeCloudwatchLogs } = require('../index.js')

/**
 * @typedef {(err?: Error) => void} Callback
   @typedef {
      import('aws-sdk').CloudWatchLogs.OutputLogEvent
 * } OutputLogEvent
 * @typedef {
      import('aws-sdk').CloudWatchLogs.LogStream
 * } LogStream
 * @typedef {
       import('aws-sdk').CloudWatchLogs.LogGroup
 * } LogGroup
 */

class TestHarness {
  constructor () {
    /** @type {FakeCloudwatchLogs} */
    this.cwServer = new FakeCloudwatchLogs({
      port: 0
    })
    /** @type {AWS.CloudWatchLogs | null} */
    this.cw = null
    /** @type {number} */
    this.gCounter = 0
  }

  /** @returns {Promise<void>} */
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

  /** @returns {FakeCloudwatchLogs} */
  getServer () {
    return this.cwServer
  }

  /** @returns {string} */
  getCachePath () {
    return path.join(
      os.tmpdir(), `test-fake-cloudwatch-logs-${cuuid()}`
    )
  }

  /** @returns {AWS.CloudWatchLogs} */
  getCW () {
    if (!this.cw) throw new Error('not bootstrapped yet')
    return this.cw
  }

  /** @returns {Promise<void>} */
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

  /**
   * @param {string} [name]
   * @returns {LogGroup}
   */
  makeLogGroup (name) {
    const logGroupName = name || `my-log-group-${this.gCounter++}`
    return {
      logGroupName,
      creationTime: Date.now(),
      metricFilterCount: 0,
      arn: `arn:aws:logs:us-east-1:0:log-group:${logGroupName}:*`,
      // tslint:disable-next-line: insecure-random
      storedBytes: Math.floor(Math.random() * 1024 * 1024)
    }
  }

  /**
   * @param {string} [name]
   * @returns {LogStream}
   */
  makeLogStream (name) {
    const logStreamName = name || `my-log-stream-${this.gCounter++}`
    return {
      logStreamName,
      creationTime: Date.now(),
      firstEventTimestamp: Date.now(),
      lastEventTimestamp: Date.now(),
      lastIngestionTime: Date.now(),
      arn: 'arn:aws:logs:us-east-1:0:log-group:???:' +
        `log-stream:${logStreamName}`,
      uploadSequenceToken: (
        Math.random().toString() + Math.random().toString() +
        Math.random().toString() + Math.random().toString()
      ).replace(/\./g, ''),
      // tslint:disable-next-line: insecure-random
      storedBytes: Math.floor(Math.random() * 1024 * 1024)
    }
  }

  /**
   * @param {number} [timeOffset]
   * @returns {OutputLogEvent}
   */
  makeLogEvent (timeOffset) {
    timeOffset = timeOffset || 0
    return {
      timestamp: Date.now() - timeOffset,
      ingestionTime: Date.now(),
      message: `[INFO]: A log message: ${this.gCounter++}`
    }
  }
}
exports.TestHarness = TestHarness

exports.test = tapeCluster(tape, TestHarness)

/**
 * @returns {string}
 */
function cuuid () {
  const str = (
    Date.now().toString(16) +
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32)
  return str.slice(0, 8) + '-' + str.slice(8, 12) + '-' +
    str.slice(12, 16) + '-' + str.slice(16, 20) + '-' +
    str.slice(20)
}
