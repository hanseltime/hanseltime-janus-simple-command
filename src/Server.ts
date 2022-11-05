import { BaseMsgSend, BaseMsgSendOptions, SendMessageReturn } from './BaseMsgSend'
import { intGeneratorFactory } from './idGenerators'
import {
  ACKMessage,
  NACKMessage,
  CommandMessage,
  CommandMap,
  StatusMap,
  SenderCreateCommand,
  SenderCreateStatusMessage,
  SenderCloseCommand,
  SenderCloseStatusMessage,
  SuccessStatusMessage,
  FailStatusMessage,
  SenderCreateAckMessage,
} from './messagesTypes'
import { ReceiverTxnManager } from './txn/ReceiverTxnManager'

export interface ServerOptions extends BaseMsgSendOptions {
  idGenerator?: () => string
  maxSenderInactivity: number // the amount, in milliseconds that a sender can go without sending a command
}

type HandlerReturn<T extends SuccessStatusMessage<any> | FailStatusMessage<any>> =
  | {
      isError: false
      data: Extract<T, { result: 'success' }>['data']
    }
  | {
      isError: true
      data: Extract<T, { result: 'fail' }>['error']
    }

type ValidCommandHandlers<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
> =
  | (<C extends Commands>(msg: CMap[C]) => Promise<HandlerReturn<SMap[C]>>)
  | ((msg: SenderCreateCommand<any>) => Promise<HandlerReturn<SenderCreateStatusMessage>>)
  | ((msg: SenderCloseCommand<any>) => Promise<HandlerReturn<SenderCloseStatusMessage>>)

interface HandlerConfig<Commands extends string, CMap extends CommandMap<Commands>, SMap extends StatusMap<Commands>> {
  handler: ValidCommandHandlers<Commands, CMap, SMap>
  maxTimeout: number
}

