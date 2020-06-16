// @ts-check
'use strict'

/** @type {import('assert')} */
const assert = require('assert')

const { test } = require('./test-harness.js')

test('can fetch cloudwatch streams', async (harness, t) => {
  const cw = harness.getCW()

  const res = await cw.describeLogStreams({
    logGroupName: 'test-group'
  }).promise()
  t.ok(res)
  t.deepEqual(res.logStreams, [])

  populateStreams(harness, '123', 'us-east-1', 'test-group', [
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

  const logStreams = [...Array(30).keys()].map((_) => {
    return harness.makeLogStream()
  })
  populateStreams(
    harness, '123', 'us-east-1', 'test-group', logStreams
  )

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

  const logStreams = Array.from(Array(30), () => {
    return harness.makeLogStream()
  })

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

test('can fetch from two regions', async (harness, t) => {
  populateStreams(harness, '123', 'us-east-1', 'test-group-1', [
    harness.makeLogStream()
  ])
  populateStreams(harness, '123', 'us-west-1', 'test-group-2', [
    harness.makeLogStream()
  ])

  const cw1 = harness.buildCWClient('123', 'us-east-1')
  const cw2 = harness.buildCWClient('123', 'us-west-1')

  const res1 = await cw1.describeLogStreams({
    logGroupName: 'test-group-1'
  }).promise()
  const res2 = await cw2.describeLogStreams({
    logGroupName: 'test-group-2'
  }).promise()

  t.ok(res1.logStreams)
  assert(res1.logStreams)
  t.equal(res1.logStreams.length, 1)
  t.equal(res1.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 2}`)

  t.ok(res2.logStreams)
  assert(res2.logStreams)
  t.equal(res2.logStreams.length, 1)
  t.equal(res2.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 1}`)
})

test('can fetch from two profiles', async (harness, t) => {
  populateStreams(harness, '123', 'us-east-1', 'test-group-1', [
    harness.makeLogStream()
  ])
  populateStreams(harness, 'abc', 'us-west-1', 'test-group-2', [
    harness.makeLogStream()
  ])

  const cw1 = harness.buildCWClient('123', 'us-east-1')
  const cw2 = harness.buildCWClient('abc', 'us-west-1')

  const res1 = await cw1.describeLogStreams({
    logGroupName: 'test-group-1'
  }).promise()
  const res2 = await cw2.describeLogStreams({
    logGroupName: 'test-group-2'
  }).promise()

  t.ok(res1.logStreams)
  assert(res1.logStreams)
  t.equal(res1.logStreams.length, 1)
  t.equal(res1.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 2}`)

  t.ok(res2.logStreams)
  assert(res2.logStreams)
  t.equal(res2.logStreams.length, 1)
  t.equal(res2.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 1}`)
})

test('can fetch from two groups', async (harness, t) => {
  populateStreams(harness, '123', 'us-east-1', 'test-group-1', [
    harness.makeLogStream()
  ])
  populateStreams(harness, '123', 'us-east-1', 'test-group-2', [
    harness.makeLogStream()
  ])

  const cw = harness.getCW()
  const res1 = await cw.describeLogStreams({
    logGroupName: 'test-group-1'
  }).promise()
  const res2 = await cw.describeLogStreams({
    logGroupName: 'test-group-2'
  }).promise()

  t.ok(res1.logStreams)
  assert(res1.logStreams)
  t.equal(res1.logStreams.length, 1)
  t.equal(res1.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 2}`)

  t.ok(res2.logStreams)
  assert(res2.logStreams)
  t.equal(res2.logStreams.length, 1)
  t.equal(res2.logStreams[0].logStreamName,
    `my-log-stream-${harness.gCounter - 1}`)
})

/**
 * @param {import('./test-harness').TestHarness} harness
 * @param {string} profile
 * @param {string} region
 * @param {string} logGroupName
 * @param {import('aws-sdk').CloudWatchLogs.LogStream[]} streams
 * @returns {void}
 */
function populateStreams (
  harness, profile, region, logGroupName, streams
) {
  const server = harness.getServer()
  server.populateGroups(
    profile, region, [harness.makeLogGroup(logGroupName)]
  )
  server.populateStreams(profile, region, logGroupName, streams)
}
