// TypeScript Version: 3.0
/// <reference types="node" />

declare namespace rimraf {}
declare function rimraf(
    filePath: string,
    cb: (err?: Error) => void
): void;

export = rimraf;
