import {
  CommandMessage,
  StatusMessage,
  ACKMessage,
  NACKMessage,
  SenderCreateStatusMessage,
  SenderCloseStatusMessage,
} from '../messagesTypes'
import { Connection } from '../types'
import { wait } from './utils'

export class MockConnection implements Connection {
  private messageHandler: ((msg: string) => Promise<void>) | undefined
  private errorHandler: ((error: Error) => Promise<void>) | undefined
  private closeHandler: (() => Promise<void>) | undefined

  private inflightCalls = new Map<string, number>()
  private commandHandlers = new Map<string, (cmd: CommandMessage<string, any>) => Promise<StatusMessage<any, any>>>()
  private commandAckHandlers = new Map<
    string,
    (cmd: CommandMessage<string, any>) => Promise<ACKMessage | NACKMessage>
  >()
  private statusAckHandler: (msg: StatusMessage<any, any>) => Promise<NACKMessage | ACKMessage> = async (
    msg,
  ): Promise<ACKMessage> => {
    return {
      for: msg.for,
      txn: msg.txn,
      ack: 'status',
    }
  }

  /**
   * mockResponse function that you can mockImplementation on
   * in order to respond to provide a response message to an actual message.
   * This only has a use for expected command-status
   *
   * Note this is never called with ack messages as we short circuit those
   */
  readonly mockMessageResponse = jest
    .fn<Promise<StatusMessage<any> | undefined>, [CommandMessage<string, any>]>()
    .mockImplementation(async (command: CommandMessage<string, any>) => {
      const handler = this.commandHandlers.get(command.command)
      if (!handler) {
        throw new Error(`Unexpected command with no mock handler ${command.command}`)
      }
      return await handler?.(command)
    })
  /**
   * Mock how we want to respond (whether ack or nack) when a serialized
   * command message if presented
   */
  readonly mockMessageAck = jest
    .fn<Promise<ACKMessage | NACKMessage>, [CommandMessage<string, any> | StatusMessage<any, any>]>()
    .mockImplementation(
      async (msg: CommandMessage<string, any> | StatusMessage<any, any>): Promise<ACKMessage | NACKMessage> => {
        const isCommand = !!(msg as CommandMessage<string, any>).command
        if (isCommand) {
          const command = msg as CommandMessage<string, any>
          const handler = this.commandAckHandlers.get(command.command)
          if (!handler) {
            throw new Error(`Unexpected command with no mock ACK handler ${command.command}`)
          }
          return await handler?.(command)
        } else {
          const status = msg as StatusMessage<any, any>
          return await this.statusAckHandler?.(status)
        }
      },
    )

  constructor(public numberOfMsgsBeforeAck: number, public waitResponseMs: number) {
    // add a default senderCreate response
    this.commandHandlers.set(
      'senderCreate',
      async (cmd: CommandMessage<any, any>): Promise<SenderCreateStatusMessage> => {
        return {
          for: 'senderId',
          txn: cmd.txn,
          result: 'success',
          data: {
            inactivity: 4000,
          },
        }
      },
    )
    this.commandHandlers.set(
      'senderClose',
      async (cmd: CommandMessage<any, any>): Promise<SenderCloseStatusMessage> => {
        return {
          for: 'senderId',
          txn: cmd.txn,
          result: 'success',
          data: {},
        }
      },
    )
    this.ackForCommand('senderCreate')
    this.ackForCommand('senderClose')
  }

  open = jest.fn().mockImplementation(async () => {
    // Nothing
  })
  sendMessage = jest.fn().mockImplementation(async (msg: string) => {
    const msgObj = JSON.parse(msg)
    const isCommand = !!(msgObj as CommandMessage<string, any>).command
    const isAck = !!(msgObj as ACKMessage).ack
    const isNack = !!(msgObj as NACKMessage).nack
    const isStatus = !!(msgObj as StatusMessage<any, any>).result

    if (isAck || isNack) {
      // short-circuit
      return
    }

    if (!this.inflightCalls.has(msg)) {
      this.inflightCalls.set(msg, 0)
    }
    let calls = this.inflightCalls.get(msg) as number
    this.inflightCalls.set(msg, ++calls)

    if (calls >= this.numberOfMsgsBeforeAck) {
      this.inflightCalls.delete(msg)
      const ackmsg = await this.mockMessageAck(JSON.parse(msg))
      await this.simulateIncomingMessage(JSON.stringify(ackmsg))
      // Nacks and status messages don't have futher lifecycle
      if ((ackmsg as NACKMessage).nack || isStatus) {
        return
      }
      // Simulate the response to a command
      await wait(this.waitResponseMs)
      const response = await this.mockMessageResponse(JSON.parse(msg))
      if (response) {
        await this.simulateIncomingMessage(JSON.stringify(response))
      }
    }
  })
  close = jest.fn().mockImplementation(async () => {
    // Nothing
  })

  onMessage(messageHandler: (msg: string) => Promise<void>): void {
    this.messageHandler = messageHandler
  }
  onError(errorHandler: (error: Error) => Promise<void>): void {
    this.errorHandler = errorHandler
  }
  onClose(closeHandler: () => Promise<void>): void {
    this.closeHandler = closeHandler
  }

  async simulateIncomingMessage(msg: string): Promise<void> {
    await this.messageHandler?.(msg)
  }

  async simulateError(error: Error): Promise<void> {
    await this.errorHandler?.(error)
  }

  async simulateclose(): Promise<void> {
    await this.closeHandler?.()
  }

  handleCommand(command: string, handler: (cmd: CommandMessage<string, any>) => Promise<StatusMessage<any, any>>) {
    this.commandHandlers.set(command, handler)
  }

  handleCommandAck(command: string, handler: (cmd: CommandMessage<string, any>) => Promise<NACKMessage | ACKMessage>) {
    this.commandAckHandlers.set(command, handler)
  }

  ackForCommand(command: string) {
    this.commandAckHandlers.set(command, async (cmd: CommandMessage<any, any>) => {
      return {
        ack: cmd.command,
        for: cmd.for,
        txn: cmd.txn,
      }
    })
  }

  nackForCommand(command: string) {
    this.commandAckHandlers.set(command, async (cmd: CommandMessage<any, any>): Promise<NACKMessage> => {
      return {
        nack: cmd.command,
        for: cmd.for,
        txn: cmd.txn,
        reason: 'noCommand',
      }
    })
  }

  statusAck(handler: (msg: StatusMessage<any, any>) => Promise<NACKMessage | ACKMessage>): void {
    this.statusAckHandler = handler
  }
}
