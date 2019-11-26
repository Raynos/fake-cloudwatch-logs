'use strict';

import * as os from 'os';
import * as path from 'path';
import { test } from './test-harness';
import {
    LogGroup, LogStream, OutputLogEvent
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
        logEvents.push(makeLogEvent());
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
        `[INFO]: A log message: ${gCounter - 30}`
    );
    t.equal(
        res2.events![9].message,
        `[INFO]: A log message: ${gCounter - 21}`
    );
});

function makeLogEvent(): OutputLogEvent {
    return {
        timestamp: Date.now(),
        ingestionTime: Date.now(),
        message: `[INFO]: A log message: ${gCounter++}`
    };
}

function makeLogStream(): LogStream {
    return {
        logStreamName: `my-log-stream-${gCounter++}`,
        creationTime: Date.now(),
        firstEventTimestamp: 0,
        lastEventTimestamp: 0
    };
}

function makeLogGroup(): LogGroup {
    return {
        logGroupName: `my-log-group-${gCounter++}`,
        creationTime: Date.now(),
        retentionInDays: 7
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
