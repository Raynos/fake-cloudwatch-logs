'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const util = require("util");
class FakeCloudwatchLogs {
    constructor(options = {}) {
        this.httpServer = http.createServer();
        this.port = options.port || 0;
        this.hostPort = null;
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
                case 'DescribeLogStreams':
                    respBody = this.describeLogStreams(body);
                    break;
                default:
                    break;
            }
            if (!respBody) {
                res.statusCode = 400;
                res.end('Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/x-amz-json-1.1'
            });
            res.end(JSON.stringify(respBody));
        });
    }
    describeLogStreams(body) {
    }
}
exports.FakeCloudwatchLogs = FakeCloudwatchLogs;
//# sourceMappingURL=index.js.map