export interface Callback {
  (err?: Error): void;
}

export interface Dictionary<T> {
  [key: string]: T | undefined;
}
