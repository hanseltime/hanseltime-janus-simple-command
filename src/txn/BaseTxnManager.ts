import { FailStatusMessage, SuccessStatusMessage } from "../messagesTypes"

export type SenderTxnListener = {
  onAck: () => Promise<void>
  onNack: () => Promise<void>
  onStatus: (msg: FailStatusMessage | SuccessStatusMessage<any>) => Promise<void>
}

export type RecieverTxnListener = {
  onAck: () => Promise<void>
  onNack: () => Promise<void>
}

export class BaseTxnManager<TxnListener extends RecieverTxnListener | SenderTxnListener> {
  protected txnMap = new Map<string, TxnListener>()

  /**
   * Triggers an onAck of the txn
   *
   * @param txn
   */
  async ack(txn: string): Promise<void> {
    const txnObj = this.txnMap.get(txn)
    if (!txnObj) return
    return txnObj.onAck()
  }

  /**
   * Triggers onNack of the txn
   * and removes the txn from the pool
   *
   * @param txn
   */
  nack(txn: string) {
    const txnObj = this.txnMap.get(txn)
    if (!txnObj) return
    this.remove(txn)
    return txnObj.onNack()
  }

  /**
   * Removes a txn from the pool
   *
   * @param txn
   */
  remove(txn: string): boolean {
    return this.txnMap.delete(txn)
  }

  /**
   * Only use this if the client is disconnected
   */
  clear() {
    this.txnMap.clear()
  }

  /**
   * Returns if the txnManager has a txn currently in place for the id
   * @param txn
   */
  has(txn: string): boolean {
    return this.txnMap.has(txn)
  }

  /**
   * Returns the number of txns currently being managed
   *
   * @returns
   */
  count(): number {
    return this.txnMap.size
  }
}
