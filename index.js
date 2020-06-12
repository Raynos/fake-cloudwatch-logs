// @ts-check
'use strict'

const http = require('http')
const util = require('util')
const path = require('path')
const fs = require('fs')

/**
   @typedef {import('aws-sdk').CloudWatchLogs.LogGroup} LogGroup
 * @typedef {import('aws-sdk').CloudWatchLogs.LogStream} LogStream
 * @typedef {import('aws-sdk').CloudWatchLogs.OutputLogEvent} OutputLogEvent
 * @typedef {
      import('aws-sdk').CloudWatchLogs.DescribeLogGroupsRequest
 * } DescribeLogGroupsRequest
 * @typedef {
      import('aws-sdk').CloudWatchLogs.DescribeLogStreamsRequest
 * } DescribeLogStreamsRequest
 * @typedef {
      import('aws-sdk').CloudWatchLogs.GetLogEventsRequest
 * } GetLogEventsRequest
 */

/** @typedef {{ (err?: Error): void; }} Callback */

const mkdirP = util.promisify(fs.mkdir)
const writeFileP = util.promisify(fs.writeFile)
const readFileP = util.promisify(fs.readFile)
const readdirP = util.promisify(fs.readdir)

class FakeCloudwatchLogs {
  /**
   * @param {{ port?: number }} options
   */
  constructor (options) {
    /** @type {http.Server | null} */
    this.httpServer = http.createServer()
    /** @type {number} */
    this.port = options.port || 0
    /** @type {string | null} */
    this.hostPort = null
    /** @type {boolean} */
    this.touchedCache = false
    /** @type {string[]} */
    this.knownCaches = []

    /** @type {LogGroup[]} */
    this.rawGroups = []
    /** @type {Record<string, LogStream[]|undefined>} */
    this.rawStreams = {}
    /** @type {Record<string, OutputLogEvent[]|undefined>} */
    this.rawEvents = {}
    /** @type {Record<string, { offset: number }|undefined>} */
    this.tokens = {}
  }

  /**
   * @param {string} filePath
   * @returns {Promise<void>}
   */
  async tryMkdir (filePath) {
    try {
      await mkdirP(filePath)
    } catch (maybeErr) {
      /**
       * https://github.com/typescript-eslint/typescript-eslint/issues/1943
       */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const err = /** @type {NodeJS.ErrnoException} */ (maybeErr)
      if (err.code !== 'EEXIST') throw err
    }
  }

  /**
   * TODO: Add profile & region to cache*()
   * TODO: Add fetchAndCache()
   * TODO: Add getAllRegions()
   * TODO: Add profile & region to populate*
   *
   * TODO: Update read paths, add `_getProfileRegion()`
   *
   */

  /**
   * @param {string} filePath
   * @param {LogGroup[]} groups
   * @returns {Promise<void>}
   */
  async cacheGroupsToDisk (filePath, groups) {
    this.touchedCache = true
    if (!this.knownCaches.includes(filePath)) {
      this.knownCaches.push(filePath)
    }

    await this.tryMkdir(filePath)
    await writeFileP(
      path.join(filePath, 'groups.json'),
      JSON.stringify({
        type: 'cached-log-group',
        groups
      }),
      'utf8'
    )
  }

  /**
   * @param {string} filePath
   * @param {string} groupName
   * @param {LogStream[]} streams
   * @returns {Promise<void>}
   */
  async cacheStreamsToDisk (filePath, groupName, streams) {
    this.touchedCache = true
    if (!this.knownCaches.includes(filePath)) {
      this.knownCaches.push(filePath)
    }

    const key = encodeURIComponent(groupName)
    await this.tryMkdir(filePath)
    await this.tryMkdir(path.join(filePath, 'groups'))
    await this.tryMkdir(path.join(filePath, 'groups', key))
    await writeFileP(
      path.join(filePath, 'groups', key, 'streams.json'),
      JSON.stringify({
        type: 'cached-log-stream',
        groupName,
        streams
      })
    )
  }

