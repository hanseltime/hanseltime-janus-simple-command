import { BaseMsgSend, BaseMsgSendOptions, SendMessageReturn } from './BaseMsgSend'
import { intGeneratorFactory } from './idGenerators'
import { InactivityMonitor } from './InactivityMonitor'
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
  IntermediateStatusMap,
  IntermediateStatusMessage,
  InterMessageFromMap,
} from './messagesTypes'
import { ReceiverTxnManager } from './txn/ReceiverTxnManager'

export interface ServerOptions extends BaseMsgSendOptions {
  idGenerator?: () => string
  maxSenderInactivity: number // the amount, in milliseconds that a sender can go without sending a command
}

export type HandlerReturn<T extends SuccessStatusMessage<any> | FailStatusMessage<any>> =
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
  InterMap extends IntermediateStatusMap<Commands>,
> =
  | (<C extends Commands>(
      msg: CMap[C],
      sendIntermediateStatus?: (payload: InterMap[C]) => Promise<boolean>,
    ) => Promise<HandlerReturn<SMap[C]>>)
  | ((msg: SenderCreateCommand<any>) => Promise<HandlerReturn<SenderCreateStatusMessage>>)
  | ((msg: SenderCloseCommand<any>) => Promise<HandlerReturn<SenderCloseStatusMessage>>)

interface HandlerConfig<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
  InterMap extends IntermediateStatusMap<Commands>,
> {
  handler: ValidCommandHandlers<Commands, CMap, SMap, InterMap>
  maxTimeout?: number
}

export class Server<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
  InterMap extends IntermediateStatusMap<Commands> = Record<Commands, never>,
