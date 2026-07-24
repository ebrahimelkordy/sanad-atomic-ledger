export const incomingMessageQueueConfig = {
  name: 'incoming-messages',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
};

export const outgoingMessageQueueConfig = {
  name: 'outgoing-messages',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
};
