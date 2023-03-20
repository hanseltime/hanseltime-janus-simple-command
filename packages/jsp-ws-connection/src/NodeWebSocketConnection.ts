import WebSocket from 'ws'
import {
  Connection,
  messageIsForClient,
  messageIsForServer,
  tryToGetMessageObject,
} from '@hanseltime/janus-simple-command'

export class NodeWebSocketConnection implements Connection {
  private messageHandler: ((msg: string) => Promise<void>) | undefined
  private errorHandler: ((error: Error) => Promise<void>) | undefined
  private closeHandler: (() => Promise<void>) | undefined

  private connect: Promise<void>
  private cancelConnect: ((error: Error) => void) | undefined
  private pending = new Set<Promise<any>>()
  constructor(private ws: WebSocket, private type: 'server' | 'client', log: (...args: any) => void) {
    this.connect = new Promise<void>((res, reject) => {
      if (ws.readyState === WebSocket.CONNECTING) {
        this.cancelConnect = reject
        ws.on('open', () => {
          this.cancelConnect = undefined
          res()
        })
        return
      }
      if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
        throw new Error('Attempting to make a connection from a closing Websocket')
      }
      res()
    })
    ws.on('message', (data) => {
      if (!this.messageHandler) {
        log('returning void onmessage')
        return
      }
      const msg = data.toString()
      const msgObj = tryToGetMessageObject(msg)
      if (!msgObj) return
      const appliesToConnection =
        (this.type === 'client' && messageIsForClient(msgObj)) || (this.type === 'server' && messageIsForServer(msgObj))
      if (!appliesToConnection) {
        log('message does not apply to connection')
        return
      }

      const prom = this.messageHandler(msg).finally(() => {
        this.pending.delete(prom)
      })
      this.pending.add(prom)
    })
    ws.on('error', (error) => {
      if (!this.errorHandler) return
      const prom = this.errorHandler(error).finally(() => {
        this.pending.delete(prom)
      })
      this.pending.add(prom)
    })
    ws.on('close', () => {
      if (!this.closeHandler) return
      const prom = this.closeHandler().finally(() => {
        this.pending.delete(prom)
      })
    })
  }

  async open(): Promise<void> {
    await this.connect
  }

  async sendMessage(msg: string): Promise<void> {
    await new Promise<void>((res, rej) => {
      this.ws.send(msg, (error) => {
        if (error) {
          rej(error)
        } else {
          res()
        }
      })
    })
  }

  onMessage(messageHandler: (msg: string) => Promise<void>): void {
    this.messageHandler = messageHandler
  }
  onError(errorHandler: (error: Error) => Promise<void>): void {
    this.errorHandler = errorHandler
  }
  onClose(closeHandler: () => Promise<void>): void {
    this.closeHandler = closeHandler
  }

  async close(): Promise<void> {
    if (this.cancelConnect) {
      this.cancelConnect(new Error('Close called before connection'))
    }
    await Promise.allSettled(this.pending)
    this.ws.close()
  }
}
