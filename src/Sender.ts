import { CommandMap, SenderCloseCommand, SenderCloseStatusMessage, StatusMap } from '../messagesTypes'

/**
 * The sender is a single managed session on a given client connection.
 *
 * With a sender, you can be sure that your responses are associated with the
 * session.
 */
export class Sender<Commands extends string, CMap extends CommandMap<Commands>, SMap extends StatusMap<Commands>> {
  private closed = false
  private inactive = false
  private inactivityTimer: NodeJS.Timeout | null = null
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
      this.inactivityTimer = setTimeout(() => {
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
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer)
    }

    const payload: SenderCloseCommand<any>['data'] = {
      ...(this.authVerify ? { auth: this.authVerify } : null),
    }

    // We'll just type cast since we know this is a valid command set
    return await this.sendFcn('senderClose' as Commands, payload, this.id)
  }
}
