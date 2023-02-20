import { BaseTxnManager, RecieverTxnListener } from './BaseTxnManager'

export class ReceiverTxnManager extends BaseTxnManager<RecieverTxnListener> {
  /**
   * Creates a transaction id that is associated with the following
   * transaction id passed fo the Receiver
   *
   * @param txn - The txn id to start managing
   * @param actions
   *      onAck() - for handling calls to ack()
   *      onNack() - for handling calls to nack()
   *
   * @returns true if the transaction started or false if there was already a transaction
   */
  start(txn: string, actions: RecieverTxnListener): boolean {
    if (this.txnMap.has(txn)) {
      return false
    }

    this.txnMap.set(txn, actions)
    return true
  }

  // Remove the txn on acknowledge
  async ack(txn: string): Promise<void> {
    await super.ack(txn)
    this.remove(txn)
  }
}
