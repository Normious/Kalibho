export const STRATEGIES = {
  suffix: {
    name: 'suffix',
    description: 'Appends -2, -3, -4... up to max attempts, then falls back to timestamp',
    example: 'hello-world → hello-world-2 → hello-world-3',
  },
  timestamp: {
    name: 'timestamp',
    description: 'Appends a base36-encoded timestamp suffix',
    example: 'hello-world → hello-world-1a2b3c4d',
  },
  uuid: {
    name: 'uuid',
    description: 'Appends a 6-character random suffix',
    example: 'hello-world → hello-world-k8j3f9',
  },
};

export function listStrategies() {
  return Object.values(STRATEGIES);
}
