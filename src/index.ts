'use strict';

import * as http from 'http';
import * as util from 'util';
import * as path from 'path';
import {
    DescribeLogGroupsRequest,
    DescribeLogGroupsResponse,
    LogGroup,
    LogStream,
    OutputLogEvent,
    DescribeLogStreamsResponse,
    DescribeLogStreamsRequest,
    GetLogEventsResponse,
    GetLogEventsRequest
} from 'aws-sdk/clients/cloudwatchlogs';
import * as fs from 'fs';

const mkdirP = util.promisify(fs.mkdir);
const writeFileP = util.promisify(fs.writeFile);
const readFileP = util.promisify(fs.readFile);
const readdirP = util.promisify(fs.readdir);

export interface Callback {
    (err?: Error): void;
}

export interface Options {
    port?: number;
}

export interface Dictionary<T> {
    [key: string]: T | undefined;
}

export class FakeCloudwatchLogs {
    touchedCache: boolean;
    knownCaches: string[];
    private httpServer: http.Server | null;
    private readonly port: number;
    private hostPort: string | null;
    private readonly rawGroups: LogGroup[];
    private readonly rawStreams: Dictionary<LogStream[]>;
    private readonly rawEvents: Dictionary<
        Dictionary<OutputLogEvent[]>
    >;
    private readonly tokens: Dictionary<{
        offset: number
    }>;

    constructor(options: Options = {}) {
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

    async cacheGroupsToDisk(
        filePath: string, groups: LogGroup[]
    ): Promise<void> {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }

        await mkdirP(filePath);
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
        filePath: string, groupName: string, streams: LogStream[]
    ): Promise<void> {
        this.touchedCache = true;
        if (!this.knownCaches.includes(filePath)) {
            this.knownCaches.push(filePath);
        }

        await mkdirP(filePath);
        await mkdirP(path.join(filePath, 'groups'));
        await mkdirP(path.join(filePath, 'groups', groupName));
        await writeFileP(
            path.join(filePath, 'groups', groupName, 'streams.json'),
            JSON.stringify({
                type: 'cached-log-stream',
                groupName,
                streams
            })
        );
    }

    async populateFromCache(filePath: string): Promise<void> {
        let groupsStr: string | null = null;
        try {
            groupsStr = await readFileP(
                path.join(filePath, 'groups.json'), 'utf8'
            );
        } catch (maybeErr) {
            const err = <NodeJS.ErrnoException> maybeErr;
            if (err.code !== 'ENOENT') throw err;
        }

        if (groupsStr) {
            const groupsInfo = <{
                groups: LogGroup[]
            }> JSON.parse(groupsStr);
            this.populateGroups(groupsInfo.groups);
        }

        let groupDirs: string[] | null = null;
        try {
            groupDirs = await readdirP(
                path.join(filePath, 'groups')
            );
        } catch (maybeErr) {
            const err = <NodeJS.ErrnoException> maybeErr;
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
                const streamsInfo = <{
                    groupName: string,
                    streams: LogStream[]
                }> JSON.parse(streamsStr);
                this.populateStreams(
                    streamsInfo.groupName,
                    streamsInfo.streams
                );
            }
        }
    }

    populateGroups(groups: LogGroup[]): void {
        this.rawGroups.push(...groups);
    }

    populateStreams(
        groupName: string,
        streams: LogStream[]
    ): void {
        let rawStreams = this.rawStreams[groupName];
        if (rawStreams === undefined) {
            rawStreams = this.rawStreams[groupName] = [];
        }
        rawStreams.push(...streams);
    }

    populateEvents(
        groupName: string,
        streamName: string,
        events: OutputLogEvent[]
    ): void {
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

    async bootstrap(): Promise<string> {
        if (!this.httpServer) {
            throw new Error('cannot bootstrap closed server');
        }

        this.httpServer.on('request', (
            req: http.IncomingMessage,
            res: http.ServerResponse
        ) => {
            this.handleServerRequest(req, res);
        });

        const server = this.httpServer;
        await util.promisify((cb: Callback) => {
            server.listen(this.port, cb);
        })();

        const addr = this.httpServer.address();
        if (!addr || typeof addr === 'string') {
            throw new Error('invalid http server address');
        }

        this.hostPort = `localhost:${addr.port}`;
        return this.hostPort;
    }

    async close(): Promise<void> {
        if (this.httpServer) {
            await util.promisify(
                this.httpServer.close.bind(this.httpServer)
            )();
            this.httpServer = null;
        }
    }

    private handleServerRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): void {
        let body = '';
        req.on('data', (chunk: string) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const target = req.headers['x-amz-target'];
            if (Array.isArray(target)) {
                throw new Error('bad request, array header x-amz-target');
            }

            const parts = (target || '').split('.');
            const lastPart = parts[parts.length - 1];

            let respBody: unknown;
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

    private paginate<T>(
        rawItems: T[],
        prevToken?: string,
        limit?: number
    ): { items: T[], nextToken?: string } {
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

        let nextToken: string | undefined;
        if (rawItems.length > end) {
            nextToken = cuuid();
            this.tokens[nextToken] = { offset: end };
        }

        return { items, nextToken };
    }

    private describeLogGroups(
        body: string
    ): DescribeLogGroupsResponse {
        const req = <DescribeLogGroupsRequest> JSON.parse(body);
        // TODO: req.logGroupNamePrefix
        // TODO: default sort

        const page = this.paginate(
            this.rawGroups, req.nextToken, req.limit
        );

        // tslint:disable-next-line: no-unnecessary-local-variable
        const res: DescribeLogGroupsResponse = {
            logGroups: page.items,
            nextToken: page.nextToken
        };
        return res;
    }

    private describeLogStreams(
        body: string
    ): DescribeLogStreamsResponse {
        const req = <DescribeLogStreamsRequest> JSON.parse(body);
        // TODO: default sort
        // TODO: req.logStreamNamePrefix
        // TODO: req.descending
        // TODO: req.orderBy

        const streamsByGroup = this.rawStreams[req.logGroupName];
        if (!streamsByGroup) {
            return {};
        }

        const page = this.paginate(
            streamsByGroup,
            req.nextToken,
            req.limit
        );

        // tslint:disable-next-line: no-unnecessary-local-variable
        const res: DescribeLogStreamsResponse = {
            logStreams: page.items,
            nextToken: page.nextToken
        };
        return res;
    }

    private getLogEvents(
        body: string
    ): GetLogEventsResponse {
        const req = <GetLogEventsRequest> JSON.parse(body);
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
        const res: GetLogEventsResponse = {
            events
        };
        return res;
    }

    // TODO: getLogEvents
    // TODO: getLogRecord

    // TODO: getLogGroupFields ?
    // TODO: filterLogEvents ?
}

function cuuid(): string {
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
