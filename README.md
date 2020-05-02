# fake-cloudwatch-logs

Setup a fake Cloudwatch logs server for testing purposes

## Example

```js
const AWS = require('aws-sdk')
const path = require('path')
const { FakeCloudwatchLogs } = require('fake-cloudwatch-logs')

async function test() {
  const server = new FakeCloudwatchLogs({
    port: 0
  })

  server.populateGroups([...])
  server.populateStreams('my-group', [...])
  server.populateLogEvents('my-group', 'my-stream', [...])

  const cachePath = path.join(__dirname, 'cw-fixtures')
  await server.populateFromCache(cachePath)
  await server.bootstrap()

  const cw = new AWS.CloudwatchLogs({
    region: 'us-east-1',
    endpoint: `http://${server.hostPort}`,
    sslEnabled: false,
    accessKey: 'abc',
    secretAccessKey: '123'
  })

  const groups = await cw.describeLogGroups().promise()

  // Should be groups you populated or loaded from disk cache
  console.log('the groups', groups.logGroups)

  const events = await cw.getLogEvents({
    logGroupName: 'my-group',
    logStreamName: 'my-stream'
  }).promise()

  // Should be events you populated.
  console.log('the events', events.events)

  await server.close()
}

process.on('unhandledRejection', (err) => { throw err })
test()
```

## Features

Currently this `fake-cloudwatch-logs` module supports various
read APIs like describe log groups, describe streams and fetching
log events.

It also supports APIs designed for making a read-only copy of
production data cached on disks. This allows for using fixture
data for local development and integration tests.

The other functionality can be added in the future, as needed.

The API that are supported are :

 - `DescribeLogGroups`
 - `DescribeLogStreams`
 - `GetLogEvents`

## Recommended testing approach

Create the `FakeCloudwatchLogs` server in your test harness. Then
configure your aws client to point to the endpoint.

You can call `populate` methods to populate mock data into the
fake cloudwatch server.

## Recommended local approach

Create the FakeCloudwatchLogs server on some HTTP port of your
choice.

I recommend copying the `scripts/cache-from-prod.js` into your
application, this will cache production data into a fixtures
directory.

You can configure the FakeCloudwatchLogs to fetch that fixtures
data into memory and then configure your website or application or
server to point to the FakeCloudwatchLogs on whatever port you
choose.

Here is an example snippet from the script

```js
'use strict'

const path = require('path')
const AWS = require('aws-sdk')
const FakeCloudWatchLogs =
  require('../src/index.js').FakeCloudwatchLogs

async function main () {
  const fakeCW = new FakeCloudWatchLogs()
  // Use production cloudwatch logs aws client to fetch data
  // and then cache them into a fixtures directory.
  const cw = new AWS.CloudWatchLogs({
    region: 'us-east-1'
  })

  const cachePath = path.join(__dirname, '..', 'fixtures')

  // Cache groups
  const groups = await cw.describeLogGroups().promise()
  await fakeCW.cacheGroupsToDisk(cachePath, groups.logGroups)

  // Cache streams
  const rawGroups = fakeCW.rawGroups
  for (const g of rawGroups) {
    let streams
    let allStreams = []
    do {
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
}

main().then(null, (err) => {
  process.nextTick(() => { throw err })
})
```

## Docs :

### `const server = new FakeCloudwatchLogs(options)`

Creates a fake Cloudwatch logs server listening on the port
your specified.

 - `options.port`; port to lsiten on, defaults to 0

### `await server.bootstrap()`

Starts the server. After this method completes the field
`server.hostPort` is available and can be used to access the
actual listening port of the server if you choose to listen on
port 0.

### `await server.close()`

Closes the http server.

### `server.populateGroups(groups)`

Adds groups to the in-memory server. The group must be a valid
`LogGroup`

```js
let gCounter = 0
function makeLogGroup() {
    const logGroupName = `my-log-group-${gCounter++}`;
    return {
        logGroupName,
        creationTime: Date.now(),
        metricFilterCount: 0,
        arn: `arn:aws:logs:us-east-1:0:log-group:${logGroupName}:*`,
        storedBytes: Math.floor(Math.random() * 1024 * 1024)
    };
}
```

### `server.populateStreams(groupName, streams)`

Adds streams to the in-memory server that belong to the `groupName`.
The streams must be a valid `LogStream`

```js
let gCounter = 0
function makeLogStream() {
    const logStreamName = `my-log-stream-${gCounter++}`;
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
        storedBytes: Math.floor(Math.random() * 1024 * 1024)
    };
}
```

### `server.populateEvents(groupName, streamName, events)`

Adds events to the in-memory server that belong to the `groupName`
and the `streamName`. The events must be a valid `OutputLogEvent`

```js
let gCounter = 0
function makeLogEvent(timeOffset) {
    timeOffset = timeOffset || 0;
    return {
        timestamp: Date.now() - timeOffset,
        ingestionTime: Date.now(),
        message: `[INFO]: A log message: ${gCounter++}`
    };
}
```

### `await server.populateFromCache(cacheDir)`

This will have the server fetch groups, streams & events from
a cache on disk. This can be useful for writing tests with fixtures
or for starting a local server that loads fixtures from disk.

It's recommende you use the `cacheXToDisk()` methods to create
the fixtures.

### `await server.cacheGroupsToDisk(cacheDir, groups)`

This will write groups to disk in the cache directory. The
groups must be valid `LogGroup` ;

### `await server.cacheStreamsToDisk(cacheDir, groupName, streams)`

This will write streams to disk in the cache directory for the
`groupName` you specify. The streams must be valid `LogStream`

### `await server.cacheEventsToDisk(cacheDir, groupName, streamName, events)`

This will write events to disk in the cache directory for the
`groupName` and `streamName` you specify. The streams must be
valid `OutputLogEvent` ;

## install

```
% npm install fake-cloudwatch-logs
```

## MIT Licensed

