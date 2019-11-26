'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const util = require("util");
const path = require("path");
const fs = require("fs");
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
    async cacheGroupsToDisk(filePath, groups) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }
        await mkdirP(filePath);
        await writeFileP(path.join(filePath, 'groups.json'), JSON.stringify({
            type: 'cached-log-group',
            groups
        }), 'utf8');
    }
    async cacheStreamsToDisk(filePath, groupName, streams) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }
        await mkdirP(filePath);
        await mkdirP(path.join(filePath, 'groups'));
        await mkdirP(path.join(filePath, 'groups', groupName));
        await writeFileP(path.join(filePath, 'groups', groupName, 'streams.json'), JSON.stringify({
            type: 'cached-log-stream',
            groupName,
            streams
        }));
    }
    async cacheEventsToDisk(filePath, groupName, streamName, events) {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }
        const streamsDir = path.join(filePath, 'streams');
        const key = groupName + ':' + streamName;
        await mkdirP(filePath);
        await mkdirP(path.join(streamsDir));
        await mkdirP(path.join(streamsDir, key));
        await writeFileP(path.join(streamsDir, key, 'events.json'), JSON.stringify({
            type: 'cached-log-event',
            groupName,
            streamName,
            events
        }));
    }
    async populateFromCache(filePath) {
        let groupsStr = null;
        try {
            groupsStr = await readFileP(path.join(filePath, 'groups.json'), 'utf8');
        }
        catch (maybeErr) {
            const err = maybeErr;
            if (err.code !== 'ENOENT')
                throw err;
        }
        if (groupsStr) {
            const groupsInfo = JSON.parse(groupsStr);
            this.populateGroups(groupsInfo.groups);
        }
        let groupDirs = null;
        try {
            groupDirs = await readdirP(path.join(filePath, 'groups'));
        }
        catch (maybeErr) {
            const err = maybeErr;
            if (err.code !== 'ENOENT')
                throw err;
        }
        if (groupDirs) {
            for (const groupName of groupDirs) {
                const streamsStr = await readFileP(path.join(filePath, 'groups', groupName, 'streams.json'), 'utf8');
                const streamsInfo = JSON.parse(streamsStr);
                this.populateStreams(streamsInfo.groupName, streamsInfo.streams);
            }
        }
        let streamDirs = null;
        try {
            streamDirs = await readdirP(path.join(filePath, 'streams'));
        }
        catch (maybeErr) {
            const err = maybeErr;
            if (err.code !== 'ENOENT')
                throw err;
        }
        if (streamDirs) {
            for (const dirName of streamDirs) {
                const eventsStr = await readFileP(path.join(filePath, 'streams', dirName, 'events.json'), 'utf8');
                const eventsinfo = JSON.parse(eventsStr);
                this.populateEvents(eventsinfo.groupName, eventsinfo.streamName, eventsinfo.events);
            }
        }
    }
    populateGroups(groups) {
        this.rawGroups.push(...groups);
    }
    populateStreams(groupName, streams) {
        let rawStreams = this.rawStreams[groupName];
        if (rawStreams === undefined) {
            rawStreams = this.rawStreams[groupName] = [];
        }
        rawStreams.push(...streams);
    }
    populateEvents(groupName, streamName, events) {
        let eventsByGroup = this.rawEvents[groupName];
        if (eventsByGroup === undefined) {
            eventsByGroup = this.rawEvents[groupName] = {};
        }
        let eventsByStream = eventsByGroup[streamName];
        if (!eventsByStream) {
            eventsByStream = eventsByGroup[streamName] = [];
        }
        eventsByStream.push(...events);
    }
    async bootstrap() {
        if (!this.httpServer) {
            throw new Error('cannot bootstrap closed server');
        }
        this.httpServer.on('request', (req, res) => {
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
            await util.promisify(this.httpServer.close.bind(this.httpServer))();
            this.httpServer = null;
        }
    }
    handleServerRequest(req, res) {
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
    paginate(rawItems, prevToken, limit) {
        let offset = 0;
        if (prevToken) {
            const tokenInfo = this.tokens[prevToken];
            // tslint:disable-next-line: no-dynamic-delete
            delete this.tokens[prevToken];
            if (!tokenInfo) {
                throw new Error(`invalid prevToken: ${prevToken}`);
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
    describeLogGroups(body) {
        const req = JSON.parse(body);
        // TODO: req.logGroupNamePrefix
        // TODO: default sort
        const page = this.paginate(this.rawGroups, req.nextToken, req.limit);
        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            logGroups: page.items,
            nextToken: page.nextToken
        };
        return res;
    }
    describeLogStreams(body) {
        const req = JSON.parse(body);
        // TODO: default sort
        // TODO: req.logStreamNamePrefix
        // TODO: req.descending
        // TODO: req.orderBy
        const streamsByGroup = this.rawStreams[req.logGroupName];
        if (!streamsByGroup) {
            return {};
        }
        const page = this.paginate(streamsByGroup, req.nextToken, req.limit);
        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            logStreams: page.items,
            nextToken: page.nextToken
        };
        return res;
    }
    getLogEvents(body) {
        const req = JSON.parse(body);
        // TODO: req.startTime
        // TODO: req.endTime
        // TODO: req.startFromHead
        const eventsByGroup = this.rawEvents[req.logGroupName];
        if (!eventsByGroup) {
            return {};
        }
        const events = eventsByGroup[req.logStreamName];
        if (!events) {
            return {};
        }
        // tslint:disable-next-line: no-unnecessary-local-variable
        const res = {
            events: events.slice(0, req.limit || 50)
        };
        return res;
    }
}
exports.FakeCloudwatchLogs = FakeCloudwatchLogs;
function cuuid() {
    const str = (Date.now().toString(16) +
        // tslint:disable-next-line: insecure-random
        Math.random().toString(16).slice(2) +
        // tslint:disable-next-line: insecure-random
        Math.random().toString(16).slice(2)).slice(0, 32);
    return str.slice(0, 8) + '-' + str.slice(8, 12) + '-' +
        str.slice(12, 16) + '-' + str.slice(16, 20) + '-' +
        str.slice(20);
}
//# sourceMappingURL=index.js.map