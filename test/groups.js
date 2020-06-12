// @ts-check
'use strict'

const { test } = require('./test-harness.js')

test('can fetch cloudwatch groups', async (harness, t) => {
  const cw = harness.getCW()

  const res = await cw.describeLogGroups().promise()
  t.ok(res.logGroups)
  assert(res.logGroups)
  t.equal(res.logGroups.length, 0)

  const server = harness.getServer()
  server.populateGroups([
    harness.makeLogGroup()
  ])

  const res2 = await cw.describeLogGroups().promise()
  t.ok(res2.logGroups)
  assert(res2.logGroups)
  t.equal(res2.logGroups.length, 1)
  t.equal(
    res2.logGroups[0].logGroupName,
        `my-log-group-${harness.gCounter - 1}`
  )
})

test('can fetch limit=10 groups', async (harness, t) => {
  const cw = harness.getCW()
  const server = harness.getServer()

  const logGroups = [...Array(100).keys()].map((_) => {
    return harness.makeLogGroup()
  })
  server.populateGroups(logGroups)

  const res1 = await cw.describeLogGroups().promise()
  t.ok(res1.logGroups)
  assert(res1.logGroups)
  t.equal(res1.logGroups.length, 50)
  t.equal(
    res1.logGroups[0].logGroupName,
        `my-log-group-${harness.gCounter - 100}`
  )
  t.equal(
    res1.logGroups[49].logGroupName,
        `my-log-group-${harness.gCounter - 51}`
  )

  const res2 = await cw.describeLogGroups({
    limit: 10
  }).promise()
  t.ok(res2.logGroups)
  assert(res2.logGroups)
  t.equal(res2.logGroups.length, 10)
  t.equal(
    res2.logGroups[0].logGroupName,
        `my-log-group-${harness.gCounter - 100}`
  )
  t.equal(
    res2.logGroups[9].logGroupName,
        `my-log-group-${harness.gCounter - 91}`
  )
})

test('can fetch two batches of groups', async (harness, t) => {
  const cw = harness.getCW()
  const server = harness.getServer()

  const logGroups = [...Array(30).keys()].map((_) => {
    return harness.makeLogGroup()
  })
  server.populateGroups(logGroups)

  const res1 = await cw.describeLogGroups({
    limit: 10
  }).promise()
  t.ok(res1.logGroups)
  t.ok(res1.nextToken)
  assert(res1.logGroups)
  t.equal(res1.logGroups.length, 10)
  t.equal(
    res1.logGroups[0].logGroupName,
        `my-log-group-${harness.gCounter - 30}`
  )
  t.equal(
    res1.logGroups[9].logGroupName,
        `my-log-group-${harness.gCounter - 21}`
  )

  const res2 = await cw.describeLogGroups({
    limit: 10,
    nextToken: res1.nextToken
  }).promise()
  t.ok(res2.logGroups)
  t.ok(res2.nextToken)
  assert(res2.logGroups)
  t.equal(res2.logGroups.length, 10)
  t.equal(
    res2.logGroups[0].logGroupName,
        `my-log-group-${harness.gCounter - 20}`
  )
  t.equal(
    res2.logGroups[9].logGroupName,
        `my-log-group-${harness.gCounter - 11}`
  )
})

/**
 * @param {unknown} value
 * @returns {asserts value}
 */
function assert (value) {
  if (!value) throw new Error('value is falsey')
}
