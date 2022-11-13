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
  // Listener for when this closes and whether or not it closed due
  // to an explicit call or the connection forcing a close
  onClose?: (explicit: boolean) => Promise<void>
}

export class BaseMsgSend {
  readonly ackRetryDelay: number
  readonly maxAckRetries: number
  protected connection: Connection
  protected debug: (msg: string) => void
  protected isConnected = false
  protected explicitClose = false
  private timers = new Set<() => Promise<void>>()
  private onCloseHandler: (isExplicit: boolean) => Promise<void>

  private promises = new Set<Promise<any>>()

  constructor(options: BaseMsgSendOptions) {
    this.ackRetryDelay = options.ackRetryDelay
    this.maxAckRetries = options.maxAckRetries
    this.connection = options.connection
    this.debug = options.debug
    this.onCloseHandler = options.onClose!
    // Handle closing here
    this.connection.onClose(async () => {
      if (!this.explicitClose) {
        this.debug('Connection Forced ShutDown!')
        await this.innerClose(false)
      }
    })
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
    const timeOutFcn = async () => {
      clearInterval(timer)
      this.debug('No ACK recieved')
      await options?.onTimeout?.()
    }
    let noRetry = false
    const ret = {
      stopRetry: () => {
        noRetry = true
        if (timer) {
          clearInterval(timer)
          this.timers.delete(timeOutFcn)
        }
      },
    }
    await this.connection.sendMessage(msg)
    // Schedule retry intervals
    let retry = 0
    const asyncRetry = async () => {
      ++retry
      if (retry > this.maxAckRetries) {
        await timeOutFcn()
        return
      }
      try {
        await this.connection.sendMessage(msg)
      } catch (err) {
        this.debug(`Send Message Error: ${err}`)
      }
    }

    timer = setInterval(() => {
      if (noRetry) return
      let finished = false
      const promise = asyncRetry().finally(() => {
        finished = true
        this.promises.delete(promise)
      })
      if (!finished) {
        this.promises.add(promise)
      }
    }, this.ackRetryDelay)
    this.timers.add(timeOutFcn)

    return ret
  }

  // Meant for Acks
  protected async sendMsgWithNoRetry(msg: string): Promise<void> {
    await this.connection.sendMessage(msg)
  }

  async open(): Promise<void> {
    await this.connection.open()
    this.isConnected = true
  }

  async close(): Promise<void> {
    await this.innerClose(true)
  }

  async innerClose(isExplicit: boolean): Promise<void> {
    const timeouts: Promise<void>[] = []
    this.timers.forEach((timeoutFcn: () => Promise<void>) => {
      timeouts.push(timeoutFcn())
    })
    await Promise.allSettled(timeouts)
    this.explicitClose = isExplicit
    if (isExplicit) {
      await this.connection.close()
    }
    await Promise.allSettled([...this.promises])
    this.isConnected = false
    await this.onCloseHandler?.(isExplicit)
  }
}
