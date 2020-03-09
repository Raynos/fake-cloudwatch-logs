"use strict";Object.defineProperty(exports, "__esModule", {value: true});'use strict';

var _http = require('http'); var http = _http;
var _util = require('util'); var util = _util;
var _path = require('path'); var path = _path;











var _fs = require('fs'); var fs = _fs;

const mkdirP = util.promisify(fs.mkdir);
const writeFileP = util.promisify(fs.writeFile);
const readFileP = util.promisify(fs.readFile);
const readdirP = util.promisify(fs.readdir);













 class FakeCloudwatchLogs {
    
    
    
    
    
    
    
    
    



    constructor(options = {}) {
        this.httpServer = http.createServer();
        this.port = options.port || 0;
        this.hostPort = null;
        this.touchedCache = false;
        this.knownCaches = [];

        this.rawGroups = [];
        this.rawStreams = {};
        this.rawEvents = {};
        this.tokens = {};
    }

     async tryMkdir(filePath) {
        try {
            await mkdirP(filePath);
        } catch (maybeErr) {
            const err =  maybeErr;
            if (err.code !== 'EEXIST') throw err;
        }
    }

    async cacheGroupsToDisk(
        filePath, groups
    ) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }

        await this.tryMkdir(filePath);
        await writeFileP(
            path.join(filePath, 'groups.json'),
            JSON.stringify({
                type: 'cached-log-group',
                groups
            }),
            'utf8'
        );
    }

    async cacheStreamsToDisk(
        filePath, groupName, streams
    ) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }

        const key = encodeURIComponent(groupName);
        await this.tryMkdir(filePath);
        await this.tryMkdir(path.join(filePath, 'groups'));
        await this.tryMkdir(path.join(filePath, 'groups', key));
        await writeFileP(
            path.join(filePath, 'groups', key, 'streams.json'),
            JSON.stringify({
                type: 'cached-log-stream',
                groupName,
                streams
            })
        );
    }

    async cacheEventsToDisk(
        filePath,
        groupName,
        streamName,
        events
    ) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }

        const streamsDir = path.join(filePath, 'streams');
        const key = encodeURIComponent(groupName + ':' + streamName);

        await this.tryMkdir(filePath);
        await this.tryMkdir(path.join(streamsDir));
        await this.tryMkdir(path.join(streamsDir, key));
        await writeFileP(
            path.join(streamsDir, key, 'events.json'),
            JSON.stringify({
                type: 'cached-log-event',
                groupName,
                streamName,
                events
            })
        );
    }

    async populateFromCache(filePath) {
        let groupsStr = null;
        try {
            groupsStr = await readFileP(
                path.join(filePath, 'groups.json'), 'utf8'
            );
        } catch (maybeErr) {
            const err =  maybeErr;
            if (err.code !== 'ENOENT') throw err;
        }

        if (groupsStr) {
            const groupsInfo = 

 JSON.parse(groupsStr);
            this.populateGroups(groupsInfo.groups);
        }

        let groupDirs = null;
        try {
            groupDirs = await readdirP(
                path.join(filePath, 'groups')
            );
        } catch (maybeErr) {
            const err =  maybeErr;
            if (err.code !== 'ENOENT') throw err;
        }

        if (groupDirs) {
            for (const groupName of groupDirs) {
                const streamsStr = await readFileP(path.join(
                    filePath,
                    'groups',
                    groupName,
                    'streams.json'
                ), 'utf8');
                const streamsInfo = 


 JSON.parse(streamsStr);
                this.populateStreams(
                    streamsInfo.groupName,
                    streamsInfo.streams
                );
            }
        }

        let streamDirs = null;
        try {
            streamDirs = await readdirP(
                path.join(filePath, 'streams')
            );
        } catch (maybeErr) {
            const err =  maybeErr;
            if (err.code !== 'ENOENT') throw err;
        }

        if (streamDirs) {
            for (const dirName of streamDirs) {
                const eventsStr = await readFileP(path.join(
                    filePath,
                    'streams',
                    dirName,
                    'events.json'
                ), 'utf8');
                const eventsinfo = 



 JSON.parse(eventsStr);
                this.populateEvents(
                    eventsinfo.groupName,
                    eventsinfo.streamName,
                    eventsinfo.events
                );
            }
        }
    }

    populateGroups(groups) {
        this.rawGroups.push(...groups);
    }

    populateStreams(
        groupName,
        streams
    ) {
        let rawStreams = this.rawStreams[groupName];
        if (rawStreams === undefined) {
            rawStreams = this.rawStreams[groupName] = [];
        }
        rawStreams.push(...streams);
    }

    populateEvents(
        groupName,
        streamName,
        events
    ) {
        if (events.length === 0) {
            throw new Error('cannot add empty events array');
        }

        const key = groupName + '~~' + streamName;

        let rawEvents = this.rawEvents[key];
        if (rawEvents === undefined) {
            rawEvents = this.rawEvents[key] = [];
        }
        rawEvents.push(...events);
        rawEvents.sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return a.timestamp < b.timestamp ? -1 : 1;
        });

        const rawStreams = this.rawStreams[groupName];
        if (!rawStreams) {
            throw new Error('could not find streams for: ' + groupName);
        }
        const stream = rawStreams.find(s => {
            return s.logStreamName === streamName;
        });
        if (!stream) {
            throw new Error('could not find stream: ' + streamName);
        }

        let oldestTs = 0;
        let youngestTs = Infinity;
        for (const e of rawEvents) {
            if (!e.timestamp) continue;
            if (e.timestamp > oldestTs) {
                oldestTs = e.timestamp;
            }
            if (e.timestamp < youngestTs) {
                youngestTs = e.timestamp;
            }
        }

        stream.lastIngestionTime = oldestTs;
        stream.lastEventTimestamp = oldestTs;
        stream.firstEventTimestamp = youngestTs;
    }

    async bootstrap() {
        if (!this.httpServer) {
            throw new Error('cannot bootstrap closed server');
        }

        this.httpServer.on('request', (
            req,
            res
        ) => {
            this.handleServerRequest(req, res);
        });

        const server = this.httpServer;
        await util.promisify((cb) => {
            server.listen(this.port, cb);
        })();

        const addr = this.httpServer.address();
        if (!addr || typeof addr === 'string') {
            throw new Error('invalid http server address');
        }

        this.hostPort = `localhost:${addr.port}`;
        return this.hostPort;
    }

    async close() {
        if (this.httpServer) {
            await util.promisify(
                this.httpServer.close.bind(this.httpServer)
            )();
            this.httpServer = null;
        }
    }

     handleServerRequest(
        req,
        res
    ) {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const target = req.headers['x-amz-target'];
            if (Array.isArray(target)) {
                throw new Error('bad request, array header x-amz-target');
            }

            const parts = (target || '').split('.');
            const lastPart = parts[parts.length - 1];

            let respBody;
            switch (lastPart) {
                case 'DescribeLogGroups':
                    respBody = this.describeLogGroups(body);
                    break;

                case 'DescribeLogStreams':
                    respBody = this.describeLogStreams(body);
                    break;

                case 'GetLogEvents':
                    respBody = this.getLogEvents(body);
                    break;

                default:
                    break;
            }

            if (typeof respBody !== 'object') {
                res.statusCode = 404;
                res.end('Not Found');
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/x-amz-json-1.1'
            });
            res.end(JSON.stringify(respBody));
        });
    }

     paginate(
        rawItems,
        prevToken,
        limit
    ) {
        let offset = 0;
        if (prevToken) {
            const tokenInfo = this.tokens[prevToken];
            // tslint:disable-next-line: no-dynamic-delete
            delete this.tokens[prevToken];
            if (!tokenInfo) {
                throw new Error(`invalid nextToken: ${prevToken}`);
            }
            offset = tokenInfo.offset;
        }

        const end = offset + (limit || 50);
        const items = rawItems.slice(offset, end);

        let nextToken;
        if (rawItems.length > end) {
            nextToken = cuuid();
            this.tokens[nextToken] = { offset: end };
        }

        return { items, nextToken };
    }

     describeLogGroups(
        body
    ) {
        const req =  JSON.parse(body);
        // TODO: default sort
        // TODO: req.logGroupNamePrefix

        const page = this.paginate(
            this.rawGroups, req.nextToken, req.limit
        );

        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            logGroups: page.items,
            nextToken: page.nextToken
        };
        return res;
    }

     describeLogStreams(
        body
    ) {
        const req =  JSON.parse(body);
        // TODO: default sort
        // TODO: req.logStreamNamePrefix
        // TODO: req.descending
        // TODO: req.orderBy

        const streamsByGroup = this.rawStreams[req.logGroupName];
        if (!streamsByGroup) {
            return { logStreams: [] };
        }

        const page = this.paginate(
            streamsByGroup,
            req.nextToken,
            req.limit
        );

        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            logStreams: page.items,
            nextToken: page.nextToken
        };
        return res;
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
     */
     getLogEvents(
        body
    ) {
        const req =  JSON.parse(body);
        // TODO: req.startTime
        // TODO: req.endTime
        // TODO: req.startFromHead

        const key = req.logGroupName + '~~' + req.logStreamName;
        let events = this.rawEvents[key];
        if (!events) {
            return {
                events: []
            };
        }

        if (req.startTime || req.endTime) {
            const startTime = req.startTime || 0;
            const endTime = req.endTime || Infinity;
            events = events.filter((e) => {
                if (!e.timestamp) return false;
                return startTime <= e.timestamp &&
                    endTime > e.timestamp;
            });
        }

        let offset = 0;
        if (req.nextToken) {
            const tokenInfo = this.tokens[req.nextToken];
            // tslint:disable-next-line: no-dynamic-delete
            delete this.tokens[req.nextToken];
            if (!tokenInfo) {
                throw new Error(`invalid nextToken: ${req.nextToken}`);
            }
            offset = tokenInfo.offset;
        }

        const limit = req.limit || 10000;
        let start = events.length - limit - offset;
        let end = events.length - offset;

        if (start < 0) {
            start = 0;
        }
        if (end < 0) {
            end = 0;
        }

        const nextForwardToken = `f/${cuuid()}`;
        this.tokens[nextForwardToken] = {
            offset: offset + (-limit)
        };
        const nextBackwardToken = `b/${cuuid()}`;
        this.tokens[nextBackwardToken] = {
            offset: offset + limit
        };

        const items = events.slice(start, end);

        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            events: items,
            nextForwardToken,
            nextBackwardToken
        };
        return res;
    }

    // TODO: getLogGroupFields ?
    // TODO: filterLogEvents ?
} exports.FakeCloudwatchLogs = FakeCloudwatchLogs;

function cuuid() {
    const str = (
        Date.now().toString(16) +
        // tslint:disable-next-line: insecure-random
        Math.random().toString(16).slice(2) +
        // tslint:disable-next-line: insecure-random
        Math.random().toString(16).slice(2)
    ).slice(0, 32);
    return str.slice(0, 8) + '-' + str.slice(8, 12) + '-' +
        str.slice(12, 16) + '-' + str.slice(16, 20) + '-' +
        str.slice(20);
}
