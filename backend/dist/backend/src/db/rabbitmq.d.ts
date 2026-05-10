import { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
export declare const QUEUES: {
    readonly TX_TRACE: "tx.trace";
    readonly TX_SIMULATE: "tx.simulate";
    readonly TX_DECODE: "tx.decode";
};
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export declare function connectRabbitMQ(): Promise<ChannelModel>;
export declare function getPublishChannel(): Promise<Channel>;
export declare function createConsumerChannel(): Promise<Channel>;
export declare function getRabbitMQStatus(): Promise<boolean>;
export declare function publishJob(queue: QueueName, payload: object): Promise<boolean>;
export declare function consumeQueue(queue: QueueName, handler: (msg: ConsumeMessage, ch: Channel) => Promise<void>): Promise<void>;
//# sourceMappingURL=rabbitmq.d.ts.map