// The variable the supervisor sets, to its own PID, on every process it
// starts: it tells the supervisor's group apart from a foreign one once the
// supervisor is gone.
export const SUPERVISOR_MARK = 'POLLY_SUPERVISOR_PID'