> extends BaseMsgSend {
  static readonly maxNumberCollisions = 100

  private idGenerator: () => string
  private maxSenderInactivity: number

  private senderTxnManagers = new Map<string, ReceiverTxnManager>()
  private closing = new Map<string, ReceiverTxnManager>()
  private intermediate = new Map<string, ReceiverTxnManager>()
  private commandHandlers = new Map<
    Commands | 'senderCreate' | 'senderClose',
    HandlerConfig<Commands, CMap, SMap, InterMap>
  >()
  private inactivityMonitor: InactivityMonitor

  private registered = false

  constructor(options: ServerOptions) {
    super(options)
    this.idGenerator = options.idGenerator ?? intGeneratorFactory()
    this.maxSenderInactivity = options.maxSenderInactivity
    this.inactivityMonitor = new InactivityMonitor(options.maxSenderInactivity)

    this.commandHandlers.set('senderClose', {
      handler: async (msg: SenderCloseCommand<any>): Promise<HandlerReturn<SenderCloseStatusMessage>> => {
        // TODO: auth verification
        const txnManager = this.senderTxnManagers.get(msg.for)
        if (!txnManager) {
          return {
            isError: true,
            data: {
              type: 'unexpected',
              message: `could not find a relevant connection to close for ${msg.for}`,
            },
          }
        }
        this.senderTxnManagers.delete(msg.for)
        this.closing.set(msg.for, txnManager) // This allows us to close any retry attempts
        this.inactivityMonitor.register(`${msg.for}`, () => {
          this.closing.delete(msg.for)
        })
        return {
          isError: false,
          data: {},
        }
      },
    })
  }

  async open(): Promise<void> {
    await super.open()
    this.registerConnectionListener()
  }

  private registerConnectionListener(): void {
    if (this.registered) return
    this.registered = true
    this.connection.onMessage(async (msg) => {
      const msgObj = JSON.parse(msg) as CommandMessage<Commands, any> | ACKMessage | NACKMessage
      const txn = msgObj.txn
      const interModifier = (msgObj as ACKMessage | NACKMessage).interModifier

      // Verify the message has a sender or is creating one
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
          this.debug(`Did not supply senderId for txn: ${msgObj.txn}`)
          this.inactivityMonitor.unregister(msgObj.for)
          return
        }
        await this.handleSenderCreateMessage(msgObj as SenderCreateCommand<any>)
        return
      }

      const txnManager = this.getTxnManager(msgObj, interModifier)
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

      // ingest the acknowledge - We use the intermediate modifier instead of txn for intermediate statuses
      if ((msgObj as ACKMessage).ack) {
        await txnManager.ack(interModifier ?? txn)
        return
      } else if ((msgObj as NACKMessage).nack) {
        await txnManager.nack(interModifier ?? txn)
        return
      }

      const { command } = msgObj as CommandMessage<Commands, any>

      // Drop the message is a transaction has already started
      if (txnManager.has(txn)) {
        this.debug(`Duplicate command transaction dropped for ${command}`)
        return
      }

      // Normal Command-Response flow
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
      // Refresh the sender's inactivity
      this.inactivityMonitor.refresh(msgObj.for)

      // Log the transaction
      let sendMessageReturn: SendMessageReturn | null = null
      let earlyAck = false
      const intermediateKey = `${msgObj.for}-${txn}`
      const sendPromise = new Promise<void>((res) => {
        txnManager.start(txn, {
          onAck: async () => {
            earlyAck = true
            sendMessageReturn?.stopRetry()
            this.intermediate.delete(intermediateKey)
            res()
          },
          onNack: async () => {
            earlyAck = true
            sendMessageReturn?.stopRetry()
            this.intermediate.delete(intermediateKey)
            res()
          },
          onTimeout: async () => {
            this.debug(`Failed to recieve acknowledgement for status to ${command}`)
            this.intermediate.delete(intermediateKey)
            res()
          },
        })
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

      // We will use Receiver TxnManager with incremented integers to manage the
      const handlerReturn = await handlerConfig.handler(
        msgObj as any,
        this.createIntermediateStatusSender(intermediateKey, msgObj as CommandMessage<Commands, any>),
      )

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
          await txnManager!.timeout(txn)
        },
      })
      if (earlyAck) {
        sendMessageReturn.stopRetry()
      }
      await sendPromise
    })
  }

  setMessageHandler<C extends Commands>(
    command: C,
    config: {
      handler: (
        msg: CMap[C],
        sendIntermediateStatus: (payload: InterMessageFromMap<C, InterMap>['data']) => Promise<void>,
      ) => Promise<HandlerReturn<SMap[C]>>
      maxTimeout?: number
    },
  ): void
  setMessageHandler<C extends Commands>(
    command: C,
    config: {
      handler: (msg: CMap[C]) => Promise<HandlerReturn<SMap[C]>>
      maxTimeout?: number
    },
  ): void {
    this.commandHandlers.set(command, config as HandlerConfig<Commands, CMap, SMap, InterMap>)
  }

  setMessageHandlerWithIntermediate<C extends Commands>(
    command: C,
    config: {
      handler: (
        msg: CMap[C],
        sendIntermediateStatus: (payload: InterMessageFromMap<C, InterMap>['data']) => Promise<void>,
      ) => Promise<HandlerReturn<SMap[C]>>
      maxTimeout?: number
    },
  ): void {
    this.commandHandlers.set(command, config as HandlerConfig<Commands, CMap, SMap, InterMap>)
  }

  removeMessageHandler<C extends Commands>(command: C): boolean {
    return this.commandHandlers.delete(command)
  }

  private getTxnManager(
    msgObj: CommandMessage<Commands, any> | ACKMessage | NACKMessage,
    interModifier?: string,
  ): ReceiverTxnManager | undefined {
    // Handle intermediate status modifiers differently
    if (interModifier) {
      return this.intermediate.get(this.getIntermediateKey(msgObj))
    }
    return this.senderTxnManagers.get(msgObj.for) ?? this.closing.get(msgObj.for)
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
      if (retry > Server.maxNumberCollisions) {
        throw new Error('Too Many Id Collisions')
      }
      senderId = this.idGenerator()
      retry++
    } while (this.senderTxnManagers.has(senderId))
    const txnManager = new ReceiverTxnManager()
    this.senderTxnManagers.set(senderId, txnManager)
    this.inactivityMonitor.register(senderId, () => {
      this.debug(`deleting due to inactivity ${senderId}`)
      this.senderTxnManagers.delete(senderId)
    })

    let sendMsgReturn: SendMessageReturn | null = null
    let earlyAck = false
    const statusPromise = new Promise<void>((res) => {
      txnManager.start(msg.txn, {
        onAck: async () => {
          earlyAck = true
          sendMsgReturn?.stopRetry()
          res()
        },
        onNack: async () => {
          earlyAck = true
          sendMsgReturn?.stopRetry()
          this.debug('Nack received for status to senderCreate')
          this.senderTxnManagers.delete(senderId)
          res()
        },
        onTimeout: async () => {
          this.debug('Failed to recieve acknowledgement for status to senderCreate')
          this.senderTxnManagers.delete(senderId)
          res()
        },
      })
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
        this.debug(`Did not recieve client acknowledge for sender (${senderId}), closing sender`)
        await txnManager.timeout(msg.txn)
      },
    })
    if (earlyAck) {
      sendMsgReturn.stopRetry()
    }
    await statusPromise
  }

  private getIntermediateKey(msgObj: CommandMessage<Commands, any> | ACKMessage | NACKMessage) {
    return `${msgObj.for}-${msgObj.txn}`
  }

  private createIntermediateStatusSender(intermediateKey: string, msgObj: CommandMessage<Commands, any>) {
    let intermediateInt = 0
    // We will reuse txn logic since we control the intermediateInt for a key
    this.intermediate.set(intermediateKey, new ReceiverTxnManager())

    return async (interData: any): Promise<boolean> => {
      const interTxnManager = this.intermediate.get(intermediateKey)
      if (!interTxnManager) {
        this.debug(`Error: attempting to send intermediate status on closed txn: ${msgObj.txn}`)
        return false
      }

      intermediateInt += 1
      const intModifier = `${intermediateInt}`
      let earlyInterAck = false
      let sendInterStatus: SendMessageReturn | null = null
      const interSendPromise = new Promise<boolean>((res) => {
        interTxnManager.start(intModifier, {
          onAck: async () => {
            earlyInterAck = true
            sendInterStatus?.stopRetry()
            res(true)
          },
          onNack: async () => {
            earlyInterAck = true
            sendInterStatus?.stopRetry()
            res(false)
          },
          onTimeout: async () => {
            this.debug(`Failed to recieve acknowledgement for intermediate status to ${msgObj.command}`)
            res(false)
          },
        })
      })

      sendInterStatus = await this.sendWithRetry(
        JSON.stringify({
          for: msgObj.for,
          txn: msgObj.txn,
          result: 'intermediate',
          interModifier: intModifier,
          data: interData ?? {},
        } as IntermediateStatusMessage<any>),
        {
          onTimeout: async () => {
            await interTxnManager.timeout(intModifier)
          },
        },
      )
      if (earlyInterAck) {
        sendInterStatus.stopRetry()
      }
      return await interSendPromise
    }
  }

  numberOfSenders(): number {
    return this.senderTxnManagers.size
  }

  async close(): Promise<void> {
    this.inactivityMonitor.close()
    await super.close()
  }
}