  /**
   * @param {string} filePath
   * @param {string} groupName
   * @param {string} streamName
   * @param {OutputLogEvent[]} events
   * @returns {Promise<void>}
   */
  async cacheEventsToDisk (
    filePath, groupName, streamName, events
  ) {
    this.touchedCache = true
    if (!this.knownCaches.includes(filePath)) {
      this.knownCaches.push(filePath)
    }

    const streamsDir = path.join(filePath, 'streams')
    const key = encodeURIComponent(groupName + ':' + streamName)

    await this.tryMkdir(filePath)
    await this.tryMkdir(path.join(streamsDir))
    await this.tryMkdir(path.join(streamsDir, key))
    await writeFileP(
      path.join(streamsDir, key, 'events.json'),
      JSON.stringify({
        type: 'cached-log-event',
        groupName,
        streamName,
        events
      })
    )
  }

  /**
   * @param {string} filePath
   * @returns {Promise<void>}
   */
  async populateFromCache (filePath) {
    /** @type {string | null} */
    let groupsStr = null
    try {
      groupsStr = await readFileP(
        path.join(filePath, 'groups.json'), 'utf8'
      )
    } catch (maybeErr) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const err = /** @type {NodeJS.ErrnoException} */ (maybeErr)
      if (err.code !== 'ENOENT') throw err
    }

