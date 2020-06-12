'use strict'

const path = require('path')
const AWS = require('aws-sdk')
const FakeCloudWatchLogs =
  require('../index.js').FakeCloudwatchLogs

async function main () {
  const fakeCW = new FakeCloudWatchLogs()
  const cw = new AWS.CloudWatchLogs({
    region: 'us-east-1'
  })

  const cachePath = path.join(__dirname, '..', 'fixtures')
  await fakeCW.populateFromCache(cachePath)

  if (process.argv[2] !== 'download') {
    console.log('groups', fakeCW.rawGroups)

    let totalStreams = 0
    for (const s of Object.values(fakeCW.rawStreams)) {
      totalStreams += s.length
    }
    console.log('stream count', totalStreams)

    let totalEvents = 0
    for (const e of Object.values(fakeCW.rawEvents)) {
      totalEvents += e.length
    }
    console.log('events count', totalEvents)
    return
  }

  // Cache groups
  const groups = await cw.describeLogGroups().promise()
  await fakeCW.cacheGroupsToDisk(cachePath, groups.logGroups)

  // Cache streams
  const rawGroups = fakeCW.rawGroups
  for (const g of rawGroups) {
    let streams
    let allStreams = []
    do {
      console.log('fetching streams',
        g.logGroupName, streams && streams.nextToken)
      streams = await cw.describeLogStreams({
        logGroupName: g.logGroupName,
        nextToken: streams && streams.nextToken
          ? streams.nextToken : undefined
      }).promise()

      allStreams.push(...streams.logStreams)
    } while (streams && streams.nextToken)

    await fakeCW.cacheStreamsToDisk(
      cachePath, g.logGroupName, allStreams
    )
  }

  // Cache log events
  const rawStreams = fakeCW.rawStreams
  for (const groupName of Object.keys(rawStreams)) {
    console.log('groupName', groupName)
    for (const stream of rawStreams[groupName]) {
      console.log('stream', stream.logStreamName)

      let events
      let allEvents = []
      do {
        console.log('fetching events',
          groupName, stream.logStreamName,
          events && events.nextBackwardToken)
        events = await cw.getLogEvents({
          logGroupName: groupName,
          logStreamName: stream.logStreamName,
          nextToken: events && events.nextBackwardToken
            ? events.nextBackwardToken : undefined
        }).promise()
        console.log('fetched events', events.events.length)
        allEvents.push(...events.events)
      } while (
        events &&
          events.nextBackwardToken &&
          events.events &&
          events.events.length > 0
      )

      await fakeCW.cacheEventsToDisk(
        cachePath, groupName, stream.logStreamName, allEvents
      )
    }
  }
}

main().then(null, (err) => {
  process.nextTick(() => {
    throw err
  })
})
