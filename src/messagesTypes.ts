export interface ACKMessage {
  ack: string // The Command Name
  for: string // The Sender Id that sent the command
  txn: string // The txn of the command we are acknowledging
  timeout?: number // The server may opt to return an estimated time to complete after ACK'ing
}

export interface NACKMessage {
  nack: string // The Command Name
  for: string // The Sender Id that tried to send it
  txn: string // The txn of the command we are acknowledging
  reason: 'noSender' | 'noCommand' | 'badMessage' // Additional information around the fast fail
}

export interface CommandMessage<Command extends string, CommandPayload> {
  for: string // Valid Sender Id from senderCreate command
  txn: string // A unique string for all in-flight sender commands
  command: Command
  data: CommandPayload
}

// Status Messages
export interface SuccessStatusMessage<StatusPayload> {
  for: string // Valid Sender Id from senderCreate command
  result: 'success'
  txn: string // A unique string for all in-flight
  data: StatusPayload
}

export type BaseErrorTypes = 'unauthorized' | 'unexpected'

export interface FailStatusMessage<ErrorTypes = never> {
  for: string // Valid Sender Id from senderCreate command
  result: 'fail'
  txn: string // A unique string for all in-flight
  error: {
    type: ErrorTypes | BaseErrorTypes
    message: string
  }
}

export type StatusMessage<SuccessPayload, ErrorType = never> =
  | SuccessStatusMessage<SuccessPayload>
  | FailStatusMessage<ErrorType>

// Common Command Messages

export interface SenderCreateCommand<AuthPayload> {
  command: 'senderCreate'
  txn: string // A uuid for response matching
  data: AuthPayload
}

// The senderCreate doesn't know it's for id yet
export type SenderCreateAckMessage = Omit<ACKMessage, 'for'>

export type SenderCreateStatusMessage =
  | SuccessStatusMessage<{
      // The amount of time that the reciever allows between command sending
      inactivity: number
      // Any auth verification returned for the sender
      auth?: string
    }>
  | FailStatusMessage<'tooMany'>

export type SenderCloseCommand<AuthVerifyPayload> = CommandMessage<
  'senderClose',
  {
    auth?: AuthVerifyPayload // The verification payload matched to the AuthPayload for the given reciever
  }
>

export type SenderCloseStatusMessage = SuccessStatusMessage<Record<string, never>> | FailStatusMessage

// Management infrastructure
export type CommandMap<Commands extends string> = {
  [key in Commands]: CommandMessage<Commands, any>
}
export type StatusMap<Commands extends string> = {
  [key in Commands]: SuccessStatusMessage<any> | FailStatusMessage<any>
}
