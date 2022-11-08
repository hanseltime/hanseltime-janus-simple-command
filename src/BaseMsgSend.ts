import { Connection } from './types'

export interface SendMessageReturn {
  stopRetry: () => void
}

interface SendWithRetryOptions {
  onTimeout: () => Promise<void>
}

export interface BaseMsgSendOptions {
  ackRetryDelay: number // Milliseconds to wait to retry an non-ack'd send
  maxAckRetries: number // The number of retries we will do if we don't get an ACK
  connection: Connection
  debug: (msg: string) => void // Debugging interface for you to determine
}

export class BaseMsgSend {
  readonly ackRetryDelay: number
  readonly maxAckRetries: number
  protected connection: Connection
  protected debug: (msg: string) => void

  private promises = new Set<Promise<any>>()

  constructor(options: BaseMsgSendOptions) {
    this.ackRetryDelay = options.ackRetryDelay
    this.maxAckRetries = options.maxAckRetries
    this.connection = options.connection
    this.debug = options.debug
  }

  /**
   * Allows you to send a main message (status or command) that expects
   * an ACK.
   *
   * @param msg
   * @returns
   */
  protected async sendWithRetry(msg: string, options: SendWithRetryOptions): Promise<SendMessageReturn> {
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timer
    const ret = {
      stopRetry: () => {
        if (timer) {
          clearInterval(timer)
        }
      },
    }
    await this.connection.sendMessage(msg)
    // Schedule retry intervals
    let retry = 0
    timer = setInterval(async () => {
      retry++
      if (retry > this.maxAckRetries) {
        clearInterval(timer)
        this.debug('No ACK recieved')
        const timeoutPromise = options?.onTimeout?.()
        if (timeoutPromise) {
          this.promises.add(timeoutPromise)
          await timeoutPromise
          this.promises.delete(timeoutPromise)
        }
        return
      }
      // TODO: actually store this an an awaitable for draining
      const promise = this.connection.sendMessage(msg)
      this.promises.add(promise)
      await promise
      this.promises.delete(promise)
    }, this.ackRetryDelay)

    return ret
  }

  // Meant for Acks
  protected async sendMsgWithNoRetry(msg: string): Promise<void> {
    await this.connection.sendMessage(msg)
  }

  async open(): Promise<void> {
    return this.connection.open()
  }

  async close(): Promise<void> {
    await this.connection.close()
    await Promise.allSettled(this.promises)
  }
}
