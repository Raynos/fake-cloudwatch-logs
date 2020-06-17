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
 */

class TestHarness {
  constructor () {
    /** @type {FakeCloudwatchLogs} */
    this.cwServer = new FakeCloudwatchLogs({
      port: 0,
      cachePath: this.getCachePath()
    })
    /** @type {AWS.CloudWatchLogs | null} */
    this.cw = null

    /** @type {Mutex} */
    this.pollingMutex = new Mutex()
  }

  /** @returns {Promise<void>} */
  async bootstrap () {
    await this.cwServer.bootstrap()
    this.cw = this.buildCWClient('123', 'us-east-1')
  }

  /**
   * @param {string} accessKeyId
   * @param {string} region
   * @returns {AWS.CloudWatchLogs}
   */
  buildCWClient (accessKeyId, region) {
    return new AWS.CloudWatchLogs({
      region: region,
      endpoint: `http://${this.cwServer.hostPort}`,
      sslEnabled: false,
      accessKeyId: accessKeyId,
      secretAccessKey: 'abc'
    })
  }

  /** @returns {number} */
  get gCounter () {
    return this.getServer().gCounter
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
   * @param {string} logGroupName
   * @param {string} logStreamName
   * @param {OutputLogEvent[]} events
   * @returns {void}
   */
  populateEvents (logGroupName, logStreamName, events) {
    const server = this.getServer()
    server.populateGroups(
      '123', 'us-east-1', [this.makeLogGroup(logGroupName)]
    )
    server.populateStreams('123', 'us-east-1', logGroupName, [
      this.makeLogStream(logStreamName)
    ])
    server.populateEvents(
      '123', 'us-east-1', logGroupName, logStreamName, events
    )
  }

  /**
   * @param {string} [name]
   * @returns {import('aws-sdk').CloudWatchLogs.LogGroup}
   */
  makeLogGroup (name) {
    return this.getServer().makeLogGroup(name)
  }

  /**
   * @param {string} [name]
   * @returns {LogStream}
   */
  makeLogStream (name) {
    return this.getServer().makeLogStream(name)
  }

  /**
   * @param {number} [timeOffset]
   * @returns {OutputLogEvent}
   */
  makeLogEvent (timeOffset) {
    return this.getServer().makeLogEvent(timeOffset)
  }

  /**
     @param {{
        delay: number;
        count: number;
        logGroupName: string;
        logStreamName: string;
        allocate?: () => OutputLogEvent;
   * }} options
   * @returns {Promise<OutputLogEvent[]>}
   */
  async writeStreamingEvents (options) {
    const server = this.getServer()
    const allocate = options.allocate || (() => this.makeLogEvent())
    let insertsLeft = options.count

    /** @type {OutputLogEvent[]} */
    const events = []

    do {
      await sleep(options.delay)
      await this.pollingMutex.do(() => {
        const event = allocate()
        events.push(event)
        server.populateEvents(
          '123', 'us-east-1',
          options.logGroupName, options.logStreamName, [event]
        )
      })
    } while (--insertsLeft > 0)

    return events
  }

  /**
     @param {{
        delay: number;
        count: number;
        logGroupName: string;
        logStreamName: string;
   * }} options
   * @returns {Promise<{ stream: LogStream, ts: number }[]>}
   */
  async readStreamInterval (options) {
    const cw = this.getCW()
    let readsLeft = options.count

    /** @type {{ts: number, stream: LogStream}[]} */
    const streams = []

    do {
      await sleep(options.delay)
      await this.pollingMutex.do(async () => {
        const ts = Date.now()
        const res = await cw.describeLogStreams({
          logGroupName: options.logGroupName,
          logStreamNamePrefix: options.logStreamName
        }).promise()
        if (!res.logStreams) return
        const stream = res.logStreams.find((s) => {
          return s.logStreamName === options.logStreamName
        })
        if (!stream) return
        streams.push({ ts, stream })
      })
    } while (--readsLeft > 0)

    return streams
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

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

class Mutex {
  constructor () {
    /** @type {Promise<void>|null} */
    this.pendingOperation = null
  }

  /**
   * @param {() => void | Promise<void>} operation
   * @returns {Promise<void>}
   */
  async do (operation) {
    while (this.pendingOperation) await this.pendingOperation

    const promise = operation()
    if (promise && typeof promise.then === 'function') {
      this.pendingOperation = promise
      const result = await promise
      this.pendingOperation = null
      return result
    }
    return promise
  }
}