class Server<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
> extends BaseMsgSend {
  static readonly maxNumberCollisions = 100

  private idGenerator: () => string
  private maxSenderInactivity: number

  private senderTxnManagers = new Map<string, ReceiverTxnManager>()
  private createCmdTxnManager = new ReceiverTxnManager() // Tracks senderCreate transactions
  private commandHandlers = new Map<Commands | 'senderCreate' | 'senderClose', HandlerConfig<Commands, CMap, SMap>>()

  constructor(options: ServerOptions) {
    super(options)
    this.idGenerator = options.idGenerator ?? intGeneratorFactory()
    this.maxSenderInactivity = options.maxSenderInactivity

    this.commandHandlers.set('senderClose', {
      handler: async (msg: SenderCloseCommand<any>): Promise<HandlerReturn<SenderCloseStatusMessage>> => {
        // TODO: auth verification
        this.senderTxnManagers.delete(msg.for)
        return {
          isError: false,
          data: {},
        }
      },
      maxTimeout: 3000,
    })

    this.connection.onMessage(async (msg) => {
      const msgObj = JSON.parse(msg) as CommandMessage<Commands, any> | ACKMessage | NACKMessage
      const txn = msgObj.txn

      // Verify the message has a sender of is creating one
      if (!msgObj.for) {
        if ((msgObj as SenderCreateCommand<any>).command !== 'senderCreate') {
          if ((msgObj as CommandMessage<Commands, any>).command) {
            const nack: NACKMessage = {
              nack: (msgObj as CommandMessage<Commands, any>).command,
              for: msgObj.for,
              txn: msgObj.txn,
              reason: 'badMessage',
            }
            await this.sendMsgWithNoRetry(JSON.stringify(nack))
          }
          // Log it regardless for the sake of monitoring
          console.error(`Did not supply senderId for txn: ${msgObj.txn}`)
          return
        }
        await this.handleSenderCreateMessage(msgObj as SenderCreateCommand<any>)
        return
      }

      const txnManager = this.getTxnManager(msgObj.for)
      if (!txnManager) {
        // There's essentially no sender record
        if ((msgObj as CommandMessage<Commands, any>).command) {
          const nack: NACKMessage = {
            nack: (msgObj as CommandMessage<Commands, any>).command,
            for: msgObj.for,
            txn: msgObj.txn,
            reason: 'noSender',
          }
          await this.sendMsgWithNoRetry(JSON.stringify(nack))
        }
        // acks's for closed senders have no meaning
        return
      }

      // ingest the acknowledge
      if ((msgObj as ACKMessage).ack) {
        await txnManager.ack(txn)
        return
      } else if ((msgObj as NACKMessage).nack) {
        await txnManager.nack(txn)
        return
      }

      const { command } = msgObj as CommandMessage<Commands, any>

      const handlerConfig = this.commandHandlers.get(command)
      if (!handlerConfig) {
        // TODO: throw?
        const nack: NACKMessage = {
          nack: command,
          for: msgObj.for,
          txn: msgObj.txn,
          reason: 'noCommand',
        }
        await this.sendMsgWithNoRetry(JSON.stringify(nack))
        return
      }

      // Log the transaction
      let sendMessageReturn: SendMessageReturn
      txnManager.start(txn, {
        onAck: async () => {
          sendMessageReturn?.stopRetry()
        },
        onNack: async () => {
          sendMessageReturn?.stopRetry()
        },
      })
      // ACK as soon as we can
      const ack: ACKMessage = {
        ack: command,
        for: msgObj.for,
        txn: msgObj.txn,
        timeout: handlerConfig.maxTimeout,
      }
      await this.sendMsgWithNoRetry(JSON.stringify(ack))

      // Use the handler
      const handlerReturn = await handlerConfig.handler(msgObj as any)

      let statusMessage: FailStatusMessage<any> | SuccessStatusMessage<any>
      if (handlerReturn.isError) {
        statusMessage = {
          for: msgObj.for,
          txn: msgObj.txn,
          result: 'fail',
          error: handlerReturn.data,
        }
      } else {
        statusMessage = {
          for: msgObj.for,
          txn: msgObj.txn,
          result: 'success',
          data: handlerReturn.data,
        }
      }

      sendMessageReturn = await this.sendWithRetry(JSON.stringify(statusMessage), {
        onTimeout: async () => {
          await txnManager.remove(txn)
        },
      })
    })
  }

  setMessageHandler<C extends Commands>(
    command: C,
    config: {
      handler: (msg: CMap[C]) => Promise<HandlerReturn<SMap[C]>>
      maxTimeout: number
    },
  ): void {
    this.commandHandlers.set(command, config as HandlerConfig<Commands, CMap, SMap>)
  }

  removeMessageHandler<C extends Commands>(command: C): boolean {
    return this.commandHandlers.delete(command)
  }

  private getTxnManager(senderId: string): ReceiverTxnManager | undefined {
    return this.senderTxnManagers.get(senderId)
  }

  private async handleSenderCreateMessage(msg: SenderCreateCommand<any>) {
    // Send acknowledgement asap
    const ack: SenderCreateAckMessage = {
      ack: msg.command,
      txn: msg.txn,
      timeout: 3000,
    }
    await this.sendMsgWithNoRetry(JSON.stringify(ack))

    let senderId: string
    let retry = 0
    do {
      if (retry < Server.maxNumberCollisions) {
        throw new Error('Too Many Id Collisions')
      }
      senderId = this.idGenerator()
      retry++
    } while (this.senderTxnManagers.has(senderId))
    const txnManager = new ReceiverTxnManager()
    this.senderTxnManagers.set(senderId, txnManager)

    let sendMsgReturn: SendMessageReturn
    this.createCmdTxnManager.start(msg.txn, {
      onAck: async () => {
        sendMsgReturn?.stopRetry()
      },
      onNack: async () => {
        sendMsgReturn?.stopRetry()
      },
    })
    // TODO: consume auth payload
    const statusMsg: SenderCreateStatusMessage = {
      for: senderId,
      txn: msg.txn,
      result: 'success',
      data: {
        inactivity: this.maxSenderInactivity,
      },
    }

    sendMsgReturn = await this.sendWithRetry(JSON.stringify(statusMsg), {
      onTimeout: async () => {
        console.log(`Did not recieve client acknowledge for sender (${senderId}), closing sender`)
        this.createCmdTxnManager.remove(msg.txn)
        this.senderTxnManagers.delete(senderId)
      },
    })
  }
}
