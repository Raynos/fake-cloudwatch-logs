"use strict";Object.defineProperty(exports, "__esModule", {value: true});'use strict';

var _awssdk = require('aws-sdk'); var AWS = _awssdk;
var _tape = require('@pre-bundled/tape'); var tape = _tape;
var _rimraf = require('@pre-bundled/rimraf'); var rimraf = _rimraf;
var _util = require('util'); var util = _util;
var _tapecluster = require('tape-cluster'); var tapeCluster = _tapecluster;

var _index = require('../src/index');





 class TestHarness {
    
    

    constructor() {
        this.cwServer = new (0, _index.FakeCloudwatchLogs)({
            port: 0
        });
        this.cw = null;
    }

    async bootstrap() {
        const hostPort = await this.cwServer.bootstrap();

        this.cw = new AWS.CloudWatchLogs({
            region: 'us-east-1',
            endpoint: `http://${hostPort}`,
            sslEnabled: false,
            accessKeyId: '123',
            secretAccessKey: 'abc'
        });
    }

    getServer() {
        return this.cwServer;
    }

    getCW() {
        if (!this.cw) throw new Error('not bootstrapped yet');
        return this.cw;
    }

    async close() {
        await this.cwServer.close();

        for (const cachePath of this.cwServer.knownCaches) {
            await util.promisify((cb) => {
                rimraf(cachePath, {
                    disableGlob: true
                }, cb);
            })();
        }
    }
} exports.TestHarness = TestHarness;

 const test = tapeCluster(tape, TestHarness); exports.test = test;
