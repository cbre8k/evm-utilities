export declare const config: {
    readonly port: number;
    readonly nodeEnv: string;
    readonly mongo: {
        readonly uri: string;
    };
    readonly redis: {
        readonly url: string;
    };
    readonly rabbitmq: {
        readonly url: string;
    };
    readonly jobs: {
        readonly processTimeoutMs: number;
        readonly maxConcurrent: number;
        readonly rateLimitPerMin: number;
    };
    readonly ttl: {
        readonly trace: 3600;
        readonly selector: 604800;
        readonly job: 3600;
        readonly share: 0;
    };
    readonly etherscan: {
        readonly apiKey: string;
    };
};
//# sourceMappingURL=config.d.ts.map