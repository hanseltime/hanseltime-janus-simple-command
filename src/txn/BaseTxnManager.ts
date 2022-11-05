export type SenderTxnListener = {
  onAck: () => Promise<void>
  onNack: () => Promise<void>
  onStatus: (msg: any) => Promise<void>
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
}
