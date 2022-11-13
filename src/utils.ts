import { ACKMessage, CommandMessage, NACKMessage, StatusMessage } from './messagesTypes'

/**
 * Determines if a string message is of an incoming type that would match for a server
 *
 * This is useful when using Senders and Recievers on each side of a connection
 * @param msg
 * @returns
 */
export function messageIsForServer(
  msgObj: CommandMessage<any, any> | StatusMessage<any> | ACKMessage | NACKMessage,
): boolean {
  let forServer = false
  const ackOrNack = (msgObj as ACKMessage).ack || (msgObj as NACKMessage).nack
  if (ackOrNack) {
    forServer = ackOrNack === 'status'
  } else {
    forServer = !!(msgObj as CommandMessage<any, any>).command
  }
  return forServer
}

/**
 * Determines if a string message is of an incoming type that would match for a client to receive
 *
 * This is useful when using Senders and Recievers on each side of a connection
 * @param msg
 * @returns
 */
export function messageIsForClient(
  msgObj: CommandMessage<any, any> | StatusMessage<any> | ACKMessage | NACKMessage,
): boolean {
  let forServer = false
  const ackOrNack = (msgObj as ACKMessage).ack || (msgObj as NACKMessage).nack
  if (ackOrNack) {
    forServer = ackOrNack !== 'status'
  } else {
    forServer = !!(msgObj as StatusMessage<any>).result
  }
  return forServer
}

/**
 * This is basically just a JSON check, but can be used to verify that utility messages (like PING and PONG)
 * aren't being processed.
 *
 * @param msg
 * @returns
 */
export function tryToGetMessageObject(
  msg: string,
): CommandMessage<any, any> | StatusMessage<any> | ACKMessage | NACKMessage | null {
  try {
    return JSON.parse(msg)
  } catch (err) {
    return null
  }
}