    if (groupsStr) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const groupsInfo = /** @type {{
        groups: LogGroup[]
      }} */ (JSON.parse(groupsStr))
      this.populateGroups(groupsInfo.groups)
    }

    /** @type {string[] | null} */
    let groupDirs = null
    try {
      groupDirs = await readdirP(
        path.join(filePath, 'groups')
      )
    } catch (maybeErr) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const err = /** @type {NodeJS.ErrnoException} */ (maybeErr)
      if (err.code !== 'ENOENT') throw err
    }

    if (groupDirs) {
      for (const groupName of groupDirs) {
        const streamsStr = await readFileP(path.join(
          filePath,
          'groups',
          groupName,
          'streams.json'
        ), 'utf8')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const streamsInfo = /** @type {{
          groupName: string,
          streams: LogStream[]
        }} */ (JSON.parse(streamsStr))
        this.populateStreams(
          streamsInfo.groupName,
          streamsInfo.streams
        )
      }
    }

    /** @type {string[] | null} */
    let streamDirs = null
    try {
      streamDirs = await readdirP(
        path.join(filePath, 'streams')
      )
    } catch (maybeErr) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const err = /** @type {NodeJS.ErrnoException} */ (maybeErr)
      if (err.code !== 'ENOENT') throw err
    }

    if (streamDirs) {
      for (const dirName of streamDirs) {
        const eventsStr = await readFileP(path.join(
          filePath,
          'streams',
          dirName,
          'events.json'
        ), 'utf8')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const eventsinfo = /** @type {{
          groupName: string,
          streamName: string,
          events: OutputLogEvent[]
        }} */ (JSON.parse(eventsStr))
        this.populateEvents(
          eventsinfo.groupName,
          eventsinfo.streamName,
          eventsinfo.events
        )
      }
    }
  }

  /**
   * @param {LogGroup[]} groups
   * @returns {void}
   */
  populateGroups (groups) {
    this.rawGroups.push(...groups)
  }

  /**
   * @param {string} groupName
   * @param {LogStream[]} streams
   * @returns {void}
   */
  populateStreams (groupName, streams) {
    let rawStreams = this.rawStreams[groupName]
    if (rawStreams === undefined) {
      rawStreams = this.rawStreams[groupName] = []
    }
    rawStreams.push(...streams)
  }

  /**
   * @param {string} groupName
   * @param {string} streamName
   * @param {OutputLogEvent[]} events
   * @returns {void}
   */
  populateEvents (
    groupName, streamName, events
  ) {
    if (events.length === 0) {
      throw new Error('cannot add empty events array')
    }

    const key = groupName + '~~' + streamName

    let rawEvents = this.rawEvents[key]
    if (rawEvents === undefined) {
      rawEvents = this.rawEvents[key] = []
    }
    rawEvents.push(...events)
    rawEvents.sort((a, b) => {
      if (!a.timestamp) return 1
      if (!b.timestamp) return -1
      return a.timestamp < b.timestamp ? -1 : 1
    })

    const rawStreams = this.rawStreams[groupName]
    if (!rawStreams) {
      throw new Error('could not find streams for: ' + groupName)
    }
    const stream = rawStreams.find(s => {
      return s.logStreamName === streamName
    })
    if (!stream) {
      throw new Error('could not find stream: ' + streamName)
    }

    let oldestTs = 0
    let youngestTs = Infinity
    for (const e of rawEvents) {
      if (!e.timestamp) continue
      if (e.timestamp > oldestTs) {
        oldestTs = e.timestamp
      }
      if (e.timestamp < youngestTs) {
        youngestTs = e.timestamp
      }
    }

    stream.lastIngestionTime = oldestTs
    stream.lastEventTimestamp = oldestTs
    stream.firstEventTimestamp = youngestTs
  }

  /** @returns {Promise<string>} */
  async bootstrap () {
    if (!this.httpServer) {
      throw new Error('cannot bootstrap closed server')
    }

    this.httpServer.on('request', (
      /** @type {http.IncomingMessage} */req,
      /** @type {http.ServerResponse} */res
    ) => {
      this.handleServerRequest(req, res)
    })

    const server = this.httpServer
    await util.promisify((/** @type {Callback} */ cb) => {
      server.listen(this.port, cb)
    })()

    const addr = this.httpServer.address()
    if (!addr || typeof addr === 'string') {
      throw new Error('invalid http server address')
    }

    this.hostPort = `localhost:${addr.port}`
    return this.hostPort
  }

  /** @returns {Promise<void>} */
  async close () {
    if (this.httpServer) {
      await util.promisify(
        this.httpServer.close.bind(this.httpServer)
      )()
      this.httpServer = null
    }
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @returns {void}
   */
  handleServerRequest (req, res) {
    let body = ''
    req.on('data', (
      /** @type {string} */ chunk
    ) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      const target = req.headers['x-amz-target']
      if (Array.isArray(target)) {
        throw new Error('bad request, array header x-amz-target')
      }

      const parts = (target || '').split('.')
      const lastPart = parts[parts.length - 1]

      /** @type {unknown} */
      let respBody
      switch (lastPart) {
        case 'DescribeLogGroups':
          respBody = this.describeLogGroups(body)
          break

        case 'DescribeLogStreams':
          respBody = this.describeLogStreams(body)
          break

        case 'GetLogEvents':
          respBody = this.getLogEvents(body)
          break

        default:
          break
      }

      if (typeof respBody !== 'object') {
        res.statusCode = 404
        res.end('Not Found')
        return
      }

      res.writeHead(200, {
        'Content-Type': 'application/x-amz-json-1.1'
      })
      res.end(JSON.stringify(respBody))
    })
  }

  /**
   * @template T
   * @param {T[]} rawItems
   * @param {string} [prevToken]
   * @param {number} [limit]
   * @returns {{ items: T[], nextToken?: string }}
   */
  paginate (rawItems, prevToken, limit) {
    let offset = 0
    if (prevToken) {
      const tokenInfo = this.tokens[prevToken]
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.tokens[prevToken]
      if (!tokenInfo) {
        throw new Error(`invalid nextToken: ${prevToken}`)
      }
      offset = tokenInfo.offset
    }

    const end = offset + (limit || 50)
    const items = rawItems.slice(offset, end)

    /** @type {string | undefined} */
    let nextToken
    if (rawItems.length > end) {
      nextToken = cuuid()
      this.tokens[nextToken] = { offset: end }
    }

    return { items, nextToken }
  }

  /**
   * @param {string} body
   * @returns {import('aws-sdk').CloudWatchLogs.DescribeLogGroupsResponse}
   */
  describeLogGroups (body) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const req = /** @type {DescribeLogGroupsRequest} */ (
      JSON.parse(body)
    )
    // TODO: default sort
    // TODO: req.logGroupNamePrefix

    const page = this.paginate(
      this.rawGroups, req.nextToken, req.limit
    )

    const res = {
      logGroups: page.items,
      nextToken: page.nextToken
    }
    return res
  }

  /**
   * @param {string} body
   * @returns {import('aws-sdk').CloudWatchLogs.DescribeLogStreamsResponse}
   */
  describeLogStreams (body) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const req = /** @type {
      DescribeLogStreamsRequest
    } */ (JSON.parse(body))
    // TODO: default sort
    // TODO: req.logStreamNamePrefix
    // TODO: req.descending
    // TODO: req.orderBy

    const streamsByGroup = this.rawStreams[req.logGroupName]
    if (!streamsByGroup) {
      return { logStreams: [] }
    }

    const page = this.paginate(
      streamsByGroup,
      req.nextToken,
      req.limit
    )

    const res = {
      logStreams: page.items,
      nextToken: page.nextToken
    }
    return res
  }

  /**
   * getLogEvents() always returns the tail of the events
   *
   * nextBackwardToken returns another record further back in
   * time.
   *
   * nextForwardToken returns a pointer to go forward in time
   *
   * So if you have 50 events and you get limit=10 return
   *      {
   *          events = 40-49
   *          nextForwardToken = pointer => 50-59
   *          nextBackwardToken = pointer => 30-39
   *      }
   *
   * If someone queries with the backward token return
   *
   *      {
   *          events = 30-39
   *          nextForwardToken = pointer => 40-49
   *          nextBackwardToken = pointer => 20-29
   *      }
   *
   * @param {string} body
   * @returns {import('aws-sdk').CloudWatchLogs.GetLogEventsResponse}
   */
  getLogEvents (body) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const req = /** @type {
      GetLogEventsRequest
    } */ (JSON.parse(body))
    // TODO: req.startFromHead

    const key = req.logGroupName + '~~' + req.logStreamName
    let events = this.rawEvents[key]
    if (!events) {
      return {
        events: []
      }
    }

    if (req.startTime || req.endTime) {
      const startTime = req.startTime || 0
      const endTime = req.endTime || Infinity
      events = events.filter((e) => {
        if (!e.timestamp) return false
        return startTime <= e.timestamp &&
          endTime > e.timestamp
      })
    }

    let offset = 0
    if (req.nextToken) {
      const tokenInfo = this.tokens[req.nextToken]
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.tokens[req.nextToken]
      if (!tokenInfo) {
        throw new Error(`invalid nextToken: ${req.nextToken}`)
      }
      offset = tokenInfo.offset
    }

    const limit = req.limit || 10000
    let start = events.length - limit - offset
    let end = events.length - offset

    if (start < 0) {
      start = 0
    }
    if (end < 0) {
      end = 0
    }

    const nextForwardToken = `f/${cuuid()}`
    this.tokens[nextForwardToken] = {
      offset: offset + (-limit)
    }
    const nextBackwardToken = `b/${cuuid()}`
    this.tokens[nextBackwardToken] = {
      offset: offset + limit
    }

    const items = events.slice(start, end)

    const res = {
      events: items,
      nextForwardToken,
      nextBackwardToken
    }
    return res
  }

  // TODO: getLogGroupFields ?
  // TODO: filterLogEvents ?
}
exports.FakeCloudwatchLogs = FakeCloudwatchLogs

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
