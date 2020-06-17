// @ts-check
'use strict'

/**
 * TODO: tests
 *
 * [X] Query streams when log events are being written and check
 * the state of the timestamps.
 *
 * [ ] Query HISTORICAL stream
 *    - firstEventTs
 *    - lastEventTs
 *    - creationTime
 *    - lastIngestionTime
 *
 * [ ] Query LIVE stream ; first write a few messages to, then read
 *    - firstEventTs / lastEventTs ; expect delayed
 *    - lastIngestionTime ; expect realtime
 *    - WAIT some time ( 2 hours )
 *    - query again; lastEventTs is now accurate.
 *
 * [ ] Query LIVE stream ; write data to it frequently.
 *     - Query stream & most recent log event a few times
 *     - assert ingestionTime ~correct-ish ( they are the same
 *          but we are querying two data structures in parallel
 *          so we might have newer or older logs dependent
 *          on timing of parallel reads.)
 *     - assert lastEventTs stale.
 *
 */

// /** @type {import('assert')} */
// const assert = require('assert')

const { test } = require('./test-harness.js')

test('can fetch logStream info in realtime', async (harness, t) => {
  const evs = Array.from(Array(3), () => {
    return harness.makeLogEvent()
  })
  harness.populateEvents('test-group', 'test-stream', evs)

  const p = harness.writeStreamingEvents({
    delay: 3,
    count: 10,
    logGroupName: 'test-group',
    logStreamName: 'test-stream',
    allocate: () => harness.makeLogEvent()
  })
  const p2 = harness.readStreamInterval({
    logGroupName: 'test-group',
    logStreamName: 'test-stream',
    delay: 8,
    count: 3
  })

  const [events, streams] = await Promise.all([p, p2])

  t.equal(events.length, 10)
  t.equal(streams.length, 3)

  const events1 = events.filter((e) => {
    return e.ingestionTime && e.ingestionTime <= streams[0].ts
  }).reverse()
  const events2 = events.filter((e) => {
    return e.ingestionTime && e.ingestionTime <= streams[1].ts
  }).reverse()
  const events3 = events.filter((e) => {
    return e.ingestionTime && e.ingestionTime <= streams[2].ts
  }).reverse()

  t.equal(
    events1[0].ingestionTime, streams[0].stream.lastIngestionTime,
    'first stream ingestionTime correct'
  )
  t.equal(streams[0].stream.firstEventTimestamp, evs[0].timestamp)
  t.equal(streams[0].stream.lastEventTimestamp, evs[2].timestamp)

  /**
   * Most of the time there were 3 events published between
   * the first and second stream read because the delay=3 which
   * gets two events in. sometimes theres only 1 event in between
   * because of the non-deterministic delay of `setTimeout()`.
   */
  t.ok(
    events2.length - events1.length >= 2 &&
    events2.length - events1.length <= 3,
    'three events between 1 & 2'
  )
  t.equal(
    events2[0].ingestionTime, streams[1].stream.lastIngestionTime,
    'second stream ingestionTime correct'
  )
  t.equal(streams[1].stream.firstEventTimestamp, evs[0].timestamp)
  t.equal(streams[1].stream.lastEventTimestamp, evs[2].timestamp)
  t.ok(
    events3.length - events2.length >= 2 &&
    events3.length - events2.length <= 3,
    'three events between 2 & 3'
  )
  t.equal(
    events3[0].ingestionTime, streams[2].stream.lastIngestionTime,
    'third stream ingestionTime correct'
  )
  t.equal(streams[2].stream.firstEventTimestamp, evs[0].timestamp)
  t.equal(streams[2].stream.lastEventTimestamp, evs[2].timestamp)
})
