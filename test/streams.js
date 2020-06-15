// @ts-check
'use strict'

/**
   @typedef {
      import('aws-sdk').CloudWatchLogs.LogStream
 * } LogStream
 */

const { test } = require('./test-harness.js')

test('can fetch cloudwatch streams', async (harness, t) => {
  const cw = harness.getCW()

  const res = await cw.describeLogStreams({
    logGroupName: 'test-group'
  }).promise()
  t.ok(res)
  t.deepEqual(res.logStreams, [])

  populateStreams(harness, 'test-group', [
    harness.makeLogStream()
  ])

  const res2 = await cw.describeLogStreams({
    logGroupName: 'test-group'
  }).promise()
  t.ok(res2.logStreams)
  assert(res2.logStreams)
  t.equal(res2.logStreams.length, 1)
  t.equal(
    res2.logStreams[0].logStreamName,
        `my-log-stream-${harness.gCounter - 1}`
  )
})

test('can fetch two batches of streams', async (harness, t) => {
  const cw = harness.getCW()

  /** @type {LogStream[]} */
  const logStreams = []
  for (let i = 0; i < 30; i++) {
    logStreams.push(harness.makeLogStream())
  }
  populateStreams(harness, 'test-group', logStreams)

  const res1 = await cw.describeLogStreams({
    limit: 10,
    logGroupName: 'test-group'
  }).promise()
  t.ok(res1.logStreams)
  t.ok(res1.nextToken)
  assert(res1.logStreams)
  t.equal(res1.logStreams.length, 10)
  t.equal(
    res1.logStreams[0].logStreamName,
        `my-log-stream-${harness.gCounter - 30}`
  )
  t.equal(
    res1.logStreams[9].logStreamName,
        `my-log-stream-${harness.gCounter - 21}`
  )

  const res2 = await cw.describeLogStreams({
    limit: 10,
    logGroupName: 'test-group',
    nextToken: res1.nextToken
  }).promise()
  t.ok(res2.logStreams)
  t.ok(res2.nextToken)
  assert(res2.logStreams)
  t.equal(res2.logStreams.length, 10)
  t.equal(
    res2.logStreams[0].logStreamName,
        `my-log-stream-${harness.gCounter - 20}`
  )
  t.equal(
    res2.logStreams[9].logStreamName,
        `my-log-stream-${harness.gCounter - 11}`
  )
})

test('can cache streams to disk', async (harness, t) => {
  const cw = harness.getCW()
  const server = harness.getServer()

  /** @type {LogStream[]} */
  const logStreams = []
  for (let i = 0; i < 30; i++) {
    logStreams.push(harness.makeLogStream())
  }

  await server.cacheStreamsToDisk(
    '123', 'us-east-1', 'test-group', logStreams
  )
  await server.populateFromCache()

  const res1 = await cw.describeLogStreams({
    limit: 10,
    logGroupName: 'test-group'
  }).promise()
  t.ok(res1.logStreams)
  t.ok(res1.nextToken)
  assert(res1.logStreams)
  t.equal(res1.logStreams.length, 10)
  t.equal(
    res1.logStreams[0].logStreamName,
        `my-log-stream-${harness.gCounter - 30}`
  )
  t.equal(
    res1.logStreams[9].logStreamName,
        `my-log-stream-${harness.gCounter - 21}`
  )
})

/**
 * @param {import('./test-harness').TestHarness} harness
 * @param {string} logGroupName
 * @param {LogStream[]} streams
 * @returns {void}
 */
function populateStreams (
  harness,
  logGroupName,
  streams
) {
  const server = harness.getServer()
  server.populateGroups(
    '123', 'us-east-1', [harness.makeLogGroup(logGroupName)]
  )
  server.populateStreams('123', 'us-east-1', logGroupName, streams)
}

/**
 * @param {unknown} value
 * @returns {asserts value}
 */
function assert (value) {
  if (!value) throw new Error('value is falsey')
}
