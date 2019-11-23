# fake-cloudwatch-logs

Setup a fake Cloudwatch logs server for testing purposes

## Example

```js
const AWS = require('aws-sdk')
const FakeCloudwatchLogs =
  require('fake-cloudwatch-logs').FakeCloudwatchLogs

async function test() {
  const server = new FakeCloudwatchLogs({
    port: 0
  })

  server.populateGroups([...])
  server.populateStreams([...])
  server.populateLogEvents([...])
  await server.populateFromDiskCache(path)

  await server.cacheGroupsToDisk(path, [...])
  await server.cacheStreamsToDisk(path, [...])
  await server.cacheLogEventsToDisk(path, [...])

  await server.bootstrap()

  const cw = new AWS.CloudwatchLogs({
    region: 'us-east-1',
    endpoint: `http://${sever.hostPort}`,
    sslEnabled: false,
    accessKey: 'abc',
    secretAccessKey: '123'
  })

  const grousp = await cw.describeLogGroups({
  }).promise()

  // Should be groups you populated or loaded from disk cache
  console.log('the groups', data.Groups)

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

## Docs :

## install

```
% npm install fake-cloudwatch-logs
```

## MIT Licensed

