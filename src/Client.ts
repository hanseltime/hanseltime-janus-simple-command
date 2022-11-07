import { SenderTxnManager } from './txn/SenderTxnManager'
import {
  CommandMessage,
  FailStatusMessage,
  SuccessStatusMessage,
  SenderCreateCommand,
  ACKMessage,
  NACKMessage,
  SenderCreateStatusMessage,
  SenderCloseStatusMessage,
  SenderCloseCommand,
  CommandMap,
  StatusMap,
} from './messagesTypes'
import { BaseMsgSend, BaseMsgSendOptions, SendMessageReturn } from './BaseMsgSend'

interface ClientOptions<Commands extends string> extends BaseMsgSendOptions {
  commands: Commands[]
}

/**
 * The sender is a single managed session on a given client connection.
 *
 * With a sender, you can be sure that your responses are associated with the
 * session.
 */
class Sender<Commands extends string, CMap extends CommandMap<Commands>, SMap extends StatusMap<Commands>> {
  private closed = false
  private inactive = false
  constructor(
    private id: string,
    private sendFcn: <C extends Commands>(cmd: C, payload: CMap[C]['data'], senderId: string) => Promise<SMap[C]>,
    private inactivity: number,
    private authVerify: any, // TODO: type constrain this
  ) {
    this.resetInactivity()
  }

  private resetInactivity() {
    if (this.inactivity && this.inactivity > 0) {
      setTimeout(() => {
        this.inactive = true
      }, this.inactivity)
    }
  }

  async command<C extends Commands>(cmd: C, payload: CMap[C]['data']): Promise<SMap[C]> {
    if (this.closed) {
      throw new Error('Sender already had closed call.  Cannot send again')
    }
    if (this.inactive) {
      throw new Error(`Sender did not make a call within ${this.inactivity}ms.  Cannot send again`)
    }
    // TODO: this is not the most valid reset since we could do this on command ACK
    this.resetInactivity()
    return await this.sendFcn(cmd, payload, this.id)
  }

  async close(): Promise<SenderCloseStatusMessage> {
    this.closed = true

    const payload: SenderCloseCommand<any>['data'] = {
      ...(this.authVerify ? { auth: this.authVerify } : null),
    }

    // We'll just type cast since we know this is a valid command set
    return await this.sendFcn('senderClose' as Commands, payload, this.id)
  }
}

class Client<
  Commands extends string,
  CMap extends CommandMap<Commands>,
  SMap extends StatusMap<Commands>,
> extends BaseMsgSend {
  private txnStore = new SenderTxnManager()

  private commands: string[]

  constructor(options: ClientOptions<Commands>) {
    super(options)
    this.commands = options.commands

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

  // TODO: type-constrain auth payload
  async createSender(authPayload: any): Promise<Sender<Commands, CMap, SMap>> {
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
    let sendMsgReturn: SendMessageReturn | null = null

    const txnSetup = new Promise<{
      txn: string
      commandRespond: Promise<SMap[C]>
    }>((txnRes) => {
      const commandRespond = new Promise<SMap[C]>((res, rej) => {
        const txn = this.txnStore.create({
          onAck: async () => {
            sendMsgReturn?.stopRetry()
          },
          onNack: async () => {
            sendMsgReturn?.stopRetry()
            rej('NACK recieved')
          },
          onStatus: async (msg: SMap[C]) => {
            // send an ack
            const ack: ACKMessage = {
              ack: command,
              txn,
              for: msg.for,
            }
            await this.sendMsgWithNoRetry(JSON.stringify(ack))
            res(msg)
          },
        })
        txnRes({
          commandRespond,
          txn,
        })
      })
    })

    const { txn, commandRespond } = await txnSetup

    let cmdMessage: CMap[C] | SenderCreateCommand<any>
    if (command === 'senderCreate') {
      cmdMessage = {
        command: 'senderCreate',
        txn,
        data: payload,
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
        this.txnStore.remove(txn)
      },
    })

    return await commandRespond
  }
}
