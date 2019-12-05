'use strict';

import * as os from 'os';
import * as path from 'path';
import { test } from './test-harness';
import {
    LogGroup, LogStream, OutputLogEvent, GetLogEventsResponse
} from 'aws-sdk/clients/cloudwatchlogs';

let gCounter = 0;

// tslint:disable: no-non-null-assertion

test('can fetch cloudwatch groups', async (harness, t) => {
    const cw = harness.getCW();

    const res = await cw.describeLogGroups().promise();
    t.ok(res.logGroups);
    t.equal(res.logGroups!.length, 0);

    const server = harness.getServer();
    server.populateGroups([
        makeLogGroup()
    ]);

    const res2 = await cw.describeLogGroups().promise();
    t.ok(res2.logGroups);
    t.equal(res2.logGroups!.length, 1);
    t.equal(
        res2.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 1}`
    );
});

test('can fetch limit=10 groups', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logGroups: LogGroup[] = [];
    for (let i = 0; i < 100; i++) {
        logGroups.push(makeLogGroup());
    }
    server.populateGroups(logGroups);

    const res1 = await cw.describeLogGroups().promise();
    t.ok(res1.logGroups);
    t.equal(res1.logGroups!.length, 50);
    t.equal(
        res1.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 100}`
    );
    t.equal(
        res1.logGroups![49].logGroupName,
        `my-log-group-${gCounter - 51}`
    );

    const res2 = await cw.describeLogGroups({
        limit: 10
    }).promise();
    t.ok(res2.logGroups);
    t.equal(res2.logGroups!.length, 10);
    t.equal(
        res2.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 100}`
    );
    t.equal(
        res2.logGroups![9].logGroupName,
        `my-log-group-${gCounter - 91}`
    );
});

test('can fetch two batches of groups', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logGroups: LogGroup[] = [];
    for (let i = 0; i < 30; i++) {
        logGroups.push(makeLogGroup());
    }
    server.populateGroups(logGroups);

    const res1 = await cw.describeLogGroups({
        limit: 10
    }).promise();
    t.ok(res1.logGroups);
    t.ok(res1.nextToken);
    t.equal(res1.logGroups!.length, 10);
    t.equal(
        res1.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 30}`
    );
    t.equal(
        res1.logGroups![9].logGroupName,
        `my-log-group-${gCounter - 21}`
    );

    const res2 = await cw.describeLogGroups({
        limit: 10,
        nextToken: res1.nextToken
    }).promise();
    t.ok(res2.logGroups);
    t.ok(res2.nextToken);
    t.equal(res2.logGroups!.length, 10);
    t.equal(
        res2.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 20}`
    );
    t.equal(
        res2.logGroups![9].logGroupName,
        `my-log-group-${gCounter - 11}`
    );
});

test('can fetch cloudwatch streams', async (harness, t) => {
    const cw = harness.getCW();

    const res = await cw.describeLogStreams({
        logGroupName: 'test-group'
    }).promise();
    t.ok(res);
    t.equal(res.logStreams, undefined);

    const server = harness.getServer();
    server.populateStreams('test-group', [
        makeLogStream()
    ]);

    const res2 = await cw.describeLogStreams({
        logGroupName: 'test-group'
    }).promise();
    t.ok(res2.logStreams);
    t.equal(res2.logStreams!.length, 1);
    t.equal(
        res2.logStreams![0].logStreamName,
        `my-log-stream-${gCounter - 1}`
    );
});

test('can fetch two batches of streams', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logStreams: LogStream[] = [];
    for (let i = 0; i < 30; i++) {
        logStreams.push(makeLogStream());
    }
    server.populateStreams('test-group', logStreams);

    const res1 = await cw.describeLogStreams({
        limit: 10,
        logGroupName: 'test-group'
    }).promise();
    t.ok(res1.logStreams);
    t.ok(res1.nextToken);
    t.equal(res1.logStreams!.length, 10);
    t.equal(
        res1.logStreams![0].logStreamName,
        `my-log-stream-${gCounter - 30}`
    );
    t.equal(
        res1.logStreams![9].logStreamName,
        `my-log-stream-${gCounter - 21}`
    );

    const res2 = await cw.describeLogStreams({
        limit: 10,
        logGroupName: 'test-group',
        nextToken: res1.nextToken
    }).promise();
    t.ok(res2.logStreams);
    t.ok(res2.nextToken);
    t.equal(res2.logStreams!.length, 10);
    t.equal(
        res2.logStreams![0].logStreamName,
        `my-log-stream-${gCounter - 20}`
    );
    t.equal(
        res2.logStreams![9].logStreamName,
        `my-log-stream-${gCounter - 11}`
    );
});

test('can fetch log events', async (harness, t) => {
    const cw = harness.getCW();

    const res1 = await cw.getLogEvents({
        logGroupName: 'test-group',
        logStreamName: 'test-stream'
    }).promise();
    t.ok(res1);
    t.equal(res1.events, undefined);

    const server = harness.getServer();
    server.populateEvents('test-group', 'test-stream', [
        makeLogEvent()
    ]);

    const res2 = await cw.getLogEvents({
        logGroupName: 'test-group',
        logStreamName: 'test-stream'
    }).promise();
    t.ok(res2);
    t.ok(res2.events);
    t.equal(res2.events!.length, 1);
    t.equal(
        res2.events![0].message,
        `[INFO]: A log message: ${gCounter - 1}`
    );
});

test('can fetch uneven pages of log events', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logEvents: OutputLogEvent[] = [];
    for (let i = 0; i < 100; i++) {
        logEvents.push(makeLogEvent(100 - i));
    }
    server.populateEvents('test-group', 'test-stream', logEvents);

    const pages: Array<OutputLogEvent[]> = [];

    let result: GetLogEventsResponse | null = null;
    do {
        result = await cw.getLogEvents({
            limit: 8,
            logGroupName: 'test-group',
            logStreamName: 'test-stream',
            nextToken: result ?
                result.nextBackwardToken : undefined
        }).promise();

        if (result.events && result.events.length > 0) {
            pages.push(result.events);
        }
    } while (result.events && result.events.length !== 0);

    t.equal(pages.length, 13);
    for (const [index, p] of pages.entries()) {
        t.equal(p.length, index === 12 ? 4 : 8);
    }
});

test('can fetch pages of log events', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logEvents: OutputLogEvent[] = [];
    for (let i = 0; i < 50; i++) {
        logEvents.push(makeLogEvent(50 - i));
    }
    server.populateEvents('test-group', 'test-stream', logEvents);

    const res1 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream'
    }).promise();
    t.ok(res1.events);
    t.ok(res1.nextBackwardToken);
    t.ok(res1.nextForwardToken);
    t.equal(res1.events!.length, 10);
    t.equal(
        res1.events![0].message,
        `[INFO]: A log message: ${gCounter - 10}`
    );
    t.equal(
        res1.events![9].message,
        `[INFO]: A log message: ${gCounter - 1}`
    );
    const ts0 = res1.events![0].timestamp;
    const ts9 = res1.events![9].timestamp;
    t.ok(ts0 && ts9 && ts0 < ts9);

    const res2 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        nextToken: res1.nextForwardToken
    }).promise();
    t.ok(res2.events);
    t.equal(res2.events!.length, 0);
    t.ok(res2.nextBackwardToken);
    t.ok(res2.nextForwardToken);

    const res3 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        nextToken: res2.nextBackwardToken
    }).promise();
    t.ok(res3.events);
    t.equal(res3.events!.length, 10);
    t.ok(res3.nextBackwardToken);
    t.ok(res3.nextForwardToken);
    t.equal(
        res3.events![0].message,
        `[INFO]: A log message: ${gCounter - 10}`
    );
    t.equal(
        res3.events![9].message,
        `[INFO]: A log message: ${gCounter - 1}`
    );
    const ts3_0 = res3.events![0].timestamp;
    const ts3_9 = res3.events![9].timestamp;
    t.ok(ts3_0 && ts3_9 && ts3_0 < ts3_9);

    const res4 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        nextToken: res3.nextBackwardToken
    }).promise();
    t.ok(res4.events);
    t.equal(res4.events!.length, 10);
    t.ok(res4.nextBackwardToken);
    t.ok(res4.nextForwardToken);
    t.equal(
        res4.events![0].message,
        `[INFO]: A log message: ${gCounter - 20}`
    );
    t.equal(
        res4.events![9].message,
        `[INFO]: A log message: ${gCounter - 11}`
    );
    const ts4_0 = res4.events![0].timestamp;
    const ts4_9 = res4.events![9].timestamp;
    t.ok(ts4_0 && ts4_9 && ts4_0 < ts4_9);

    const res5 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        nextToken: res4.nextBackwardToken
    }).promise();
    t.ok(res5.events);
    t.equal(res5.events!.length, 10);
    t.ok(res5.nextBackwardToken);
    t.ok(res5.nextForwardToken);
    t.equal(
        res5.events![0].message,
        `[INFO]: A log message: ${gCounter - 30}`
    );
    t.equal(
        res5.events![9].message,
        `[INFO]: A log message: ${gCounter - 21}`
    );
    const ts5_0 = res5.events![0].timestamp;
    const ts5_9 = res5.events![9].timestamp;
    t.ok(ts5_0 && ts5_9 && ts5_0 < ts5_9);

    const res6 = await cw.getLogEvents({
        limit: 10,
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        nextToken: res5.nextForwardToken
    }).promise();
    t.ok(res6.events);
    t.equal(res6.events!.length, 10);
    t.ok(res6.nextBackwardToken);
    t.ok(res6.nextForwardToken);
    t.equal(
        res6.events![0].message,
        `[INFO]: A log message: ${gCounter - 20}`
    );
    t.equal(
        res6.events![9].message,
        `[INFO]: A log message: ${gCounter - 11}`
    );
    const ts6_0 = res6.events![0].timestamp;
    const ts6_9 = res6.events![9].timestamp;
    t.ok(ts6_0 && ts6_9 && ts6_0 < ts6_9);
});

test('can cache groups to disk', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logGroups: LogGroup[] = [];
    for (let i = 0; i < 30; i++) {
        logGroups.push(makeLogGroup());
    }

    const cachePath = path.join(
        os.tmpdir(), `test-fake-cloudwatch-logs-${cuuid()}`
    );

    await server.cacheGroupsToDisk(cachePath, logGroups);
    await server.populateFromCache(cachePath);

    const res1 = await cw.describeLogGroups({
        limit: 10
    }).promise();
    t.ok(res1.logGroups);
    t.ok(res1.nextToken);
    t.equal(res1.logGroups!.length, 10);
    t.equal(
        res1.logGroups![0].logGroupName,
        `my-log-group-${gCounter - 30}`
    );
    t.equal(
        res1.logGroups![9].logGroupName,
        `my-log-group-${gCounter - 21}`
    );
});

test('can cache streams to disk', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logStreams: LogStream[] = [];
    for (let i = 0; i < 30; i++) {
        logStreams.push(makeLogStream());
    }

    const cachePath = path.join(
        os.tmpdir(), `test-fake-cloudwatch-logs-${cuuid()}`
    );
    await server.cacheStreamsToDisk(
        cachePath, 'test-group', logStreams
    );
    await server.populateFromCache(cachePath);

    const res1 = await cw.describeLogStreams({
        limit: 10,
        logGroupName: 'test-group'
    }).promise();
    t.ok(res1.logStreams);
    t.ok(res1.nextToken);
    t.equal(res1.logStreams!.length, 10);
    t.equal(
        res1.logStreams![0].logStreamName,
        `my-log-stream-${gCounter - 30}`
    );
    t.equal(
        res1.logStreams![9].logStreamName,
        `my-log-stream-${gCounter - 21}`
    );
});

test('can cache events to disk', async (harness, t) => {
    const cw = harness.getCW();
    const server = harness.getServer();

    const logEvents: OutputLogEvent[] = [];
    for (let i = 0; i < 30; i++) {
        logEvents.push(makeLogEvent(30 - i));
    }

    const cachePath = path.join(
        os.tmpdir(), `test-fake-cloudwatch-logs-${cuuid()}`
    );
    await server.cacheEventsToDisk(
        cachePath, 'test-group', 'test-stream', logEvents
    );
    await server.populateFromCache(cachePath);

    const res2 = await cw.getLogEvents({
        logGroupName: 'test-group',
        logStreamName: 'test-stream',
        limit: 10
    }).promise();
    t.ok(res2.events);
    t.equal(res2.events!.length, 10);
    t.equal(
        res2.events![0].message,
        `[INFO]: A log message: ${gCounter - 10}`
    );
    t.equal(
        res2.events![9].message,
        `[INFO]: A log message: ${gCounter - 1}`
    );
    const ts0 = res2.events![0].timestamp;
    const ts9 = res2.events![9].timestamp;
    t.ok(ts0 && ts9 && ts0 < ts9);
});

function makeLogEvent(timeOffset?: number): OutputLogEvent {
    timeOffset = timeOffset || 0;
    return {
        timestamp: Date.now() - timeOffset,
        ingestionTime: Date.now(),
        message: `[INFO]: A log message: ${gCounter++}`
    };
}

function makeLogStream(): LogStream {
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
            // tslint:disable-next-line: insecure-random
            Math.random().toString() + Math.random().toString() +
            // tslint:disable-next-line: insecure-random
            Math.random().toString() + Math.random().toString()
        ).replace(/\./g, ''),
        // tslint:disable-next-line: insecure-random
        storedBytes: Math.floor(Math.random() * 1024 * 1024)
    };
}

function makeLogGroup(): LogGroup {
    const logGroupName = `my-log-group-${gCounter++}`;
    return {
        logGroupName,
        creationTime: Date.now(),
        metricFilterCount: 0,
        arn: `arn:aws:logs:us-east-1:0:log-group:${logGroupName}:*`,
        // tslint:disable-next-line: insecure-random
        storedBytes: Math.floor(Math.random() * 1024 * 1024)
    };
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
