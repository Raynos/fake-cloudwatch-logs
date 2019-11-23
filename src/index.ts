'use strict';

import * as http from 'http';
import * as util from 'util';

export interface Callback {
    (err?: Error): void;
}

export interface Options {
    port?: number;
}

export class FakeCloudwatchLogs {
    private httpServer: http.Server | null;
    private readonly port: number;
    private hostPort: string | null;

    constructor(options: Options = {}) {
        this.httpServer = http.createServer();
        this.port = options.port || 0;
        this.hostPort = null;
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
        })

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
    ) {
        let body = '';
        req.on('data', (chunk: string) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const target = req.headers['x-amz-target'];
            if (Array.isArray(target)) {
                throw new Error('bad request, array header x-amz-target')
            }

            const parts = (target || '').split('.');
            const lastPart = parts[parts.length - 1]

            let respBody: unknown;
            switch (lastPart) {
                case 'DescribeLogStreams':
                    respBody = this.describeLogStreams(body);
                    break

                default:
                    break
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

    private describeLogStreams(body: string) {

    }
}

