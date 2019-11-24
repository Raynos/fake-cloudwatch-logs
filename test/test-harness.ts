'use strict';

import * as AWS from 'aws-sdk';
import * as tape from 'tape';
import * as rimraf from 'rimraf';
import * as util from 'util';
import * as tapeCluster from 'tape-cluster';

import { FakeCloudwatchLogs } from '../src/index';

interface Callback {
    (err?: Error): void;
}

export class TestHarness {
    cwServer: FakeCloudwatchLogs;
    cw: AWS.CloudWatchLogs | null;

    constructor() {
        this.cwServer = new FakeCloudwatchLogs({
            port: 0
        });
        this.cw = null;
    }

    async bootstrap(): Promise<void> {
        const hostPort = await this.cwServer.bootstrap();

        this.cw = new AWS.CloudWatchLogs({
            region: 'us-east-1',
            endpoint: `http://${hostPort}`,
            sslEnabled: false,
            accessKeyId: '123',
            secretAccessKey: 'abc'
        });
    }

    getServer(): FakeCloudwatchLogs {
        return this.cwServer;
    }

    getCW(): AWS.CloudWatchLogs {
        if (!this.cw) throw new Error('not bootstrapped yet');
        return this.cw;
    }

    async close(): Promise<void> {
        await this.cwServer.close();

        for (const cachePath of this.cwServer.knownCaches) {
            await util.promisify((cb: Callback) => {
                rimraf(cachePath, cb);
            })();
        }
    }
}

export const test = tapeCluster(tape, TestHarness);
