'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const AWS = require("aws-sdk");
const tape = require("tape");
const rimraf = require("rimraf");
const util = require("util");
const tapeCluster = require("tape-cluster");
const index_1 = require("../src/index");
class TestHarness {
    constructor() {
        this.cwServer = new index_1.FakeCloudwatchLogs({
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
        if (!this.cw)
            throw new Error('not bootstrapped yet');
        return this.cw;
    }
    async close() {
        await this.cwServer.close();
        for (const cachePath of this.cwServer.knownCaches) {
            await util.promisify((cb) => {
                rimraf(cachePath, cb);
            })();
        }
    }
}
exports.TestHarness = TestHarness;
exports.test = tapeCluster(tape, TestHarness);
//# sourceMappingURL=test-harness.js.map