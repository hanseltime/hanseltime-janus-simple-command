import { SenderTxnManager } from './txn/SenderTxnManager'
import {
  FailStatusMessage,
  SuccessStatusMessage,
  SenderCreateCommand,
  ACKMessage,
  NACKMessage,
  SenderCreateStatusMessage,
  SenderCloseCommand,
  CommandMap,
  StatusMap,
  AuthSchema,
} from './messagesTypes'
import { BaseMsgSend, BaseMsgSendOptions, SendMessageReturn } from './BaseMsgSend'
import { Sender } from './Sender'

interface ClientOptions<Commands extends string> extends BaseMsgSendOptions {
  commands: Commands[]
}

export class Client<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
  AuthMap extends AuthSchema<any, any> = AuthSchema<undefined, undefined>,
> extends BaseMsgSend {
  private txnStore = new SenderTxnManager()

  private commands: string[]
  private registered = false

  constructor(options: ClientOptions<Commands>) {
    super(options)
    this.commands = options.commands
  }

  async open(): Promise<void> {
    await super.open()
    this.registerListener()
  }

  private registerListener() {
    if (this.registered) return
    this.registered = true

    this.connection.onMessage(async (msg: string) => {
      const m = JSON.parse(msg) as FailStatusMessage | SuccessStatusMessage<any> | ACKMessage | NACKMessage
      const txn = m.txn

      // Run the transaction through it's paces
      if ((m as ACKMessage).ack) {
        await this.txnStore.ack(txn)
      } else if ((m as NACKMessage).nack) {
        await this.txnStore.nack(txn)
      } else {
        await this.txnStore.status(txn, m) // TODO - should this just be payload?  probably
      }
    })
  }

  /**
   * Depending on the type provided for AuthMap, you will need to choose the
   * authPayload
   *
   * Important: to avoid tracking all senders, you are expected to formally
   * close the sender before closing the client.  Please make a case for storing
   * sender references and closing them here
   */
  async createSender(): Promise<Sender<Commands, CMap, SMap>>
  async createSender(authPayload: AuthMap['submit']): Promise<Sender<Commands, CMap, SMap>>
  async createSender(authPayload?: AuthMap['submit']): Promise<Sender<Commands, CMap, SMap>> {
    const status = (await this.send('senderCreate' as any, authPayload)) as SenderCreateStatusMessage
    if (status.result === 'fail') {
      throw new Error(`Failed to create Sender: [${status.error.type}] ${status.error.message}`)
    } else {
      return new Sender(status.for, this.send.bind(this), status.data.inactivity, status.data.auth)
    }
  }

  private async send<C extends Commands>(
    command: 'senderClose',
    payload: SenderCloseCommand<any>['data'],
    senderId?: string,
  ): Promise<SMap[C]>
  private async send<C extends Commands>(
    command: 'senderCreate',
    payload: SenderCreateCommand<any>['data'],
  ): Promise<SMap[C]>
  private async send<C extends Commands>(command: C, payload: CMap[C]['data'], senderId?: string): Promise<SMap[C]>
  private async send<C extends Commands>(
    command: C | 'senderCreate',
    payload: CMap[C]['data'] | SenderCreateCommand<any>['data'],
    senderId?: string,
  ): Promise<SMap[C]> {
    if (!this.isConnected) {
      throw Error(`Cannot send command ${command}. Not connected to an active connection!`)
    }
    let sendMsgReturn: SendMessageReturn | null = null

    // Switch for catching nearly synchronous acks
    let earlyAck = false
    const txnSetup = async (): Promise<{
      txn: string
      commandRespond: Promise<SMap[C]>
    }> => {
      let txnResolve: (txn: string) => void | undefined
      const txnPromise = new Promise<string>((res) => {
        txnResolve = res
      })
      const commandRespond = new Promise<SMap[C]>((res, rej) => {
        const txn = this.txnStore.create({
          onAck: async () => {
            earlyAck = true
            sendMsgReturn?.stopRetry()
          },
          onNack: async () => {
            earlyAck = true
            rej('NACK received')
          },
          onStatus: (async (msg: SMap[C]) => {
            // send an ack
            const ack: ACKMessage = {
              ack: 'status',
              txn,
              for: msg.for,
            }
            await this.sendMsgWithNoRetry(JSON.stringify(ack))
            res(msg)
          }) as any, // TODO: solve actual type alignment
          onTimeout: async () => {
            rej(`Failed to secure response in time for ${command}`)
          },
        })
        txnResolve(txn)
      })
      return {
        commandRespond,
        txn: await txnPromise,
      }
    }

    const { txn, commandRespond } = await txnSetup()

    let cmdMessage: CMap[C] | SenderCreateCommand<any>
    if (command === 'senderCreate') {
      cmdMessage = {
        command: 'senderCreate',
        txn,
        data: payload ?? {},
      } as SenderCreateCommand<any>
    } else {
      cmdMessage = {
        for: senderId!,
        command: command,
        txn,
        data: payload,
      } as unknown as CMap[C]
    }

    sendMsgReturn = await this.sendWithRetry(JSON.stringify(cmdMessage), {
      onTimeout: async () => {
        await this.txnStore.timeout(txn)
      },
    })
    if (earlyAck) {
      sendMsgReturn.stopRetry()
    }

    return await commandRespond
  }
}
